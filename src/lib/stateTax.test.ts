import { describe, it, expect } from 'vitest';
import { STATES, stateTax, stateIncrementalTax } from './stateTax';

const CA = STATES.CA;
const NO_TAX = STATES.NO_TAX;

describe('stateTax — CA pinned values per algorithm §18.3', () => {
  it('returns 0 for non-positive income', () => {
    expect(stateTax(0, 'single', CA)).toBe(0);
    expect(stateTax(-1000, 'single', CA)).toBe(0);
  });

  it('matches the 1% lowest-bracket pinned value', () => {
    expect(stateTax(11_079, 'single', CA)).toBeCloseTo(110.79, 5);
  });

  it('matches the 50k single pinned value', () => {
    // 110.79 + 303.70 + 607.52 + 512.88 across the first four brackets
    expect(stateTax(50_000, 'single', CA)).toBeCloseTo(1_534.89, 2);
  });

  it('matches $1M (no BHST yet — comparison is >, not >=)', () => {
    expect(stateTax(1_000_000, 'single', CA)).toBeCloseTo(103_836.61, 2);
  });

  it('matches $1.5M with BHST surtax', () => {
    // 103,836.61 + 500,000 * 0.123 + 500,000 * 0.01 = 103,836.61 + 61,500 + 5,000
    expect(stateTax(1_500_000, 'single', CA)).toBeCloseTo(170_336.61, 2);
  });
});

describe('stateIncrementalTax — CA', () => {
  it('returns 0 for non-positive additional income', () => {
    expect(stateIncrementalTax(100_000, 0, 'mfj', CA)).toBe(0);
    expect(stateIncrementalTax(100_000, -500, 'mfj', CA)).toBe(0);
  });

  it('matches the mfj bracket-straddle pinned value (§8.2)', () => {
    // base $145,000 mfj, +$1,500: $448 at 8% ($35.84) + $1,052 at 9.3% ($97.836)
    expect(stateIncrementalTax(145_000, 1_500, 'mfj', CA)).toBeCloseTo(133.676, 3);
  });

  it('single $80k base + $10k additional sits between $800 and $1,400', () => {
    const t = stateIncrementalTax(80_000, 10_000, 'single', CA);
    expect(t).toBeGreaterThan(800);
    expect(t).toBeLessThan(1_400);
  });

  it('hoh is less than or equal to single at the same income', () => {
    for (const income of [50_000, 100_000, 250_000]) {
      expect(stateTax(income, 'hoh', CA)).toBeLessThanOrEqual(stateTax(income, 'single', CA));
    }
  });

  it('BHST surtax fires above $1M (mfj)', () => {
    // Stepping $999,999 → $1,000,001 crosses the $1M threshold. The $2 is in
    // the 11.3% mfj bracket, so regular marginal = 0.226. BHST adds +1% on
    // the $1 above $1M = 0.01. Combined ≈ 0.236, strictly greater than the
    // bracket-only amount.
    const below = stateTax(999_999, 'mfj', CA);
    const above = stateTax(1_000_001, 'mfj', CA);
    const marginal = above - below;
    expect(marginal).toBeGreaterThan(0.113 * 2);
    expect(marginal).toBeCloseTo(0.226 + 0.01, 3);
  });
});

describe('CA bracket boundary precision per algorithm §14.2', () => {
  it.each([
    ['single', 72_724, 0.093],
    ['single', 371_479, 0.103],
    ['single', 445_771, 0.113],
    ['single', 742_953, 0.123],
  ] as const)('next-rate at the %s boundary %d → %f', (status, boundary, expectedRate) => {
    expect(stateIncrementalTax(boundary, 1, status, CA)).toBeCloseTo(expectedRate, 4);
  });
});

describe('NO_TAX state', () => {
  it('returns 0 for any income', () => {
    expect(stateTax(0, 'single', NO_TAX)).toBe(0);
    expect(stateTax(50_000, 'single', NO_TAX)).toBe(0);
    expect(stateTax(5_000_000, 'mfj', NO_TAX)).toBe(0);
  });

  it('returns 0 for any incremental', () => {
    expect(stateIncrementalTax(75_000, 10_000, 'mfj', NO_TAX)).toBe(0);
  });

  it('has no nonconformity / kiddie / surtax flags', () => {
    expect(NO_TAX.nonconforming).toBeFalsy();
    expect(NO_TAX.hasStateKiddieTax).toBeFalsy();
    expect(NO_TAX.hasBhstSurtax).toBeFalsy();
  });
});

describe('STATES registry', () => {
  it('CA is configured for the full v1 model', () => {
    expect(CA.id).toBe('CA');
    expect(CA.brackets).toBeDefined();
    expect(CA.nonconforming).toBe(true);
    expect(CA.hasStateKiddieTax).toBe(true);
    expect(CA.hasBhstSurtax).toBe(true);
  });

  it('NO_TAX has no brackets', () => {
    expect(NO_TAX.id).toBe('NO_TAX');
    expect(NO_TAX.brackets).toBeUndefined();
  });
});
