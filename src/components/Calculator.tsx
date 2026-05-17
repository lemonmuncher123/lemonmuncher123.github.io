import { useCallback, useMemo, useState } from 'react';
import { toDailyEquivalent, toMonthlyEquivalent, type Frequency } from '../lib/calculator';
import {
  projectOptimisticHistorical,
  DEFAULT_OPTIMISTIC_ASSUMPTIONS,
  HISTORICAL_DATA_RANGE,
  HISTORICAL_MONTHLY_MEAN,
  HISTORICAL_MONTHLY_VOL,
  type OptimisticResult,
} from '../lib/optimisticCalculator';
import { computeBirthYearEligibility } from '../lib/eligibility';
import { interpret } from '../lib/lifeLanguage';
import { ASSUMED_ANNUAL_INFLATION, toTodaysDollars } from '../lib/inflation';
import {
  BIRTH_YEAR_RANGE,
  DAYS_PER_YEAR,
  TRUMP_ACCOUNT_ANNUAL_CAP,
} from '../lib/constants';
import { Slider } from './Slider';
import { ResultCard } from './ResultCard';
import { TaxAnalysis } from './TaxAnalysis';
import type { CardData } from '../lib/cardRenderer';

/**
 * Initial RNG seed for the in-UI optimistic projection. The underlying
 * algorithm defaults to Math.random() (matching new/src/lib/calculator.ts
 * exactly) but v2's calculator is reactive — it recomputes on every input
 * change via useMemo — so we seed for stability. The user can click "Run new
 * simulation" to swap in a fresh seed and redraw the 1,000 market paths.
 * Tests/consumers that want unseeded behavior call `projectOptimisticHistorical`
 * directly without `seed`.
 */
export const UI_RNG_SEED = 0xc0ffee17;

/**
 * Pick a fresh 32-bit unsigned seed. Prefers `crypto.getRandomValues`, falls
 * back to `Math.random()` × 2³². Exported so tests can mock the source.
 */
export function generateNewSeed(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0];
  }
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

const formatCurrency = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const formatPct = (n: number, frac = 1) =>
  (n * 100).toFixed(frac).replace(/\.?0+$/, '') + '%';

const PRESETS: Record<Frequency, readonly number[]> = {
  day: [1, 3, 5, 10, 20],
  month: [30, 100, 150, 300, 600],
  year: [365, 1100, 1825, 3650, 5000],
};

const DEFAULTS: Record<Frequency, number> = {
  day: 5,
  month: 150,
  year: 1825,
};

function convertAmount(amount: number, from: Frequency, to: Frequency): number {
  if (from === to) return amount;
  const daily = toDailyEquivalent(amount, from);
  switch (to) {
    case 'day':
      return Math.round(daily * 100) / 100;
    case 'month':
      return Math.round((daily * 365) / 12);
    case 'year':
      return Math.round(daily * 365);
  }
}

/**
 * Slice of `OptimisticResult` the UI exposes. Future nominal dollars throughout —
 * `annualizedMean` is the post-fee annualized return that drove the sim, so the
 * UI doesn't have to redo the expense-ratio math.
 */
export interface DisplayModel {
  headlineMedian: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  annualizedMean: number;
  annualizedVol: number;
  monthlyMeanUsed: number;
  monthlyVolUsed: number;
  expenseRatioUsed: number;
  yearsSimulated: number;
  cappedAnnualContribution: number;
  wasCapped: boolean;
}

function toDisplayModel(r: OptimisticResult): DisplayModel {
  return {
    headlineMedian: r.medianSavings,
    p10: r.p10,
    p25: r.p25,
    p75: r.p75,
    p90: r.p90,
    annualizedMean: r.annualizedMean,
    annualizedVol: r.annualizedVol,
    monthlyMeanUsed: r.monthlyMeanUsed,
    monthlyVolUsed: r.monthlyVolUsed,
    expenseRatioUsed: r.expenseRatioUsed,
    yearsSimulated: r.yearsSimulated,
    cappedAnnualContribution: r.contributionDetails.cappedAnnual,
    wasCapped: r.contributionDetails.wasCapped,
  };
}

interface CalculatorProps {
  locale?: 'en' | 'es';
  /**
   * S&P 500 monthly mean from the build-time Yahoo fetch
   * (`src/lib/marketAssumptions.ts`). Falls back to `HISTORICAL_MONTHLY_MEAN`
   * (the Yahoo-derived 1985–2026 baseline) when omitted, e.g. in component
   * tests that mount `<Calculator>` directly.
   */
  monthlyMean?: number;
  /** S&P 500 monthly stdev from the same source. */
  monthlyVol?: number;
  /** Human-readable data-range label for the audit row (e.g. "1985–2026"). */
  dataRangeConfig?: string;
}

export function Calculator({
  locale = 'en',
  monthlyMean = HISTORICAL_MONTHLY_MEAN,
  monthlyVol = HISTORICAL_MONTHLY_VOL,
  dataRangeConfig = HISTORICAL_DATA_RANGE,
}: CalculatorProps) {
  const [birthYear, setBirthYear] = useState<number | null>(null);
  const [frequency, setFrequency] = useState<Frequency>('day');
  const [amount, setAmount] = useState<number>(DEFAULTS.day);
  // Active RNG seed for the simulation. Initialized to UI_RNG_SEED so the
  // first render (and all subsequent input-driven recomputes) is deterministic;
  // updated only when the user clicks "Run new simulation".
  const [simulationSeed, setSimulationSeed] = useState<number>(UI_RNG_SEED);
  // Optional tax analysis section (default OFF). When ON, the simulation
  // retains per-path year-by-year balances so the kiddie-tax overlay can run.
  const [includeTax, setIncludeTax] = useState<boolean>(false);
  const [afterTaxMedian, setAfterTaxMedian] = useState<number | null>(null);

  const t = STRINGS[locale];

  const eligibility = useMemo(
    () => (birthYear == null ? null : computeBirthYearEligibility(birthYear)),
    [birthYear],
  );

  const monthlyEquivalent = useMemo(
    () => toMonthlyEquivalent(amount, frequency),
    [amount, frequency],
  );

  const optimistic = useMemo<OptimisticResult | null>(() => {
    if (birthYear == null) return null;
    return projectOptimisticHistorical({
      birthYear,
      monthlyContribution: monthlyEquivalent,
      seed: simulationSeed,
      retainPaths: includeTax,
      assumptions: { monthlyMean, monthlyVol },
    });
  }, [birthYear, monthlyEquivalent, simulationSeed, includeTax, monthlyMean, monthlyVol]);

  const display = useMemo<DisplayModel | null>(
    () => (optimistic ? toDisplayModel(optimistic) : null),
    [optimistic],
  );

  // Life-language tiers are written in today's-purchasing-power terms. The
  // optimistic headline is future nominal dollars at age 18, so for the
  // life-language sentence we lightly deflate by an assumed CPI to pick a
  // tier that matches present college costs. This is presentation-only and
  // does NOT change the headline number.
  const lifeLang = useMemo(() => {
    if (!display) return null;
    const presentValue = toTodaysDollars(display.headlineMedian, display.yearsSimulated);
    return interpret(presentValue);
  }, [display]);

  // Today's-dollars subtitle for the gross headline. Same deflator as
  // lifeLang above so both stay in sync.
  const headlineTodaysDollars = useMemo(
    () => (display ? toTodaysDollars(display.headlineMedian, display.yearsSimulated) : null),
    [display],
  );

  // Per-frequency ceiling for the custom-amount input. Matches the federal
  // $5,000/yr §530A cap, expressed in the current frequency. Floor-rounded to
  // two decimals so the input always displays a clean number (13.69, 416.66,
  // 5000) and the implied annual stays ≤ the cap. The cap warning below
  // doesn't fire for typed-in values because the input can never produce one
  // that exceeds the cap.
  const maxAmountForFrequency = useMemo(() => {
    if (frequency === 'year') return TRUMP_ACCOUNT_ANNUAL_CAP;
    if (frequency === 'month') {
      return Math.floor((TRUMP_ACCOUNT_ANNUAL_CAP / 12) * 100) / 100;
    }
    return Math.floor((TRUMP_ACCOUNT_ANNUAL_CAP / DAYS_PER_YEAR) * 100) / 100;
  }, [frequency]);

  const handleFrequencyChange = (next: Frequency) => {
    if (next === frequency) return;
    setAmount(convertAmount(amount, frequency, next));
    setFrequency(next);
  };

  const handleCustomChange = (raw: string) => {
    if (raw === '') {
      setAmount(0);
      return;
    }
    const n = Number(raw);
    if (Number.isNaN(n) || n < 0) return;
    // Clamp to the federal $5,000/yr cap expressed in the current frequency
    // so typing $30/day or $1,000/month immediately snaps to the legal max
    // (13.69 and 416.66 respectively).
    setAmount(Math.min(n, maxAmountForFrequency));
  };

  const handleRerun = () => {
    let next = generateNewSeed();
    // Avoid the no-op case where the freshly-generated seed equals the active
    // one — extremely unlikely but cheap to guard.
    if (next === simulationSeed) next = (next + 1) >>> 0;
    setSimulationSeed(next);
  };

  const handleAfterTaxChange = useCallback((next: number | null) => {
    setAfterTaxMedian(next);
  }, []);

  const years = Array.from(
    { length: BIRTH_YEAR_RANGE.max - BIRTH_YEAR_RANGE.min + 1 },
    (_, i) => BIRTH_YEAR_RANGE.max - i,
  );

  const unitSuffix = t.unitSuffix[frequency];
  const presets = PRESETS[frequency];

  return (
    <section className="mx-auto w-full max-w-xl space-y-8 px-4 py-6">
      {/* Step 1: Birth year */}
      <div className="space-y-3">
        <label className="block">
          <span className="block text-sm font-medium uppercase tracking-wide text-slate-500">
            {t.step1Label}
          </span>
          <span className="mt-1 block text-xl font-bold text-slate-900">{t.step1Question}</span>
        </label>
        <select
          aria-label={t.step1Question}
          value={birthYear ?? ''}
          onChange={(e) => setBirthYear(e.target.value === '' ? null : Number(e.target.value))}
          className="block w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-4 text-lg font-semibold text-slate-900 focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green/30 min-h-touch"
        >
          <option value="">{t.selectYear}</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>

        {eligibility && (
          <div
            role="status"
            aria-live="polite"
            className={`mt-3 rounded-xl border-2 p-4 ${
              eligibility.pilotSeedEligible
                ? 'border-brand-green bg-green-50'
                : eligibility.eligibleForNewContributions
                  ? 'border-amber-300 bg-amber-50'
                  : 'border-slate-300 bg-slate-50'
            }`}
          >
            {eligibility.pilotSeedEligible ? (
              <>
                <div className="text-xl font-bold text-brand-green-dark">
                  ✓ {t.eligibleHeader}
                </div>
                <div className="mt-1 text-sm text-slate-700">{t.noIncomeLimit}</div>
              </>
            ) : eligibility.eligibleForNewContributions ? (
              <>
                <div className="text-lg font-bold text-amber-700">{t.partialEligibleHeader}</div>
                <div className="mt-1 text-sm text-slate-700">{t.partialEligibleDetail}</div>
              </>
            ) : (
              <>
                <div className="text-lg font-bold text-slate-700">{t.ineligibleHeader}</div>
                <div className="mt-1 text-sm text-slate-600">{t.ineligibleDetail}</div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Step 2: Contribution amount (frequency + presets + custom) */}
      {eligibility && eligibility.eligibleForNewContributions && (
        <div className="space-y-3">
          <label className="block">
            <span className="block text-sm font-medium uppercase tracking-wide text-slate-500">
              {t.step2Label}
            </span>
            <span className="block text-xl font-bold text-slate-900">{t.step2Question}</span>
          </label>

          <div
            role="radiogroup"
            aria-label={t.frequencyAriaLabel}
            className="grid grid-cols-3 gap-0.5 rounded-xl bg-slate-100 p-0.5"
          >
            {(['day', 'month', 'year'] as Frequency[]).map((f) => {
              const active = f === frequency;
              return (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => handleFrequencyChange(f)}
                  className={`flex min-h-touch items-center justify-center rounded-lg px-3 text-sm font-semibold transition ${
                    active
                      ? 'bg-white text-brand-green-dark shadow'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t.frequencyLabel[f]}
                </button>
              );
            })}
          </div>

          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">
              {t.presetsLabel}
            </div>
            <Slider
              value={amount}
              onChange={setAmount}
              presets={presets}
              unitSuffix={unitSuffix}
              ariaLabel={t.step2Question}
            />
          </div>

          <div>
            <label className="block">
              <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                {t.customLabel}
              </span>
              <div className="mt-1 flex items-center rounded-xl border-2 border-slate-200 bg-white focus-within:border-brand-green focus-within:ring-2 focus-within:ring-brand-green/30 min-h-touch">
                <span className="pl-3 pr-1 text-base font-semibold text-slate-500">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={maxAmountForFrequency}
                  step={frequency === 'day' ? 0.5 : frequency === 'month' ? 5 : 50}
                  value={amount === 0 ? '' : amount}
                  onChange={(e) => handleCustomChange(e.target.value)}
                  aria-label={t.customAriaLabel(frequency)}
                  placeholder="0"
                  className="w-full bg-transparent text-base font-semibold text-slate-900 focus:outline-none"
                />
                <span className="px-3 text-xs font-medium text-slate-500">{unitSuffix}</span>
              </div>
            </label>
            <p className="mt-1 text-[11px] text-slate-500">
              {t.annualEquivalent(amount, frequency)}
            </p>
          </div>

          {display && display.wasCapped && (
            <p className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
              {t.cappedNote}
            </p>
          )}
        </div>
      )}

      {/* Step 3: Result */}
      {display && eligibility && eligibility.eligibleForNewContributions && lifeLang && (
        <>
          <div
            aria-live="polite"
            data-testid="result-block"
            data-active-seed={String(simulationSeed)}
            className="rounded-2xl bg-gradient-to-br from-brand-green to-brand-green-dark p-6 text-white shadow-xl"
          >
            <div className="text-sm uppercase tracking-wide opacity-90">{t.step3Label}</div>
            <div
              className="mt-2 text-5xl font-black tabular-nums"
              data-testid="headline-amount"
            >
              {formatCurrency(display.headlineMedian)}
            </div>
            {headlineTodaysDollars != null && (
              <div
                className="mt-1 text-xs opacity-80"
                data-testid="headline-todays-dollars"
              >
                {t.todaysDollarsLabel(headlineTodaysDollars, ASSUMED_ANNUAL_INFLATION)}
              </div>
            )}
            <div className="mt-2 text-sm opacity-90">
              {t.headlineSubtitle(display.yearsSimulated, dataRangeConfig)}
            </div>
            <div className="mt-4 rounded-xl bg-white/15 p-4 text-lg font-semibold">
              {lifeLang[locale]}
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-white/10 px-2.5 py-1.5">
                <dt className="opacity-80">{t.p25Label}</dt>
                <dd
                  className="text-sm font-bold tabular-nums"
                  data-testid="p25-amount"
                >
                  {formatCurrency(display.p25)}
                </dd>
              </div>
              <div className="rounded-lg bg-white/10 px-2.5 py-1.5">
                <dt className="opacity-80">{t.p75Label}</dt>
                <dd
                  className="text-sm font-bold tabular-nums"
                  data-testid="p75-amount"
                >
                  {formatCurrency(display.p75)}
                </dd>
              </div>
              <div className="rounded-lg bg-white/10 px-2.5 py-1.5">
                <dt className="opacity-80">{t.p10Label}</dt>
                <dd
                  className="text-sm font-bold tabular-nums"
                  data-testid="p10-amount"
                >
                  {formatCurrency(display.p10)}
                </dd>
              </div>
              <div className="rounded-lg bg-white/10 px-2.5 py-1.5">
                <dt className="opacity-80">{t.contribLabel}</dt>
                <dd className="text-sm font-bold tabular-nums">
                  {formatCurrency(display.cappedAnnualContribution)}
                  <span className="ml-1 text-[10px] font-normal opacity-80">/yr</span>
                </dd>
              </div>
            </dl>

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/20 pt-3">
              <div className="text-[11px] leading-tight opacity-80" data-testid="assumptions-line">
                {t.assumptions(display.annualizedMean, display.annualizedVol, display.expenseRatioUsed, dataRangeConfig)}
              </div>
              <button
                type="button"
                onClick={handleRerun}
                aria-label={t.rerunAriaLabel}
                title={t.rerunNote}
                data-testid="rerun-button"
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-white/15 px-3 text-xs font-semibold text-white min-h-touch hover:bg-white/25 focus:outline-none focus:ring-2 focus:ring-white/40"
              >
                <span aria-hidden="true">↻</span>
                {t.rerunButton}
              </button>
            </div>
          </div>

          {optimistic && (
            <TaxAnalysis
              optimistic={optimistic}
              birthYear={birthYear!}
              monthlyContribution={monthlyEquivalent}
              locale={locale}
              includeTax={includeTax}
              onIncludeTaxChange={setIncludeTax}
              onAfterTaxChange={handleAfterTaxChange}
            />
          )}

          <ResultCard
            data={{
              birthYear: birthYear!,
              dailyAmount: Math.round(toDailyEquivalent(amount, frequency) * 100) / 100,
              finalBalance: display.headlineMedian,
              years: display.yearsSimulated,
              lifeLanguage: lifeLang[locale],
              locale,
              afterTaxBalance: includeTax && afterTaxMedian != null ? afterTaxMedian : undefined,
            } as CardData}
          />
        </>
      )}
    </section>
  );
}

const STRINGS = {
  en: {
    step1Label: 'Step 1',
    step1Question: "What's your child's birth year?",
    selectYear: 'Select year…',
    eligibleHeader: 'Your child qualifies for the free $1,000',
    noIncomeLimit: 'No income limit. The government adds $1,000 when the account opens.',
    partialEligibleHeader: 'No free $1,000, but your child can still open an account.',
    partialEligibleDetail:
      'The pilot $1,000 is only for children born 2025–2028, but contributions are open to all kids under 18.',
    ineligibleHeader: 'This child is past the eligibility window.',
    ineligibleDetail:
      'The Trump Account is for children under 18 when the program launches in 2026.',
    step2Label: 'Step 2',
    step2Question: 'How much can you set aside?',
    frequencyAriaLabel: 'Contribution frequency',
    frequencyLabel: { day: 'Day', month: 'Month', year: 'Year' } as Record<Frequency, string>,
    unitSuffix: { day: '/day', month: '/mo', year: '/yr' } as Record<Frequency, string>,
    presetsLabel: 'Quick picks',
    customLabel: 'Or enter any amount',
    customAriaLabel: (f: Frequency) =>
      f === 'day' ? 'Custom amount per day' : f === 'month' ? 'Custom amount per month' : 'Custom amount per year',
    annualEquivalent: (amt: number, f: Frequency) => {
      const annual = f === 'day' ? amt * 365 : f === 'month' ? amt * 12 : amt;
      if (annual <= 0) return 'Enter any amount above zero.';
      const formatted = formatCurrency(Math.min(annual, 5000));
      return annual > 5000
        ? `That's ${formatCurrency(annual)} per year — capped at ${formatted} by the federal max.`
        : `That's ${formatted} per year.`;
    },
    cappedNote: 'Capped at the $5,000/year federal maximum.',
    step3Label: 'At age 18, your child could have',
    todaysDollarsLabel: (amount: number, rate: number) =>
      `≈ ${formatCurrency(amount)} in today's dollars (assumes ${formatPct(rate, 1)} inflation)`,
    headlineSubtitle: (yrs: number, dataRange: string) =>
      `Gross median across 1,000 simulated S&P 500 paths over ${yrs} years (${dataRange}).`,
    p10Label: 'Worst 10% · downside',
    p25Label: 'Lower outcome · 25th',
    p75Label: 'Better outcome · 75th',
    contribLabel: 'Your contribution',
    assumptions: (annMean: number, annVol: number, _expense: number, dataRange: string) =>
      `≈${formatPct(annMean)} return · ≈${formatPct(annVol)} vol · S&P 500 ${dataRange}`,
    rerunButton: 'New paths',
    rerunAriaLabel: 'Run a new Monte Carlo simulation with a fresh random seed',
    rerunNote:
      'The same 1,000 market paths are reused so you can compare different contributions side-by-side. Click ↻ to draw a fresh set.',
  },
  es: {
    step1Label: 'Paso 1',
    step1Question: '¿En qué año nació su hijo/a?',
    selectYear: 'Seleccione un año…',
    eligibleHeader: 'Su hijo/a califica para los $1,000 gratis',
    noIncomeLimit: 'Sin límite de ingresos. El gobierno deposita $1,000 al abrir la cuenta.',
    partialEligibleHeader: 'No hay $1,000 gratis, pero su hijo/a aún puede abrir una cuenta.',
    partialEligibleDetail:
      'El piloto de $1,000 es solo para niños nacidos entre 2025–2028, pero las aportaciones están abiertas para todos los menores de 18.',
    ineligibleHeader: 'Este/a niño/a ya superó la edad elegible.',
    ineligibleDetail:
      'La Trump Account es para niños menores de 18 cuando el programa empiece en 2026.',
    step2Label: 'Paso 2',
    step2Question: '¿Cuánto puede ahorrar?',
    frequencyAriaLabel: 'Frecuencia de aportación',
    frequencyLabel: { day: 'Día', month: 'Mes', year: 'Año' } as Record<Frequency, string>,
    unitSuffix: { day: '/día', month: '/mes', year: '/año' } as Record<Frequency, string>,
    presetsLabel: 'Opciones rápidas',
    customLabel: 'O ingrese cualquier cantidad',
    customAriaLabel: (f: Frequency) =>
      f === 'day' ? 'Cantidad personalizada por día' : f === 'month' ? 'Cantidad personalizada por mes' : 'Cantidad personalizada por año',
    annualEquivalent: (amt: number, f: Frequency) => {
      const annual = f === 'day' ? amt * 365 : f === 'month' ? amt * 12 : amt;
      if (annual <= 0) return 'Ingrese cualquier cantidad mayor a cero.';
      const formatted = formatCurrency(Math.min(annual, 5000));
      return annual > 5000
        ? `Eso es ${formatCurrency(annual)} al año — limitado a ${formatted} por el tope federal.`
        : `Eso es ${formatted} al año.`;
    },
    cappedNote: 'Limitado al máximo federal de $5,000 al año.',
    step3Label: 'A los 18 años, su hijo/a podría tener',
    todaysDollarsLabel: (amount: number, rate: number) =>
      `≈ ${formatCurrency(amount)} en dólares de hoy (asume ${formatPct(rate, 1)} de inflación)`,
    headlineSubtitle: (yrs: number, dataRange: string) =>
      `Mediana bruta de 1,000 simulaciones del S&P 500 durante ${yrs} años (${dataRange}).`,
    p10Label: 'Peor 10% · desfavorable',
    p25Label: 'Resultado bajo · 25%',
    p75Label: 'Resultado alto · 75%',
    contribLabel: 'Su aportación',
    assumptions: (annMean: number, annVol: number, _expense: number, dataRange: string) =>
      `≈${formatPct(annMean)} retorno · ≈${formatPct(annVol)} vol · S&P 500 ${dataRange}`,
    rerunButton: 'Nuevas rutas',
    rerunAriaLabel: 'Ejecutar una nueva simulación Monte Carlo con una semilla aleatoria nueva',
    rerunNote:
      'Las mismas 1,000 trayectorias de mercado se reutilizan para que pueda comparar diferentes aportaciones lado a lado. Pulse ↻ para generar un nuevo conjunto.',
  },
} as const;

// Re-export DEFAULT_OPTIMISTIC_ASSUMPTIONS in case downstream wants to read it.
export { DEFAULT_OPTIMISTIC_ASSUMPTIONS };
