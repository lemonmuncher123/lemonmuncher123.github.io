import { describe, it, expect } from 'vitest';
import { projectBalance, toDailyEquivalent } from './calculator';

const CLOSE = (a: number, b: number, tol = 0.5) => Math.abs(a - b) < tol;

describe('projectBalance — deterministic 7% compound', () => {
  it('2026 birth, $5/day → 18 years, seed 1000, annual 1825, balance matches closed form', () => {
    const r = projectBalance({ birthYear: 2026, dailyContribution: 5 });
    expect(r.years).toBe(18);
    expect(r.seed).toBe(1000);
    expect(r.rawAnnualContribution).toBe(1825);
    expect(r.annualContribution).toBe(1825);
    expect(r.wasCapped).toBe(false);

    // Closed form: seed grows for 18 years + annuity of 1825 end-of-year for 18 years at 7%.
    const f = Math.pow(1.07, 18);
    const expected = 1000 * f + 1825 * (f - 1) / 0.07;
    expect(CLOSE(r.finalBalance, expected, 0.01)).toBe(true);
    // sanity check: about $65k
    expect(r.finalBalance).toBeGreaterThan(60_000);
    expect(r.finalBalance).toBeLessThan(70_000);
  });

  it('2026 birth, $20/day → annual contribution capped at $5000', () => {
    const r = projectBalance({ birthYear: 2026, dailyContribution: 20 });
    expect(r.rawAnnualContribution).toBe(7300);
    expect(r.annualContribution).toBe(5000);
    expect(r.wasCapped).toBe(true);

    const f = Math.pow(1.07, 18);
    const expected = 1000 * f + 5000 * (f - 1) / 0.07;
    expect(CLOSE(r.finalBalance, expected, 0.01)).toBe(true);
  });

  it('2008 birth → ineligible, zero balance', () => {
    const r = projectBalance({ birthYear: 2008, dailyContribution: 5 });
    expect(r.years).toBe(0);
    expect(r.seed).toBe(0);
    expect(r.finalBalance).toBe(0);
    expect(r.eligibleForNewContributions).toBe(false);
  });

  it('2025 birth → 17 contribution years + seed', () => {
    const r = projectBalance({ birthYear: 2025, dailyContribution: 5 });
    expect(r.years).toBe(17);
    expect(r.seed).toBe(1000);
    expect(r.pilotSeedEligible).toBe(true);

    const f = Math.pow(1.07, 17);
    const expected = 1000 * f + 1825 * (f - 1) / 0.07;
    expect(CLOSE(r.finalBalance, expected, 0.01)).toBe(true);
  });

  it('2029 birth → 18 contribution years, no seed (eligibility expired)', () => {
    const r = projectBalance({ birthYear: 2029, dailyContribution: 5 });
    expect(r.years).toBe(18);
    expect(r.seed).toBe(0);
    expect(r.pilotSeedEligible).toBe(false);

    const f = Math.pow(1.07, 18);
    const expected = 1825 * (f - 1) / 0.07;
    expect(CLOSE(r.finalBalance, expected, 0.01)).toBe(true);
  });

  it('2010 birth → 2 contribution years, no seed; matches hand calc', () => {
    const r = projectBalance({ birthYear: 2010, dailyContribution: 5 });
    expect(r.years).toBe(2);
    expect(r.seed).toBe(0);
    // year 1: 0 * 1.07 + 1825 = 1825 ; year 2: 1825 * 1.07 + 1825 = 3777.75
    expect(CLOSE(r.finalBalance, 1825 * 1.07 + 1825, 0.01)).toBe(true);
  });

  it('$0/day → zero contributions, seed only grows', () => {
    const r = projectBalance({ birthYear: 2026, dailyContribution: 0 });
    expect(r.annualContribution).toBe(0);
    expect(r.wasCapped).toBe(false);
    expect(CLOSE(r.finalBalance, 1000 * Math.pow(1.07, 18), 0.01)).toBe(true);
  });

  it('negative daily input is floored to zero', () => {
    const r = projectBalance({ birthYear: 2026, dailyContribution: -3 });
    expect(r.rawAnnualContribution).toBe(0);
    expect(r.annualContribution).toBe(0);
  });

  it('totalContributed + growth equals finalBalance', () => {
    const r = projectBalance({ birthYear: 2026, dailyContribution: 5 });
    expect(CLOSE(r.totalContributed + r.growth, r.finalBalance, 0.01)).toBe(true);
  });
});

describe('toDailyEquivalent', () => {
  it('day passes through unchanged', () => {
    expect(toDailyEquivalent(5, 'day')).toBe(5);
    expect(toDailyEquivalent(13.7, 'day')).toBeCloseTo(13.7, 6);
  });

  it('month → daily uses 365-day year (amount × 12 / 365)', () => {
    expect(toDailyEquivalent(150, 'month')).toBeCloseTo(150 * 12 / 365, 6);
    // $30.41/mo ≈ $1/day
    expect(toDailyEquivalent(30.4167, 'month')).toBeCloseTo(1, 3);
  });

  it('year → daily divides by 365', () => {
    expect(toDailyEquivalent(1825, 'year')).toBeCloseTo(1825 / 365, 6);
    expect(toDailyEquivalent(365, 'year')).toBe(1);
  });

  it('zero or negative amounts return 0', () => {
    expect(toDailyEquivalent(0, 'day')).toBe(0);
    expect(toDailyEquivalent(-5, 'day')).toBe(0);
    expect(toDailyEquivalent(-100, 'month')).toBe(0);
    expect(toDailyEquivalent(NaN, 'year')).toBe(0);
  });

  it('round-trip via projectBalance: $5,000/yr ≈ projectBalance($5/day, capped)', () => {
    // $5,000/yr is exactly the federal cap. Converted to daily ≈ 13.7.
    const dailyFromYearly = toDailyEquivalent(5000, 'year');
    const r = projectBalance({ birthYear: 2026, dailyContribution: dailyFromYearly });
    // annual should round to 5000 (within floating-point noise)
    expect(Math.round(r.annualContribution)).toBe(5000);
  });

  it('$200/month becomes $2,400/year — under the cap', () => {
    const daily = toDailyEquivalent(200, 'month');
    const r = projectBalance({ birthYear: 2026, dailyContribution: daily });
    expect(Math.round(r.annualContribution)).toBe(2400);
    expect(r.wasCapped).toBe(false);
  });

  it('$1,000/month becomes $12,000/year — capped at $5,000', () => {
    const daily = toDailyEquivalent(1000, 'month');
    const r = projectBalance({ birthYear: 2026, dailyContribution: daily });
    expect(r.annualContribution).toBe(5000);
    expect(r.wasCapped).toBe(true);
  });
});
