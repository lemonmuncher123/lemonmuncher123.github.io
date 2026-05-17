import { SITE_URL } from './constants';

export type CardFormat = '16:9' | '1:1';

export interface CardData {
  birthYear: number;
  dailyAmount: number;
  finalBalance: number;
  years: number;
  lifeLanguage: string;
  locale: 'en' | 'es';
  /** After-tax median, shown as a smaller caption under the headline. */
  afterTaxBalance?: number;
}

export const CARD_DIMENSIONS: Record<CardFormat, { width: number; height: number }> = {
  '16:9': { width: 1200, height: 675 },
  '1:1': { width: 1080, height: 1080 },
};

const COLORS = {
  bgFrom: '#16a34a',
  bgTo: '#15803d',
  text: '#ffffff',
  textDim: 'rgba(255,255,255,0.78)',
  accent: '#fef3c7',
  badge: 'rgba(255,255,255,0.16)',
};

const STR = {
  en: {
    headline: 'My child could have',
    atAge18: (yrs: number) => `at age 18`,
    born: 'Born',
    saving: 'Saving',
    perDay: '/day',
    growthAt: 'median outcome · 1,000 S&P 500 paths',
    cta: 'See yours →',
    afterTaxCaption: (amount: string) => `(≈ ${amount} after taxes)`,
  },
  es: {
    headline: 'Mi hijo/a podría tener',
    atAge18: (yrs: number) => `a los 18 años`,
    born: 'Nacido en',
    saving: 'Ahorrando',
    perDay: '/día',
    growthAt: 'resultado mediano · 1,000 simulaciones S&P 500',
    cta: 'Calcula el tuyo →',
    afterTaxCaption: (amount: string) => `(≈ ${amount} después de impuestos)`,
  },
};

const formatMoney = (n: number) =>
  '$' + Math.round(n).toLocaleString('en-US');

export interface TextElement {
  text: string;
  x: number;
  y: number;
  font: string;
  color: string;
  align?: CanvasTextAlign;
}

export function getCardElements(data: CardData, format: CardFormat): TextElement[] {
  const { width, height } = CARD_DIMENSIONS[format];
  const t = STR[data.locale];
  const square = format === '1:1';
  const cx = width / 2;
  const padX = square ? 80 : 90;

  const balanceText = formatMoney(data.finalBalance);

  // Vertical layout — square has more vertical room; 16:9 is tighter
  const baseY = square ? 160 : 120;

  const elements: TextElement[] = [
    {
      text: t.headline,
      x: cx,
      y: baseY,
      font: `500 ${square ? 42 : 38}px system-ui, sans-serif`,
      color: COLORS.textDim,
      align: 'center',
    },
    {
      text: balanceText,
      x: cx,
      y: baseY + (square ? 180 : 140),
      font: `900 ${square ? 180 : 150}px system-ui, sans-serif`,
      color: COLORS.text,
      align: 'center',
    },
    {
      text: t.atAge18(data.years),
      x: cx,
      y: baseY + (square ? 250 : 200),
      font: `500 ${square ? 36 : 30}px system-ui, sans-serif`,
      color: COLORS.textDim,
      align: 'center',
    },
  ];

  if (typeof data.afterTaxBalance === 'number') {
    elements.push({
      text: t.afterTaxCaption(formatMoney(data.afterTaxBalance)),
      x: cx,
      y: baseY + (square ? 305 : 245),
      font: `500 ${square ? 28 : 24}px system-ui, sans-serif`,
      color: COLORS.textDim,
      align: 'center',
    });
  }

  elements.push(
    {
      text: data.lifeLanguage,
      x: cx,
      y: baseY + (square ? 420 : 320),
      font: `700 italic ${square ? 38 : 32}px system-ui, sans-serif`,
      color: COLORS.accent,
      align: 'center',
    },
    {
      text: `${t.born} ${data.birthYear}  ·  ${t.saving} $${data.dailyAmount}${t.perDay}`,
      x: cx,
      y: height - (square ? 220 : 150),
      font: `500 ${square ? 30 : 26}px system-ui, sans-serif`,
      color: COLORS.textDim,
      align: 'center',
    },
    {
      text: t.growthAt,
      x: cx,
      y: height - (square ? 170 : 110),
      font: `400 ${square ? 24 : 20}px system-ui, sans-serif`,
      color: COLORS.textDim,
      align: 'center',
    },
    {
      text: SITE_URL,
      x: width - padX,
      y: height - 40,
      font: `600 ${square ? 26 : 22}px system-ui, sans-serif`,
      color: COLORS.text,
      align: 'right',
    },
    {
      text: t.cta,
      x: padX,
      y: height - 40,
      font: `600 ${square ? 26 : 22}px system-ui, sans-serif`,
      color: COLORS.text,
      align: 'left',
    },
  );

  return elements;
}

export function renderCard(
  ctx: CanvasRenderingContext2D,
  data: CardData,
  format: CardFormat,
): void {
  const { width, height } = CARD_DIMENSIONS[format];

  // Background gradient (top to bottom).
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, COLORS.bgFrom);
  gradient.addColorStop(1, COLORS.bgTo);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Decorative top stripe
  ctx.fillStyle = COLORS.badge;
  ctx.fillRect(0, 0, width, 6);

  for (const el of getCardElements(data, format)) {
    ctx.font = el.font;
    ctx.fillStyle = el.color;
    ctx.textAlign = el.align ?? 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(el.text, el.x, el.y);
  }
}

export function createCardCanvas(format: CardFormat): HTMLCanvasElement {
  const { width, height } = CARD_DIMENSIONS[format];
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
