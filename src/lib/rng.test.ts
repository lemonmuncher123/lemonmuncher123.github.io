import { describe, it, expect } from 'vitest';
import { createMulberry32, createNormalSampler } from './rng';

describe('createMulberry32', () => {
  it('returns numbers in [0, 1)', () => {
    const rng = createMulberry32(42);
    for (let i = 0; i < 5000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('same seed produces an identical sequence', () => {
    const a = createMulberry32(0xdeadbeef);
    const b = createMulberry32(0xdeadbeef);
    for (let i = 0; i < 1000; i++) {
      expect(a()).toBe(b());
    }
  });

  it('different seeds produce different sequences', () => {
    const a = createMulberry32(1);
    const b = createMulberry32(2);
    const aSeq = Array.from({ length: 50 }, a);
    const bSeq = Array.from({ length: 50 }, b);
    expect(aSeq).not.toEqual(bSeq);
  });

  it('approximately uniform mean ≈ 0.5 over many draws', () => {
    const rng = createMulberry32(7);
    let sum = 0;
    const n = 100_000;
    for (let i = 0; i < n; i++) sum += rng();
    const mean = sum / n;
    expect(mean).toBeGreaterThan(0.49);
    expect(mean).toBeLessThan(0.51);
  });
});

describe('createNormalSampler', () => {
  it('is deterministic when paired with a seeded RNG', () => {
    const a = createNormalSampler(createMulberry32(123));
    const b = createNormalSampler(createMulberry32(123));
    for (let i = 0; i < 100; i++) {
      expect(a(0, 1)).toBe(b(0, 1));
    }
  });

  it('approximate N(0, 1) — mean ≈ 0, std ≈ 1 over many samples', () => {
    const sample = createNormalSampler(createMulberry32(99));
    const n = 50_000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const z = sample(0, 1);
      sum += z;
      sumSq += z * z;
    }
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    expect(Math.abs(mean)).toBeLessThan(0.02);
    expect(Math.abs(Math.sqrt(variance) - 1)).toBeLessThan(0.02);
  });

  it('with stdDev = 0 returns exactly the mean', () => {
    const sample = createNormalSampler(createMulberry32(1));
    for (let i = 0; i < 200; i++) {
      expect(sample(0.5, 0)).toBe(0.5);
      expect(sample(-3, 0)).toBe(-3);
    }
  });
});
