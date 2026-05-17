// Deterministic, seedable RNG utilities for Monte Carlo simulations that need
// reproducible test output. Pure JavaScript — no native deps.
//
//   const rng = createMulberry32(0xDEADBEEF);
//   const normal = createNormalSampler(rng);
//   normal(mean, stdDev) → IEEE-754 number sampled from N(mean, stdDev²)
//
// Mulberry32 is a small, fast PRNG with a 32-bit state and period ≈ 2³². For a
// typical run of 1,000 paths × 18 years × 12 months × 2 calls per Box-Muller
// (432,000 draws), it is well inside its period and has adequate statistical
// quality for non-cryptographic Monte Carlo.

export type Rng = () => number;
export type NormalSampler = (mean: number, stdDev: number) => number;

/** Create a Mulberry32 PRNG that returns numbers in [0, 1). */
export function createMulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Box-Muller normal sampler that consumes two values from the given RNG per call. */
export function createNormalSampler(rng: Rng): NormalSampler {
  return function normal(mean: number, stdDev: number): number {
    let u1 = rng();
    if (u1 === 0) u1 = Number.EPSILON; // guard log(0)
    const u2 = rng();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + stdDev * z;
  };
}
