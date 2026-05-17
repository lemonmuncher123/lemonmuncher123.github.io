import {
  ACCOUNT_LAUNCH_YEAR,
  PILOT_SEED_AMOUNT,
  PILOT_SEED_END_YEAR,
  PILOT_SEED_START_YEAR,
} from './constants';

export interface BirthYearEligibility {
  pilotSeedEligible: boolean;
  initialSeed: number;
  firstContributionYear: number;
  lastGrowthYear: number;
  distributionYear: number;
  contributionYears: number;
  eligibleForNewContributions: boolean;
}

export function computeBirthYearEligibility(birthYear: number): BirthYearEligibility {
  const pilotSeedEligible =
    birthYear >= PILOT_SEED_START_YEAR && birthYear <= PILOT_SEED_END_YEAR;
  const firstContributionYear = Math.max(ACCOUNT_LAUNCH_YEAR, birthYear);
  const lastGrowthYear = birthYear + 17;
  const distributionYear = birthYear + 18;
  const contributionYears = Math.max(0, lastGrowthYear - firstContributionYear + 1);
  const eligibleForNewContributions = contributionYears > 0;

  return {
    pilotSeedEligible,
    initialSeed: pilotSeedEligible ? PILOT_SEED_AMOUNT : 0,
    firstContributionYear,
    lastGrowthYear,
    distributionYear,
    contributionYears,
    eligibleForNewContributions,
  };
}
