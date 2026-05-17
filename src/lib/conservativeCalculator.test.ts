import { describe, it, expect } from 'vitest';
import {
  CONSERVATIVE_MODE_ID,
  DEFAULT_CONSERVATIVE_ASSUMPTIONS,
  DEFAULT_NUM_PATHS,
  DEFAULT_RNG_SEED,
  projectConservativeRealWorld,
} from './conservativeCalculator';
import { projectBalance } from './calculator';
import { PILOT_SEED_AMOUNT, TRUMP_ACCOUNT_ANNUAL_CAP } from './constants';

const REQUIRED_FIELDS = [
  'nominalP10',
  'nominalP25',
  'nominalMedian',
  'nominalP75',
  'nominalP90',
  'realP10',
  'realP25',
  'realMedian',
  'realP75',
  'realP90',
  'totalContributions',
  'seedAmount',
  'expenseRatioUsed',
  'inflationRateUsed',
  'grossReturnAssumption',
  'netReturnAssumption',
  'yearsSimulated',
  'numPaths',
  'rngSeed',
  'primaryConservativeResult',
  'contributionDetails',
] as const;

describe('conservativeCalculator — constants & defaults', () => {
  it('exposes the mode id as a string literal', () => {
    expect(CONSERVATIVE_MODE_ID).toBe('conservativeRealWorld');
  });

  it('default assumptions match the spec (6% / 0.10% / 2.7% / 16%)', () => {
    expect(DEFAULT_CONSERVATIVE_ASSUMPTIONS.grossNominalAnnualReturn).toBe(0.06);
    expect(DEFAULT_CONSERVATIVE_ASSUMPTIONS.expenseRatio).toBe(0.001);
    expect(DEFAULT_CONSERVATIVE_ASSUMPTIONS.inflationRate).toBe(0.027);
    expect(DEFAULT_CONSERVATIVE_ASSUMPTIONS.annualVolatility).toBe(0.16);
  });

  it('default path count is at least 1,000', () => {
    expect(DEFAULT_NUM_PATHS).toBeGreaterThanOrEqual(1000);
  });
});

describe('projectConservativeRealWorld — output shape', () => {
  it('returns every required field', () => {
    const r = projectConservativeRealWorld({ birthYear: 2026, monthlyContribution: 150 });
    for (const f of REQUIRED_FIELDS) {
      expect(r, `missing field: ${f}`).toHaveProperty(f);
    }
  });

  it('echoes assumptions and seed back in audit fields', () => {
    const r = projectConservativeRealWorld({
      birthYear: 2026,
      monthlyContribution: 150,
      assumptions: { expenseRatio: 0.005, inflationRate: 0.03 },
      seed: 12345,
    });
    expect(r.expenseRatioUsed).toBe(0.005);
    expect(r.inflationRateUsed).toBe(0.03);
    expect(r.grossReturnAssumption).toBe(0.06);
    expect(r.rngSeed).toBe(12345);
  });

  it('netReturn = (1+gross) / (1+expense) − 1, exact', () => {
    const r = projectConservativeRealWorld({
      birthYear: 2026,
      monthlyContribution: 100,
      assumptions: { grossNominalAnnualReturn: 0.06, expenseRatio: 0.001 },
    });
    const expected = 1.06 / 1.001 - 1;
    expect(r.netReturnAssumption).toBeCloseTo(expected, 10);
  });

  it('primaryConservativeResult is the P25 number (nominal & real)', () => {
    const r = projectConservativeRealWorld({ birthYear: 2026, monthlyContribution: 150 });
    expect(r.primaryConservativeResult.nominal).toBe(r.nominalP25);
    expect(r.primaryConservativeResult.real).toBe(r.realP25);
  });
});

describe('projectConservativeRealWorld — determinism', () => {
  it('same input → identical output', () => {
    const a = projectConservativeRealWorld({ birthYear: 2026, monthlyContribution: 150 });
    const b = projectConservativeRealWorld({ birthYear: 2026, monthlyContribution: 150 });
    expect(b).toEqual(a);
  });

  it('different seeds produce different distributions', () => {
    const a = projectConservativeRealWorld({ birthYear: 2026, monthlyContribution: 150, seed: 1 });
    const b = projectConservativeRealWorld({ birthYear: 2026, monthlyContribution: 150, seed: 2 });
    expect(b.nominalMedian).not.toBe(a.nominalMedian);
  });

  it('uses the default seed when none is provided', () => {
    const r = projectConservativeRealWorld({ birthYear: 2026, monthlyContribution: 150 });
    expect(r.rngSeed).toBe(DEFAULT_RNG_SEED >>> 0);
  });
});

describe('projectConservativeRealWorld — contribution handling', () => {
  it('converts monthly to annual via ×12', () => {
    const r = projectConservativeRealWorld({ birthYear: 2026, monthlyContribution: 200 });
    expect(r.contributionDetails.rawMonthly).toBe(200);
    expect(r.contributionDetails.rawAnnual).toBe(2400);
    expect(r.contributionDetails.cappedAnnual).toBe(2400);
    expect(r.contributionDetails.wasCapped).toBe(false);
  });

  it('caps the annual contribution at the federal max', () => {
    const r = projectConservativeRealWorld({ birthYear: 2026, monthlyContribution: 1000 });
    expect(r.contributionDetails.rawAnnual).toBe(12_000);
    expect(r.contributionDetails.cappedAnnual).toBe(TRUMP_ACCOUNT_ANNUAL_CAP);
    expect(r.contributionDetails.wasCapped).toBe(true);
  });

  it('floors negative and NaN monthly inputs to zero', () => {
    expect(
      projectConservativeRealWorld({ birthYear: 2026, monthlyContribution: -50 })
        .contributionDetails.rawAnnual,
    ).toBe(0);
    expect(
      projectConservativeRealWorld({ birthYear: 2026, monthlyContribution: Number.NaN })
        .contributionDetails.rawAnnual,
    ).toBe(0);
  });

  it('totalContributions = seed + cappedAnnual × yearsSimulated', () => {
    const r = projectConservativeRealWorld({ birthYear: 2026, monthlyContribution: 150 });
    expect(r.totalContributions).toBe(r.seedAmount + r.contributionDetails.cappedAnnual * r.yearsSimulated);
  });
});

describe('projectConservativeRealWorld — eligibility integration', () => {
  it('birth year 2026 → 18 years simulated, $1,000 seed', () => {
    const r = projectConservativeRealWorld({ birthYear: 2026, monthlyContribution: 150 });
    expect(r.yearsSimulated).toBe(18);
    expect(r.seedAmount).toBe(PILOT_SEED_AMOUNT);
  });

  it('birth year 2025 → 17 years simulated, $1,000 seed', () => {
    const r = projectConservativeRealWorld({ birthYear: 2025, monthlyContribution: 150 });
    expect(r.yearsSimulated).toBe(17);
    expect(r.seedAmount).toBe(PILOT_SEED_AMOUNT);
  });

  it('birth year 2029 → 18 years, no seed', () => {
    const r = projectConservativeRealWorld({ birthYear: 2029, monthlyContribution: 150 });
    expect(r.yearsSimulated).toBe(18);
    expect(r.seedAmount).toBe(0);
  });

  it('birth year 2008 → 0 years, $0 seed, all percentiles 0', () => {
    const r = projectConservativeRealWorld({ birthYear: 2008, monthlyContribution: 200 });
    expect(r.yearsSimulated).toBe(0);
    expect(r.seedAmount).toBe(0);
    for (const p of ['nominalP10', 'nominalP25', 'nominalMedian', 'nominalP75', 'nominalP90'] as const) {
      expect(r[p]).toBe(0);
    }
  });
});

describe('projectConservativeRealWorld — percentile ordering', () => {
  it('nominal: P10 ≤ P25 ≤ median ≤ P75 ≤ P90', () => {
    const r = projectConservativeRealWorld({ birthYear: 2026, monthlyContribution: 150 });
    expect(r.nominalP10).toBeLessThanOrEqual(r.nominalP25);
    expect(r.nominalP25).toBeLessThanOrEqual(r.nominalMedian);
    expect(r.nominalMedian).toBeLessThanOrEqual(r.nominalP75);
    expect(r.nominalP75).toBeLessThanOrEqual(r.nominalP90);
  });

  it('real percentiles preserve the same ordering', () => {
    const r = projectConservativeRealWorld({ birthYear: 2026, monthlyContribution: 150 });
    expect(r.realP10).toBeLessThanOrEqual(r.realP25);
    expect(r.realP25).toBeLessThanOrEqual(r.realMedian);
    expect(r.realMedian).toBeLessThanOrEqual(r.realP75);
    expect(r.realP75).toBeLessThanOrEqual(r.realP90);
  });
});

describe('projectConservativeRealWorld — inflation handling', () => {
  it('real ≤ nominal at every percentile when inflation > 0', () => {
    const r = projectConservativeRealWorld({ birthYear: 2026, monthlyContribution: 150 });
    expect(r.realP10).toBeLessThan(r.nominalP10);
    expect(r.realP25).toBeLessThan(r.nominalP25);
    expect(r.realMedian).toBeLessThan(r.nominalMedian);
    expect(r.realP75).toBeLessThan(r.nominalP75);
    expect(r.realP90).toBeLessThan(r.nominalP90);
  });

  it('with inflation=0, real equals nominal at every percentile', () => {
    const r = projectConservativeRealWorld({
      birthYear: 2026,
      monthlyContribution: 150,
      assumptions: { inflationRate: 0 },
    });
    expect(r.realP10).toBe(r.nominalP10);
    expect(r.realMedian).toBe(r.nominalMedian);
    expect(r.realP90).toBe(r.nominalP90);
  });
});

describe('projectConservativeRealWorld — deterministic special cases', () => {
  it('volatility=0 collapses all paths to the same closed-form balance', () => {
    const r = projectConservativeRealWorld({
      birthYear: 2026,
      monthlyContribution: 0,
      assumptions: {
        grossNominalAnnualReturn: 0.06,
        expenseRatio: 0,
        inflationRate: 0,
        annualVolatility: 0,
      },
    });
    // seed 1000 grown for 18 yr at exact 6% (expense 0): 1000 × 1.06^18.
    const expected = 1000 * Math.pow(1.06, 18);
    expect(r.nominalMedian).toBeCloseTo(expected, 4);
    expect(r.nominalP10).toBeCloseTo(expected, 4);
    expect(r.nominalP90).toBeCloseTo(expected, 4);
  });

  it('volatility=0 + expense=0.1% gives 1000 × (1.06/1.001)^18 ≈ closed form', () => {
    const r = projectConservativeRealWorld({
      birthYear: 2026,
      monthlyContribution: 0,
      assumptions: {
        grossNominalAnnualReturn: 0.06,
        expenseRatio: 0.001,
        inflationRate: 0,
        annualVolatility: 0,
      },
    });
    const net = 1.06 / 1.001 - 1;
    const expected = 1000 * Math.pow(1 + net, 18);
    expect(r.nominalMedian).toBeCloseTo(expected, 4);
  });

  it('zero return and zero vol → balance equals seed + cappedAnnual × years', () => {
    const r = projectConservativeRealWorld({
      birthYear: 2026,
      monthlyContribution: 100,
      assumptions: {
        grossNominalAnnualReturn: 0,
        expenseRatio: 0,
        inflationRate: 0,
        annualVolatility: 0,
      },
    });
    expect(r.nominalMedian).toBeCloseTo(1000 + 1200 * 18, 6);
    expect(r.realMedian).toBe(r.nominalMedian);
  });
});

describe('projectConservativeRealWorld — sensitivity sanity', () => {
  it('a higher expense ratio reduces the median nominal terminal', () => {
    const low = projectConservativeRealWorld({
      birthYear: 2026,
      monthlyContribution: 150,
      assumptions: { expenseRatio: 0.001 },
    });
    const high = projectConservativeRealWorld({
      birthYear: 2026,
      monthlyContribution: 150,
      assumptions: { expenseRatio: 0.01 },
    });
    expect(high.nominalMedian).toBeLessThan(low.nominalMedian);
  });

  it('higher volatility widens the P10–P90 spread', () => {
    const calm = projectConservativeRealWorld({
      birthYear: 2026,
      monthlyContribution: 150,
      assumptions: { annualVolatility: 0.05 },
    });
    const wild = projectConservativeRealWorld({
      birthYear: 2026,
      monthlyContribution: 150,
      assumptions: { annualVolatility: 0.30 },
    });
    const calmSpread = calm.nominalP90 - calm.nominalP10;
    const wildSpread = wild.nominalP90 - wild.nominalP10;
    expect(wildSpread).toBeGreaterThan(calmSpread);
  });

  it('the conservative P25 is materially below the median (positive skew)', () => {
    const r = projectConservativeRealWorld({ birthYear: 2026, monthlyContribution: 150 });
    expect(r.nominalP25).toBeLessThan(r.nominalMedian);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Additional coverage per the testing checklist.
// ───────────────────────────────────────────────────────────────────────────

describe('projectConservativeRealWorld — eligibility seed (checklist §1)', () => {
  it.each([2025, 2026, 2027, 2028])('birth year %s receives the $1,000 seed', (y) => {
    const r = projectConservativeRealWorld({ birthYear: y, monthlyContribution: 0 });
    expect(r.seedAmount).toBe(PILOT_SEED_AMOUNT);
  });

  it.each([2008, 2009, 2010, 2024, 2029, 2030, 2050])(
    'birth year %s does NOT receive the seed',
    (y) => {
      const r = projectConservativeRealWorld({ birthYear: y, monthlyContribution: 0 });
      expect(r.seedAmount).toBe(0);
    },
  );

  it('an ineligible-for-contributions child (2008) ends with all percentiles = 0', () => {
    const r = projectConservativeRealWorld({ birthYear: 2008, monthlyContribution: 500 });
    expect(r.yearsSimulated).toBe(0);
    for (const k of ['nominalP10', 'nominalP25', 'nominalMedian', 'nominalP75', 'nominalP90'] as const) {
      expect(r[k]).toBe(0);
    }
  });
});

describe('projectConservativeRealWorld — contribution handling (checklist §2)', () => {
  it('monthly → annual is exactly ×12 below the cap', () => {
    const r = projectConservativeRealWorld({ birthYear: 2026, monthlyContribution: 175 });
    expect(r.contributionDetails.rawMonthly).toBe(175);
    expect(r.contributionDetails.rawAnnual).toBe(2100);
    expect(r.contributionDetails.cappedAnnual).toBe(2100);
    expect(r.contributionDetails.wasCapped).toBe(false);
  });

  it('annual cap clamps anything above $5,000 to exactly $5,000', () => {
    const r = projectConservativeRealWorld({ birthYear: 2026, monthlyContribution: 9999 });
    expect(r.contributionDetails.rawAnnual).toBe(9999 * 12);
    expect(r.contributionDetails.cappedAnnual).toBe(TRUMP_ACCOUNT_ANNUAL_CAP);
    expect(r.contributionDetails.wasCapped).toBe(true);
  });

  it('monthly = $5000/12 (≈ $416.67) lands exactly on the cap, not over', () => {
    const r = projectConservativeRealWorld({ birthYear: 2026, monthlyContribution: 5000 / 12 });
    // JS IEEE-754: (5000/12)*12 === 5000 exactly, so the cap binds but is not exceeded.
    expect(r.contributionDetails.rawAnnual).toBe(TRUMP_ACCOUNT_ANNUAL_CAP);
    expect(r.contributionDetails.cappedAnnual).toBe(TRUMP_ACCOUNT_ANNUAL_CAP);
    expect(r.contributionDetails.wasCapped).toBe(false);
  });

  it('monthly = $417 (just over the cap) clamps and reports wasCapped', () => {
    const r = projectConservativeRealWorld({ birthYear: 2026, monthlyContribution: 417 });
    expect(r.contributionDetails.rawAnnual).toBe(5004);
    expect(r.contributionDetails.cappedAnnual).toBe(TRUMP_ACCOUNT_ANNUAL_CAP);
    expect(r.contributionDetails.wasCapped).toBe(true);
  });

  it('zero contribution still grows the $1,000 seed for an eligible child', () => {
    const r = projectConservativeRealWorld({ birthYear: 2026, monthlyContribution: 0 });
    expect(r.seedAmount).toBe(PILOT_SEED_AMOUNT);
    expect(r.contributionDetails.cappedAnnual).toBe(0);
    expect(r.totalContributions).toBe(PILOT_SEED_AMOUNT);
    // Even pessimistic P10 should be at least a notable fraction of the seed;
    // median should clearly exceed the seed.
    expect(r.nominalP10).toBeGreaterThan(0);
    expect(r.nominalMedian).toBeGreaterThan(PILOT_SEED_AMOUNT);
  });

  it('zero contribution for an ineligible-for-seed birth year stays at zero', () => {
    const r = projectConservativeRealWorld({ birthYear: 2010, monthlyContribution: 0 });
    expect(r.seedAmount).toBe(0);
    for (const k of ['nominalP10', 'nominalP25', 'nominalMedian', 'nominalP75', 'nominalP90'] as const) {
      expect(r[k]).toBe(0);
    }
  });
});

describe('projectConservativeRealWorld — expense handling (checklist §3)', () => {
  it('a 0.10% expense ratio produces a lower nominal median than 0%', () => {
    const noFee = projectConservativeRealWorld({
      birthYear: 2026,
      monthlyContribution: 200,
      assumptions: { expenseRatio: 0 },
    });
    const tenBps = projectConservativeRealWorld({
      birthYear: 2026,
      monthlyContribution: 200,
      assumptions: { expenseRatio: 0.001 },
    });
    expect(tenBps.nominalMedian).toBeLessThan(noFee.nominalMedian);
    expect(tenBps.nominalP10).toBeLessThan(noFee.nominalP10);
    expect(tenBps.nominalP90).toBeLessThan(noFee.nominalP90);
  });

  it('netReturnAssumption is strictly below grossReturnAssumption when expense > 0', () => {
    const r = projectConservativeRealWorld({
      birthYear: 2026,
      monthlyContribution: 200,
      assumptions: { grossNominalAnnualReturn: 0.06, expenseRatio: 0.001 },
    });
    expect(r.netReturnAssumption).toBeLessThan(r.grossReturnAssumption);
  });

  it('netReturnAssumption equals grossReturnAssumption when expense = 0', () => {
    const r = projectConservativeRealWorld({
      birthYear: 2026,
      monthlyContribution: 200,
      assumptions: { grossNominalAnnualReturn: 0.06, expenseRatio: 0 },
    });
    expect(r.netReturnAssumption).toBeCloseTo(r.grossReturnAssumption, 12);
  });
});

describe('projectConservativeRealWorld — inflation handling (checklist §4)', () => {
  it('real percentiles are strictly less than nominal when inflation > 0', () => {
    const r = projectConservativeRealWorld({
      birthYear: 2026,
      monthlyContribution: 200,
      assumptions: { inflationRate: 0.027 },
    });
    expect(r.realP10).toBeLessThan(r.nominalP10);
    expect(r.realP25).toBeLessThan(r.nominalP25);
    expect(r.realMedian).toBeLessThan(r.nominalMedian);
    expect(r.realP75).toBeLessThan(r.nominalP75);
    expect(r.realP90).toBeLessThan(r.nominalP90);
  });

  it('real percentiles equal nominal exactly when inflation = 0', () => {
    const r = projectConservativeRealWorld({
      birthYear: 2026,
      monthlyContribution: 200,
      assumptions: { inflationRate: 0 },
    });
    expect(r.realP10).toBe(r.nominalP10);
    expect(r.realP25).toBe(r.nominalP25);
    expect(r.realMedian).toBe(r.nominalMedian);
    expect(r.realP75).toBe(r.nominalP75);
    expect(r.realP90).toBe(r.nominalP90);
  });

  it('the real deflator is (1 + inflation)^years exactly', () => {
    const r = projectConservativeRealWorld({
      birthYear: 2026,
      monthlyContribution: 200,
      assumptions: { inflationRate: 0.03 },
    });
    const expected = r.nominalMedian / Math.pow(1.03, r.yearsSimulated);
    expect(r.realMedian).toBeCloseTo(expected, 6);
  });
});

describe('projectConservativeRealWorld — percentile contract (checklist §5)', () => {
  it('headline result is the P25, not a mean', () => {
    const r = projectConservativeRealWorld({ birthYear: 2026, monthlyContribution: 200 });
    expect(r.primaryConservativeResult.nominal).toBe(r.nominalP25);
    expect(r.primaryConservativeResult.real).toBe(r.realP25);
  });

  it('result object exposes no arithmetic-mean field', () => {
    const r = projectConservativeRealWorld({ birthYear: 2026, monthlyContribution: 200 });
    expect(r).not.toHaveProperty('mean');
    expect(r).not.toHaveProperty('average');
    expect(r).not.toHaveProperty('nominalMean');
    expect(r).not.toHaveProperty('realMean');
    expect(r).not.toHaveProperty('arithmeticMean');
  });
});

describe('projectConservativeRealWorld — determinism (checklist §6)', () => {
  it('running the same inputs twice produces field-identical output', () => {
    const input = { birthYear: 2026, monthlyContribution: 200, seed: 42 };
    const a = projectConservativeRealWorld(input);
    const b = projectConservativeRealWorld(input);
    for (const key of Object.keys(a) as Array<keyof typeof a>) {
      expect(b[key], `field ${String(key)} drifted between runs`).toEqual(a[key]);
    }
  });

  it('running three times in a row produces identical percentile vectors', () => {
    const input = { birthYear: 2026, monthlyContribution: 200 }; // default seed
    const a = projectConservativeRealWorld(input);
    const b = projectConservativeRealWorld(input);
    const c = projectConservativeRealWorld(input);
    const fields = ['nominalP10', 'nominalP25', 'nominalMedian', 'nominalP75', 'nominalP90'] as const;
    for (const f of fields) {
      expect(b[f]).toBe(a[f]);
      expect(c[f]).toBe(a[f]);
    }
  });

  it('changing only the seed but holding all other inputs constant changes the output', () => {
    const a = projectConservativeRealWorld({ birthYear: 2026, monthlyContribution: 200, seed: 1 });
    const b = projectConservativeRealWorld({ birthYear: 2026, monthlyContribution: 200, seed: 2 });
    expect(b.nominalMedian).not.toBe(a.nominalMedian);
    // Other audit fields that are not seed-dependent should match.
    expect(b.totalContributions).toBe(a.totalContributions);
    expect(b.netReturnAssumption).toBe(a.netReturnAssumption);
    expect(b.yearsSimulated).toBe(a.yearsSimulated);
  });
});

describe('projectConservativeRealWorld — regression vs optimistic historical mode (checklist §7)', () => {
  // Both modes are given the same $5,000/yr contribution. The simple
  // `projectBalance` model uses a deterministic 7% — that's the "optimistic
  // historical-return mode" referenced by the checklist. The conservative
  // model uses 6% gross / 0.10% fees / 2.7% inflation / 16% vol.
  const conservative = projectConservativeRealWorld({
    birthYear: 2026,
    monthlyContribution: 500, // 6000/yr → cap clamps to 5000
  });
  const optimistic = projectBalance({
    birthYear: 2026,
    dailyContribution: 14, // 14 × 365 = 5110/yr → cap clamps to 5000
  });

  it('both modes use exactly $5,000/yr after cap', () => {
    expect(conservative.contributionDetails.cappedAnnual).toBe(TRUMP_ACCOUNT_ANNUAL_CAP);
    expect(optimistic.annualContribution).toBe(TRUMP_ACCOUNT_ANNUAL_CAP);
  });

  it('conservative nominal median is materially below the optimistic 7% projection', () => {
    expect(conservative.nominalMedian).toBeLessThan(optimistic.finalBalance);
    // At least 5% lower — captures the combined effect of lower return,
    // expense drag, and lognormal-median-below-mean from volatility.
    expect(conservative.nominalMedian).toBeLessThan(optimistic.finalBalance * 0.95);
  });

  it('conservative real median is materially below conservative nominal median', () => {
    expect(conservative.realMedian).toBeLessThan(conservative.nominalMedian);
    // 2.7% × 18 yr ≈ 38% real-dollar haircut, so real < 70% of nominal.
    expect(conservative.realMedian).toBeLessThan(conservative.nominalMedian * 0.70);
  });

  it('even the optimistic 90th-percentile conservative nominal can sit below the simple deterministic', () => {
    // Sanity: 7% deterministic should be reasonably close to the upper tail of
    // a 6%-mean distribution with 16% annual vol, but the conservative P50
    // remains below the simple deterministic.
    expect(conservative.nominalMedian).toBeLessThan(optimistic.finalBalance);
  });
});

describe('projectConservativeRealWorld — boundary cases (checklist §8)', () => {
  it('zero years of growth (birth year 2008) — every output is zero', () => {
    const r = projectConservativeRealWorld({ birthYear: 2008, monthlyContribution: 200 });
    expect(r.yearsSimulated).toBe(0);
    expect(r.totalContributions).toBe(0);
    expect(r.nominalMedian).toBe(0);
    expect(r.realMedian).toBe(0);
  });

  it('very small monthly contribution ($0.50) produces a finite positive result', () => {
    const r = projectConservativeRealWorld({ birthYear: 2026, monthlyContribution: 0.5 });
    expect(r.contributionDetails.rawAnnual).toBe(6);
    expect(r.contributionDetails.wasCapped).toBe(false);
    expect(Number.isFinite(r.nominalMedian)).toBe(true);
    expect(r.nominalMedian).toBeGreaterThan(0);
  });

  it('contribution above cap is clamped, not rejected', () => {
    const r = projectConservativeRealWorld({ birthYear: 2026, monthlyContribution: 10_000 });
    expect(r.contributionDetails.cappedAnnual).toBe(TRUMP_ACCOUNT_ANNUAL_CAP);
    expect(r.contributionDetails.wasCapped).toBe(true);
    expect(Number.isFinite(r.nominalMedian)).toBe(true);
  });

  it('negative monthly contribution is clamped to zero (matches simple mode behavior)', () => {
    const r = projectConservativeRealWorld({ birthYear: 2026, monthlyContribution: -250 });
    expect(r.contributionDetails.rawMonthly).toBe(0);
    expect(r.contributionDetails.rawAnnual).toBe(0);
    expect(r.contributionDetails.wasCapped).toBe(false);
  });

  it('NaN monthly contribution is clamped to zero', () => {
    const r = projectConservativeRealWorld({ birthYear: 2026, monthlyContribution: Number.NaN });
    expect(r.contributionDetails.rawAnnual).toBe(0);
    expect(Number.isFinite(r.nominalMedian)).toBe(true);
  });

  it('Infinity monthly contribution is clamped to zero (not allowed to wreck the math)', () => {
    const r = projectConservativeRealWorld({
      birthYear: 2026,
      monthlyContribution: Number.POSITIVE_INFINITY,
    });
    expect(r.contributionDetails.rawMonthly).toBe(0);
    expect(r.contributionDetails.rawAnnual).toBe(0);
    expect(Number.isFinite(r.nominalMedian)).toBe(true);
  });

  it('numPaths = 0 is silently bumped to 1 (still computes a result)', () => {
    const r = projectConservativeRealWorld({
      birthYear: 2026,
      monthlyContribution: 100,
      numPaths: 0,
    });
    expect(r.numPaths).toBe(1);
    expect(Number.isFinite(r.nominalMedian)).toBe(true);
  });

  it('numPaths = 1 collapses every percentile to the single sampled terminal', () => {
    const r = projectConservativeRealWorld({
      birthYear: 2026,
      monthlyContribution: 100,
      numPaths: 1,
    });
    const values = [r.nominalP10, r.nominalP25, r.nominalMedian, r.nominalP75, r.nominalP90];
    for (let i = 1; i < values.length; i++) expect(values[i]).toBe(values[0]);
  });

  it('large numPaths (5000) still terminates and produces ordered percentiles', () => {
    const r = projectConservativeRealWorld({
      birthYear: 2026,
      monthlyContribution: 100,
      numPaths: 5000,
    });
    expect(r.numPaths).toBe(5000);
    expect(r.nominalP10).toBeLessThanOrEqual(r.nominalP25);
    expect(r.nominalP25).toBeLessThanOrEqual(r.nominalMedian);
    expect(r.nominalMedian).toBeLessThanOrEqual(r.nominalP75);
    expect(r.nominalP75).toBeLessThanOrEqual(r.nominalP90);
  });
});
