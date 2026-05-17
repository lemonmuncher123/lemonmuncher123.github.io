// Build-time market-assumption fetch. Runs once per Astro build in the
// frontmatter of the EN and ES home pages. Tries Yahoo Finance for live
// monthly S&P 500 stats; falls back to the Yahoo-derived constants captured
// from the most recent successful `new` build (1985–2026 baseline) so the
// project still builds offline.
//
// Returns the shape `<Calculator>` expects as props.

import {
  HISTORICAL_MONTHLY_MEAN,
  HISTORICAL_MONTHLY_VOL,
  HISTORICAL_DATA_RANGE,
} from './optimisticCalculator';

export interface MarketAssumptions {
  monthlyMean: number;
  monthlyVol: number;
  dataRangeConfig: string;
  /** True when the values were fetched live; false when the fallback was used. */
  fromLiveFetch: boolean;
}

export const FALLBACK_ASSUMPTIONS: MarketAssumptions = {
  monthlyMean: HISTORICAL_MONTHLY_MEAN,
  monthlyVol: HISTORICAL_MONTHLY_VOL,
  dataRangeConfig: HISTORICAL_DATA_RANGE,
  fromLiveFetch: false,
};

/**
 * Fetch ^GSPC monthly closes back to 1985 and compute the population-mean and
 * population-stdev of the monthly arithmetic returns. Matches the algorithm in
 * `new/src/pages/index.astro` so the displayed numbers stay comparable.
 *
 * On any error (network failure, Yahoo block, missing data), returns the
 * fallback constants. Never throws.
 */
export async function fetchMarketAssumptions(): Promise<MarketAssumptions> {
  try {
    // Lazy import keeps `yahoo-finance2` out of the client bundle even if a
    // future page accidentally imports this file outside frontmatter.
    const { default: YahooFinance } = await import('yahoo-finance2');
    const yahoo = new YahooFinance();

    const chartResult = await yahoo.chart('^GSPC', {
      period1: new Date('1985-01-01'),
      period2: new Date(),
      interval: '1mo',
    });
    const quotes = chartResult.quotes;
    if (!quotes || quotes.length <= 24) return FALLBACK_ASSUMPTIONS;

    const monthlyReturns: number[] = [];
    for (let i = 1; i < quotes.length; i++) {
      const prev = quotes[i - 1].close;
      const curr = quotes[i].close;
      if (prev == null || curr == null || prev === 0) continue;
      monthlyReturns.push((curr - prev) / prev);
    }
    if (monthlyReturns.length === 0) return FALLBACK_ASSUMPTIONS;

    const mean =
      monthlyReturns.reduce((a, b) => a + b, 0) / monthlyReturns.length;
    let varSum = 0;
    for (const r of monthlyReturns) varSum += (r - mean) ** 2;
    const vol = Math.sqrt(varSum / monthlyReturns.length);

    if (!Number.isFinite(mean) || !Number.isFinite(vol)) return FALLBACK_ASSUMPTIONS;

    const firstYear = new Date(quotes[0].date).getFullYear();
    const lastYear = new Date(quotes[quotes.length - 1].date).getFullYear();

    return {
      monthlyMean: mean,
      monthlyVol: vol,
      dataRangeConfig: `${firstYear}–${lastYear}`,
      fromLiveFetch: true,
    };
  } catch {
    return FALLBACK_ASSUMPTIONS;
  }
}
