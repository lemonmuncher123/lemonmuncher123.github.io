import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Calculator, UI_RNG_SEED } from './Calculator';
import {
  projectOptimisticHistorical,
  HISTORICAL_MONTHLY_MEAN,
  HISTORICAL_MONTHLY_VOL,
} from '../lib/optimisticCalculator';
import { projectConservativeRealWorld } from '../lib/conservativeCalculator';
import { projectBalance, toMonthlyEquivalent } from '../lib/calculator';

const selectYear = (year: number) => {
  const select = screen.getByLabelText(/birth year/i);
  fireEvent.change(select, { target: { value: String(year) } });
};

const formatCurrency = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

describe('Calculator', () => {
  it('renders Step 1 (birth year question) on initial mount', () => {
    render(<Calculator />);
    expect(screen.getByText(/birth year/i)).toBeInTheDocument();
    expect(screen.queryByText(/qualifies/i)).not.toBeInTheDocument();
  });

  it('shows "qualifies for the free $1,000" for birth year 2026', () => {
    render(<Calculator />);
    selectYear(2026);
    expect(screen.getByText(/qualifies for the free \$1,000/i)).toBeInTheDocument();
  });

  it('shows ineligibility copy for birth year 2009 (too old, no seed)', () => {
    render(<Calculator />);
    selectYear(2009);
    expect(screen.getByText(/No free \$1,000, but your child can still open an account/i)).toBeInTheDocument();
  });

  it('shows a projection amount for an eligible birth year', () => {
    render(<Calculator />);
    selectYear(2026);
    expect(screen.getByText(/At age 18, your child could have/i)).toBeInTheDocument();
    expect(screen.getByTestId('headline-amount').textContent).toMatch(/\$[\d,]+/);
  });

  it('updates the projection when the daily slider value changes', () => {
    render(<Calculator />);
    selectYear(2026);
    const before = screen.getByTestId('headline-amount').textContent;
    fireEvent.click(screen.getByRole('radio', { name: /\$20/ }));
    const after = screen.getByTestId('headline-amount').textContent;
    expect(after).not.toBe(before);
  });

  it('shows the cap note when daily=$20 (annual would exceed $5,000)', () => {
    render(<Calculator />);
    selectYear(2026);
    fireEvent.click(screen.getByRole('radio', { name: /\$20/ }));
    expect(screen.getByText(/Capped at the \$5,000\/year federal maximum/i)).toBeInTheDocument();
  });

  describe('frequency toggle', () => {
    it('renders Day / Month / Year radio buttons', () => {
      render(<Calculator />);
      selectYear(2026);
      const group = screen.getByRole('radiogroup', { name: /frequency/i });
      expect(within(group).getByRole('radio', { name: /^day$/i })).toBeInTheDocument();
      expect(within(group).getByRole('radio', { name: /^month$/i })).toBeInTheDocument();
      expect(within(group).getByRole('radio', { name: /^year$/i })).toBeInTheDocument();
    });

    it('switching to Month updates chip labels to /mo', () => {
      render(<Calculator />);
      selectYear(2026);
      fireEvent.click(screen.getByRole('radio', { name: /^month$/i }));
      const moMatches = screen.getAllByText('/mo');
      expect(moMatches.length).toBeGreaterThanOrEqual(5);
    });

    it('switching to Year shows yearly presets including $5,000', () => {
      render(<Calculator />);
      selectYear(2026);
      fireEvent.click(screen.getByRole('radio', { name: /^year$/i }));
      expect(screen.getByText('$5,000')).toBeInTheDocument();
      const yrMatches = screen.getAllByText('/yr');
      expect(yrMatches.length).toBeGreaterThanOrEqual(5);
    });

    it('switching frequency preserves the daily-equivalent contribution', () => {
      render(<Calculator />);
      selectYear(2026);
      fireEvent.click(screen.getByRole('radio', { name: /^month$/i }));
      const customInput = screen.getByLabelText(/Custom amount per month/i) as HTMLInputElement;
      expect(Number(customInput.value)).toBeGreaterThan(140);
      expect(Number(customInput.value)).toBeLessThan(160);
    });
  });

  describe('custom amount input', () => {
    it('renders a number input labeled for the current frequency', () => {
      render(<Calculator />);
      selectYear(2026);
      expect(screen.getByLabelText(/Custom amount per day/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('radio', { name: /^year$/i }));
      expect(screen.getByLabelText(/Custom amount per year/i)).toBeInTheDocument();
    });

    it('typing into the custom field updates the projection', () => {
      render(<Calculator />);
      selectYear(2026);
      const before = screen.getByTestId('headline-amount').textContent;
      const customInput = screen.getByLabelText(/Custom amount per day/i);
      fireEvent.change(customInput, { target: { value: '7' } });
      const after = screen.getByTestId('headline-amount').textContent;
      expect(after).not.toBe(before);
    });

    it('typing a yearly amount above $5,000 clamps to $5,000 (no over-cap value reaches the projection)', () => {
      render(<Calculator />);
      selectYear(2026);
      fireEvent.click(screen.getByRole('radio', { name: /^year$/i }));
      const customInput = screen.getByLabelText(/Custom amount per year/i) as HTMLInputElement;
      fireEvent.change(customInput, { target: { value: '10000' } });
      // Input is clamped to the federal $5,000 cap, so the cap warning never
      // fires from typed-in values.
      expect(customInput.value).toBe('5000');
      expect(
        screen.queryByText(/Capped at the \$5,000\/year federal maximum/i),
      ).not.toBeInTheDocument();
    });

    it('typing a daily amount above $13.69 clamps to the per-day cap', () => {
      render(<Calculator />);
      selectYear(2026);
      fireEvent.click(screen.getByRole('radio', { name: /^day$/i }));
      const customInput = screen.getByLabelText(/Custom amount per day/i) as HTMLInputElement;
      fireEvent.change(customInput, { target: { value: '30' } });
      // 5000/365 floor-truncated to 2 decimals = 13.69
      expect(customInput.value).toBe('13.69');
    });

    it('typing a monthly amount above $416.66 clamps to the per-month cap', () => {
      render(<Calculator />);
      selectYear(2026);
      fireEvent.click(screen.getByRole('radio', { name: /^month$/i }));
      const customInput = screen.getByLabelText(/Custom amount per month/i) as HTMLInputElement;
      fireEvent.change(customInput, { target: { value: '1000' } });
      // 5000/12 floor-truncated to 2 decimals = 416.66
      expect(customInput.value).toBe('416.66');
    });

    it('annual-equivalent helper text appears under the custom input', () => {
      render(<Calculator />);
      selectYear(2026);
      expect(screen.getByText(/That's \$1,825 per year/i)).toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Optimistic-mode integration tests (new default).
  // ─────────────────────────────────────────────────────────────────────────

  describe('optimistic-mode integration', () => {
    it('headline number matches projectOptimisticHistorical medianSavings (seed-stable)', () => {
      const expected = projectOptimisticHistorical({
        birthYear: 2026,
        monthlyContribution: toMonthlyEquivalent(5, 'day'),
        seed: UI_RNG_SEED,
      });
      const expectedFormatted = formatCurrency(expected.medianSavings);

      render(<Calculator />);
      selectYear(2026);

      expect(screen.getByTestId('headline-amount').textContent).toBe(expectedFormatted);
    });

    it('headline is NOT the conservative realP25 (regression sentinel: optimistic, not conservative)', () => {
      const conservative = projectConservativeRealWorld({
        birthYear: 2026,
        monthlyContribution: toMonthlyEquivalent(5, 'day'),
      });
      const conservativeFormatted = formatCurrency(conservative.primaryConservativeResult.real);

      render(<Calculator />);
      selectYear(2026);

      expect(screen.getByTestId('headline-amount').textContent).not.toBe(conservativeFormatted);
    });

    it('headline is NOT the deterministic 7% projectBalance result (regression sentinel: not simple mode)', () => {
      const simple = projectBalance({ birthYear: 2026, dailyContribution: 5 });
      const simpleFormatted = formatCurrency(simple.finalBalance);

      render(<Calculator />);
      selectYear(2026);

      expect(screen.getByTestId('headline-amount').textContent).not.toBe(simpleFormatted);
    });

    it('headline-amount cell shows the gross number — not the conservative-era "today\'s dollars" headline, "25th percentile", or "conservative estimate"', () => {
      render(<Calculator />);
      selectYear(2026);
      const headline = screen.getByTestId('headline-amount');
      // The headline NUMBER itself must not be the conservative-era today's-
      // dollars one (we now show that as a supplementary subtitle below, with
      // its own test id).
      expect(headline.textContent).not.toMatch(/today's dollar/i);
      expect(headline.textContent).not.toMatch(/conservative estimate/i);
      expect(headline.textContent).not.toMatch(/25th percentile/i);
      // The conservative-era subtitle phrasing must be gone too.
      expect(screen.queryByText(/conservative estimate/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/headline.*25th/i)).not.toBeInTheDocument();
    });

    it('headline subtitle mentions gross median + 1,000 paths + S&P 500', () => {
      render(<Calculator />);
      selectYear(2026);
      const subtitle = screen.getByText(/Gross median across 1,000 simulated S&P 500 paths/i);
      expect(subtitle).toBeInTheDocument();
    });

    it('renders a "today\'s dollars" subtitle under the gross headline, deflated at 2.5%/yr', () => {
      render(<Calculator />);
      selectYear(2026);
      const subtitle = screen.getByTestId('headline-todays-dollars');
      expect(subtitle.textContent).toMatch(/in today's dollars/i);
      expect(subtitle.textContent).toMatch(/2\.5% inflation/i);

      // Cross-check the deflator. The headline is in future-nominal dollars;
      // dividing the displayed today's-dollars number by it must produce the
      // exact 1/(1.025^18) ratio for a 2026 birth year (18 contribution years).
      // Pull each dollar amount via a $-anchored regex (so the "2.5% inflation"
      // suffix doesn't bleed into the parsed number).
      const parseDollars = (s: string) => {
        const m = s.match(/\$([\d,]+)/);
        return m ? Number(m[1].replace(/,/g, '')) : NaN;
      };
      const headlineValue = parseDollars(screen.getByTestId('headline-amount').textContent ?? '');
      const todaysValue = parseDollars(subtitle.textContent ?? '');
      const expectedRatio = 1 / Math.pow(1.025, 18);
      expect(todaysValue / headlineValue).toBeCloseTo(expectedRatio, 2);
    });

    it('surfaces companion percentiles P10, P25, P75 via test ids (future nominal dollars)', () => {
      render(<Calculator />);
      selectYear(2026);
      expect(screen.getByTestId('p10-amount')).toBeInTheDocument();
      expect(screen.getByTestId('p25-amount')).toBeInTheDocument();
      expect(screen.getByTestId('p75-amount')).toBeInTheDocument();
    });

    it('surfaces the assumption audit row (annualized mean & vol from the Yahoo-derived defaults)', () => {
      render(<Calculator />);
      selectYear(2026);
      // The audit row was shortened to a single-line summary that fits next to
      // the rerun button. We anchor the lookup on the new testid.
      const audit = screen.getByTestId('assumptions-line');
      // Yahoo-derived defaults: pre-fee ≈10.59%; after 0.10% fee ≈10.49%.
      expect(audit.textContent).toMatch(/10\.[3-6]%/);
      // 0.043521 × √12 ≈ 15.08%
      expect(audit.textContent).toMatch(/15\.[0-2]%/);
      // Data range still surfaced.
      expect(audit.textContent).toMatch(/S&P 500/);
      expect(audit.textContent).toMatch(/198[0-9].*20[0-9]{2}/);
    });

    it('uses Yahoo-derived defaults (1985–2026 baseline) when no market props are overridden', () => {
      // Sanity-check that the algorithm called inside the component is keyed
      // off the same defaults the algorithm module exposes.
      expect(HISTORICAL_MONTHLY_MEAN).toBeCloseTo(0.008421878912947857, 12);
      expect(HISTORICAL_MONTHLY_VOL).toBeCloseTo(0.043521649260455646, 12);
    });

    it('does NOT display any "mean" or "average" headline language', () => {
      render(<Calculator />);
      selectYear(2026);
      // Subtitle says "Median outcome" — not "mean" or "average".
      expect(screen.queryByText(/arithmetic mean/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/^average$/i)).not.toBeInTheDocument();
    });

    it('frequency conversion: equivalent daily/monthly/yearly inputs feed the same monthly amount to the optimistic algorithm', () => {
      // $5/day == ≈ $152.083/mo == $1,825/yr — same monthly-equivalent.
      const fromDay = projectOptimisticHistorical({
        birthYear: 2026,
        monthlyContribution: toMonthlyEquivalent(5, 'day'),
        seed: UI_RNG_SEED,
      });
      const fromMonth = projectOptimisticHistorical({
        birthYear: 2026,
        monthlyContribution: toMonthlyEquivalent(5 * 365 / 12, 'month'),
        seed: UI_RNG_SEED,
      });
      const fromYear = projectOptimisticHistorical({
        birthYear: 2026,
        monthlyContribution: toMonthlyEquivalent(1825, 'year'),
        seed: UI_RNG_SEED,
      });
      expect(fromMonth.medianSavings).toBe(fromDay.medianSavings);
      expect(fromYear.medianSavings).toBe(fromDay.medianSavings);
    });

    it('cap clamps typed input at $5,000/yr across frequencies', () => {
      render(<Calculator />);
      selectYear(2026);

      fireEvent.click(screen.getByRole('radio', { name: /^year$/i }));
      const yearInput = screen.getByLabelText(/Custom amount per year/i) as HTMLInputElement;
      fireEvent.change(yearInput, { target: { value: '10000' } });
      expect(yearInput.value).toBe('5000');

      fireEvent.click(screen.getByRole('radio', { name: /^day$/i }));
      const dayInput = screen.getByLabelText(/Custom amount per day/i) as HTMLInputElement;
      fireEvent.change(dayInput, { target: { value: '30' } });
      expect(dayInput.value).toBe('13.69');
    });

    it('preset $20/day still triggers the cap warning (preset values stay PRD-aspirational)', () => {
      render(<Calculator />);
      selectYear(2026);
      fireEvent.click(screen.getByRole('radio', { name: /^day$/i }));
      // $20/day × 365 = $7,300/yr → over the federal $5,000 cap.
      fireEvent.click(screen.getByRole('radio', { name: /\$20/ }));
      expect(
        screen.getByText(/Capped at the \$5,000\/year federal maximum/i),
      ).toBeInTheDocument();
    });

    it('2026 + $5,000/yr → headline median is well above $200k (optimistic vs simple 7% ≈ $173k)', () => {
      render(<Calculator />);
      selectYear(2026);
      fireEvent.click(screen.getByRole('radio', { name: /^year$/i }));
      fireEvent.change(screen.getByLabelText(/Custom amount per year/i), {
        target: { value: '5000' },
      });

      const txt = screen.getByTestId('headline-amount').textContent ?? '';
      const value = Number(txt.replace(/[^0-9]/g, ''));
      expect(value).toBeGreaterThan(200_000);
    });

    // ─────────────────────────────────────────────────────────────────────
    // Comprehensive three-way regression test (checklist §2).
    // ─────────────────────────────────────────────────────────────────────
    it('three-way regression: 2026 + $5,000/yr → headline matches optimistic median, beats simple 7% and dwarfs conservative real P25', () => {
      // Compute the three reference results independently.
      const simple = projectBalance({ birthYear: 2026, dailyContribution: 14 });
      const conservative = projectConservativeRealWorld({
        birthYear: 2026,
        monthlyContribution: 500,
      });
      const optimistic = projectOptimisticHistorical({
        birthYear: 2026,
        monthlyContribution: 500,
        seed: UI_RNG_SEED,
      });

      // (a) Sanity-check the reference numbers landed where we expect.
      expect(simple.annualContribution).toBe(5000);
      expect(simple.finalBalance).toBeGreaterThan(170_000);
      expect(simple.finalBalance).toBeLessThan(180_000); // ≈ $173k
      expect(conservative.contributionDetails.cappedAnnual).toBe(5000);
      expect(optimistic.contributionDetails.cappedAnnual).toBe(5000);

      // (b) Render the UI with the same input.
      render(<Calculator />);
      selectYear(2026);
      fireEvent.click(screen.getByRole('radio', { name: /^year$/i }));
      fireEvent.change(screen.getByLabelText(/Custom amount per year/i), {
        target: { value: '5000' },
      });

      // (c) The displayed headline must match the optimistic median to the cent.
      const displayed = screen.getByTestId('headline-amount').textContent;
      expect(displayed).toBe(formatCurrency(optimistic.medianSavings));

      // (d) And it must NOT match either of the other modes.
      expect(displayed).not.toBe(formatCurrency(simple.finalBalance));
      expect(displayed).not.toBe(formatCurrency(conservative.primaryConservativeResult.real));
      expect(displayed).not.toBe(formatCurrency(conservative.realMedian));

      // (e) Materially higher than the optimistic-historical simple 7% ($173k):
      //     With ≈10.5% post-fee mean and 15.1% vol over 18 years, the median
      //     should comfortably exceed the deterministic 7% number.
      expect(optimistic.medianSavings).toBeGreaterThan(simple.finalBalance);

      // (f) Way above the conservative real P25:
      //     Optimistic median (future $) ≫ Conservative P25 (today's $).
      expect(optimistic.medianSavings).toBeGreaterThan(
        conservative.primaryConservativeResult.real * 3,
      );
    });

    it('headline is in the expected range for 2026 + $5,000/yr ($195k–$240k with the UI seed)', () => {
      // Hard bounds anchored to the seeded run with the new Yahoo-derived defaults
      // (1985–2026, ≈10.5% post-fee annualized) → ≈ $217k with seed 0xC0FFEE17.
      // The pre-realignment range (≈12.5% return, no fee) was $240k–$280k.
      render(<Calculator />);
      selectYear(2026);
      fireEvent.click(screen.getByRole('radio', { name: /^year$/i }));
      fireEvent.change(screen.getByLabelText(/Custom amount per year/i), {
        target: { value: '5000' },
      });
      const displayed = screen.getByTestId('headline-amount').textContent ?? '';
      const value = Number(displayed.replace(/[^0-9]/g, ''));
      expect(value).toBeGreaterThan(195_000);
      expect(value).toBeLessThan(240_000);
    });

    it('exposed result-data field names do NOT include the conservative-era keys', () => {
      // Belt-and-suspenders contract check: data-testids on screen must not
      // include the conservative-era field names.
      render(<Calculator />);
      selectYear(2026);
      expect(screen.queryByTestId('real-median')).not.toBeInTheDocument();
      expect(screen.queryByTestId('nominal-p25')).not.toBeInTheDocument();
      expect(screen.queryByTestId('nominal-median')).not.toBeInTheDocument();
      // And the optimistic-era ids ARE present.
      expect(screen.getByTestId('headline-amount')).toBeInTheDocument();
      expect(screen.getByTestId('p10-amount')).toBeInTheDocument();
      expect(screen.getByTestId('p25-amount')).toBeInTheDocument();
      expect(screen.getByTestId('p75-amount')).toBeInTheDocument();
    });

    // ─────────────────────────────────────────────────────────────────────
    // "Run new simulation" button tests.
    // ─────────────────────────────────────────────────────────────────────
    describe('Run new simulation button', () => {
      afterEach(() => {
        vi.restoreAllMocks();
      });

      it('result block exposes the initial active seed = UI_RNG_SEED', () => {
        render(<Calculator />);
        selectYear(2026);
        const block = screen.getByTestId('result-block');
        expect(block).toHaveAttribute('data-active-seed', String(UI_RNG_SEED));
      });

      it('initial headline is deterministic with the default seed (matches projectOptimisticHistorical exactly)', () => {
        const expected = projectOptimisticHistorical({
          birthYear: 2026,
          monthlyContribution: toMonthlyEquivalent(5, 'day'),
          seed: UI_RNG_SEED,
        });
        render(<Calculator />);
        selectYear(2026);
        expect(screen.getByTestId('headline-amount').textContent).toBe(
          formatCurrency(expected.medianSavings),
        );
      });

      it('renders the rerun button with both visible and accessible labels', () => {
        render(<Calculator />);
        selectYear(2026);
        const btn = screen.getByTestId('rerun-button');
        expect(btn).toBeInTheDocument();
        expect(btn).toHaveAccessibleName(/run a new monte carlo simulation/i);
        // Compact button copy.
        expect(btn.textContent).toMatch(/new paths/i);
      });

      it('explains via the button title tooltip that paths are reused for stable comparison', () => {
        render(<Calculator />);
        selectYear(2026);
        // The inline explanation paragraph was moved into the rerun button's
        // `title` attribute (browser tooltip) so the result block stays compact.
        const btn = screen.getByTestId('rerun-button');
        expect(btn).toHaveAttribute(
          'title',
          expect.stringMatching(
            /same 1,000 market paths are reused so you can compare different contributions side-by-side/i,
          ),
        );
      });

      it('clicking the button swaps in a new seed (data-active-seed changes)', () => {
        // Mock crypto.getRandomValues to return a deterministic Uint32 value.
        const FAKE_SEED = 0xabcdef01;
        vi.spyOn(crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(
          buffer: T,
        ): T => {
          if (buffer instanceof Uint32Array) buffer[0] = FAKE_SEED;
          return buffer;
        });

        render(<Calculator />);
        selectYear(2026);
        const block = screen.getByTestId('result-block');
        expect(block).toHaveAttribute('data-active-seed', String(UI_RNG_SEED));

        fireEvent.click(screen.getByTestId('rerun-button'));

        expect(block).toHaveAttribute('data-active-seed', String(FAKE_SEED));
      });

      it('after clicking, the headline equals projectOptimisticHistorical with the new seed (same inputs)', () => {
        const FAKE_SEED = 0xabcdef01;
        vi.spyOn(crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(
          buffer: T,
        ): T => {
          if (buffer instanceof Uint32Array) buffer[0] = FAKE_SEED;
          return buffer;
        });

        render(<Calculator />);
        selectYear(2026); // default $5/day

        const before = screen.getByTestId('headline-amount').textContent;
        fireEvent.click(screen.getByTestId('rerun-button'));
        const after = screen.getByTestId('headline-amount').textContent;

        // Expected: same inputs, fresh seed → different median.
        const expected = projectOptimisticHistorical({
          birthYear: 2026,
          monthlyContribution: toMonthlyEquivalent(5, 'day'),
          seed: FAKE_SEED,
        });
        expect(after).toBe(formatCurrency(expected.medianSavings));
        expect(after).not.toBe(before);
      });

      it('the rerun button does not change the user\'s contribution, frequency, or birth year', () => {
        const FAKE_SEED = 0x12345678;
        vi.spyOn(crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(
          buffer: T,
        ): T => {
          if (buffer instanceof Uint32Array) buffer[0] = FAKE_SEED;
          return buffer;
        });

        render(<Calculator />);
        selectYear(2026);
        fireEvent.click(screen.getByRole('radio', { name: /^month$/i }));
        fireEvent.change(screen.getByLabelText(/Custom amount per month/i), {
          target: { value: '275' },
        });

        const birthYearBefore = (screen.getByLabelText(/birth year/i) as HTMLSelectElement).value;
        const freqRadio = within(screen.getByRole('radiogroup', { name: /frequency/i }))
          .getByRole('radio', { name: /^month$/i });
        const monthInput = screen.getByLabelText(/Custom amount per month/i) as HTMLInputElement;
        const amountBefore = monthInput.value;

        fireEvent.click(screen.getByTestId('rerun-button'));

        expect((screen.getByLabelText(/birth year/i) as HTMLSelectElement).value).toBe(birthYearBefore);
        expect(freqRadio).toHaveAttribute('aria-checked', 'true');
        expect((screen.getByLabelText(/Custom amount per month/i) as HTMLInputElement).value).toBe(
          amountBefore,
        );
      });

      it('changing contribution amount uses the CURRENT seed (no auto-rerun) — data-active-seed stays at UI_RNG_SEED', () => {
        render(<Calculator />);
        selectYear(2026);
        // Active seed should be the default.
        expect(screen.getByTestId('result-block')).toHaveAttribute(
          'data-active-seed',
          String(UI_RNG_SEED),
        );

        // Change the daily contribution.
        fireEvent.click(screen.getByRole('radio', { name: /\$10/ }));

        // Seed should NOT have auto-changed.
        expect(screen.getByTestId('result-block')).toHaveAttribute(
          'data-active-seed',
          String(UI_RNG_SEED),
        );

        // And the headline equals the optimistic median for the new contribution
        // with the SAME UI_RNG_SEED — proving the seed didn't auto-update.
        const expected = projectOptimisticHistorical({
          birthYear: 2026,
          monthlyContribution: toMonthlyEquivalent(10, 'day'),
          seed: UI_RNG_SEED,
        });
        expect(screen.getByTestId('headline-amount').textContent).toBe(
          formatCurrency(expected.medianSavings),
        );
      });

      it('changing frequency uses the current seed (no auto-rerun)', () => {
        render(<Calculator />);
        selectYear(2026);
        const before = screen.getByTestId('result-block').getAttribute('data-active-seed');

        fireEvent.click(screen.getByRole('radio', { name: /^year$/i }));

        const after = screen.getByTestId('result-block').getAttribute('data-active-seed');
        expect(after).toBe(before);
      });

      it('changing birth year uses the current seed (no auto-rerun)', () => {
        render(<Calculator />);
        selectYear(2026);
        const before = screen.getByTestId('result-block').getAttribute('data-active-seed');
        selectYear(2027);
        const after = screen.getByTestId('result-block').getAttribute('data-active-seed');
        expect(after).toBe(before);
      });

      it('cap still applies after a rerun: typing $10,000/yr clamps to $5,000 (no warning needed)', () => {
        const FAKE_SEED = 0xdeadbeef;
        vi.spyOn(crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(
          buffer: T,
        ): T => {
          if (buffer instanceof Uint32Array) buffer[0] = FAKE_SEED;
          return buffer;
        });

        render(<Calculator />);
        selectYear(2026);
        fireEvent.click(screen.getByRole('radio', { name: /^year$/i }));
        const yearInput = screen.getByLabelText(/Custom amount per year/i) as HTMLInputElement;
        fireEvent.change(yearInput, { target: { value: '10000' } });
        // Input is clamped at the cap — no over-cap value ever reaches state.
        expect(yearInput.value).toBe('5000');

        fireEvent.click(screen.getByTestId('rerun-button'));

        // Still clamped after rerun — seed changed, contribution did not.
        expect(yearInput.value).toBe('5000');
        // And the new headline equals projectOptimisticHistorical at $5,000/yr (annualized).
        const expected = projectOptimisticHistorical({
          birthYear: 2026,
          monthlyContribution: toMonthlyEquivalent(10000, 'year'),
          seed: FAKE_SEED,
        });
        // Algorithm clamps internally too; the input also clamped to 5000 above.
        expect(screen.getByTestId('headline-amount').textContent).toBe(
          formatCurrency(expected.medianSavings),
        );
      });

      it('falls back to Math.random when crypto.getRandomValues is unavailable', () => {
        // Mock crypto as if it were undefined by stubbing the method to throw,
        // then assert the button still produces a seed change via Math.random.
        const cryptoSpy = vi
          .spyOn(crypto, 'getRandomValues')
          .mockImplementation(() => {
            throw new Error('forced fallback');
          });
        const randSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

        render(<Calculator />);
        selectYear(2026);

        // Math.random(0.5) × 2³² = 0x80000000 → seed becomes 2147483648.
        // But the spy throws inside the if-branch — see if we use the catch path.
        // Our implementation does NOT catch (we test only the if-typeof guard).
        // So with crypto.getRandomValues defined but throwing, the call would
        // throw. To exercise the fallback, we instead simulate the typeof guard:
        cryptoSpy.mockRestore();
        // Now reach the Math.random branch by overriding the global crypto check:
        const original = globalThis.crypto;
        Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
        try {
          fireEvent.click(screen.getByTestId('rerun-button'));
          // 0.5 × 2³² rounds to 2147483648.
          expect(screen.getByTestId('result-block')).toHaveAttribute(
            'data-active-seed',
            String(2147483648),
          );
          expect(randSpy).toHaveBeenCalled();
        } finally {
          Object.defineProperty(globalThis, 'crypto', { configurable: true, value: original });
        }
      });
    });

    it('UI headline subtitle does not contain the conservative-era phrasing', () => {
      // The original conservative-era subtitle was:
      //   "Conservative estimate (25th percentile) across 1,000 simulated market paths…"
      // Verify that exact phrasing (and its component fragments as headline copy)
      // is gone. NOTE: today's-dollars phrasing is allowed *elsewhere on the page*
      // — it's now a supplementary subtitle under the headline (see the
      // headline-todays-dollars test below) — but it must not be the main
      // headline subtitle.
      render(<Calculator />);
      selectYear(2026);
      expect(
        screen.queryByText(/Conservative estimate \(25th percentile\)/i),
      ).not.toBeInTheDocument();
      const subtitle = screen.getByText(/Gross median across 1,000 simulated S&P 500 paths/i);
      expect(subtitle.textContent).not.toMatch(/today's dollar/i);
      expect(subtitle.textContent).not.toMatch(/conservative/i);
      expect(subtitle.textContent).not.toMatch(/25th percentile/i);
    });
  });
});
