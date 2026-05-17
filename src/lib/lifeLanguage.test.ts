import { describe, it, expect } from 'vitest';
import { interpret } from './lifeLanguage';

describe('interpret — life-language tier mapping (PRD §5.2)', () => {
  it('below $5,000 → too-low fallback', () => {
    expect(interpret(0).tier).toBe('too-low');
    expect(interpret(4_999).tier).toBe('too-low');
  });

  it('$5,000–$15,000 → first-year tier', () => {
    expect(interpret(5_000).tier).toBe('first-year');
    expect(interpret(10_000).tier).toBe('first-year');
    expect(interpret(14_999.99).tier).toBe('first-year');
    expect(interpret(5_000).en).toMatch(/first year of college/i);
  });

  it('$15,000–$40,000 → community-college tier', () => {
    expect(interpret(15_000).tier).toBe('community-college');
    expect(interpret(39_999).tier).toBe('community-college');
    expect(interpret(15_000).en).toMatch(/community college/i);
  });

  it('$40,000–$80,000 → state-university tier', () => {
    expect(interpret(40_000).tier).toBe('state-university');
    expect(interpret(79_999).tier).toBe('state-university');
    expect(interpret(40_000).en).toMatch(/state university/i);
  });

  it('$80,000+ → full-college-plus tier', () => {
    expect(interpret(80_000).tier).toBe('full-college-plus');
    expect(interpret(1_000_000).tier).toBe('full-college-plus');
    expect(interpret(80_000).en).toMatch(/down payment/i);
  });

  it('always returns both en and es strings', () => {
    for (const amt of [0, 5000, 15000, 40000, 80000]) {
      const r = interpret(amt);
      expect(r.en).toBeTruthy();
      expect(r.es).toBeTruthy();
      expect(r.en).not.toBe(r.es);
    }
  });
});
