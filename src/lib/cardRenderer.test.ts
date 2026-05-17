import { describe, it, expect, vi } from 'vitest';
import {
  CARD_DIMENSIONS,
  getCardElements,
  renderCard,
  createCardCanvas,
  type CardData,
  type CardFormat,
} from './cardRenderer';
import { SITE_URL } from './constants';

const SAMPLE: CardData = {
  birthYear: 2026,
  dailyAmount: 5,
  finalBalance: 65428,
  years: 18,
  lifeLanguage: '4 years at a state university',
  locale: 'en',
};

describe('CARD_DIMENSIONS', () => {
  it('16:9 is 1200x675 (true 16:9)', () => {
    expect(CARD_DIMENSIONS['16:9']).toEqual({ width: 1200, height: 675 });
  });
  it('1:1 is 1080x1080 (square)', () => {
    expect(CARD_DIMENSIONS['1:1']).toEqual({ width: 1080, height: 1080 });
  });
});

describe('getCardElements', () => {
  for (const format of ['16:9', '1:1'] as CardFormat[]) {
    describe(`format=${format}`, () => {
      const els = getCardElements(SAMPLE, format);

      it('includes the projected balance as $X formatted text', () => {
        const balanceEl = els.find((e) => e.text.includes('$65,428'));
        expect(balanceEl).toBeDefined();
      });

      it('includes the birth year', () => {
        const yearEl = els.find((e) => e.text.includes('2026'));
        expect(yearEl).toBeDefined();
      });

      it('includes the daily amount', () => {
        const dailyEl = els.find((e) => e.text.includes('$5'));
        expect(dailyEl).toBeDefined();
      });

      it('includes the life-language string', () => {
        const llEl = els.find((e) => e.text.includes('state university'));
        expect(llEl).toBeDefined();
      });

      it('includes the site URL', () => {
        const urlEl = els.find((e) => e.text === SITE_URL);
        expect(urlEl).toBeDefined();
      });

      it('all text positions are inside the canvas bounds', () => {
        const { width, height } = CARD_DIMENSIONS[format];
        for (const e of els) {
          expect(e.x).toBeGreaterThanOrEqual(0);
          expect(e.x).toBeLessThanOrEqual(width);
          expect(e.y).toBeGreaterThan(0);
          expect(e.y).toBeLessThanOrEqual(height);
        }
      });
    });
  }

  it('renders Spanish strings when locale=es', () => {
    const spanish = getCardElements({ ...SAMPLE, locale: 'es' }, '1:1');
    const headline = spanish.find((e) => e.text.includes('Mi hijo'));
    expect(headline).toBeDefined();
  });
});

describe('renderCard', () => {
  function makeFakeCtx() {
    const calls: { method: string; args: unknown[] }[] = [];
    const proxy = new Proxy<Record<string, unknown>>(
      {},
      {
        get(_, prop) {
          if (prop === 'createLinearGradient') {
            return () => ({ addColorStop: vi.fn() });
          }
          if (prop === 'measureText') {
            return () => ({ width: 100 });
          }
          if (typeof prop === 'symbol') return undefined;
          return (...args: unknown[]) => {
            calls.push({ method: String(prop), args });
          };
        },
        set(_, prop, value) {
          calls.push({ method: `set:${String(prop)}`, args: [value] });
          return true;
        },
      },
    );
    return { ctx: proxy as unknown as CanvasRenderingContext2D, calls };
  }

  it('calls fillRect for background and fillText for each element', () => {
    const { ctx, calls } = makeFakeCtx();
    renderCard(ctx, SAMPLE, '1:1');
    const fillRectCalls = calls.filter((c) => c.method === 'fillRect');
    const fillTextCalls = calls.filter((c) => c.method === 'fillText');
    expect(fillRectCalls.length).toBeGreaterThanOrEqual(1);
    expect(fillTextCalls.length).toBe(getCardElements(SAMPLE, '1:1').length);
  });

  it('every getCardElements text appears in a fillText call', () => {
    const { ctx, calls } = makeFakeCtx();
    renderCard(ctx, SAMPLE, '16:9');
    const drawnTexts = calls
      .filter((c) => c.method === 'fillText')
      .map((c) => c.args[0]);
    for (const el of getCardElements(SAMPLE, '16:9')) {
      expect(drawnTexts).toContain(el.text);
    }
  });
});

describe('createCardCanvas', () => {
  it('returns a canvas with the right dimensions', () => {
    for (const format of ['16:9', '1:1'] as CardFormat[]) {
      const c = createCardCanvas(format);
      expect(c.width).toBe(CARD_DIMENSIONS[format].width);
      expect(c.height).toBe(CARD_DIMENSIONS[format].height);
    }
  });
});

describe('afterTaxBalance caption', () => {
  const WITH_TAX: CardData = { ...SAMPLE, afterTaxBalance: 51234 };
  const ES_WITH_TAX: CardData = { ...WITH_TAX, locale: 'es' };

  for (const format of ['16:9', '1:1'] as CardFormat[]) {
    it(`${format}: caption is absent when afterTaxBalance is undefined`, () => {
      const els = getCardElements(SAMPLE, format);
      expect(els.find((e) => /after taxes/i.test(e.text))).toBeUndefined();
    });

    it(`${format}: EN caption appears with formatted amount`, () => {
      const els = getCardElements(WITH_TAX, format);
      const caption = els.find((e) => /after taxes/i.test(e.text));
      expect(caption).toBeDefined();
      expect(caption!.text).toContain('$51,234');
    });

    it(`${format}: ES caption uses "después de impuestos"`, () => {
      const els = getCardElements(ES_WITH_TAX, format);
      const caption = els.find((e) => /después de impuestos/i.test(e.text));
      expect(caption).toBeDefined();
    });
  }
});
