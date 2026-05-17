import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_EXPENSE_RATIO,
  DEFAULT_OPTIMISTIC_ASSUMPTIONS,
  HISTORICAL_DATA_RANGE,
  HISTORICAL_MONTHLY_MEAN,
  HISTORICAL_MONTHLY_VOL,
  OPTIMISTIC_MODE_ID,
  OPTIMISTIC_NUM_PATHS,
  applyExpenseDrag,
  projectOptimisticHistorical,
} from './optimisticCalculator';
import { projectConservativeRealWorld } from './conservativeCalculator';
import { PILOT_SEED_AMOUNT, TRUMP_ACCOUNT_ANNUAL_CAP } from './constants';

describe('optimisticCalculator — module constants match new/', () => {
  it('mode id is "optimisticHistorical"', () => {
    expect(OPTIMISTIC_MODE_ID).toBe('optimisticHistorical');
  });

  it('hard-coded path count is 1000 — same as new/src/lib/calculator.ts:44', () => {
    expect(OPTIMISTIC_NUM_PATHS).toBe(1000);
  });

  it('monthly mean / vol defaults are Yahoo-derived (1985–2026 baseline)', () => {
    expect(HISTORICAL_MONTHLY_MEAN).toBeCloseTo(0.008421878912947857, 12);
    expect(HISTORICAL_MONTHLY_VOL).toBeCloseTo(0.043521649260455646, 12);
    expect(DEFAULT_OPTIMISTIC_ASSUMPTIONS.monthlyMean).toBe(HISTORICAL_MONTHLY_MEAN);
    expect(DEFAULT_OPTIMISTIC_ASSUMPTIONS.monthlyVol).toBe(HISTORICAL_MONTHLY_VOL);
    expect(DEFAULT_OPTIMISTIC_ASSUMPTIONS.expenseRatio).toBe(0.001);
  });

  it('annualized defaults imply ≈10.6% return / ≈15.1% vol (pre-fee)', () => {
    const annMean = Math.pow(1 + HISTORICAL_MONTHLY_MEAN, 12) - 1;
    const annVol = HISTORICAL_MONTHLY_VOL * Math.sqrt(12);
    expect(annMean).toBeGreaterThan(0.10);
    expect(annMean).toBeLessThan(0.11);
    expect(annVol).toBeGreaterThan(0.14);
    expect(annVol).toBeLessThan(0.16);
  });

  it('data-range tag identifies the Yahoo sample, not the old 1950 fallback', () => {
    expect(HISTORICAL_DATA_RANGE).toMatch(/198[0-9].*20[2-9][0-9]/);
    expect(HISTORICAL_DATA_RANGE).not.toMatch(/1950/);
  });

  it('DEFAULT_EXPENSE_RATIO is 0.10%/yr', () => {
    expect(DEFAULT_EXPENSE_RATIO).toBe(0.001);
  });
});

describe('realism baseline — checklist regression', () => {
  // This block is a single anchor that maps 1:1 to the realism review
  // checklist. If any of these assertions fail, the v2 calculator has drifted
  // back toward the old over-optimistic baseline.

  it('1. defaults are NOT the old 0.0099 / 0.0488 / "1950-2024 (Fallback)"', () => {
    expect(HISTORICAL_MONTHLY_MEAN).not.toBe(0.0099);
    expect(HISTORICAL_MONTHLY_VOL).not.toBe(0.0488);
    expect(HISTORICAL_DATA_RANGE).not.toMatch(/Fallback/);
    expect(HISTORICAL_DATA_RANGE).not.toMatch(/1950/);
  });

  it('2. defaults match the documented Yahoo-derived constants from new', () => {
    expect(HISTORICAL_MONTHLY_MEAN).toBeCloseTo(0.008421878912947857, 12);
    expect(HISTORICAL_MONTHLY_VOL).toBeCloseTo(0.043521649260455646, 12);
  });

  it('3. displayed annualizedMean = (1 + effectiveMonthlyMean)^12 - 1 (post-fee)', () => {
    const r = projectOptimisticHistorical({
      birthYear: 2026,
      monthlyContribution: 0,
      seed: 1,
    });
    const expected = Math.pow(1 + r.effectiveMonthlyMean, 12) - 1;
    expect(r.annualizedMean).toBeCloseTo(expected, 12);
  });

  it('4. 0.10% fee reduces the median; the fee is exposed on the result', () => {
    const base = { birthYear: 2026, monthlyContribution: 100, seed: 1 } as const;
    const free = projectOptimisticHistorical({
      ...base,
      assumptions: { expenseRatio: 0 },
    });
    const standard = projectOptimisticHistorical({
      ...base,
      assumptions: { expenseRatio: 0.001 },
    });
    expect(standard.medianSavings).toBeLessThan(free.medianSavings);
    expect(standard.expenseRatioUsed).toBe(0.001);
    expect(free.expenseRatioUsed).toBe(0);
  });

  it('5. Monte Carlo structure: 1000 paths, ordered percentiles, contributions at year-end', () => {
    expect(OPTIMISTIC_NUM_PATHS).toBe(1000);
    const r = projectOptimisticHistorical({ birthYear: 2026, monthlyContribution: 150, seed: 1 });
    expect(r.numPaths).toBe(1000);
    expect(r.p10).toBeLessThanOrEqual(r.p25);
    expect(r.p25).toBeLessThanOrEqual(r.medianSavings);
    expect(r.medianSavings).toBeLessThanOrEqual(r.p75);
    expect(r.p75).toBeLessThanOrEqual(r.p90);
  });

  it('6. 2026 + $5,000/yr → median is below the old $270k baseline', () => {
    const r = projectOptimisticHistorical({
      birthYear: 2026,
      monthlyContribution: 5000 / 12,
      seed: 0xc0ffee17,
    });
    // The old over-optimistic build produced ≈ $270k. The realistic baseline
    // should land roughly $195k–$240k seeded with the UI seed.
    expect(r.medianSavings).toBeLessThan(255_000);
    expect(r.medianSavings).toBeGreaterThan(190_000);
  });

  it('7. $5,000/yr cap is still enforced regardless of monthly input', () => {
    const r = projectOptimisticHistorical({
      birthYear: 2026,
      monthlyContribution: 5_000, // $60,000/yr nominal → must clamp
      seed: 1,
    });
    expect(r.contributionDetails.cappedAnnual).toBe(5_000);
    expect(r.contributionDetails.wasCapped).toBe(true);
  });

  it('8. eligibility: 2026 → seed+18yr, 2025 → seed+17yr, 2029 → no seed but 18yr', () => {
    const r26 = projectOptimisticHistorical({ birthYear: 2026, monthlyContribution: 0, seed: 1 });
    expect(r26.seedAmount).toBe(1_000);
    expect(r26.yearsSimulated).toBe(18);

    const r25 = projectOptimisticHistorical({ birthYear: 2025, monthlyContribution: 0, seed: 1 });
    expect(r25.seedAmount).toBe(1_000);
    expect(r25.yearsSimulated).toBe(17);

    const r29 = projectOptimisticHistorical({ birthYear: 2029, monthlyContribution: 0, seed: 1 });
    expect(r29.seedAmount).toBe(0);
    expect(r29.yearsSimulated).toBe(18);
  });

  it('9. seed determinism: same seed + inputs → identical result', () => {
    const a = projectOptimisticHistorical({ birthYear: 2026, monthlyContribution: 150, seed: 42 });
    const b = projectOptimisticHistorical({ birthYear: 2026, monthlyContribution: 150, seed: 42 });
    expect(b.medianSavings).toBe(a.medianSavings);
    expect(b.p25).toBe(a.p25);
    expect(b.p75).toBe(a.p75);
    // Different seed shifts the distribution.
    const c = projectOptimisticHistorical({ birthYear: 2026, monthlyContribution: 150, seed: 43 });
    expect(c.medianSavings).not.toBe(a.medianSavings);
  });
});

describe('applyExpenseDrag', () => {
  it('returns input unchanged when expense ratio is 0', () => {
    expect(applyExpenseDrag(0.01, 0)).toBe(0.01);
  });

  it('returns input unchanged when expense ratio is negative', () => {
    expect(applyExpenseDrag(0.01, -0.005)).toBe(0.01);
  });

  it('reduces monthly mean by the round-trip annual subtraction', () => {
    // monthly 0.01 → annual 0.12683…; minus 0.001 = 0.12583…; back to monthly 0.00993…
    const out = applyExpenseDrag(0.01, 0.001);
    const annualPre = Math.pow(1.01, 12) - 1;
    const annualPost = annualPre - 0.001;
    const expected = Math.pow(1 + annualPost, 1 / 12) - 1;
    expect(out).toBeCloseTo(expected, 12);
    expect(out).toBeLessThan(0.01);
  });

  it('handles default Yahoo-derived mean + default 0.10% fee', () => {
    const out = applyExpenseDrag(HISTORICAL_MONTHLY_MEAN, DEFAULT_EXPENSE_RATIO);
    const annPost = Math.pow(1 + out, 12) - 1;
    // Pre-fee ≈ 10.59%, post-fee ≈ 10.49%
    expect(annPost).toBeGreaterThan(0.103);
    expect(annPost).toBeLessThan(0.107);
  });
});

describe('projectOptimisticHistorical — output shape', () => {
  it('returns every required field', () => {
    const r = projectOptimisticHistorical({
      birthYear: 2026,
      monthlyContribution: 150,
      seed: 1,
    });
    const REQUIRED = [
      'medianSavings',
      'p10',
      'p25',
      'p75',
      'p90',
      'seedAmount',
      'totalContributions',
      'yearsSimulated',
      'monthlyMeanUsed',
      'monthlyVolUsed',
      'annualizedMean',
      'annualizedVol',
      'numPaths',
      'wasSeeded',
      'contributionDetails',
    ] as const;
    for (const f of REQUIRED) {
      expect(r, `missing field: ${f}`).toHaveProperty(f);
    }
  });

  it('annualizedMean is derived from the post-fee monthly mean (≈10.5% with default 0.10% fee)', () => {
    const r = projectOptimisticHistorical({ birthYear: 2026, monthlyContribution: 0, seed: 1 });
    // Pre-fee: (1.00842…)^12 - 1 ≈ 10.59%; post 0.10% fee ≈ 10.49%.
    const preFee = Math.pow(1 + HISTORICAL_MONTHLY_MEAN, 12) - 1;
    expect(r.annualizedMean).toBeCloseTo(preFee - 0.001, 6);
    expect(r.annualizedMean).toBeGreaterThan(0.10);
    expect(r.annualizedMean).toBeLessThan(0.108);
  });

  it('annualizedVol = monthly × √12 ≈ 15.1% (vol is not adjusted by expense ratio)', () => {
    const r = projectOptimisticHistorical({ birthYear: 2026, monthlyContribution: 0, seed: 1 });
    expect(r.annualizedVol).toBeCloseTo(HISTORICAL_MONTHLY_VOL * Math.sqrt(12), 10);
    expect(r.annualizedVol).toBeGreaterThan(0.14);
    expect(r.annualizedVol).toBeLessThan(0.16);
  });

  it('exposes expenseRatioUsed and effectiveMonthlyMean audit fields', () => {
    const r = projectOptimisticHistorical({ birthYear: 2026, monthlyContribution: 0, seed: 1 });
    expect(r.expenseRatioUsed).toBe(0.001);
    expect(r.effectiveMonthlyMean).toBeLessThan(r.monthlyMeanUsed);
  });
});

describe('projectOptimisticHistorical — eligibility integration', () => {
  it.each([2025, 2026, 2027, 2028])('birth year %s gets the $1,000 seed', (y) => {
    const r = projectOptimisticHistorical({ birthYear: y, monthlyContribution: 0, seed: 1 });
    expect(r.seedAmount).toBe(PILOT_SEED_AMOUNT);
  });

  it.each([2008, 2010, 2024, 2029])('birth year %s gets no seed', (y) => {
    const r = projectOptimisticHistorical({ birthYear: y, monthlyContribution: 0, seed: 1 });
    expect(r.seedAmount).toBe(0);
  });

  it('birth year 2026 simulates 18 years', () => {
    const r = projectOptimisticHistorical({ birthYear: 2026, monthlyContribution: 150, seed: 1 });
    expect(r.yearsSimulated).toBe(18);
  });

  it('birth year 2025 simulates 17 years (account-launch limit)', () => {
    const r = projectOptimisticHistorical({ birthYear: 2025, monthlyContribution: 150, seed: 1 });
    expect(r.yearsSimulated).toBe(17);
  });

  it('birth year 2008 → 0 years, all percentiles = 0', () => {
    const r = projectOptimisticHistorical({ birthYear: 2008, monthlyContribution: 500, seed: 1 });
    expect(r.yearsSimulated).toBe(0);
    for (const k of ['medianSavings', 'p10', 'p25', 'p75', 'p90'] as const) {
      expect(r[k]).toBe(0);
    }
  });
});

describe('projectOptimisticHistorical — contribution handling', () => {
  it('monthly → annual is ×12 under the cap', () => {
    const r = projectOptimisticHistorical({ birthYear: 2026, monthlyContribution: 200, seed: 1 });
    expect(r.contributionDetails.rawAnnual).toBe(2400);
    expect(r.contributionDetails.cappedAnnual).toBe(2400);
    expect(r.contributionDetails.wasCapped).toBe(false);
  });

  it('clamps at $5,000/yr', () => {
    const r = projectOptimisticHistorical({ birthYear: 2026, monthlyContribution: 9999, seed: 1 });
    expect(r.contributionDetails.cappedAnnual).toBe(TRUMP_ACCOUNT_ANNUAL_CAP);
    expect(r.contributionDetails.wasCapped).toBe(true);
  });

  it('totalContributions = seed + cappedAnnual × yearsSimulated', () => {
    const r = projectOptimisticHistorical({ birthYear: 2026, monthlyContribution: 200, seed: 1 });
    expect(r.totalContributions).toBe(r.seedAmount + r.contributionDetails.cappedAnnual * r.yearsSimulated);
  });

  it('negative / NaN / Infinity inputs are clamped to zero', () => {
    for (const v of [-100, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = projectOptimisticHistorical({ birthYear: 2026, monthlyContribution: v, seed: 1 });
      expect(r.contributionDetails.rawAnnual).toBe(0);
    }
  });
});

describe('projectOptimisticHistorical — algorithm fidelity to new/', () => {
  it('vol = 0 collapses to a closed-form annuity (seed + end-of-year contributions)', () => {
    const r = projectOptimisticHistorical({
      birthYear: 2026,
      monthlyContribution: 0,
      // Disable expense drag so this is a pure check of the compounding math.
      assumptions: { monthlyMean: 0.0099, monthlyVol: 0, expenseRatio: 0 },
      seed: 1,
    });
    // 18 years of zero-vol monthly compounding at 0.99%/mo:
    // (1 + 0.0099)^(12 * 18) ≈ (1.125...)^18
    const f = Math.pow(1 + 0.0099, 12 * 18);
    const expected = 1000 * f;
    expect(r.medianSavings).toBeCloseTo(expected, 2);
    // All percentiles identical when vol = 0.
    expect(r.p10).toBeCloseTo(expected, 2);
    expect(r.p90).toBeCloseTo(expected, 2);
  });

  it('end-of-year contribution timing: vol = 0, contribution flows in only at year-end', () => {
    const r = projectOptimisticHistorical({
      birthYear: 2026,
      monthlyContribution: 100, // $1,200/yr under cap
      assumptions: { monthlyMean: 0.0099, monthlyVol: 0, expenseRatio: 0 },
      seed: 1,
    });
    // year-by-year closed form: balance_{y+1} = balance_y × f + 1200, f = (1.0099)^12
    const f = Math.pow(1.0099, 12);
    let bal = 1000;
    for (let y = 0; y < 18; y++) bal = bal * f + 1200;
    expect(r.medianSavings).toBeCloseTo(bal, 2);
  });

  it('expense drag reduces the median: 0% fee > 0.10% fee > 0.50% fee', () => {
    const common = { birthYear: 2026, monthlyContribution: 100, seed: 1 } as const;
    const free = projectOptimisticHistorical({
      ...common,
      assumptions: { monthlyMean: 0.0099, monthlyVol: 0, expenseRatio: 0 },
    });
    const cheap = projectOptimisticHistorical({
      ...common,
      assumptions: { monthlyMean: 0.0099, monthlyVol: 0, expenseRatio: 0.001 },
    });
    const expensive = projectOptimisticHistorical({
      ...common,
      assumptions: { monthlyMean: 0.0099, monthlyVol: 0, expenseRatio: 0.005 },
    });
    expect(free.medianSavings).toBeGreaterThan(cheap.medianSavings);
    expect(cheap.medianSavings).toBeGreaterThan(expensive.medianSavings);
  });

  it('with default 1000 paths and historical assumptions, 2026 + $5000/yr median is well above the deterministic 7% simple result', () => {
    // Deterministic 7%: 1000 × 1.07^18 + 5000 × (1.07^18 − 1)/0.07 ≈ 173,375.
    // Optimistic with ~12.5% annualized mean & 16.9% vol should produce a median > 200k.
    const r = projectOptimisticHistorical({
      birthYear: 2026,
      monthlyContribution: 500, // cap to 5000/yr
      seed: 0xfeed,
    });
    expect(r.medianSavings).toBeGreaterThan(200_000);
  });
});

describe('projectOptimisticHistorical — RNG / determinism', () => {
  it('a seed makes the run deterministic and wasSeeded=true', () => {
    const a = projectOptimisticHistorical({ birthYear: 2026, monthlyContribution: 150, seed: 42 });
    const b = projectOptimisticHistorical({ birthYear: 2026, monthlyContribution: 150, seed: 42 });
    expect(a.wasSeeded).toBe(true);
    expect(b.medianSavings).toBe(a.medianSavings);
    expect(b.p25).toBe(a.p25);
    expect(b.p75).toBe(a.p75);
  });

  it('omitting the seed uses Math.random and wasSeeded=false', () => {
    const spy = vi.spyOn(Math, 'random');
    const r = projectOptimisticHistorical({
      birthYear: 2026,
      monthlyContribution: 150,
      numPaths: 50, // smaller path count to keep the test fast
    });
    expect(r.wasSeeded).toBe(false);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('different seeds produce different distributions', () => {
    const a = projectOptimisticHistorical({ birthYear: 2026, monthlyContribution: 150, seed: 1 });
    const b = projectOptimisticHistorical({ birthYear: 2026, monthlyContribution: 150, seed: 2 });
    expect(b.medianSavings).not.toBe(a.medianSavings);
  });
});

describe('projectOptimisticHistorical — percentile ordering', () => {
  it('P10 ≤ P25 ≤ median ≤ P75 ≤ P90', () => {
    const r = projectOptimisticHistorical({ birthYear: 2026, monthlyContribution: 150, seed: 7 });
    expect(r.p10).toBeLessThanOrEqual(r.p25);
    expect(r.p25).toBeLessThanOrEqual(r.medianSavings);
    expect(r.medianSavings).toBeLessThanOrEqual(r.p75);
    expect(r.p75).toBeLessThanOrEqual(r.p90);
  });
});

describe('projectOptimisticHistorical — separation from conservative mode', () => {
  it('optimistic median > conservative real-P25 for the same inputs (sanity)', () => {
    const o = projectOptimisticHistorical({ birthYear: 2026, monthlyContribution: 500, seed: 1 });
    const c = projectConservativeRealWorld({ birthYear: 2026, monthlyContribution: 500 });
    // Higher return + nominal-not-real → optimistic should be well above conservative real-P25.
    expect(o.medianSavings).toBeGreaterThan(c.primaryConservativeResult.real * 2);
  });

  it('no real / conservative-mode fields leak into the optimistic result', () => {
    const r = projectOptimisticHistorical({ birthYear: 2026, monthlyContribution: 150, seed: 1 });
    expect(r).not.toHaveProperty('inflationRateUsed');
    expect(r).not.toHaveProperty('realMedian');
    expect(r).not.toHaveProperty('realP25');
    // `expenseRatioUsed` IS exposed (post-fee model), so we don't exclude it here.
  });
});

describe('projectOptimisticHistorical — assumption passthrough', () => {
  it('echoes monthlyMeanUsed and monthlyVolUsed equal to the inputs (defaults)', () => {
    const r = projectOptimisticHistorical({ birthYear: 2026, monthlyContribution: 150, seed: 1 });
    expect(r.monthlyMeanUsed).toBe(HISTORICAL_MONTHLY_MEAN);
    expect(r.monthlyVolUsed).toBe(HISTORICAL_MONTHLY_VOL);
  });

  it('echoes user-overridden monthlyMean/monthlyVol back via audit fields', () => {
    const r = projectOptimisticHistorical({
      birthYear: 2026,
      monthlyContribution: 150,
      assumptions: { monthlyMean: 0.008421878912947857, monthlyVol: 0.043521649260455646 },
      seed: 1,
    });
    expect(r.monthlyMeanUsed).toBe(0.008421878912947857);
    expect(r.monthlyVolUsed).toBe(0.043521649260455646);
    // annualizedMean = (1 + 0.00842…)^12 - 1 ≈ 10.6%
    expect(r.annualizedMean).toBeGreaterThan(0.10);
    expect(r.annualizedMean).toBeLessThan(0.115);
  });

  it('overriding only monthlyMean (vol stays default) propagates to the projection', () => {
    // Higher mean → higher median for same seed.
    const base = projectOptimisticHistorical({
      birthYear: 2026,
      monthlyContribution: 150,
      seed: 99,
    });
    const higher = projectOptimisticHistorical({
      birthYear: 2026,
      monthlyContribution: 150,
      assumptions: { monthlyMean: 0.015 }, // ~19.6% annualized
      seed: 99,
    });
    expect(higher.medianSavings).toBeGreaterThan(base.medianSavings);
  });

  it('overriding only monthlyVol (mean stays default) widens the P10–P90 spread', () => {
    const calm = projectOptimisticHistorical({
      birthYear: 2026,
      monthlyContribution: 150,
      assumptions: { monthlyVol: 0.02 },
      seed: 17,
    });
    const wild = projectOptimisticHistorical({
      birthYear: 2026,
      monthlyContribution: 150,
      assumptions: { monthlyVol: 0.08 },
      seed: 17,
    });
    expect(wild.p90 - wild.p10).toBeGreaterThan(calm.p90 - calm.p10);
  });

  it('partial assumption override merges with defaults (only the overridden field changes)', () => {
    const r = projectOptimisticHistorical({
      birthYear: 2026,
      monthlyContribution: 150,
      assumptions: { monthlyMean: 0.012 },
      seed: 1,
    });
    expect(r.monthlyMeanUsed).toBe(0.012);
    expect(r.monthlyVolUsed).toBe(HISTORICAL_MONTHLY_VOL);
  });

  it('vol = 0 + custom monthlyMean produces a closed-form deterministic balance for any seed', () => {
    // With vol=0 the result is fully deterministic regardless of seed.
    const a = projectOptimisticHistorical({
      birthYear: 2026,
      monthlyContribution: 0,
      // expenseRatio: 0 to compare directly against the closed form.
      assumptions: { monthlyMean: 0.005, monthlyVol: 0, expenseRatio: 0 },
      seed: 1,
    });
    const b = projectOptimisticHistorical({
      birthYear: 2026,
      monthlyContribution: 0,
      assumptions: { monthlyMean: 0.005, monthlyVol: 0, expenseRatio: 0 },
      seed: 2,
    });
    expect(b.medianSavings).toBe(a.medianSavings);
    // Closed form: 1000 × (1.005)^(12×18).
    expect(a.medianSavings).toBeCloseTo(1000 * Math.pow(1.005, 12 * 18), 2);
  });
});

describe('projectOptimisticHistorical — retainPaths', () => {
  it('pathsByYear is undefined by default', () => {
    const r = projectOptimisticHistorical({ birthYear: 2026, monthlyContribution: 150, seed: 1 });
    expect(r.pathsByYear).toBeUndefined();
  });

  it('returns one Float64Array per path when retainPaths=true', () => {
    const r = projectOptimisticHistorical({
      birthYear: 2026,
      monthlyContribution: 150,
      seed: 1,
      numPaths: 10,
      retainPaths: true,
    });
    expect(r.pathsByYear).toBeDefined();
    expect(r.pathsByYear).toHaveLength(10);
    for (const path of r.pathsByYear!) {
      expect(path).toBeInstanceOf(Float64Array);
      expect(path.length).toBe(r.yearsSimulated);
    }
  });

  it('vol=0: every path is the same closed-form trajectory', () => {
    const r = projectOptimisticHistorical({
      birthYear: 2026,
      monthlyContribution: 100,
      assumptions: { monthlyMean: 0.0099, monthlyVol: 0, expenseRatio: 0 },
      seed: 1,
      numPaths: 5,
      retainPaths: true,
    });
    const f = Math.pow(1.0099, 12);
    let bal = 1000;
    const expected = new Float64Array(18);
    for (let y = 0; y < 18; y++) {
      bal = bal * f + 1200;
      expected[y] = bal;
    }
    for (const path of r.pathsByYear!) {
      for (let y = 0; y < 18; y++) {
        expect(path[y]).toBeCloseTo(expected[y], 2);
      }
    }
  });

  it('birth year 2008 → 0-length paths (no contribution years)', () => {
    const r = projectOptimisticHistorical({
      birthYear: 2008,
      monthlyContribution: 500,
      seed: 1,
      numPaths: 3,
      retainPaths: true,
    });
    expect(r.yearsSimulated).toBe(0);
    expect(r.pathsByYear).toHaveLength(3);
    for (const path of r.pathsByYear!) {
      expect(path.length).toBe(0);
    }
  });
});
