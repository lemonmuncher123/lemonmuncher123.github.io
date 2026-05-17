// Tax-system constants for the optional Tax Analysis section.
// Sources: CALCULATOR_ALGORITHM.md §5.2 (kiddie tax, realization rate, CA surtax)
// and §5.4 (federal LTCG mapping).
//
// Existing FEDERAL_EMPLOYER_EXCLUSION_CAP and TRUMP_ACCOUNT_ANNUAL_CAP live in
// constants.ts and are reused.

// Kiddie tax — IRS Rev. Proc. 2024-40, 2025 amounts (algorithm §5.2)
export const KIDDIE_TAX_EXEMPT = 1_350;
export const KIDDIE_TAX_CHILD_BAND = 1_350;
export const KIDDIE_TAX_CHILD_RATE = 0.01;

// Realization assumption — 5% of an annual gain is "realized" (taxable) for a
// passive buy-and-hold S&P index portfolio. Algorithm §5.2 / §10.3.
export const REALIZATION_RATE = 0.05;

// California Mental Health Services Tax surtax — algorithm §5.2.
export const CA_BHST_THRESHOLD = 1_000_000;
export const CA_BHST_RATE = 0.01;

// Federal LTCG mapping — algorithm §5.4.
// Returns the federal long-term-capital-gains rate that applies to a taxpayer
// whose ordinary-income marginal rate is `parentMarginalRate`.
export function federalLtcgRate(parentMarginalRate: number): number {
  if (parentMarginalRate <= 0.12) return 0;
  if (parentMarginalRate <= 0.35) return 0.15;
  return 0.20;
}
