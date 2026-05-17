// State income tax engine for the optional Tax Analysis section.
//
// Only California is fully modeled (CA brackets per CALCULATOR_ALGORITHM.md §5.3
// plus the BHST surtax §5.2, plus §128 nonconformity Layer 1, plus annual kiddie
// tax Layer 2). Everything else uses the NO_TAX config, which is *accurate* for
// the nine no-state-income-tax states (AK, FL, NV, NH, SD, TN, TX, WA, WY as of
// 2026) and is an *approximation* for other income-tax states. The UI surfaces
// that approximation as a disclaimer.

import { CA_BHST_THRESHOLD, CA_BHST_RATE } from './taxConstants';

export type FilingStatus = 'single' | 'mfj' | 'hoh';
export type StateId = 'CA' | 'NO_TAX';

/** A single tax bracket: `[lowerInclusive, upperExclusive, rate]`. */
export type Bracket = readonly [number, number, number];

export interface StateConfig {
  id: StateId;
  /** Human-readable label for the UI dropdown. */
  label: string;
  /** Ordered brackets per filing status. Absent ⇒ no state income tax. */
  brackets?: Readonly<Record<FilingStatus, ReadonlyArray<Bracket>>>;
  /**
   * State does NOT conform to IRC §530A — annual contributions are state-taxable
   * even when federally excluded under §128. CA-only as of 2026.
   */
  nonconforming?: boolean;
  /**
   * State has its own kiddie-tax treatment on the §530A account's annual
   * realized gains (the Layer 2 toggle in algorithm §9). CA-only.
   */
  hasStateKiddieTax?: boolean;
  /**
   * State levies an additional flat surtax above CA_BHST_THRESHOLD. CA-only.
   * (California Mental Health Services Tax, +1% above $1M.)
   */
  hasBhstSurtax?: boolean;
}

// CA 2025 FTB brackets — verbatim from CALCULATOR_ALGORITHM.md §5.3.
const CA_BRACKETS: Record<FilingStatus, ReadonlyArray<Bracket>> = {
  single: [
    [0, 11_079, 0.01],
    [11_079, 26_264, 0.02],
    [26_264, 41_452, 0.04],
    [41_452, 57_542, 0.06],
    [57_542, 72_724, 0.08],
    [72_724, 371_479, 0.093],
    [371_479, 445_771, 0.103],
    [445_771, 742_953, 0.113],
    [742_953, Infinity, 0.123],
  ],
  mfj: [
    [0, 22_158, 0.01],
    [22_158, 52_528, 0.02],
    [52_528, 82_904, 0.04],
    [82_904, 115_084, 0.06],
    [115_084, 145_448, 0.08],
    [145_448, 742_958, 0.093],
    [742_958, 891_542, 0.103],
    [891_542, 1_485_906, 0.113],
    [1_485_906, Infinity, 0.123],
  ],
  hoh: [
    [0, 22_173, 0.01],
    [22_173, 52_530, 0.02],
    [52_530, 67_716, 0.04],
    [67_716, 83_805, 0.06],
    [83_805, 98_990, 0.08],
    [98_990, 505_208, 0.093],
    [505_208, 606_251, 0.103],
    [606_251, 1_010_417, 0.113],
    [1_010_417, Infinity, 0.123],
  ],
};

export const STATES: Record<StateId, StateConfig> = {
  CA: {
    id: 'CA',
    label: 'California',
    brackets: CA_BRACKETS,
    nonconforming: true,
    hasStateKiddieTax: true,
    hasBhstSurtax: true,
  },
  NO_TAX: {
    id: 'NO_TAX',
    label: 'All other states (federal only)',
  },
};

/**
 * Total state income tax on `taxableIncome`. Matches algorithm §8.1 — sums
 * bracket-by-bracket, adds the BHST surtax if enabled, returns 0 for non-positive
 * income or states without brackets.
 */
export function stateTax(
  taxableIncome: number,
  status: FilingStatus,
  state: StateConfig,
): number {
  if (taxableIncome <= 0) return 0;
  if (!state.brackets) return 0;

  const brackets = state.brackets[status];
  let tax = 0;
  for (const [lower, upper, rate] of brackets) {
    if (taxableIncome <= lower) break;
    tax += (Math.min(taxableIncome, upper) - lower) * rate;
  }
  if (state.hasBhstSurtax && taxableIncome > CA_BHST_THRESHOLD) {
    tax += (taxableIncome - CA_BHST_THRESHOLD) * CA_BHST_RATE;
  }
  return tax;
}

/**
 * Tax on `additionalIncome` stacked on top of `baseTaxableIncome`. Per
 * algorithm §8.2: NOT a marginal-rate × additional shortcut. It correctly
 * handles bracket-straddling.
 */
export function stateIncrementalTax(
  baseTaxableIncome: number,
  additionalIncome: number,
  status: FilingStatus,
  state: StateConfig,
): number {
  if (additionalIncome <= 0) return 0;
  return (
    stateTax(baseTaxableIncome + additionalIncome, status, state) -
    stateTax(baseTaxableIncome, status, state)
  );
}
