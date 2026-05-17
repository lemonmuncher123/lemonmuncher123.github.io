// Maps a projected balance to a "life language" interpretation.
// Source: trump_account_prd.md §5.2 (amount → life-language table).

export type LifeLanguageTier = 'too-low' | 'first-year' | 'community-college' | 'state-university' | 'full-college-plus';

export interface LifeLanguage {
  tier: LifeLanguageTier;
  en: string;
  es: string;
}

const TIERS: ReadonlyArray<{ min: number; tier: LifeLanguageTier; en: string; es: string }> = [
  {
    min: 80_000,
    tier: 'full-college-plus',
    en: 'A full college education + a down payment on their first home',
    es: 'Una carrera universitaria completa + el enganche para su primera casa',
  },
  {
    min: 40_000,
    tier: 'state-university',
    en: '4 years at a state university',
    es: '4 años en una universidad estatal',
  },
  {
    min: 15_000,
    tier: 'community-college',
    en: '2 years at community college, fully paid',
    es: '2 años en un community college, totalmente pagados',
  },
  {
    min: 5_000,
    tier: 'first-year',
    en: 'A solid start to their first year of college',
    es: 'Un buen comienzo para su primer año de universidad',
  },
];

const FALLBACK = {
  tier: 'too-low' as const,
  en: 'A meaningful head start — every dollar grows for 18 years',
  es: 'Una ventaja significativa — cada dólar crece durante 18 años',
};

export function interpret(amount: number): LifeLanguage {
  for (const t of TIERS) {
    if (amount >= t.min) {
      return { tier: t.tier, en: t.en, es: t.es };
    }
  }
  return { tier: FALLBACK.tier, en: FALLBACK.en, es: FALLBACK.es };
}
