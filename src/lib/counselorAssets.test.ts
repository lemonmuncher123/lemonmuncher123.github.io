import { describe, it, expect } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const PUBLIC_DIR = resolve(__dirname, '..', '..', 'public');

describe('counselor PDFs', () => {
  const files = ['counselor-en.pdf', 'counselor-es.pdf'];

  for (const f of files) {
    it(`${f} exists in public/`, () => {
      const path = resolve(PUBLIC_DIR, f);
      expect(existsSync(path)).toBe(true);
    });

    it(`${f} is a non-trivial size (>2 KB)`, () => {
      const path = resolve(PUBLIC_DIR, f);
      const { size } = statSync(path);
      expect(size).toBeGreaterThan(2 * 1024);
    });
  }
});
