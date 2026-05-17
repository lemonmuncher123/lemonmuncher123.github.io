// Optimistic Historical Mode — port of new/src/lib/calculator.ts's
// `simulateCollegeSavings`, adapted to v2's input shape and policy mechanics.
//
// Algorithm (per path, 1000 paths):
//   balance = pilot seed if eligible else 0
//   for y = 1..yearsToMatriculation:
//     yearGrowth = ∏_{m=1..12} (1 + N(effectiveMonthlyMean, monthlyVol²))
//     balance = balance × yearGrowth + cappedAnnualContribution     // end of year
//
// Default market parameters are the Yahoo-derived S&P 500 monthly stats from
// new/dist (1985–2026 sample) — same shape Astro will overwrite when the
// build-time Yahoo fetch in `src/pages/index.astro` succeeds. Values were
// captured at the last observed `new` build so v2 stays sensible even when
// offline or when Yahoo blocks the fetch:
//   monthlyMean ≈ 0.00842   (annualized ≈ 10.6%)
//   monthlyVol  ≈ 0.04352   (annualized ≈ 15.1%)
//
// Expense drag: the gross historical return is reduced by a fund expense ratio
// (default 0.10%/yr, typical for low-cost S&P 500 index ETFs) before the Monte
// Carlo runs. We apply it on the annualized return and convert back to
// `effectiveMonthlyMean`:
//   annual_pre  = (1 + monthlyMean)^12 - 1
//   annual_post = annual_pre - expenseRatio
//   effectiveMonthlyMean = (1 + annual_post)^(1/12) - 1
// Volatility is not adjusted by the expense ratio.
//
// No inflation deflation — the result is the future nominal balance, headline
// = median (50th percentile).
//
// RNG defaults to `Math.random()` Box-Muller (matches new exactly). For
// deterministic results (tests, stable UI output) pass an `input.seed` —
// the seeded mulberry32 + Box-Muller from ./rng is used instead.

import { PILOT_SEED_AMOUNT, TRUMP_ACCOUNT_ANNUAL_CAP } from './constants';
import { computeBirthYearEligibility } from './eligibility';
import { createMulberry32, createNormalSampler, type NormalSampler } from './rng';

/**
 * Yahoo-derived S&P 500 monthly mean from the last observed `new` build
 * (1985–2026 sample). Used when the Astro build-time fetch is skipped or
 * fails. Annualized: ≈10.6%.
 */
export const HISTORICAL_MONTHLY_MEAN = 0.008421878912947857;

/**
 * Yahoo-derived monthly stdev from the same sample. Annualized: ≈15.1%.
 */
export const HISTORICAL_MONTHLY_VOL = 0.043521649260455646;

/** Yahoo-derived label. Astro overrides this with the live fetched range. */
export const HISTORICAL_DATA_RANGE = '1985–2026';

/**
 * Default fund expense ratio (0.10%/yr) — typical for a low-cost S&P 500 index
 * ETF (e.g. VOO 0.03%, IVV 0.03%, SPY 0.0945%, SWPPX 0.02%; 0.10% is a
 * conservative round number families would realistically meet).
 */
export const DEFAULT_EXPENSE_RATIO = 0.001;

/** Hard-coded in new/src/lib/calculator.ts:44. */
export const OPTIMISTIC_NUM_PATHS = 1000;

/** Mode identifier the UI can switch on. */
export const OPTIMISTIC_MODE_ID = 'optimisticHistorical' as const;
export type OptimisticModeId = typeof OPTIMISTIC_MODE_ID;

export interface OptimisticAssumptions {
  monthlyMean: number;
  monthlyVol: number;
  /**
   * Annual fund expense ratio applied before the simulation runs (e.g. 0.001
   * for 0.10%/yr). Reduces `monthlyMean` to `effectiveMonthlyMean` via the
   * annualized round-trip described at the top of this file. Use 0 to disable.
   */
  expenseRatio: number;
}

export const DEFAULT_OPTIMISTIC_ASSUMPTIONS: OptimisticAssumptions = {
  monthlyMean: HISTORICAL_MONTHLY_MEAN,
  monthlyVol: HISTORICAL_MONTHLY_VOL,
  expenseRatio: DEFAULT_EXPENSE_RATIO,
};

/**
 * Apply expense drag: subtract the annual expense ratio from the annualized
 * return implied by `monthlyMean`, then convert back to a monthly figure.
 * Returns `monthlyMean` unchanged when `expenseRatio <= 0`.
 */
export function applyExpenseDrag(monthlyMean: number, expenseRatio: number): number {
  if (!Number.isFinite(monthlyMean) || expenseRatio <= 0) return monthlyMean;
  const annualPre = Math.pow(1 + monthlyMean, 12) - 1;
  const annualPost = annualPre - expenseRatio;
  // Guard against pathological inputs (e.g. expense ratio larger than the gross
  // return) — keep the post-fee annual in (-1, ∞) so the 12th root stays real.
  if (annualPost <= -1) return Math.pow(0, 1 / 12) - 1;
  return Math.pow(1 + annualPost, 1 / 12) - 1;
}

export interface OptimisticInput {
  birthYear: number;
  /** Monthly contribution; annualized internally as `monthly × 12`. */
  monthlyContribution: number;
  /** Optional override of monthly mean/vol (e.g. to feed Yahoo-fetched values). */
  assumptions?: Partial<OptimisticAssumptions>;
  /** Override the default 1000 paths. */
  numPaths?: number;
  /** Optional RNG seed for deterministic output. Omit to match `new` exactly. */
  seed?: number;
  /**
   * When true, retain the full year-by-year balance trajectory for every path.
   * Used by the optional Tax Analysis section to compute pathwise after-tax
   * percentiles and (for CA) annual kiddie tax. Costs ~144 KB for 1000 paths
   * × 18 years × 8 bytes; off by default.
   */
  retainPaths?: boolean;
}

export interface OptimisticContributionDetails {
  rawMonthly: number;
  rawAnnual: number;
  cappedAnnual: number;
  wasCapped: boolean;
}

export interface OptimisticResult {
  /** Headline: median nominal terminal balance, future dollars at age 18. */
  medianSavings: number;
  // Companion percentiles, future nominal dollars.
  p10: number;
  p25: number;
  p75: number;
  p90: number;

  // Audit / echo-back fields.
  seedAmount: number;
  totalContributions: number;
  yearsSimulated: number;
  /** Pre-fee monthly mean as passed in via `assumptions.monthlyMean`. */
  monthlyMeanUsed: number;
  monthlyVolUsed: number;
  /** Effective monthly mean after applying expense drag — what the sim ran with. */
  effectiveMonthlyMean: number;
  /** Expense ratio actually applied (annualized). */
  expenseRatioUsed: number;
  /**
   * Annualized mean used by the simulation, i.e. derived from
   * `effectiveMonthlyMean` (post-fee). This is the value to display.
   */
  annualizedMean: number;
  /** Implied annualized vol: monthlyVol × √12. */
  annualizedVol: number;
  numPaths: number;
  /** Whether the run was deterministic-seeded (true) or used Math.random (false). */
  wasSeeded: boolean;
  contributionDetails: OptimisticContributionDetails;
  /**
   * Year-by-year balance for each path (length `numPaths`, each
   * `Float64Array(yearsSimulated)`). Populated only when
   * `input.retainPaths === true`.
   */
  pathsByYear?: Float64Array[];
}

/**
 * Run the Optimistic Historical projection. Headline = `medianSavings`
 * (future nominal dollars at age 18). No inflation, no fees.
 */
export function projectOptimisticHistorical(input: OptimisticInput): OptimisticResult {
  const assumptions: OptimisticAssumptions = {
    ...DEFAULT_OPTIMISTIC_ASSUMPTIONS,
    ...(input.assumptions ?? {}),
  };
  const numPaths = Math.max(1, Math.floor(input.numPaths ?? OPTIMISTIC_NUM_PATHS));

  const eligibility = computeBirthYearEligibility(input.birthYear);
  const yearsSimulated = eligibility.contributionYears;
  const seedAmount = eligibility.pilotSeedEligible ? PILOT_SEED_AMOUNT : 0;

  const rawMonthly = Math.max(
    0,
    Number.isFinite(input.monthlyContribution) ? input.monthlyContribution : 0,
  );
  const rawAnnual = rawMonthly * 12;
  const cappedAnnual = Math.min(rawAnnual, TRUMP_ACCOUNT_ANNUAL_CAP);
  const wasCapped = rawAnnual > TRUMP_ACCOUNT_ANNUAL_CAP;

  const { monthlyMean, monthlyVol, expenseRatio } = assumptions;
  const effectiveMonthlyMean = applyExpenseDrag(monthlyMean, expenseRatio);

  const wasSeeded = input.seed !== undefined;
  const normal: NormalSampler = wasSeeded
    ? createNormalSampler(createMulberry32(input.seed as number))
    : mathRandomBoxMuller;

  const terminals = new Float64Array(numPaths);
  const pathsByYear: Float64Array[] | undefined = input.retainPaths
    ? new Array(numPaths)
    : undefined;
  for (let i = 0; i < numPaths; i++) {
    let balance = seedAmount;
    const path = pathsByYear ? new Float64Array(yearsSimulated) : null;
    for (let y = 0; y < yearsSimulated; y++) {
      let yearGrowth = 1;
      for (let m = 0; m < 12; m++) {
        yearGrowth *= 1 + normal(effectiveMonthlyMean, monthlyVol);
      }
      balance = balance * yearGrowth + cappedAnnual;
      if (path) path[y] = balance;
    }
    terminals[i] = balance;
    if (pathsByYear && path) pathsByYear[i] = path;
  }

  terminals.sort();

  const pct = (p: number): number => {
    if (terminals.length === 0) return 0;
    const idx = Math.min(terminals.length - 1, Math.floor(terminals.length * p));
    return terminals[idx];
  };

  return {
    medianSavings: pct(0.5),
    p10: pct(0.1),
    p25: pct(0.25),
    p75: pct(0.75),
    p90: pct(0.9),
    seedAmount,
    totalContributions: seedAmount + cappedAnnual * yearsSimulated,
    yearsSimulated,
    monthlyMeanUsed: monthlyMean,
    monthlyVolUsed: monthlyVol,
    effectiveMonthlyMean,
    expenseRatioUsed: Math.max(0, expenseRatio),
    annualizedMean: Math.pow(1 + effectiveMonthlyMean, 12) - 1,
    annualizedVol: monthlyVol * Math.sqrt(12),
    numPaths,
    wasSeeded,
    contributionDetails: { rawMonthly, rawAnnual, cappedAnnual, wasCapped },
    ...(pathsByYear ? { pathsByYear } : {}),
  };
}

/**
 * Inline Box-Muller using Math.random — exactly the implementation from
 * new/src/lib/calculator.ts:107. Used when no seed is provided.
 */
function mathRandomBoxMuller(mean: number, stdDev: number): number {
  let u1 = Math.random();
  const u2 = Math.random();
  if (u1 === 0) u1 = Number.EPSILON;
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z0 * stdDev + mean;
}
