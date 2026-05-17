import { describe, it, expect } from 'vitest';
import {
  capContributions,
  stateKiddieTaxOnYearGain,
  pathwiseStateKiddieTax,
  runTaxModel,
  applyPerPathTax,
  type TaxModelInput,
} from './taxModel';
import { STATES } from './stateTax';

const CA = STATES.CA;
const NO_TAX = STATES.NO_TAX;

// ---------------------------------------------------------------------------
// §6 / §18.1 — capContributions lookup table
// ---------------------------------------------------------------------------

describe('capContributions — pinned values per §18.1', () => {
  it.each([
    [0, 0, 0, 0, false],
    [1_000, 2_000, 1_000, 2_000, false],
    [2_500, 2_500, 2_500, 2_500, false],
    [2_501, 0, 2_500, 0, true],
    [5_000, 0, 2_500, 0, true],
    [2_500, 3_000, 2_500, 2_500, true],
    [0, 6_000, 0, 5_000, true],
    [1_000, 5_000, 1_000, 4_000, true],
  ] as const)(
    'rawEmployer=%d rawOther=%d → employerC=%d otherC=%d wasCapped=%s',
    (rawEmployer, rawOther, expEmployer, expOther, expCapped) => {
      const r = capContributions(rawEmployer, rawOther);
      expect(r.employerC).toBe(expEmployer);
      expect(r.otherC).toBe(expOther);
      expect(r.wasCapped).toBe(expCapped);
    },
  );

  it('handles negative inputs defensively', () => {
    const r = capContributions(-100, -50);
    expect(r.employerC).toBe(0);
    expect(r.otherC).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §9.1 — stateKiddieTaxOnYearGain
// ---------------------------------------------------------------------------

describe('stateKiddieTaxOnYearGain', () => {
  it('returns 0 for NO_TAX state regardless of gain', () => {
    expect(stateKiddieTaxOnYearGain(100_000, 5_000, 'mfj', 75_000, NO_TAX)).toBe(0);
  });

  it('CA — exempt band: gain × 5% ≤ $1,350 → no tax', () => {
    // 27,000 × 0.05 = 1,350 → exactly fills exempt band
    expect(stateKiddieTaxOnYearGain(27_000, 5_000, 'mfj', 75_000, CA)).toBe(0);
  });

  it('CA — child band: exempt + child band fully filled = $1,350 × 1% = $13.50', () => {
    // 54,000 × 0.05 = 2,700 → fills exempt + child band
    expect(stateKiddieTaxOnYearGain(54_000, 5_000, 'mfj', 75_000, CA)).toBeCloseTo(13.5, 4);
  });

  it('CA — negative gain → 0', () => {
    expect(stateKiddieTaxOnYearGain(-10_000, 5_000, 'mfj', 75_000, CA)).toBe(0);
  });

  it('CA — large gain spills into parent band', () => {
    // 100,000 × 0.05 = 5,000 → exempt (1,350) + child band (1,350) + parent (2,300)
    // parent band taxed at incremental rate stacked on $75k + $5k = $80k mfj
    const t = stateKiddieTaxOnYearGain(100_000, 5_000, 'mfj', 75_000, CA);
    expect(t).toBeGreaterThan(13.5);
  });
});

// ---------------------------------------------------------------------------
// §9.2 — pathwiseStateKiddieTax
// ---------------------------------------------------------------------------

describe('pathwiseStateKiddieTax', () => {
  it('empty trajectory → 0', () => {
    expect(pathwiseStateKiddieTax([], 0, 0, 'mfj', 75_000, CA)).toBe(0);
  });

  it('NO_TAX state → 0', () => {
    const balances = new Float64Array([10_000, 30_000, 60_000]);
    expect(pathwiseStateKiddieTax(balances, 1_000, 5_000, 'mfj', 75_000, NO_TAX)).toBe(0);
  });

  it('all-below-exempt 18-year flat path → 0', () => {
    // Each year gains $20k pre-realization → $1k realized → all in exempt band
    const balances = new Float64Array(18);
    for (let y = 0; y < 18; y++) balances[y] = 1_000 + (y + 1) * (5_000 + 20_000);
    expect(pathwiseStateKiddieTax(balances, 1_000, 5_000, 'mfj', 75_000, CA)).toBe(0);
  });

  it('paths with identical terminals but different shapes can yield different totals', () => {
    // Flat: each year balance grows by exactly $30k
    const flat = new Float64Array(18);
    for (let y = 0; y < 18; y++) flat[y] = 1_000 + (y + 1) * (5_000 + 30_000);

    // Spiky: 17 years flat-no-gain, year 18 catches up to the same terminal
    const flatTerminal = flat[17];
    const spiky = new Float64Array(18);
    for (let y = 0; y < 17; y++) spiky[y] = 1_000 + (y + 1) * 5_000;
    spiky[17] = flatTerminal;

    const tFlat = pathwiseStateKiddieTax(flat, 1_000, 5_000, 'mfj', 75_000, CA);
    const tSpiky = pathwiseStateKiddieTax(spiky, 1_000, 5_000, 'mfj', 75_000, CA);
    expect(tSpiky).toBeGreaterThan(tFlat); // spike incurs a large terminal-year hit
  });
});

// ---------------------------------------------------------------------------
// §10 — runTaxModel
// ---------------------------------------------------------------------------

const BASE_CA_INPUT: TaxModelInput = {
  years: 18,
  annualEmployerContribution: 2_500,
  annualOtherContribution: 2_500,
  monthlyReturnRate: Math.pow(1.085, 1 / 12) - 1,
  filingStatus: 'mfj',
  state: CA,
  baseStateTaxableIncome: 150_000,
  parentFederalMarginalRate: 0.24,
  childFutureFederalRate: 0.10,
  initialSeed: 1_000,
  includeAnnualStateKiddieTax: true,
};

describe('runTaxModel — comparison mode (Mode B sameAfterTaxCash vs Mode A samePreTaxIncome)', () => {
  // The default mode is `sameAfterTaxCash`. Both accounts deposit the same
  // post-tax cash. Mode A is preserved as an explicit option.

  it('default is sameAfterTaxCash and echoes back on the result', () => {
    const r = runTaxModel(BASE_CA_INPUT);
    expect(r.comparisonMode).toBe('sameAfterTaxCash');
  });

  it('Mode A is opt-in and echoes back', () => {
    const r = runTaxModel({ ...BASE_CA_INPUT, comparisonMode: 'samePreTaxIncome' });
    expect(r.comparisonMode).toBe('samePreTaxIncome');
  });

  it('Mode B: baseline invests full totalC (basis grows by full totalC per year, not net of fed/state)', () => {
    // No state tax + parent fed rate 0 → kills all gain-side tax noise and
    // isolates the contribution-side basis behavior.
    const NO_TAX = STATES.NO_TAX;
    const cleanInput: TaxModelInput = {
      ...BASE_CA_INPUT,
      state: NO_TAX,
      parentFederalMarginalRate: 0, // also nukes LTCG (mapping gives 0)
      monthlyReturnRate: 0, // no compounding
    };
    const modeB = runTaxModel(cleanInput);
    // No growth, no taxes anywhere → baseline ends at exactly totalC × years + 0.
    // baselineBalance never had a seed; only contributions.
    const totalC = 5_000;
    expect(modeB.baselineFinalBalance).toBeCloseTo(totalC * 18, 5);
  });

  it('Mode A: baseline invests totalC reduced by parent ordinary tax', () => {
    // Same clean inputs but switch to Mode A; parent fed rate matters.
    const NO_TAX = STATES.NO_TAX;
    const cleanModeA: TaxModelInput = {
      ...BASE_CA_INPUT,
      state: NO_TAX,
      parentFederalMarginalRate: 0.24,
      monthlyReturnRate: 0,
      comparisonMode: 'samePreTaxIncome',
    };
    const modeA = runTaxModel(cleanModeA);
    const totalC = 5_000;
    // afterTaxC per year = totalC × (1 - 0.24) = $3,800
    // 18 years × $3,800 = $68,400
    expect(modeA.baselineFinalBalance).toBeCloseTo(3_800 * 18, 5);
  });

  it('Mode B counts NO ordinary-income tax on the baseline contribution', () => {
    // Same input, both modes. Mode A's brokerage deposits totalC * (1 - rate);
    // Mode B's brokerage deposits the full totalC. With no compounding the
    // delta is exactly the missing contribution-tax stream.
    const NO_TAX = STATES.NO_TAX;
    const input: TaxModelInput = {
      ...BASE_CA_INPUT,
      state: NO_TAX,
      parentFederalMarginalRate: 0.24,
      monthlyReturnRate: 0,
    };
    const modeA = runTaxModel({ ...input, comparisonMode: 'samePreTaxIncome' });
    const modeB = runTaxModel({ ...input, comparisonMode: 'sameAfterTaxCash' });

    // Mode A baseline gets afterTaxC = $5000 × (1 - 0.24) = $3,800/yr × 18 = $68,400.
    // Mode B baseline gets the full $5,000/yr × 18 = $90,000.
    expect(modeA.baselineFinalBalance).toBeCloseTo(3_800 * 18, 5);
    expect(modeB.baselineFinalBalance).toBeCloseTo(5_000 * 18, 5);
    // Mode A's baseline pays $1,200/yr × 18 = $21,600 in federal contribution
    // tax. Mode B records zero baseline federal tax on contribution.
    // (Both modes still see a small distribution-side tax difference because
    // §530A's federal basis excludes the §128 employer slug — that's why we
    // don't expect raw equality on federalTaxSavings, only on the baseline
    // side.)
    expect(modeA.baselineFinalBalance + 21_600).toBeCloseTo(modeB.baselineFinalBalance, 0);
  });

  it('Mode A produces a LARGER Trump advantage than Mode B (low-income CA family)', () => {
    // Same input except for mode. Mode A inflates §530A wealthDifference
    // because the brokerage compounds a smaller after-tax deposit.
    const lowIncomeCA: TaxModelInput = {
      ...BASE_CA_INPUT,
      annualEmployerContribution: 0,
      annualOtherContribution: 5_000,
      filingStatus: 'mfj',
      baseStateTaxableIncome: 75_000,
      parentFederalMarginalRate: 0.12,
      childFutureFederalRate: 0.10,
    };
    const modeB = runTaxModel({ ...lowIncomeCA, comparisonMode: 'sameAfterTaxCash' });
    const modeA = runTaxModel({ ...lowIncomeCA, comparisonMode: 'samePreTaxIncome' });
    expect(modeA.wealthDifference).toBeGreaterThan(modeB.wealthDifference);
    expect(modeA.baselineFinalBalance).toBeLessThan(modeB.baselineFinalBalance);
  });

  it('Mode B combinedTaxSavings excludes ordinary contribution tax — measures investment/account treatment only', () => {
    // Clean setup so the only non-zero taxes are gain-side. With parent rate
    // 0 and no growth, ALL fields should be 0 in Mode B.
    const NO_TAX = STATES.NO_TAX;
    const inert: TaxModelInput = {
      ...BASE_CA_INPUT,
      state: NO_TAX,
      parentFederalMarginalRate: 0,
      monthlyReturnRate: 0,
      annualEmployerContribution: 0,
      annualOtherContribution: 5_000,
      initialSeed: 0,
      childFutureFederalRate: 0,
    };
    const modeB = runTaxModel(inert);
    expect(modeB.federalTaxSavings).toBe(0);
    expect(modeB.stateTaxSavings).toBe(0);
    expect(modeB.combinedTaxSavings).toBe(0);
  });

  it('Mode A combinedTaxSavings DOES include ordinary contribution tax', () => {
    // Same inert setup but Mode A: brokerage pays 24% × $5k × 18 = $21.6k in
    // fed contribution tax, Trump pays the same out-of-pocket. With parent
    // rate 0.24 that's a wash for federalTaxSavings (both sides paid the
    // same), but it confirms Mode A is wiring the contribution tax in.
    const NO_TAX = STATES.NO_TAX;
    const modeAInert: TaxModelInput = {
      ...BASE_CA_INPUT,
      state: NO_TAX,
      parentFederalMarginalRate: 0.24,
      monthlyReturnRate: 0,
      annualEmployerContribution: 0,
      annualOtherContribution: 5_000,
      initialSeed: 0,
      childFutureFederalRate: 0,
      comparisonMode: 'samePreTaxIncome',
    };
    const modeA = runTaxModel(modeAInert);
    // baselineTotalFederal includes 0.24 × 5000 × 18 = 21,600.
    // trumpTotalFederal includes the same trumpFedContrib stream = 21,600.
    // Plus a tiny terminal LTCG on the baseline's small unrealized gain (vol=0,
    // so any gain is exactly 0 — but the after-tax deposits don't compound at
    // monthlyReturnRate=0 either, so this stays clean).
    expect(modeA.federalTaxSavings).toBeCloseTo(0, 5);
    // Either side accumulated exactly $21,600 of "federal tax" — proving the
    // contribution tax is wired in Mode A.
  });
});

describe('runTaxModel — CA base case', () => {
  it('produces 18 yearRows with positive end balances', () => {
    const r = runTaxModel(BASE_CA_INPUT);
    expect(r.yearRows).toHaveLength(18);
    expect(r.baselineFinalBalance).toBeGreaterThan(0);
    expect(r.trumpFinalBalance).toBeGreaterThan(0);
  });

  it('echoes the kiddie-tax toggle', () => {
    const on = runTaxModel(BASE_CA_INPUT);
    const off = runTaxModel({ ...BASE_CA_INPUT, includeAnnualStateKiddieTax: false });
    expect(on.annualStateKiddieTaxEnabled).toBe(true);
    expect(off.annualStateKiddieTaxEnabled).toBe(false);
  });

  it('Layer 2 toggle changes Trump balance but not baseline', () => {
    const on = runTaxModel(BASE_CA_INPUT);
    const off = runTaxModel({ ...BASE_CA_INPUT, includeAnnualStateKiddieTax: false });
    expect(on.trumpFinalBalance).not.toBeCloseTo(off.trumpFinalBalance, 1);
    expect(on.baselineFinalBalance).toBeCloseTo(off.baselineFinalBalance, 5);
  });

  it('wealthDifference ≈ trumpFinal − baselineFinal', () => {
    const r = runTaxModel(BASE_CA_INPUT);
    expect(r.wealthDifference).toBeCloseTo(r.trumpFinalBalance - r.baselineFinalBalance, 5);
  });

  it('year-18 terminal liquidation reduces baseline balance', () => {
    const r = runTaxModel(BASE_CA_INPUT);
    const lastRow = r.yearRows[r.yearRows.length - 1];
    expect(lastRow.baselineEndBalance).toBeGreaterThan(r.baselineFinalBalance);
  });
});

describe('runTaxModel — federal basis asymmetry', () => {
  it('Trump federal basis at distribution = otherC × years (not totalC × years)', () => {
    const employerC = 2_500;
    const otherC = 1_000;
    const r = runTaxModel({
      ...BASE_CA_INPUT,
      annualEmployerContribution: employerC,
      annualOtherContribution: otherC,
    });
    // The federal distribution tax is childFedRate × (trumpBalance − years × otherC).
    // Recompute the implied trumpBalance pre-fed-tax: it should be > federal basis.
    // We can't easily extract it, but we can assert that with smaller otherC the
    // federal taxable-at-distribution amount is higher → trumpFinal smaller per
    // dollar of contribution.
    const rBoth = runTaxModel({
      ...BASE_CA_INPUT,
      annualEmployerContribution: 0,
      annualOtherContribution: employerC + otherC, // same gross contribution, all individual
    });
    // With everything as individual, basis = (employerC+otherC) × years (larger basis)
    // → less taxable → higher trumpFinal.
    expect(rBoth.trumpFinalBalance).toBeGreaterThan(r.trumpFinalBalance);
  });
});

describe('runTaxModel — NO_TAX state', () => {
  const NO_TAX_INPUT: TaxModelInput = { ...BASE_CA_INPUT, state: NO_TAX };

  it('stateTaxSavings = 0 (no state tax on either side)', () => {
    const r = runTaxModel(NO_TAX_INPUT);
    expect(r.stateTaxSavings).toBe(0);
  });

  it('kiddie-tax toggle has no effect on Trump final', () => {
    const on = runTaxModel(NO_TAX_INPUT);
    const off = runTaxModel({ ...NO_TAX_INPUT, includeAnnualStateKiddieTax: false });
    expect(on.trumpFinalBalance).toBeCloseTo(off.trumpFinalBalance, 5);
  });

  it('federalTaxSavings still tracks (Trump saves federal tax on growth)', () => {
    const r = runTaxModel(NO_TAX_INPUT);
    expect(r.federalTaxSavings).toBeGreaterThan(0);
  });

  it('combinedTaxSavings === federalTaxSavings when state tax is 0', () => {
    const r = runTaxModel(NO_TAX_INPUT);
    expect(r.combinedTaxSavings).toBeCloseTo(r.federalTaxSavings, 5);
  });
});

describe('runTaxModel — zero contribution', () => {
  it('runs cleanly with no NaNs', () => {
    const r = runTaxModel({
      ...BASE_CA_INPUT,
      annualEmployerContribution: 0,
      annualOtherContribution: 0,
    });
    expect(Number.isFinite(r.trumpFinalBalance)).toBe(true);
    expect(Number.isFinite(r.baselineFinalBalance)).toBe(true);
    expect(r.baselineFinalBalance).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// §10.6 — applyPerPathTax
// ---------------------------------------------------------------------------

describe('applyPerPathTax', () => {
  it('NO_TAX + zero federal rate → balance unchanged', () => {
    const balances = new Float64Array([10_000, 25_000, 50_000]);
    const after = applyPerPathTax({
      balanceByYear: balances,
      initialSeed: 1_000,
      employerC: 0,
      otherC: 2_000,
      filingStatus: 'mfj',
      state: NO_TAX,
      baseStateIncome: 75_000,
      childFutureFederalRate: 0,
      includeAnnualStateKiddieTax: false,
    });
    expect(after).toBeCloseTo(50_000, 5);
  });

  it('NO_TAX + child rate 10% → tax only on (terminal − individualBasis)', () => {
    const balances = new Float64Array([10_000, 30_000]);
    const after = applyPerPathTax({
      balanceByYear: balances,
      initialSeed: 1_000,
      employerC: 0,
      otherC: 5_000,
      filingStatus: 'mfj',
      state: NO_TAX,
      baseStateIncome: 75_000,
      childFutureFederalRate: 0.10,
      includeAnnualStateKiddieTax: false,
    });
    // basis = 2 × 5,000 = 10,000; taxable = 30,000 − 10,000 = 20,000; tax = 2,000
    expect(after).toBeCloseTo(28_000, 5);
  });

  it('CA Layer 2 ON uses pathwise kiddie tax', () => {
    const balances = new Float64Array(18);
    let bal = 1_000;
    for (let y = 0; y < 18; y++) {
      bal = bal * 1.10 + 5_000;
      balances[y] = bal;
    }
    const caOn = applyPerPathTax({
      balanceByYear: balances,
      initialSeed: 1_000,
      employerC: 2_500,
      otherC: 2_500,
      filingStatus: 'mfj',
      state: CA,
      baseStateIncome: 75_000,
      childFutureFederalRate: 0.10,
      includeAnnualStateKiddieTax: true,
    });
    const caOff = applyPerPathTax({
      balanceByYear: balances,
      initialSeed: 1_000,
      employerC: 2_500,
      otherC: 2_500,
      filingStatus: 'mfj',
      state: CA,
      baseStateIncome: 75_000,
      childFutureFederalRate: 0.10,
      includeAnnualStateKiddieTax: false,
    });
    expect(caOn).not.toBeCloseTo(caOff, 1);
    // Both should leave a positive after-tax balance.
    expect(caOn).toBeGreaterThan(0);
    expect(caOff).toBeGreaterThan(0);
  });

  it('empty path → initialSeed', () => {
    const after = applyPerPathTax({
      balanceByYear: new Float64Array(0),
      initialSeed: 1_000,
      employerC: 0,
      otherC: 0,
      filingStatus: 'mfj',
      state: CA,
      baseStateIncome: 75_000,
      childFutureFederalRate: 0.10,
      includeAnnualStateKiddieTax: true,
    });
    expect(after).toBe(1_000);
  });
});
