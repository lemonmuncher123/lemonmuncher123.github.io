// Centralized i18n dictionary. Used by Astro pages and components that aren't
// already string-self-contained (Calculator + ResultCard carry their own copy).

export type Locale = 'en' | 'es';

export const DICT = {
  en: {
    brand: 'Trump Account Guide',
    nav: {
      how: 'How it works',
      about: 'About',
      counselors: 'For counselors',
    },
    home: {
      eyebrow: 'The free $1,000 for your baby',
      heroLine1: 'Does your child get the',
      heroAccent: 'free $1,000',
      heroLine2: '?',
      heroBody:
        'The government is putting $1,000 into a savings account for every U.S. baby born 2025–2028. No income limit. Find out in 30 seconds — no signup, no name, no SSN.',
      openCta: 'How to open the account →',
      openWhen: 'Accounts open July 4, 2026 at trumpaccounts.gov.',
    },
    how: {
      title: 'How it works',
      subtitle: 'Five questions every parent asks. Plain answers, no jargon.',
      ctaTitle: 'Ready to see your number?',
      ctaLink: 'Calculate in 30 seconds →',
    },
    counselors: {
      title: 'For community workers & counselors',
      body:
        'Most low-income families will only hear about the Trump Account from someone they trust — that is you. This one-page handout summarizes the program in plain language, includes a QR code to the official sign-up site, and is printable on A4 or Letter paper.',
      downloadEn: 'Download English handout (PDF)',
      downloadEs: 'Descargar versión en español (PDF)',
    },
    about: {
      title: 'About this site',
    },
    disclaimer:
      'This site is an independent educational resource, not affiliated with any government agency, financial institution, or the U.S. Treasury. Projections run a 1,000-path Monte Carlo over the historical S&P 500 monthly return distribution (≈10.5% annualized after a 0.10%/yr fund expense, 1985–2026); the headline is the median outcome. Actual returns can be substantially higher or lower, including losses. Numbers are illustrative only and are not investment, tax, or legal advice. Consult a qualified professional before making financial decisions.',
  },
  es: {
    brand: 'Guía Trump Account',
    nav: {
      how: 'Cómo funciona',
      about: 'Acerca de',
      counselors: 'Para consejeros',
    },
    home: {
      eyebrow: 'Los $1,000 gratis para su bebé',
      heroLine1: '¿Su hijo/a recibe los',
      heroAccent: '$1,000 gratis',
      heroLine2: '?',
      heroBody:
        'El gobierno depositará $1,000 en una cuenta de ahorros para cada bebé estadounidense nacido entre 2025–2028. Sin límite de ingresos. Compruébelo en 30 segundos — sin registro, sin nombre, sin SSN.',
      openCta: 'Cómo abrir la cuenta →',
      openWhen: 'Las cuentas abren el 4 de julio de 2026 en trumpaccounts.gov.',
    },
    how: {
      title: 'Cómo funciona',
      subtitle: 'Cinco preguntas que todo padre se hace. Respuestas claras, sin jerga.',
      ctaTitle: '¿Listo para ver su número?',
      ctaLink: 'Calcule en 30 segundos →',
    },
    counselors: {
      title: 'Para trabajadores comunitarios y consejeros',
      body:
        'La mayoría de las familias de bajos ingresos solo escuchará sobre la Trump Account de alguien en quien confíen — usted. Este folleto de una página resume el programa en lenguaje claro, incluye un código QR al sitio oficial de inscripción y se puede imprimir en papel A4 o Carta.',
      downloadEn: 'Download English handout (PDF)',
      downloadEs: 'Descargar versión en español (PDF)',
    },
    about: {
      title: 'Acerca de este sitio',
    },
    disclaimer:
      'Este sitio es un recurso educativo independiente, sin afiliación con ninguna agencia gubernamental, institución financiera ni con el Tesoro de EE. UU. Las proyecciones ejecutan una simulación Monte Carlo de 1,000 trayectorias sobre la distribución histórica de rendimientos mensuales del S&P 500 (≈10.5% anualizado después de un gasto del fondo de 0.10%/año, 1985–2026); la cifra mostrada es el resultado mediano. Los rendimientos reales pueden ser significativamente mayores o menores, incluyendo pérdidas. Las cifras son solo ilustrativas y no constituyen asesoramiento de inversión, fiscal ni legal. Consulte a un profesional cualificado antes de tomar decisiones financieras.',
  },
} as const;

export type DictShape = typeof DICT.en;

// Type-level assert: ensure the Spanish dictionary mirrors the English one.
const _esCheck: DictShape = DICT.es;
void _esCheck;

export function t(locale: Locale): DictShape {
  return DICT[locale];
}
