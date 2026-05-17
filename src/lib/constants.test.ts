import { describe, it, expect } from 'vitest';
import {
  ANNUAL_RETURN_RATE,
  ACCOUNT_LAUNCH_YEAR,
  DAYS_PER_YEAR,
  FEDERAL_EMPLOYER_EXCLUSION_CAP,
  PILOT_SEED_AMOUNT,
  PILOT_SEED_END_YEAR,
  PILOT_SEED_START_YEAR,
  TRUMP_ACCOUNT_ANNUAL_CAP,
  DAILY_PRESETS,
  DEFAULT_DAILY,
} from './constants';

describe('constants — match authoritative spec', () => {
  it('matches CALCULATOR_ALGORITHM.md §5.2 values', () => {
    expect(PILOT_SEED_AMOUNT).toBe(1_000);
    expect(PILOT_SEED_START_YEAR).toBe(2025);
    expect(PILOT_SEED_END_YEAR).toBe(2028);
    expect(ACCOUNT_LAUNCH_YEAR).toBe(2026);
    expect(TRUMP_ACCOUNT_ANNUAL_CAP).toBe(5_000);
    expect(FEDERAL_EMPLOYER_EXCLUSION_CAP).toBe(2_500);
  });

  it('matches trump_account_prd.md §5.2 simplified values', () => {
    expect(ANNUAL_RETURN_RATE).toBe(0.07);
    expect(DAYS_PER_YEAR).toBe(365);
  });

  it('exposes the five PRD daily-contribution presets', () => {
    expect([...DAILY_PRESETS]).toEqual([1, 3, 5, 10, 20]);
    expect(DEFAULT_DAILY).toBe(5);
  });
});
