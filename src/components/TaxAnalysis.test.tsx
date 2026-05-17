import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { TaxAnalysis, type TaxAnalysisProps } from './TaxAnalysis';
import { projectOptimisticHistorical, type OptimisticResult } from '../lib/optimisticCalculator';
import { runTaxModel } from '../lib/taxModel';
import { STATES } from '../lib/stateTax';

const SEED = 0xc0ffee17;

function makeOptimistic(retain: boolean): OptimisticResult {
  return projectOptimisticHistorical({
    birthYear: 2026,
    monthlyContribution: 150,
    seed: SEED,
    numPaths: 50,
    retainPaths: retain,
  });
}

function Harness(props: Partial<TaxAnalysisProps> & { startOn?: boolean }) {
  const [includeTax, setIncludeTax] = useState(props.startOn ?? false);
  const optimistic = props.optimistic ?? makeOptimistic(includeTax);
  return (
    <TaxAnalysis
      optimistic={optimistic}
      birthYear={2026}
      monthlyContribution={150}
      locale="en"
      includeTax={includeTax}
      onIncludeTaxChange={(next) => {
        setIncludeTax(next);
        props.onIncludeTaxChange?.(next);
      }}
      onAfterTaxChange={props.onAfterTaxChange}
    />
  );
}

describe('TaxAnalysis — default OFF', () => {
  it('renders only the toggle row when includeTax is false', () => {
    render(<Harness />);
    expect(screen.getByTestId('tax-toggle')).not.toBeChecked();
    expect(screen.queryByTestId('after-tax-block')).not.toBeInTheDocument();
    expect(screen.queryByTestId('comparison-block')).not.toBeInTheDocument();
  });

  it('toggling on bubbles up the change', () => {
    const onChange = vi.fn();
    render(<Harness onIncludeTaxChange={onChange} />);
    fireEvent.click(screen.getByTestId('tax-toggle'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('TaxAnalysis — expanded', () => {
  it('shows after-tax and comparison blocks once toggled on', () => {
    render(<Harness startOn />);
    expect(screen.getByTestId('tax-toggle')).toBeChecked();
    expect(screen.getByTestId('after-tax-block')).toBeInTheDocument();
    expect(screen.getByTestId('comparison-block')).toBeInTheDocument();
  });

  it('renders the kiddie-tax toggle only for CA (default)', () => {
    render(<Harness startOn />);
    expect(screen.getByTestId('kiddie-toggle')).toBeInTheDocument();
  });

  it('hides the kiddie-tax toggle when state is NO_TAX', () => {
    render(<Harness startOn />);
    fireEvent.change(screen.getByTestId('tax-state'), { target: { value: 'NO_TAX' } });
    expect(screen.queryByTestId('kiddie-toggle')).not.toBeInTheDocument();
  });

  it('switching to NO_TAX zeros the state-savings line', () => {
    render(<Harness startOn />);
    fireEvent.change(screen.getByTestId('tax-state'), { target: { value: 'NO_TAX' } });
    // After the redesign the savings are rendered inline as
    // "Federal saved $X · State saved $0" inside the comparison block.
    const text = screen.getByTestId('comparison-block').textContent ?? '';
    expect(text).toMatch(/State saved \$0\b/);
  });

  it('after-tax median is less than gross median', () => {
    const opt = makeOptimistic(true);
    render(<Harness optimistic={opt} startOn />);
    const afterTax = Number(
      screen.getByTestId('after-tax-median').textContent!.replace(/[^0-9]/g, ''),
    );
    expect(afterTax).toBeGreaterThan(0);
    expect(afterTax).toBeLessThan(opt.medianSavings);
  });
});

describe('TaxAnalysis — onAfterTaxChange callback', () => {
  it('emits null while OFF', () => {
    const cb = vi.fn();
    render(<Harness onAfterTaxChange={cb} />);
    expect(cb).toHaveBeenLastCalledWith(null);
  });

  it('emits a positive median once ON', async () => {
    const cb = vi.fn();
    render(<Harness onAfterTaxChange={cb} startOn />);
    // The last call should be a positive number, not null.
    const lastCall = cb.mock.calls.at(-1);
    expect(lastCall?.[0]).toBeGreaterThan(0);
  });
});

describe('TaxAnalysis — uses post-fee compounding for the deterministic comparison', () => {
  // Verifies that runTaxModel is fed `optimistic.effectiveMonthlyMean` (post-fee),
  // not `optimistic.monthlyMeanUsed` (pre-fee). If the wiring regressed, both
  // expense-ratio cases below would produce identical deterministic outputs
  // because monthlyMeanUsed is the same for both.

  function mountWithExpense(expenseRatio: number) {
    const optimistic = projectOptimisticHistorical({
      birthYear: 2026,
      monthlyContribution: 150,
      seed: SEED,
      numPaths: 50,
      retainPaths: true,
      assumptions: { expenseRatio },
    });
    const { unmount } = render(<Harness optimistic={optimistic} startOn />);
    const txt = screen.getByTestId('wealth-diff').textContent ?? '';
    unmount();
    return { optimistic, wealthDiffText: txt };
  }

  it('different expense ratios produce different deterministic wealth differences', () => {
    const free = mountWithExpense(0); // no fee
    const standard = mountWithExpense(0.001); // 0.10%/yr
    const expensive = mountWithExpense(0.005); // 0.50%/yr

    // Sanity: the optimistic results agree on monthlyMeanUsed but differ on
    // effectiveMonthlyMean — that's exactly the regression surface.
    expect(free.optimistic.monthlyMeanUsed).toBe(standard.optimistic.monthlyMeanUsed);
    expect(free.optimistic.effectiveMonthlyMean).toBeGreaterThan(
      standard.optimistic.effectiveMonthlyMean,
    );
    expect(standard.optimistic.effectiveMonthlyMean).toBeGreaterThan(
      expensive.optimistic.effectiveMonthlyMean,
    );

    // Wealth-difference strings must differ — proves runTaxModel saw different
    // rates, not the same pre-fee mean.
    expect(free.wealthDiffText).not.toBe(standard.wealthDiffText);
    expect(standard.wealthDiffText).not.toBe(expensive.wealthDiffText);
  });
});

describe('TaxAnalysis — Mode B default (same after-tax cash) is wired into the UI', () => {
  it('comparison header says "same after-tax cash in a regular brokerage"', () => {
    render(<Harness startOn />);
    const header = screen.getByText(/same after-tax cash in a regular brokerage/i);
    expect(header).toBeInTheDocument();
  });

  it('comparison block surfaces the Mode B explainer note', () => {
    render(<Harness startOn />);
    const note = screen.getByTestId('comparison-note');
    expect(note.textContent).toMatch(/same amount each year/i);
    expect(note.textContent).toMatch(/not ordinary income tax on the cash you contribute/i);
  });

  it('old "same pre-tax income capacity" copy is NOT shown by default', () => {
    render(<Harness startOn />);
    expect(screen.queryByText(/same pre-tax income/i)).not.toBeInTheDocument();
  });

  it('Mode B wealth difference for a low-income CA family is much smaller than the Mode A surrogate', () => {
    // The UI runs Mode B. We recompute Mode A independently with the same
    // inputs and assert its wealthDifference is materially larger.
    const optimistic = projectOptimisticHistorical({
      birthYear: 2026,
      monthlyContribution: 5000 / 12,
      seed: SEED,
      numPaths: 50,
      retainPaths: true,
    });
    const baseArgs = {
      years: optimistic.yearsSimulated,
      annualEmployerContribution: 0,
      annualOtherContribution: 5_000,
      monthlyReturnRate: optimistic.effectiveMonthlyMean,
      filingStatus: 'mfj' as const,
      state: STATES.CA,
      baseStateTaxableIncome: 75_000,
      parentFederalMarginalRate: 0.12,
      childFutureFederalRate: 0.10,
      initialSeed: optimistic.seedAmount,
      includeAnnualStateKiddieTax: true,
    };
    const modeB = runTaxModel({ ...baseArgs, comparisonMode: 'sameAfterTaxCash' });
    const modeA = runTaxModel({ ...baseArgs, comparisonMode: 'samePreTaxIncome' });
    expect(modeA.wealthDifference).toBeGreaterThan(modeB.wealthDifference);
  });
});

describe('TaxAnalysis — free-form number inputs for income and employer', () => {
  it('renders a number input for taxable income, initialised to the default $75,000', () => {
    render(<Harness startOn />);
    const input = screen.getByTestId('tax-base-income') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.tagName.toLowerCase()).toBe('input');
    expect(input.type).toBe('number');
    expect(input.value).toBe('75000');
  });

  it('renders a number input for employer contribution, initialised empty (default $0)', () => {
    render(<Harness startOn />);
    const input = screen.getByTestId('tax-employer-c') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.type).toBe('number');
    expect(input.value).toBe(''); // 0 → empty placeholder
  });

  it('changing the income input updates the deterministic comparison output', () => {
    render(<Harness startOn />);
    const before = screen.getByTestId('wealth-diff').textContent;
    fireEvent.change(screen.getByTestId('tax-base-income'), { target: { value: '250000' } });
    const after = screen.getByTestId('wealth-diff').textContent;
    expect(after).not.toBe(before); // changing income shifts state-tax outcomes
  });

  it('changing the employer input updates the deterministic comparison output', () => {
    render(<Harness startOn />);
    const before = screen.getByTestId('wealth-diff').textContent;
    fireEvent.change(screen.getByTestId('tax-employer-c'), { target: { value: '2000' } });
    const after = screen.getByTestId('wealth-diff').textContent;
    expect(after).not.toBe(before);
  });

  it('empty income input clamps to 0 without crashing', () => {
    render(<Harness startOn />);
    fireEvent.change(screen.getByTestId('tax-base-income'), { target: { value: '' } });
    expect(screen.getByTestId('comparison-block')).toBeInTheDocument();
  });

  it('rejects negative numbers (income stays at its previous value)', () => {
    render(<Harness startOn />);
    const input = screen.getByTestId('tax-base-income') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '-1000' } });
    // Handler returns early on negative, so the React-controlled value sticks
    // at the previous valid state.
    expect(input.value).toBe('75000');
  });

  // Employer must never exceed (a) the §128 federal cap of $2,500 AND
  // (b) the user's own annual contribution — whichever is smaller.
  describe('employer cap: §128 ∧ user\'s annual contribution', () => {
    it('typing $5,000 employer when user contributes $1,800/yr ($150/mo) clamps to $1,800', () => {
      // Default Harness uses monthlyContribution = 150 → rawAnnual = $1,800.
      // §128 cap is $2,500 but the user's $1,800 binds tighter.
      render(<Harness startOn />);
      const input = screen.getByTestId('tax-employer-c') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '5000' } });
      expect(input.value).toBe('1800');
    });

    it('typing $5,000 employer when user contributes $5,000/yr clamps to $2,500 (§128)', () => {
      function HiContrib() {
        const [includeTax, setIncludeTax] = useState(true);
        const optimistic = projectOptimisticHistorical({
          birthYear: 2026,
          monthlyContribution: 5000 / 12, // $5k/yr
          seed: SEED,
          numPaths: 50,
          retainPaths: true,
        });
        return (
          <TaxAnalysis
            optimistic={optimistic}
            birthYear={2026}
            monthlyContribution={5000 / 12}
            locale="en"
            includeTax={includeTax}
            onIncludeTaxChange={setIncludeTax}
          />
        );
      }
      render(<HiContrib />);
      const input = screen.getByTestId('tax-employer-c') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '5000' } });
      expect(input.value).toBe('2500');
    });

    it('typing $1,000 employer when user contributes $0 clamps to $0', () => {
      function ZeroContrib() {
        const [includeTax, setIncludeTax] = useState(true);
        const optimistic = projectOptimisticHistorical({
          birthYear: 2026,
          monthlyContribution: 0,
          seed: SEED,
          numPaths: 50,
          retainPaths: true,
        });
        return (
          <TaxAnalysis
            optimistic={optimistic}
            birthYear={2026}
            monthlyContribution={0}
            locale="en"
            includeTax={includeTax}
            onIncludeTaxChange={setIncludeTax}
          />
        );
      }
      render(<ZeroContrib />);
      const input = screen.getByTestId('tax-employer-c') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '1000' } });
      expect(input.value).toBe(''); // 0 renders as empty placeholder
    });
  });
});

describe('TaxAnalysis — percent-button labels', () => {
  it('child federal rate buttons read "10%" and "12%" (no "1%" from a broken trailing-zero regex)', () => {
    render(<Harness startOn />);
    // The regression bug stripped the trailing zero off "10" and rendered "1%".
    expect(screen.queryByRole('button', { name: '1%' })).not.toBeInTheDocument();
    // Both expected child-rate labels are present on the page.
    expect(screen.getAllByText('10%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('12%').length).toBeGreaterThan(0);
  });

  it('parent federal rate buttons show whole percents (10/12/22/24/32/37)', () => {
    render(<Harness startOn />);
    for (const label of ['10%', '12%', '22%', '24%', '32%', '37%']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });
});

describe('TaxAnalysis — today\'s-dollars subtitle on the after-tax median', () => {
  it('renders the subtitle when the toggle is on, with 2.5%/yr deflator language', () => {
    render(<Harness startOn />);
    const sub = screen.getByTestId('after-tax-todays-dollars');
    // Compact copy uses "≈ $X today" rather than the longer "in today's dollars".
    expect(sub.textContent).toMatch(/today/i);
    expect(sub.textContent).toMatch(/2\.5% inflation/i);
  });

  it('subtitle value matches the shared toTodaysDollars deflator (1/1.025^18 for 2026)', () => {
    render(<Harness startOn />);
    const parse = (s: string) => {
      const m = s.match(/\$([\d,]+)/);
      return m ? Number(m[1].replace(/,/g, '')) : NaN;
    };
    const medianValue = parse(screen.getByTestId('after-tax-median').textContent ?? '');
    const todaysValue = parse(screen.getByTestId('after-tax-todays-dollars').textContent ?? '');
    const expectedRatio = 1 / Math.pow(1.025, 18);
    expect(todaysValue / medianValue).toBeCloseTo(expectedRatio, 2);
  });

  it('subtitle is absent when the toggle is off (after-tax block is hidden)', () => {
    render(<Harness />); // startOn=false
    expect(screen.queryByTestId('after-tax-todays-dollars')).not.toBeInTheDocument();
  });
});

describe('TaxAnalysis — reconciliation note explains why wealth diff ≠ tax saved', () => {
  it('CA + seed-eligible birth year: mentions both pilot seed and Layer 1', () => {
    render(<Harness startOn />);
    const note = screen.getByTestId('reconciliation-note');
    expect(note.textContent).toMatch(/pilot seed/i);
    expect(note.textContent).toMatch(/Layer 1|nonconformity/i);
  });

  it('Non-CA + seed-eligible birth year: mentions seed only', () => {
    render(<Harness startOn />);
    // Switch state to "All other states" — non-conforming flag becomes false.
    fireEvent.change(screen.getByTestId('tax-state'), { target: { value: 'NO_TAX' } });
    const note = screen.getByTestId('reconciliation-note');
    expect(note.textContent).toMatch(/pilot seed/i);
    expect(note.textContent).not.toMatch(/Layer 1|nonconformity/i);
  });

  it('Ineligible birth year + non-CA: no reconciliation note (numbers add up)', () => {
    const optimistic = projectOptimisticHistorical({
      birthYear: 2010, // far past — no pilot seed, fewer contribution years
      monthlyContribution: 150,
      seed: SEED,
      numPaths: 50,
      retainPaths: true,
    });
    render(<Harness optimistic={optimistic} startOn />);
    fireEvent.change(screen.getByTestId('tax-state'), { target: { value: 'NO_TAX' } });
    expect(screen.queryByTestId('reconciliation-note')).not.toBeInTheDocument();
  });
});

describe('TaxAnalysis — Spanish locale', () => {
  it('uses Spanish labels when locale=es', () => {
    function EsHarness() {
      const [includeTax, setIncludeTax] = useState(false);
      const optimistic = makeOptimistic(false);
      return (
        <TaxAnalysis
          optimistic={optimistic}
          birthYear={2026}
          monthlyContribution={150}
          locale="es"
          includeTax={includeTax}
          onIncludeTaxChange={setIncludeTax}
        />
      );
    }
    render(<EsHarness />);
    expect(screen.getByText(/Mostrar análisis de impuestos/)).toBeInTheDocument();
  });
});
