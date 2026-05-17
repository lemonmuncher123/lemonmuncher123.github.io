import {
  ANNUAL_RETURN_RATE,
  DAYS_PER_YEAR,
  TRUMP_ACCOUNT_ANNUAL_CAP,
} from './constants';
import { computeBirthYearEligibility } from './eligibility';

export type Frequency = 'day' | 'month' | 'year';

// Convert a user-entered amount in any frequency to its daily equivalent.
// projectBalance expects daily; this lets the UI accept monthly/yearly
// without modifying the core algorithm.
export function toDailyEquivalent(amount: number, frequency: Frequency): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  switch (frequency) {
    case 'day':
      return amount;
    case 'month':
      return (amount * 12) / DAYS_PER_YEAR;
    case 'year':
      return amount / DAYS_PER_YEAR;
  }
}

// Convert a user-entered amount in any frequency to its monthly equivalent.
// projectConservativeRealWorld expects monthly; this is the parallel converter
// to `toDailyEquivalent` so both modes can share a single (amount, frequency)
// input from the UI.
export function toMonthlyEquivalent(amount: number, frequency: Frequency): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  switch (frequency) {
    case 'day':
      return (amount * DAYS_PER_YEAR) / 12;
    case 'month':
      return amount;
    case 'year':
      return amount / 12;
  }
}

export interface ProjectInput {
  birthYear: number;
  dailyContribution: number;
}

export interface ProjectOutput {
  years: number;
  seed: number;
  rawAnnualContribution: number;
  annualContribution: number;
  wasCapped: boolean;
  finalBalance: number;
  totalContributed: number;
  growth: number;
  eligibleForNewContributions: boolean;
  pilotSeedEligible: boolean;
}

export function projectBalance({ birthYear, dailyContribution }: ProjectInput): ProjectOutput {
  const eligibility = computeBirthYearEligibility(birthYear);
  const rawAnnual = Math.max(0, dailyContribution) * DAYS_PER_YEAR;
  const annual = Math.min(rawAnnual, TRUMP_ACCOUNT_ANNUAL_CAP);
  const wasCapped = rawAnnual > TRUMP_ACCOUNT_ANNUAL_CAP;
  const seed = eligibility.initialSeed;
  const years = eligibility.contributionYears;

  // End-of-year contribution (matches CALCULATOR_ALGORITHM.md §4.4)
  let balance = seed;
  for (let y = 0; y < years; y++) {
    balance = balance * (1 + ANNUAL_RETURN_RATE) + annual;
  }

  const totalContributed = seed + annual * years;
  const growth = balance - totalContributed;

  return {
    years,
    seed,
    rawAnnualContribution: rawAnnual,
    annualContribution: annual,
    wasCapped,
    finalBalance: balance,
    totalContributed,
    growth,
    eligibleForNewContributions: eligibility.eligibleForNewContributions,
    pilotSeedEligible: eligibility.pilotSeedEligible,
  };
}
