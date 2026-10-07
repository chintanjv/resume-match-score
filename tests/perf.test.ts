import { describe, expect, it } from 'vitest';
import { analyze } from '../src/engine';
import { lexicon } from '../src/engine/lexicon';
import { fixture, NOW, PAIRS } from './helpers';

describe('performance', () => {
  it('builds the lexicon once, quickly', () => {
    const t0 = performance.now();
    lexicon();
    expect(performance.now() - t0).toBeLessThan(500);
  });

  it.each(PAIRS)('analyzes $jd in well under 300 ms', ({ jd, resume }) => {
    const j = fixture(jd);
    const r = fixture(resume);
    analyze(j, r, { now: NOW });
    const t0 = performance.now();
    analyze(j, r, { now: NOW });
    expect(performance.now() - t0).toBeLessThan(300);
  });
});
