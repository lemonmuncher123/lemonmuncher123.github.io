import { describe, it, expect } from 'vitest';
import {
  KIDDIE_TAX_EXEMPT,
  KIDDIE_TAX_CHILD_BAND,
  KIDDIE_TAX_CHILD_RATE,
  REALIZATION_RATE,
  CA_BHST_THRESHOLD,
  CA_BHST_RATE,
  federalLtcgRate,
} from './taxConstants';

describe('taxConstants — match CALCULATOR_ALGORITHM.md §5.2', () => {
  it('matches kiddie-tax constants', () => {
    expect(KIDDIE_TAX_EXEMPT).toBe(1_350);
    expect(KIDDIE_TAX_CHILD_BAND).toBe(1_350);
    expect(KIDDIE_TAX_CHILD_RATE).toBe(0.01);
  });

  it('matches realization rate', () => {
    expect(REALIZATION_RATE).toBe(0.05);
  });

  it('matches CA BHST surtax constants', () => {
    expect(CA_BHST_THRESHOLD).toBe(1_000_000);
    expect(CA_BHST_RATE).toBe(0.01);
  });
});

describe('federalLtcgRate — boundaries per §5.4', () => {
  it('returns 0 at or below 12%', () => {
    expect(federalLtcgRate(0.10)).toBe(0);
    expect(federalLtcgRate(0.12)).toBe(0);
  });

  it('returns 0.15 between 12% (exclusive) and 35% (inclusive)', () => {
    expect(federalLtcgRate(0.121)).toBe(0.15);
    expect(federalLtcgRate(0.22)).toBe(0.15);
    expect(federalLtcgRate(0.24)).toBe(0.15);
    expect(federalLtcgRate(0.32)).toBe(0.15);
    expect(federalLtcgRate(0.35)).toBe(0.15);
  });

  it('returns 0.20 above 35%', () => {
    expect(federalLtcgRate(0.351)).toBe(0.20);
    expect(federalLtcgRate(0.37)).toBe(0.20);
  });
});
