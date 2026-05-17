import { describe, it, expect } from 'vitest';
import { ASSUMED_ANNUAL_INFLATION, toTodaysDollars } from './inflation';

describe('ASSUMED_ANNUAL_INFLATION', () => {
  it('is 2.5%/yr — matches the standard financial-planning default', () => {
    expect(ASSUMED_ANNUAL_INFLATION).toBe(0.025);
  });
});

describe('toTodaysDollars', () => {
  it('returns the input unchanged at year 0', () => {
    expect(toTodaysDollars(100_000, 0)).toBe(100_000);
  });

  it('returns the input unchanged when years is negative', () => {
    expect(toTodaysDollars(100_000, -5)).toBe(100_000);
  });

  it('returns the input unchanged when inflation rate is 0', () => {
    expect(toTodaysDollars(100_000, 18, 0)).toBe(100_000);
  });

  it('matches the closed-form discount at the default rate over 18 years', () => {
    const expected = 100_000 / Math.pow(1.025, 18);
    expect(toTodaysDollars(100_000, 18)).toBeCloseTo(expected, 6);
  });

  it('applies a custom rate when provided', () => {
    const expected = 100_000 / Math.pow(1.03, 18);
    expect(toTodaysDollars(100_000, 18, 0.03)).toBeCloseTo(expected, 6);
  });

  it('18-year deflator at 2.5% gives roughly 0.641', () => {
    const ratio = toTodaysDollars(1, 18) / 1;
    expect(ratio).toBeGreaterThan(0.638);
    expect(ratio).toBeLessThan(0.644);
  });

  it('10-year deflator at 2.5% gives roughly 0.781', () => {
    const ratio = toTodaysDollars(1, 10) / 1;
    expect(ratio).toBeGreaterThan(0.778);
    expect(ratio).toBeLessThan(0.784);
  });

  it('passes through non-finite inputs', () => {
    expect(toTodaysDollars(Number.NaN, 18)).toBeNaN();
    expect(toTodaysDollars(Number.POSITIVE_INFINITY, 18)).toBe(Number.POSITIVE_INFINITY);
  });
});
