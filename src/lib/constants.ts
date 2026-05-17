// Authoritative constants for the Trump Account v2 calculator.
// Sources: CALCULATOR_ALGORITHM.md §5.2 and trump_account_prd.md §5.2.

export const PILOT_SEED_AMOUNT = 1_000;
export const PILOT_SEED_START_YEAR = 2025;
export const PILOT_SEED_END_YEAR = 2028;
export const ACCOUNT_LAUNCH_YEAR = 2026;

export const TRUMP_ACCOUNT_ANNUAL_CAP = 5_000;
export const FEDERAL_EMPLOYER_EXCLUSION_CAP = 2_500;

export const ANNUAL_RETURN_RATE = 0.07;
export const DAYS_PER_YEAR = 365;

export const SITE_URL = 'trumpaccount.guide';
export const OFFICIAL_GOV_URL = 'https://trumpaccounts.gov';

export const DAILY_PRESETS = [1, 3, 5, 10, 20] as const;
export const DEFAULT_DAILY = 5;

export const BIRTH_YEAR_RANGE = { min: 2009, max: 2028 } as const;
