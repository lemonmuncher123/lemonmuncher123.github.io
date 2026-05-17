// Presentation-layer inflation deflator. Used to annotate future-nominal
// headline amounts with a "≈ $X in today's dollars" subtitle so users
// understand what the projected balance actually buys.
//
// This is strictly presentation. It MUST NOT be applied inside the Monte Carlo
// simulator, the tax model, the per-path after-tax overlay, or any other
// place where dollars are summed, compounded, or compared. The simulator and
// tax engines work in nominal terms; deflation happens only when a single
// final number is displayed.

/**
 * Standard financial-planning default for long-run U.S. CPI. Matches the value
 * used in `Calculator.tsx` for life-language tier deflation and sits between
 * the Fed's 2% target and the ~3% long-run U.S. CPI average.
 *
 * 18-year deflator: `1.025^18 ≈ 1.560` → $1 future-nominal ≈ $0.641 today.
 */
export const ASSUMED_ANNUAL_INFLATION = 0.025;

/**
 * Convert a future-nominal dollar amount into today's dollars by discounting
 * at `inflationRate` per year for `years` years.
 *
 * Edge cases:
 * - `years <= 0` → returns `futureNominal` unchanged (no deflation).
 * - `inflationRate <= 0` → returns `futureNominal` unchanged.
 * - non-finite `futureNominal` → returned as-is.
 */
export function toTodaysDollars(
  futureNominal: number,
  years: number,
  inflationRate: number = ASSUMED_ANNUAL_INFLATION,
): number {
  if (!Number.isFinite(futureNominal)) return futureNominal;
  if (years <= 0 || inflationRate <= 0) return futureNominal;
  return futureNominal / Math.pow(1 + inflationRate, years);
}
