import { describe, it, expect } from 'vitest';
import { computeBirthYearEligibility } from './eligibility';

// Table from CALCULATOR_ALGORITHM.md §7 — every column must match.
const TABLE = [
  { y: 2008, firstC: 2026, lastG: 2025, dist: 2026, cy: 0,  seed: 0,     seedElig: false },
  { y: 2009, firstC: 2026, lastG: 2026, dist: 2027, cy: 1,  seed: 0,     seedElig: false },
  { y: 2010, firstC: 2026, lastG: 2027, dist: 2028, cy: 2,  seed: 0,     seedElig: false },
  { y: 2020, firstC: 2026, lastG: 2037, dist: 2038, cy: 12, seed: 0,     seedElig: false },
  { y: 2024, firstC: 2026, lastG: 2041, dist: 2042, cy: 16, seed: 0,     seedElig: false },
  { y: 2025, firstC: 2026, lastG: 2042, dist: 2043, cy: 17, seed: 1000,  seedElig: true  },
  { y: 2026, firstC: 2026, lastG: 2043, dist: 2044, cy: 18, seed: 1000,  seedElig: true  },
  { y: 2027, firstC: 2027, lastG: 2044, dist: 2045, cy: 18, seed: 1000,  seedElig: true  },
  { y: 2028, firstC: 2028, lastG: 2045, dist: 2046, cy: 18, seed: 1000,  seedElig: true  },
  { y: 2029, firstC: 2029, lastG: 2046, dist: 2047, cy: 18, seed: 0,     seedElig: false },
];

describe('computeBirthYearEligibility', () => {
  for (const row of TABLE) {
    it(`birth year ${row.y} matches §7 table`, () => {
      const r = computeBirthYearEligibility(row.y);
      expect(r.firstContributionYear).toBe(row.firstC);
      expect(r.lastGrowthYear).toBe(row.lastG);
      expect(r.distributionYear).toBe(row.dist);
      expect(r.contributionYears).toBe(row.cy);
      expect(r.initialSeed).toBe(row.seed);
      expect(r.pilotSeedEligible).toBe(row.seedElig);
      expect(r.eligibleForNewContributions).toBe(row.cy > 0);
    });
  }

  it('2008 — fully ineligible', () => {
    const r = computeBirthYearEligibility(2008);
    expect(r.eligibleForNewContributions).toBe(false);
    expect(r.pilotSeedEligible).toBe(false);
    expect(r.contributionYears).toBe(0);
    expect(r.initialSeed).toBe(0);
  });

  it('contribution years never negative even for ancient years', () => {
    expect(computeBirthYearEligibility(1990).contributionYears).toBe(0);
  });
});
