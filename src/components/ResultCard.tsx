import { useState, type FC } from 'react';
import {
  CARD_DIMENSIONS,
  type CardData,
  type CardFormat,
  createCardCanvas,
  renderCard,
} from '../lib/cardRenderer';
import { SITE_URL } from '../lib/constants';

interface ResultCardProps {
  data: CardData;
}

const formatMoney = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

const COPY = {
  en: {
    cardTitle: 'Share your result',
    cardDesc: 'Send your child\'s number to friends. The link lives at the bottom of the card.',
    square: 'Square (Feed)',
    wide: 'Wide (Story)',
    download: 'Download PNG',
    share: 'Share',
    copyLink: 'Copy link',
    copied: 'Copied!',
    born: 'Born',
    saving: 'Saving',
    perDay: '/day',
    atAge18: 'at age 18',
    growthAt: 'median · 1,000 S&P 500 paths',
    afterTaxCaption: (amount: string) => `(≈ ${amount} after taxes)`,
  },
  es: {
    cardTitle: 'Comparte tu resultado',
    cardDesc: 'Envía el número de tu hijo/a a tus amigos. El enlace aparece en la tarjeta.',
    square: 'Cuadrado (Feed)',
    wide: 'Ancho (Story)',
    download: 'Descargar PNG',
    share: 'Compartir',
    copyLink: 'Copiar enlace',
    copied: '¡Copiado!',
    born: 'Nacido en',
    saving: 'Ahorrando',
    perDay: '/día',
    atAge18: 'a los 18 años',
    growthAt: 'mediana · 1,000 simulaciones S&P 500',
    afterTaxCaption: (amount: string) => `(≈ ${amount} después de impuestos)`,
  },
} as const;

export const ResultCard: FC<ResultCardProps> = ({ data }) => {
  const [format, setFormat] = useState<CardFormat>('1:1');
  const [copied, setCopied] = useState(false);
  const t = COPY[data.locale];

  const handleDownload = async () => {
    const canvas = createCardCanvas(format);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderCard(ctx, data, format);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trump-account-${data.birthYear}-${format.replace(':', 'x')}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  };

  const handleShare = async () => {
    const text = data.locale === 'es'
      ? `Mi hijo/a podría tener ${formatMoney(data.finalBalance)} a los 18. Calcula el tuyo:`
      : `My child could have ${formatMoney(data.finalBalance)} at age 18. See yours:`;
    if (navigator.share) {
      try {
        await navigator.share({ text, url: window.location.href });
      } catch {
        /* user cancelled */
      }
    } else {
      handleCopy();
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  };

  const { width, height } = CARD_DIMENSIONS[format];
  const aspect = width / height;

  return (
    <div className="mt-4 rounded-2xl bg-white p-4 shadow-md ring-1 ring-slate-200">
      <div className="text-sm font-semibold text-slate-700">{t.cardTitle}</div>
      <p className="mt-1 text-xs text-slate-500">{t.cardDesc}</p>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setFormat('1:1')}
          className={`flex-1 rounded-lg border-2 px-2 py-2 text-sm font-semibold min-h-touch ${
            format === '1:1' ? 'border-brand-green-dark bg-brand-green-dark text-white' : 'border-slate-200 bg-white text-slate-700'
          }`}
        >
          {t.square}
        </button>
        <button
          type="button"
          onClick={() => setFormat('16:9')}
          className={`flex-1 rounded-lg border-2 px-2 py-2 text-sm font-semibold min-h-touch ${
            format === '16:9' ? 'border-brand-green-dark bg-brand-green-dark text-white' : 'border-slate-200 bg-white text-slate-700'
          }`}
        >
          {t.wide}
        </button>
      </div>

      {/* HTML preview (mirrors canvas output). The Square format is capped at
          380px so the content fills the visible area instead of stretching to
          the full column width and leaving a tall empty middle. The actual
          downloaded PNG is still drawn at the canonical canvas size from
          cardRenderer.ts (1080×1080 for Square, 1200×675 for Wide). */}
      <div
        aria-label="card preview"
        className="mt-3 mx-auto overflow-hidden rounded-xl shadow-inner ring-1 ring-slate-200"
        style={{
          aspectRatio: aspect,
          maxWidth: format === '1:1' ? '380px' : undefined,
          width: '100%',
        }}
      >
        <div
          className="flex h-full w-full flex-col bg-gradient-to-b from-brand-green to-brand-green-dark p-6 text-white"
          style={{ aspectRatio: aspect }}
        >
          <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
            <div>
              <div className="text-sm opacity-80">
                {data.locale === 'es' ? 'Mi hijo/a podría tener' : 'My child could have'}
              </div>
              <div className="mt-1 text-5xl font-black tabular-nums sm:text-6xl">
                {formatMoney(data.finalBalance)}
              </div>
              <div className="mt-1 text-xs opacity-80">{t.atAge18}</div>
              {typeof data.afterTaxBalance === 'number' && (
                <div className="mt-1 text-xs font-medium opacity-90">
                  {t.afterTaxCaption(formatMoney(data.afterTaxBalance))}
                </div>
              )}
            </div>
            <div className="px-2 text-base italic leading-snug text-amber-100">
              "{data.lifeLanguage}"
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="w-full text-center text-[10px] opacity-80">
              {t.born} {data.birthYear} · {t.saving} ${data.dailyAmount}{t.perDay} · {t.growthAt}
            </div>
            <div className="flex w-full items-end justify-between text-[10px] font-semibold opacity-90">
              <span>{data.locale === 'es' ? 'Calcula el tuyo →' : 'See yours →'}</span>
              <span>{SITE_URL}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={handleDownload}
          className="rounded-lg bg-brand-green-dark px-2 py-3 text-sm font-semibold text-white min-h-touch hover:bg-brand-green"
        >
          {t.download}
        </button>
        <button
          type="button"
          onClick={handleShare}
          className="rounded-lg border-2 border-brand-green-dark bg-white px-2 py-3 text-sm font-semibold text-brand-green-dark min-h-touch hover:bg-brand-green hover:text-white"
        >
          {t.share}
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-lg border-2 border-slate-200 bg-white px-2 py-3 text-sm font-semibold text-slate-700 min-h-touch hover:border-slate-300"
        >
          {copied ? t.copied : t.copyLink}
        </button>
      </div>
    </div>
  );
};
