// Conservative Real-World Mode for the Trump Account projection.
//
// Unlike the simple deterministic compound model in `./calculator.ts`, this
// mode runs a 1,000-path Monte Carlo simulation with:
//   • a seedable PRNG for fully reproducible results,
//   • an expense ratio drag on gross returns,
//   • a deterministic annual inflation rate used to deflate nominal terminals
//     into today's-dollar real terminals,
//   • annual volatility on gross returns (S&P 500-ish 16% by default).
//
// The headline result is the 25th-percentile terminal balance — meant to give
// ordinary families a number they can plan around rather than a rosy average.
// All percentiles (P10/P25/median/P75/P90) are returned in both nominal and
// real terms so the caller can show distributional context.
//
// Policy mechanics are reused from the existing v2 model:
//   • $1,000 seed if the birth year is in 2025–2028 (via eligibility.ts).
//   • Growth window through age 17 (via eligibility.ts).
//   • $5,000 annual federal contribution cap.
//
// The existing simple `projectBalance` model is *not* modified or refactored.

import { PILOT_SEED_AMOUNT, TRUMP_ACCOUNT_ANNUAL_CAP } from './constants';
import { computeBirthYearEligibility } from './eligibility';
import { createMulberry32, createNormalSampler } from './rng';

/** Assumptions that drive the conservative simulation. All annualized. */
export interface ConservativeAssumptions {
  /** Gross nominal annual return before fees, e.g. 0.06 = 6% */
  grossNominalAnnualReturn: number;
  /** Fund expense ratio, deducted geometrically from gross, e.g. 0.001 = 10 bps */
  expenseRatio: number;
  /** Deterministic annual inflation rate used to deflate nominal terminals */
  inflationRate: number;
  /** Annual volatility (standard deviation) of gross returns, e.g. 0.16 */
  annualVolatility: number;
}

export const DEFAULT_CONSERVATIVE_ASSUMPTIONS: ConservativeAssumptions = {
  grossNominalAnnualReturn: 0.06,
  expenseRatio: 0.001,
  inflationRate: 0.027,
  annualVolatility: 0.16,
};

/** Default number of Monte Carlo paths. */
export const DEFAULT_NUM_PATHS = 1_000;

/** Default RNG seed, chosen to be human-recognizable in test failures. */
export const DEFAULT_RNG_SEED = 0x5eed1337;

export interface ConservativeInput {
  birthYear: number;
  /** User contribution capacity expressed monthly. Annualized internally as `monthly × 12`. */
  monthlyContribution: number;
  assumptions?: Partial<ConservativeAssumptions>;
  /** Override default 1,000 paths if needed. */
  numPaths?: number;
  /** Override default RNG seed for reproducibility / testing. */
  seed?: number;
}

export interface ConservativeContributionDetails {
  rawMonthly: number;
  rawAnnual: number;
  cappedAnnual: number;
  wasCapped: boolean;
}

export interface ConservativeResult {
  // Percentile terminal balances in future nominal dollars.
  nominalP10: number;
  nominalP25: number;
  nominalMedian: number;
  nominalP75: number;
  nominalP90: number;

  // Percentile terminal balances in today's purchasing power (real dollars).
  realP10: number;
  realP25: number;
  realMedian: number;
  realP75: number;
  realP90: number;

  /** Headline conservative number — P25 by design, in both nominal and real terms. */
  primaryConservativeResult: { nominal: number; real: number };

  // Audit / echo-back fields for callers and UI.
  totalContributions: number;
  seedAmount: number;
  expenseRatioUsed: number;
  inflationRateUsed: number;
  grossReturnAssumption: number;
  netReturnAssumption: number;
  yearsSimulated: number;
  numPaths: number;
  rngSeed: number;
  contributionDetails: ConservativeContributionDetails;
}

/** Identifier the UI layer can switch on. */
export const CONSERVATIVE_MODE_ID = 'conservativeRealWorld' as const;
export type ConservativeModeId = typeof CONSERVATIVE_MODE_ID;

/**
 * Run the Conservative Real-World projection.
 *
 * Algorithm (per path i, repeated `numPaths` times):
 *   balance₀ = pilot seed if eligible else 0
 *   For y = 1..yearsToMatriculation:
 *     For m = 1..12:
 *       r_m ~ N(μ_m, σ_m²)            with μ_m = (1+netAnnual)^(1/12) − 1
 *                                          σ_m = annualVolatility / √12
 *       growth ×= (1 + r_m)
 *     balance = balance × growth + cappedAnnualContribution    (end-of-year)
 *
 * netAnnual = (1 + grossNominalAnnualReturn) / (1 + expenseRatio) − 1
 *
 * After all paths complete, terminal balances are sorted ascending and the
 * 10/25/50/75/90 percentiles are extracted. Real percentiles deflate by
 * (1 + inflationRate)^yearsSimulated.
 */
export function projectConservativeRealWorld(input: ConservativeInput): ConservativeResult {
  const assumptions: ConservativeAssumptions = {
    ...DEFAULT_CONSERVATIVE_ASSUMPTIONS,
    ...(input.assumptions ?? {}),
  };
  const numPaths = Math.max(1, Math.floor(input.numPaths ?? DEFAULT_NUM_PATHS));
  const seed = (input.seed ?? DEFAULT_RNG_SEED) >>> 0;

  const eligibility = computeBirthYearEligibility(input.birthYear);
  const yearsSimulated = eligibility.contributionYears;
  const seedAmount = eligibility.pilotSeedEligible ? PILOT_SEED_AMOUNT : 0;

  // Contribution: monthly → annual → federal cap.
  const rawMonthly = Math.max(0, Number.isFinite(input.monthlyContribution) ? input.monthlyContribution : 0);
  const rawAnnual = rawMonthly * 12;
  const cappedAnnual = Math.min(rawAnnual, TRUMP_ACCOUNT_ANNUAL_CAP);
  const wasCapped = rawAnnual > TRUMP_ACCOUNT_ANNUAL_CAP;

  // Net-of-fees annual return (geometric, exact).
  const grossAnnual = assumptions.grossNominalAnnualReturn;
  const netAnnual = (1 + grossAnnual) / (1 + assumptions.expenseRatio) - 1;

  // Convert to per-month so we compound 12× per year, matching the granularity
  // used by the existing v1 model and producing the correct right-skew.
  const monthlyMeanNet = Math.pow(1 + netAnnual, 1 / 12) - 1;
  const monthlyVol = assumptions.annualVolatility / Math.sqrt(12);

  // Seed the RNG once per call so the same input → identical output.
  const rng = createMulberry32(seed);
  const normal = createNormalSampler(rng);

  const terminals = new Float64Array(numPaths);
  for (let i = 0; i < numPaths; i++) {
    let balance = seedAmount;
    for (let y = 0; y < yearsSimulated; y++) {
      let yearGrowth = 1;
      for (let m = 0; m < 12; m++) {
        yearGrowth *= 1 + normal(monthlyMeanNet, monthlyVol);
      }
      balance = balance * yearGrowth + cappedAnnual;
    }
    terminals[i] = balance;
  }

  // Float64Array.prototype.sort is numeric by default.
  terminals.sort();

  const pct = (p: number): number => {
    if (terminals.length === 0) return 0;
    const idx = Math.min(terminals.length - 1, Math.floor(terminals.length * p));
    return terminals[idx];
  };

  const nominalP10 = pct(0.1);
  const nominalP25 = pct(0.25);
  const nominalMedian = pct(0.5);
  const nominalP75 = pct(0.75);
  const nominalP90 = pct(0.9);

  const deflator = Math.pow(1 + assumptions.inflationRate, yearsSimulated);
  const toReal = (x: number) => (deflator === 0 ? x : x / deflator);

  const realP10 = toReal(nominalP10);
  const realP25 = toReal(nominalP25);
  const realMedian = toReal(nominalMedian);
  const realP75 = toReal(nominalP75);
  const realP90 = toReal(nominalP90);

  const totalContributions = seedAmount + cappedAnnual * yearsSimulated;

  return {
    nominalP10,
    nominalP25,
    nominalMedian,
    nominalP75,
    nominalP90,
    realP10,
    realP25,
    realMedian,
    realP75,
    realP90,
    primaryConservativeResult: { nominal: nominalP25, real: realP25 },
    totalContributions,
    seedAmount,
    expenseRatioUsed: assumptions.expenseRatio,
    inflationRateUsed: assumptions.inflationRate,
    grossReturnAssumption: grossAnnual,
    netReturnAssumption: netAnnual,
    yearsSimulated,
    numPaths,
    rngSeed: seed,
    contributionDetails: { rawMonthly, rawAnnual, cappedAnnual, wasCapped },
  };
}
