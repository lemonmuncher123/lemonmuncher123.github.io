import { describe, it, expect } from 'vitest';
import { DICT, t } from './i18n';

function flatten(obj: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'string') {
        out[key] = v;
      } else if (v && typeof v === 'object') {
        Object.assign(out, flatten(v, key));
      }
    }
  }
  return out;
}

describe('i18n dictionary', () => {
  it('English and Spanish dictionaries have identical key sets', () => {
    const enKeys = Object.keys(flatten(DICT.en)).sort();
    const esKeys = Object.keys(flatten(DICT.es)).sort();
    expect(esKeys).toEqual(enKeys);
  });

  it('every Spanish value is non-empty', () => {
    const es = flatten(DICT.es);
    for (const [k, v] of Object.entries(es)) {
      expect(v, `es.${k}`).toBeTruthy();
    }
  });

  it('substantive Spanish values differ from English', () => {
    // Allow identical values for single-character punctuation and PDF labels
    // that intentionally describe the linked file's language.
    const ALLOW_IDENTICAL = new Set([
      'counselors.downloadEn',
      'counselors.downloadEs',
    ]);
    const isPunctOnly = (s: string) => /^[\s\p{P}]+$/u.test(s);

    const en = flatten(DICT.en);
    const es = flatten(DICT.es);
    for (const k of Object.keys(en)) {
      if (ALLOW_IDENTICAL.has(k) || isPunctOnly(en[k])) continue;
      expect(es[k], `es.${k} should differ from en.${k}`).not.toBe(en[k]);
    }
  });

  it('t() returns the matching locale', () => {
    expect(t('en').brand).toBe('Trump Account Guide');
    expect(t('es').brand).toBe('Guía Trump Account');
  });
});
