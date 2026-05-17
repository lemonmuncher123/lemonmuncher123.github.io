import { useEffect, useMemo, useState } from 'react';
import type { OptimisticResult } from '../lib/optimisticCalculator';
import {
  STATES,
  type FilingStatus,
  type StateId,
} from '../lib/stateTax';
import {
  capContributions,
  runTaxModel,
  applyPerPathTax,
} from '../lib/taxModel';
import { FEDERAL_EMPLOYER_EXCLUSION_CAP } from '../lib/constants';
import { ASSUMED_ANNUAL_INFLATION, toTodaysDollars } from '../lib/inflation';

const PARENT_FED_RATES = [0.10, 0.12, 0.22, 0.24, 0.32, 0.37] as const;
const CHILD_FED_RATES = [0.10, 0.12] as const;

const formatCurrency = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const formatPct = (n: number, frac = 0) => {
  let s = (n * 100).toFixed(frac);
  // Strip trailing zeros only AFTER a decimal point — e.g. "2.50" → "2.5",
  // "3.00" → "3". Whole-number strings like "10" or "100" must not be
  // trimmed (the previous version stripped "10" → "1").
  if (s.includes('.')) {
    s = s.replace(/0+$/, '').replace(/\.$/, '');
  }
  return s + '%';
};

export interface TaxAnalysisProps {
  optimistic: OptimisticResult;
  birthYear: number;
  monthlyContribution: number;
  locale: 'en' | 'es';
  includeTax: boolean;
  onIncludeTaxChange(next: boolean): void;
  /**
   * Emitted whenever the after-tax median changes. The parent uses this to
   * caption the ResultCard. `null` means "tax analysis is off — drop caption".
   */
  onAfterTaxChange?(afterTaxMedian: number | null): void;
}

/**
 * Optional tax analysis section. Collapsed by default — single thin row with a
 * checkbox. Expanded view shows inputs (state, filing status, income, rates,
 * employer contribution, kiddie-tax toggle) and outputs (after-tax Monte Carlo
 * percentiles + deterministic comparison against a taxable brokerage baseline).
 */
export function TaxAnalysis({
  optimistic,
  birthYear: _birthYear,
  monthlyContribution,
  locale,
  includeTax,
  onIncludeTaxChange,
  onAfterTaxChange,
}: TaxAnalysisProps) {
  const t = STRINGS[locale];

  const [stateId, setStateId] = useState<StateId>('CA');
  const [filingStatus, setFilingStatus] = useState<FilingStatus>('mfj');
  const [baseIncome, setBaseIncome] = useState<number>(75_000);
  const [parentFedRate, setParentFedRate] = useState<number>(0.12);
  const [childFedRate, setChildFedRate] = useState<number>(0.10);
  const [employerC, setEmployerC] = useState<number>(0);
  const [kiddieTaxOn, setKiddieTaxOn] = useState<boolean>(true);

  const state = STATES[stateId];

  // The individual (otherC) contribution comes from the calculator's monthly
  // slider, converted to annual. The TaxAnalysis section adds an optional
  // employer slice on top, then caps via §6.
  const rawAnnual = Math.max(0, monthlyContribution) * 12;
  // Employer is bounded by two ceilings: the §128 federal exclusion cap and the
  // user's own annual contribution. The "≤ your annual contribution" rule
  // prevents the prior surprise where capContributions silently shrank the
  // user's individual contribution because employer took the §530A headroom.
  const effectiveEmployerCap = Math.min(FEDERAL_EMPLOYER_EXCLUSION_CAP, rawAnnual);
  // If the user reduces their Step 2 contribution after typing an employer
  // amount, clamp the employer state back down so the displayed value never
  // exceeds the new ceiling.
  useEffect(() => {
    if (employerC > effectiveEmployerCap) {
      setEmployerC(effectiveEmployerCap);
    }
  }, [employerC, effectiveEmployerCap]);
  const caps = useMemo(() => capContributions(employerC, rawAnnual), [employerC, rawAnnual]);
  const { employerC: cappedEmployer, otherC } = caps;
  const totalC = cappedEmployer + otherC;
  const includeKiddie = kiddieTaxOn && !!state.hasStateKiddieTax;

  const afterTaxByPath = useMemo(() => {
    if (!includeTax) return null;
    const paths = optimistic.pathsByYear;
    if (!paths || paths.length === 0) return null;
    const out = new Float64Array(paths.length);
    for (let i = 0; i < paths.length; i++) {
      out[i] = applyPerPathTax({
        balanceByYear: paths[i],
        initialSeed: optimistic.seedAmount,
        employerC: cappedEmployer,
        otherC,
        filingStatus,
        state,
        baseStateIncome: baseIncome,
        childFutureFederalRate: childFedRate,
        includeAnnualStateKiddieTax: includeKiddie,
      });
    }
    out.sort();
    const pct = (p: number) => out[Math.min(out.length - 1, Math.floor(out.length * p))];
    return {
      median: pct(0.5),
      p25: pct(0.25),
      p75: pct(0.75),
      p10: pct(0.1),
    };
  }, [
    includeTax,
    optimistic.pathsByYear,
    optimistic.seedAmount,
    cappedEmployer,
    otherC,
    filingStatus,
    state,
    baseIncome,
    childFedRate,
    includeKiddie,
  ]);

  const deterministic = useMemo(() => {
    if (!includeTax || optimistic.yearsSimulated === 0) return null;
    return runTaxModel({
      years: optimistic.yearsSimulated,
      annualEmployerContribution: cappedEmployer,
      annualOtherContribution: otherC,
      // Use the post-fee effective monthly mean — same rate the Monte Carlo
      // paths compounded at. Otherwise the deterministic §530A-vs-brokerage
      // comparison would silently quote a higher gross-return scenario than
      // the per-path after-tax overlay is showing.
      monthlyReturnRate: optimistic.effectiveMonthlyMean,
      filingStatus,
      state,
      baseStateTaxableIncome: baseIncome,
      parentFederalMarginalRate: parentFedRate,
      childFutureFederalRate: childFedRate,
      initialSeed: optimistic.seedAmount,
      includeAnnualStateKiddieTax: includeKiddie,
      // Apples-to-apples: both accounts deposit the same after-tax cash
      // (the brokerage isn't penalized by ordinary income tax on the
      // contribution it never had to pay in real life).
      comparisonMode: 'sameAfterTaxCash',
    });
  }, [
    includeTax,
    optimistic.yearsSimulated,
    optimistic.effectiveMonthlyMean,
    optimistic.seedAmount,
    cappedEmployer,
    otherC,
    filingStatus,
    state,
    baseIncome,
    parentFedRate,
    childFedRate,
    includeKiddie,
  ]);

  // Today's-dollars deflation of the after-tax median. Presentation-only —
  // does NOT feed back into the tax math, the per-path overlay, or the
  // deterministic comparison.
  const afterTaxMedianTodaysDollars =
    afterTaxByPath != null
      ? toTodaysDollars(afterTaxByPath.median, optimistic.yearsSimulated)
      : null;

  // Bubble the after-tax median up to the parent so the ResultCard caption
  // can stay in sync with what's shown here.
  useEffect(() => {
    if (!onAfterTaxChange) return;
    onAfterTaxChange(afterTaxByPath ? afterTaxByPath.median : null);
  }, [afterTaxByPath, onAfterTaxChange]);

  const wealthDiff = deterministic?.wealthDifference ?? 0;

  // The wealth-difference headline and the federal/state "tax saved" cells do
  // NOT add up. They differ by (a) the compounded $1,000 pilot seed (not a
  // tax saving — free money) and (b) any state Layer 1 tax that's paid
  // out-of-pocket instead of from the account balance (CA only). Render a
  // small explainer line below the savings grid keyed on which of those two
  // gaps are actually present.
  const hasSeed = optimistic.seedAmount > 0;
  const hasLayer1 = !!state.nonconforming;
  const reconciliationKey =
    hasSeed && hasLayer1
      ? 'reconciliationSeedAndLayer1'
      : hasSeed
        ? 'reconciliationSeedOnly'
        : hasLayer1
          ? 'reconciliationLayer1Only'
          : null;

  return (
    <section
      className="rounded-2xl border-2 border-slate-200 bg-white"
      data-testid="tax-analysis"
    >
      <label className="flex min-h-touch cursor-pointer items-center gap-3 px-4 py-3">
        <input
          type="checkbox"
          checked={includeTax}
          onChange={(e) => onIncludeTaxChange(e.target.checked)}
          className="h-5 w-5 rounded border-slate-300 text-brand-green-dark focus:ring-brand-green"
          aria-describedby="tax-analysis-hint"
          data-testid="tax-toggle"
        />
        <span className="flex-1">
          <span className="text-sm font-semibold text-slate-900">{t.toggleLabel}</span>
          <span id="tax-analysis-hint" className="block text-xs text-slate-500">
            {t.toggleHint}
          </span>
        </span>
      </label>

      {includeTax && (
        <div className="space-y-3 border-t border-slate-200 px-4 py-3">
          {/* Row 1: State (with short hint) + Filing status — side by side */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                {t.state}
              </span>
              <select
                value={stateId}
                onChange={(e) => setStateId(e.target.value as StateId)}
                className="mt-1 block w-full rounded-xl border-2 border-slate-200 bg-white px-2 text-sm font-semibold text-slate-900 min-h-touch focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green/30"
                data-testid="tax-state"
              >
                <option value="CA">{t.stateOption.CA}</option>
                <option value="NO_TAX">{t.stateOption.NO_TAX}</option>
              </select>
            </label>
            <div>
              <span className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                {t.filingStatus}
              </span>
              <div
                role="radiogroup"
                aria-label={t.filingStatus}
                className="mt-1 grid grid-cols-3 gap-0.5 rounded-xl bg-slate-100 p-0.5"
              >
                {(['single', 'mfj', 'hoh'] as FilingStatus[]).map((s) => {
                  const active = filingStatus === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setFilingStatus(s)}
                      className={`min-h-touch rounded-lg px-1 text-xs font-semibold transition ${
                        active
                          ? 'bg-white text-brand-green-dark shadow'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {t.filingShort[s]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Row 2: Income + Employer */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                {t.baseIncome}
              </span>
              <div className="mt-1 flex items-center rounded-xl border-2 border-slate-200 bg-white focus-within:border-brand-green focus-within:ring-2 focus-within:ring-brand-green/30 min-h-touch">
                <span className="px-2 text-sm font-semibold text-slate-500">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={1_000}
                  value={baseIncome === 0 ? '' : baseIncome}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') {
                      setBaseIncome(0);
                      return;
                    }
                    const n = Number(raw);
                    if (Number.isNaN(n) || n < 0) return;
                    setBaseIncome(n);
                  }}
                  placeholder="0"
                  aria-label={t.baseIncomeAriaLabel}
                  data-testid="tax-base-income"
                  className="w-full bg-transparent pr-2 text-sm font-semibold text-slate-900 focus:outline-none"
                />
              </div>
            </label>
            <label className="block">
              <span className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                {t.employerContrib}
              </span>
              <div className="mt-1 flex items-center rounded-xl border-2 border-slate-200 bg-white focus-within:border-brand-green focus-within:ring-2 focus-within:ring-brand-green/30 min-h-touch">
                <span className="px-2 text-sm font-semibold text-slate-500">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={effectiveEmployerCap}
                  step={100}
                  value={employerC === 0 ? '' : employerC}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') {
                      setEmployerC(0);
                      return;
                    }
                    const n = Number(raw);
                    if (Number.isNaN(n) || n < 0) return;
                    setEmployerC(Math.min(n, effectiveEmployerCap));
                  }}
                  placeholder="0"
                  aria-label={t.employerContribAriaLabel}
                  data-testid="tax-employer-c"
                  className="w-full bg-transparent pr-2 text-sm font-semibold text-slate-900 focus:outline-none"
                />
              </div>
            </label>
          </div>

          {/* Row 3: Parent federal rate — full width, 6 chips */}
          <div>
            <span className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">
              {t.parentFedRate}
            </span>
            <div className="mt-1 grid grid-cols-6 gap-1">
              {PARENT_FED_RATES.map((r) => {
                const active = Math.abs(r - parentFedRate) < 1e-9;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setParentFedRate(r)}
                    aria-pressed={active}
                    className={`min-h-touch rounded-lg border px-1 text-xs font-semibold transition ${
                      active
                        ? 'border-brand-green bg-brand-green text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {formatPct(r)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 4: Child future rate (+ Kiddie toggle, CA only) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                {t.childFedRate}
              </span>
              <div className="mt-1 grid grid-cols-2 gap-1">
                {CHILD_FED_RATES.map((r) => {
                  const active = Math.abs(r - childFedRate) < 1e-9;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setChildFedRate(r)}
                      aria-pressed={active}
                      className={`min-h-touch rounded-lg border px-1 text-xs font-semibold transition ${
                        active
                          ? 'border-brand-green bg-brand-green text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {formatPct(r)}
                    </button>
                  );
                })}
              </div>
            </div>
            {state.hasStateKiddieTax && (
              <label className="flex min-h-touch cursor-pointer items-center gap-2 self-end rounded-xl border border-slate-200 px-2">
                <input
                  type="checkbox"
                  checked={kiddieTaxOn}
                  onChange={(e) => setKiddieTaxOn(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-green-dark focus:ring-brand-green"
                  data-testid="kiddie-toggle"
                />
                <span className="text-[11px] leading-tight text-slate-700">{t.kiddieToggleShort}</span>
              </label>
            )}
          </div>

          {/* After-tax overlay — compact */}
          {afterTaxByPath && (
            <div className="rounded-xl bg-slate-50 p-3" data-testid="after-tax-block">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  {t.afterTaxLabel}
                </span>
                {afterTaxMedianTodaysDollars != null && (
                  <span
                    className="text-[11px] text-slate-500 tabular-nums"
                    data-testid="after-tax-todays-dollars"
                  >
                    {t.todaysDollarsLabel(afterTaxMedianTodaysDollars, ASSUMED_ANNUAL_INFLATION)}
                  </span>
                )}
              </div>
              <div
                className="mt-0.5 text-2xl font-black tabular-nums text-slate-900"
                data-testid="after-tax-median"
              >
                {formatCurrency(afterTaxByPath.median)}
              </div>
              <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
                {t.p10} {formatCurrency(afterTaxByPath.p10)}
                {' · '}
                {t.p25} {formatCurrency(afterTaxByPath.p25)}
                {' · '}
                {t.p75} {formatCurrency(afterTaxByPath.p75)}
              </div>
            </div>
          )}

          {/* Comparison vs brokerage — compact */}
          {deterministic && (
            <div className="rounded-xl border-2 border-slate-200 p-3" data-testid="comparison-block">
              <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                {t.comparisonHeader}
              </div>
              <div className="mt-0.5 flex items-baseline gap-2 flex-wrap">
                <div
                  className={`text-2xl font-black tabular-nums ${
                    wealthDiff >= 0 ? 'text-brand-green-dark' : 'text-brand-accent'
                  }`}
                  data-testid="wealth-diff"
                >
                  {wealthDiff >= 0 ? '+' : '−'} {formatCurrency(Math.abs(wealthDiff))}
                </div>
                <p className="text-sm text-slate-700">
                  {wealthDiff >= 0 ? t.wealthDiffPositive : t.wealthDiffNegative}
                </p>
              </div>
              <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
                {t.federalSavings} {formatCurrency(deterministic.federalTaxSavings)}
                {' · '}
                {t.stateSavings} {formatCurrency(deterministic.stateTaxSavings)}
              </div>
            </div>
          )}

          {/* Learn more — collapsible FAQ with all the long-form explainers */}
          <details className="group rounded-xl border border-slate-200 px-3 py-2">
            <summary className="cursor-pointer list-none text-xs font-semibold text-slate-700 marker:hidden">
              <span className="inline-block transition group-open:rotate-90" aria-hidden="true">›</span>{' '}
              {t.learnMore}
            </summary>
            <div className="mt-2 space-y-3 text-[11px] leading-relaxed text-slate-600" data-testid="tax-faq">
              {reconciliationKey && (
                <div>
                  <div className="font-semibold text-slate-700">{t.faqReconciliationTitle}</div>
                  <p data-testid="reconciliation-note">{t[reconciliationKey]}</p>
                </div>
              )}
              <div>
                <div className="font-semibold text-slate-700">{t.faqComparisonTitle}</div>
                <p data-testid="comparison-note">{t.comparisonNote}</p>
              </div>
              <div>
                <div className="font-semibold text-slate-700">{t.faqStatesTitle}</div>
                <p>{stateId === 'NO_TAX' ? t.noTaxHint : t.caHint}</p>
              </div>
              <div>
                <div className="font-semibold text-slate-700">{t.faqEmployerTitle}</div>
                <p>{t.employerHint(FEDERAL_EMPLOYER_EXCLUSION_CAP)}</p>
              </div>
              {state.hasStateKiddieTax && (
                <div>
                  <div className="font-semibold text-slate-700">{t.faqKiddieTitle}</div>
                  <p>{t.kiddieToggle}</p>
                </div>
              )}
              <p className="text-slate-500">{t.disclaimer}</p>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}

const STRINGS = {
  en: {
    toggleLabel: 'Show tax analysis (advanced)',
    toggleHint: 'Compare to a regular brokerage account, after federal and state taxes.',
    state: 'State',
    stateOption: {
      CA: 'California',
      NO_TAX: 'Other state (federal tax only)',
    },
    noTaxHint:
      'No state tax modeled. Accurate for AK, FL, NV, NH, SD, TN, TX, WA, WY. Other states are an approximation — your real state tax is not included.',
    caHint:
      'California does not conform to §530A — annual contributions and earnings are state-taxable.',
    filingStatus: 'Filing status',
    filingLabel: { single: 'Single', mfj: 'Married Joint', hoh: 'Head of HH' } as Record<FilingStatus, string>,
    filingShort: { single: 'Single', mfj: 'MFJ', hoh: 'HoH' } as Record<FilingStatus, string>,
    baseIncome: 'Taxable income',
    baseIncomeAriaLabel: 'Your annual taxable income in U.S. dollars',
    parentFedRate: 'Your federal tax bracket',
    childFedRate: "Child's rate at 18",
    employerContrib: 'Employer/yr',
    employerContribAriaLabel: 'Annual employer contribution in U.S. dollars',
    employerHint: (cap: number) =>
      `Up to $${cap.toLocaleString('en-US')} of employer contributions is federally tax-free (§128), and never more than your own annual contribution.`,
    kiddieToggle: 'Apply California kiddie tax on annual gains. Recommended because CA does not conform to §530A — earnings are taxed annually at the kiddie-tax rate rather than deferred to distribution.',
    kiddieToggleShort: 'Apply CA kiddie tax',
    afterTaxLabel: 'After-tax at 18',
    todaysDollarsLabel: (amount: number, rate: number) =>
      `≈ ${formatCurrency(amount)} today (assumes ${formatPct(rate, 1)} inflation)`,
    p10: 'Worst 10%',
    p25: 'Lower (25th)',
    p75: 'Better (75th)',
    comparisonHeader: 'vs. investing the same after-tax cash in a regular brokerage',
    comparisonNote:
      'Both accounts deposit the same amount each year. The comparison only counts taxes from the account itself (annual gains, distribution), not ordinary income tax on the cash you contribute.',
    reconciliationSeedAndLayer1:
      "Why the wealth gap is bigger than the tax saved: it also reflects the $1,000 pilot seed's compounded growth, plus California's Layer 1 nonconformity tax, which you pay out-of-pocket rather than from the account.",
    reconciliationSeedOnly:
      "Why the wealth gap doesn't equal the tax saved: it also reflects the $1,000 pilot seed's compounded growth, which isn't a tax saving.",
    reconciliationLayer1Only:
      "Why the wealth gap doesn't equal the tax saved: California's Layer 1 nonconformity tax is paid out-of-pocket, not from the account.",
    wealthDiffPositive:
      'A Trump Account leaves your child more wealth after taxes.',
    wealthDiffNegative:
      'For your inputs, a regular brokerage would leave more after taxes.',
    federalSavings: 'Federal saved',
    stateSavings: 'State saved',
    disclaimer:
      'Deterministic estimate using the historical mean return — not investment or tax advice.',
    learnMore: 'Learn more about these numbers',
    faqReconciliationTitle: "Why doesn't the wealth gap equal the tax saved?",
    faqComparisonTitle: 'How is this comparison framed?',
    faqStatesTitle: 'Which states does this model?',
    faqEmployerTitle: 'Employer contribution rules',
    faqKiddieTitle: 'About the California kiddie tax',
  },
  es: {
    toggleLabel: 'Mostrar análisis de impuestos (avanzado)',
    toggleHint: 'Compare con una cuenta de corretaje regular, después de impuestos federales y estatales.',
    state: 'Estado',
    stateOption: {
      CA: 'California',
      NO_TAX: 'Otro estado (solo impuesto federal)',
    },
    noTaxHint:
      'Sin impuesto estatal modelado. Exacto para AK, FL, NV, NH, SD, TN, TX, WA, WY. Otros estados son una aproximación — su impuesto estatal real no está incluido.',
    caHint:
      'California no se ajusta al §530A — las aportaciones anuales y las ganancias están sujetas a impuestos estatales.',
    filingStatus: 'Estado civil',
    filingLabel: { single: 'Soltero/a', mfj: 'Casado/a', hoh: 'Jefe de hogar' } as Record<FilingStatus, string>,
    filingShort: { single: 'Soltero', mfj: 'Casado', hoh: 'JdH' } as Record<FilingStatus, string>,
    baseIncome: 'Ingreso imponible',
    baseIncomeAriaLabel: 'Su ingreso imponible anual en dólares',
    parentFedRate: 'Su tasa federal',
    childFedRate: 'Tasa a los 18',
    employerContrib: 'Empleador/año',
    employerContribAriaLabel: 'Aportación anual del empleador en dólares',
    employerHint: (cap: number) =>
      `Hasta $${cap.toLocaleString('en-US')} de aportación del empleador está libre de impuestos federales (§128), y nunca más que su propia aportación anual.`,
    kiddieToggle: 'Aplicar el impuesto kiddie de California anualmente. Recomendado porque CA no se ajusta al §530A — las ganancias se gravan anualmente a la tasa kiddie en lugar de diferirse hasta la distribución.',
    kiddieToggleShort: 'Aplicar impuesto kiddie de CA',
    afterTaxLabel: 'Después de impuestos a los 18',
    todaysDollarsLabel: (amount: number, rate: number) =>
      `≈ ${formatCurrency(amount)} hoy (asume ${formatPct(rate, 1)} de inflación)`,
    p10: 'Peor 10%',
    p25: 'Menor (25%)',
    p75: 'Mejor (75%)',
    comparisonHeader: 'vs. invertir el mismo efectivo después de impuestos en una cuenta de corretaje',
    comparisonNote:
      'Ambas cuentas depositan la misma cantidad cada año. La comparación solo cuenta impuestos generados por la cuenta (ganancias anuales, distribución), no el impuesto sobre la renta del dinero que aporta.',
    reconciliationSeedAndLayer1:
      'Por qué la diferencia de riqueza supera el impuesto ahorrado: también refleja el crecimiento compuesto de la aportación piloto de $1,000 y el impuesto de no conformidad Layer 1 de California, que usted paga de su bolsillo, no de la cuenta.',
    reconciliationSeedOnly:
      'Por qué la diferencia de riqueza no iguala al impuesto ahorrado: también refleja el crecimiento compuesto de la aportación piloto de $1,000, que no es un ahorro fiscal.',
    reconciliationLayer1Only:
      'Por qué la diferencia de riqueza no iguala al impuesto ahorrado: el impuesto de no conformidad Layer 1 de California se paga de su bolsillo, no de la cuenta.',
    wealthDiffPositive:
      'Una Trump Account le deja más a su hijo/a después de impuestos.',
    wealthDiffNegative:
      'Con sus datos, una cuenta de corretaje regular dejaría más después de impuestos.',
    federalSavings: 'Federal ahorrado',
    stateSavings: 'Estatal ahorrado',
    disclaimer:
      'Estimación determinista con el rendimiento histórico medio — no es asesoramiento de inversión ni fiscal.',
    learnMore: 'Más información sobre estos números',
    faqReconciliationTitle: '¿Por qué la diferencia de riqueza no es igual al impuesto ahorrado?',
    faqComparisonTitle: '¿Cómo se hace esta comparación?',
    faqStatesTitle: '¿Qué estados se modelan?',
    faqEmployerTitle: 'Reglas de aportación del empleador',
    faqKiddieTitle: 'Sobre el impuesto kiddie de California',
  },
} as const;
