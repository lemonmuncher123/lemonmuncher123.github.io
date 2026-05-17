// Tax model for the optional Tax Analysis section.
//
// Ports CALCULATOR_ALGORITHM.md §6 (capContributions), §9 (state kiddie tax,
// both single-year and pathwise), §10.1–10.4 (deterministic 18-year tax model),
// and §10.6 (per-Monte-Carlo-path after-tax overlay).
//
// Generalized from v1's California-only model: state behavior is gated on
// `state.nonconforming` (Layer 1) and `state.hasStateKiddieTax` (Layer 2).
// CA flips both flags; NO_TAX flips neither, so all state-tax expressions
// degenerate to 0 and only federal math survives.

import { FEDERAL_EMPLOYER_EXCLUSION_CAP, TRUMP_ACCOUNT_ANNUAL_CAP } from './constants';
import {
  KIDDIE_TAX_EXEMPT,
  KIDDIE_TAX_CHILD_BAND,
  KIDDIE_TAX_CHILD_RATE,
  REALIZATION_RATE,
  federalLtcgRate,
} from './taxConstants';
import {
  type FilingStatus,
  type StateConfig,
  stateIncrementalTax,
} from './stateTax';

// ---------------------------------------------------------------------------
// §6 — Contribution cap enforcement
// ---------------------------------------------------------------------------

/**
 * Clamp employer + individual contributions to the federal caps. Employer
 * takes priority up to FEDERAL_EMPLOYER_EXCLUSION_CAP (§128); individual fills
 * the remaining headroom up to TRUMP_ACCOUNT_ANNUAL_CAP (§530A total).
 */
export function capContributions(
  rawEmployer: number,
  rawOther: number,
): { employerC: number; otherC: number; wasCapped: boolean } {
  const employerC = Math.min(Math.max(0, rawEmployer), FEDERAL_EMPLOYER_EXCLUSION_CAP);
  const remaining = Math.max(0, TRUMP_ACCOUNT_ANNUAL_CAP - employerC);
  const otherC = Math.min(Math.max(0, rawOther), remaining);
  const wasCapped =
    rawEmployer > FEDERAL_EMPLOYER_EXCLUSION_CAP || rawOther > remaining;
  return { employerC, otherC, wasCapped };
}

// ---------------------------------------------------------------------------
// §9 — Kiddie tax (annual, on 5% of each year's gain)
// ---------------------------------------------------------------------------

/**
 * State kiddie tax on one year's investment gain. Three-band structure on the
 * 5%-realized portion: exempt → child rate → parent's marginal rate. Returns 0
 * if the state has no kiddie tax (`state.hasStateKiddieTax` falsy).
 *
 * Matches algorithm §9.1.
 */
export function stateKiddieTaxOnYearGain(
  yearGain: number,
  totalC: number,
  status: FilingStatus,
  baseStateIncome: number,
  state: StateConfig,
): number {
  if (!state.hasStateKiddieTax) return 0;
  const effective = Math.max(0, yearGain) * REALIZATION_RATE;
  if (effective <= 0) return 0;
  const exempt = Math.min(effective, KIDDIE_TAX_EXEMPT);
  const childBand = Math.min(Math.max(effective - exempt, 0), KIDDIE_TAX_CHILD_BAND);
  const parentBand = Math.max(effective - exempt - childBand, 0);
  return (
    childBand * KIDDIE_TAX_CHILD_RATE +
    stateIncrementalTax(baseStateIncome + totalC, parentBand, status, state)
  );
}

/**
 * Lifetime kiddie tax across an entire 18-year balance trajectory. Path-
 * dependent: two paths with the same terminal balance can produce different
 * totals because the exempt band resets each year.
 *
 * Matches algorithm §9.2.
 */
export function pathwiseStateKiddieTax(
  balanceByYear: ArrayLike<number>,
  initialBalance: number,
  totalAnnualContribution: number,
  status: FilingStatus,
  baseStateIncome: number,
  state: StateConfig,
): number {
  let prev = initialBalance;
  let total = 0;
  for (let y = 0; y < balanceByYear.length; y++) {
    const gain = balanceByYear[y] - prev - totalAnnualContribution;
    total += stateKiddieTaxOnYearGain(gain, totalAnnualContribution, status, baseStateIncome, state);
    prev = balanceByYear[y];
  }
  return total;
}

// ---------------------------------------------------------------------------
// §10 — Deterministic 18-year tax model
// ---------------------------------------------------------------------------

/**
 * How the brokerage baseline is funded relative to the §530A side.
 *
 * - `sameAfterTaxCash` (default): the user is assumed to have committed
 *   `totalC` of *after-tax* cash per year. Both accounts deposit the full
 *   `totalC`. No ordinary-income contribution tax is charged to either side.
 *   This is the apples-to-apples comparison most users actually face — "if I
 *   have $5,000/yr to invest, where does it grow best?"
 *
 * - `samePreTaxIncome`: the user is assumed to have `totalC` of *pre-tax*
 *   income capacity. The brokerage side pays ordinary federal+state tax on
 *   the contribution and invests only the after-tax remainder; the §530A side
 *   gets to deposit the full pre-tax amount (federal tax on the non-§128
 *   portion paid out-of-pocket). This is the v1 model. It overstates the
 *   §530A advantage for low-income families because their lower ordinary
 *   bracket makes the "you get to skip ordinary tax at deposit" benefit
 *   smaller in dollars, but the model amplifies it by giving §530A more
 *   compounded principal.
 */
export type ComparisonMode = 'sameAfterTaxCash' | 'samePreTaxIncome';

export interface TaxModelInput {
  years: number;
  annualEmployerContribution: number;
  annualOtherContribution: number;
  monthlyReturnRate: number;
  filingStatus: FilingStatus;
  state: StateConfig;
  baseStateTaxableIncome: number;
  parentFederalMarginalRate: number;
  childFutureFederalRate: number;
  includeAnnualStateKiddieTax?: boolean;
  initialSeed?: number;
  /** How the baseline is funded. Default: `'sameAfterTaxCash'`. */
  comparisonMode?: ComparisonMode;
}

export interface TaxYearRow {
  year: number;
  baselineEndBalance: number;
  trumpEndBalance: number;
  baselineTaxThisYear: number;
  trumpTaxThisYear: number;
}

export interface TaxModelOutput {
  baselineFinalBalance: number;
  trumpFinalBalance: number;
  federalTaxSavings: number;
  stateTaxSavings: number;
  combinedTaxSavings: number;
  wealthDifference: number;
  yearRows: TaxYearRow[];
  annualStateKiddieTaxEnabled: boolean;
  /** Echoes the active mode so the UI can label the comparison correctly. */
  comparisonMode: ComparisonMode;
}

/**
 * Deterministic single-path comparison of a §530A "Trump Account" against a
 * taxable brokerage baseline at the same gross contribution level. Uses the
 * exact historical mean monthly return (no random draws) so two scenarios are
 * directly comparable.
 *
 * Math is identical to algorithm §10 — the only generalization is that state
 * behavior is driven by the `state` config object rather than hard-coded CA.
 */
export function runTaxModel(input: TaxModelInput): TaxModelOutput {
  const {
    years,
    annualEmployerContribution: employerC,
    annualOtherContribution: otherC,
    monthlyReturnRate,
    filingStatus,
    state,
    baseStateTaxableIncome: baseStateIncome,
    parentFederalMarginalRate: parentFedRate,
    childFutureFederalRate: childFedRate,
    initialSeed = 0,
  } = input;
  const includeAnnualStateKiddieTax = input.includeAnnualStateKiddieTax ?? true;
  const comparisonMode: ComparisonMode = input.comparisonMode ?? 'sameAfterTaxCash';

  const totalC = employerC + otherC;
  const annualFactor = Math.pow(1 + monthlyReturnRate, 12);
  const ltcgRate = federalLtcgRate(parentFedRate);

  // Federally taxable now = the part of totalC not excluded under §128.
  const fedExcluded = Math.min(employerC, FEDERAL_EMPLOYER_EXCLUSION_CAP);
  const federallyTaxableNow = (employerC - fedExcluded) + otherC;

  // State taxable now = if the state is nonconforming, the full totalC is
  // taxed each year; if it conforms, only the federally-taxable portion is.
  // CA nonconformity is a §530A-specific extra state tax on top of whatever the
  // user has already paid in ordinary income tax — it is included in both
  // comparison modes because it's not "ordinary income tax on the original
  // cash", it's a unique cost the §530A account imposes that a regular
  // brokerage does not.
  const stateTaxableContribution = state.nonconforming ? totalC : federallyTaxableNow;

  let baselineBalance = 0;
  let trumpBalance = initialSeed;
  let baselineBasis = 0;

  let baselineTotalFederal = 0;
  let baselineTotalState = 0;
  let trumpTotalFederalBeforeFinal = 0;
  let trumpTotalState = 0;

  const yearRows: TaxYearRow[] = [];

  for (let y = 1; y <= years; y++) {
    // -------- Baseline (taxable brokerage) --------
    // In `sameAfterTaxCash` the contribution is already after-tax cash, so no
    // ordinary income tax is charged at deposit and the brokerage invests the
    // full `totalC`. In `samePreTaxIncome` (v1 behavior) the brokerage owes
    // ordinary parent fed + state tax on the contribution and only the
    // remainder is deposited.
    let baseFedContrib: number;
    let baseStateContrib: number;
    let afterTaxC: number;
    if (comparisonMode === 'samePreTaxIncome') {
      baseFedContrib = totalC * parentFedRate;
      baseStateContrib = stateIncrementalTax(baseStateIncome, totalC, filingStatus, state);
      afterTaxC = totalC - baseFedContrib - baseStateContrib;
    } else {
      baseFedContrib = 0;
      baseStateContrib = 0;
      afterTaxC = totalC;
    }
    baselineBasis += afterTaxC;

    // 2. Compound + deposit.
    const baselineStart = baselineBalance;
    baselineBalance = baselineBalance * annualFactor + afterTaxC;

    // 3. 5% of gain realized & taxed at LTCG + state ordinary.
    const baseGain = baselineBalance - baselineStart - afterTaxC;
    const realizedBaseGain = Math.max(0, baseGain) * REALIZATION_RATE;
    const baseFedGain = realizedBaseGain * ltcgRate;
    const baseStateGain = stateIncrementalTax(
      baseStateIncome + totalC,
      realizedBaseGain,
      filingStatus,
      state,
    );
    baselineBalance -= baseFedGain + baseStateGain;
    baselineBasis += realizedBaseGain;

    const baselineFedThisYear = baseFedContrib + baseFedGain;
    const baselineStateThisYear = baseStateContrib + baseStateGain;
    baselineTotalFederal += baselineFedThisYear;
    baselineTotalState += baselineStateThisYear;

    // -------- Trump Account (§530A) --------
    // 1. Federal contribution tax. In `samePreTaxIncome` mode the parent's
    //    ordinary federal tax on the non-§128 portion is paid out-of-pocket
    //    (doesn't reduce balance). In `sameAfterTaxCash` mode the contribution
    //    is already after-tax, so no ordinary fed tax at deposit — keeps the
    //    apples-to-apples comparison fair to the brokerage side.
    const trumpFedContrib =
      comparisonMode === 'samePreTaxIncome' ? federallyTaxableNow * parentFedRate : 0;
    // 2. State Layer 1: nonconforming states tax the full §530A contribution
    //    annually. This is a §530A-specific cost (a brokerage doesn't pay it)
    //    and is included in both comparison modes.
    const trumpStateContrib = stateIncrementalTax(
      baseStateIncome,
      stateTaxableContribution,
      filingStatus,
      state,
    );
    trumpTotalFederalBeforeFinal += trumpFedContrib;
    trumpTotalState += trumpStateContrib;

    // 3. Compound + deposit gross contribution (federal tax paid externally).
    const trumpStart = trumpBalance;
    trumpBalance = trumpBalance * annualFactor + totalC;

    // 4. State Layer 2 (toggle): annual kiddie tax on realized gain.
    const trumpYearGain = trumpBalance - trumpStart - totalC;
    const trumpStateGain = includeAnnualStateKiddieTax
      ? stateKiddieTaxOnYearGain(trumpYearGain, totalC, filingStatus, baseStateIncome, state)
      : 0;
    trumpBalance -= trumpStateGain;
    trumpTotalState += trumpStateGain;

    const trumpTaxThisYear = trumpFedContrib + trumpStateContrib + trumpStateGain;

    yearRows.push({
      year: y,
      baselineEndBalance: baselineBalance,
      trumpEndBalance: trumpBalance,
      baselineTaxThisYear: baselineFedThisYear + baselineStateThisYear,
      trumpTaxThisYear,
    });
  }

  // -------- Terminal distribution --------
  // Baseline: liquidate, pay LTCG + state on unrealized gain.
  const baselineUnrealized = Math.max(0, baselineBalance - baselineBasis);
  const baselineTerminalFed = baselineUnrealized * ltcgRate;
  const baselineTerminalState = stateIncrementalTax(
    baseStateIncome + totalC,
    baselineUnrealized,
    filingStatus,
    state,
  );
  baselineBalance -= baselineTerminalFed + baselineTerminalState;
  baselineTotalFederal += baselineTerminalFed;
  baselineTotalState += baselineTerminalState;

  // Trump federal at distribution: only individual contributions create basis.
  const federalBasis = years * otherC;
  const trumpFederallyTaxableAtDist = Math.max(0, trumpBalance - federalBasis);
  const trumpFinalFedTax = trumpFederallyTaxableAtDist * childFedRate;

  // Trump state at distribution: only matters if Layer 2 is OFF (otherwise
  // state tax has been collected pathwise year by year).
  let trumpTerminalStateTax = 0;
  if (!includeAnnualStateKiddieTax) {
    const stateBasis = totalC * years + initialSeed;
    const trumpGainForState = Math.max(0, trumpBalance - stateBasis);
    trumpTerminalStateTax = stateIncrementalTax(
      baseStateIncome + totalC,
      trumpGainForState,
      filingStatus,
      state,
    );
    trumpTotalState += trumpTerminalStateTax;
  }

  const trumpFinalBalance = trumpBalance - trumpFinalFedTax - trumpTerminalStateTax;
  const trumpTotalFederal = trumpTotalFederalBeforeFinal + trumpFinalFedTax;

  return {
    baselineFinalBalance: baselineBalance,
    trumpFinalBalance,
    federalTaxSavings: baselineTotalFederal - trumpTotalFederal,
    stateTaxSavings: baselineTotalState - trumpTotalState,
    combinedTaxSavings:
      baselineTotalFederal + baselineTotalState - trumpTotalFederal - trumpTotalState,
    wealthDifference: trumpFinalBalance - baselineBalance,
    yearRows,
    annualStateKiddieTaxEnabled: includeAnnualStateKiddieTax,
    comparisonMode,
  };
}

// ---------------------------------------------------------------------------
// §10.6 — Per-path after-tax overlay (used by the Monte Carlo display)
// ---------------------------------------------------------------------------

export interface PerPathTaxInput {
  /** End-of-year balances for a single Monte Carlo path. */
  balanceByYear: ArrayLike<number>;
  /** Balance at the start of year 1 — typically the pilot seed (or 0). */
  initialSeed: number;
  /** Capped employer contribution (annual). */
  employerC: number;
  /** Capped individual contribution (annual). */
  otherC: number;
  filingStatus: FilingStatus;
  state: StateConfig;
  baseStateIncome: number;
  childFutureFederalRate: number;
  includeAnnualStateKiddieTax: boolean;
}

/**
 * Compute the after-tax terminal balance for a single Monte Carlo path. Mirrors
 * the overlay in algorithm §10.6: federal distribution tax + state tax (either
 * pathwise kiddie or terminal incremental, depending on the Layer 2 toggle).
 */
export function applyPerPathTax(input: PerPathTaxInput): number {
  const {
    balanceByYear,
    initialSeed,
    employerC,
    otherC,
    filingStatus,
    state,
    baseStateIncome,
    childFutureFederalRate,
    includeAnnualStateKiddieTax,
  } = input;
  const totalC = employerC + otherC;
  const years = balanceByYear.length;
  if (years === 0) return initialSeed;

  const terminalBalance = balanceByYear[years - 1];
  const federalBasis = years * otherC;
  const stateBasis = years * totalC + initialSeed;

  const federalDistTax = Math.max(0, terminalBalance - federalBasis) * childFutureFederalRate;

  const stateTax = includeAnnualStateKiddieTax && state.hasStateKiddieTax
    ? pathwiseStateKiddieTax(balanceByYear, initialSeed, totalC, filingStatus, baseStateIncome, state)
    : stateIncrementalTax(
        baseStateIncome + totalC,
        Math.max(0, terminalBalance - stateBasis),
        filingStatus,
        state,
      );

  return Math.max(0, terminalBalance - federalDistTax - stateTax);
}
