import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import skills from '../src/engine/data/skills.json';
import titles from '../src/engine/data/titles.json';
import { lexicon } from '../src/engine/lexicon';
import { tokenize } from '../src/engine/nlp/tokenize';

const keyOf = (s: string) =>
  tokenize(s)
    .map((t) => t.light)
    .join(' ');

describe('skills taxonomy', () => {
  it('has 1,500–2,500 entries across all categories', () => {
    expect(skills.length).toBeGreaterThanOrEqual(1500);
    expect(skills.length).toBeLessThanOrEqual(2500);
    const cats = new Set(skills.map((s) => s.c));
    for (const c of [
      'product',
      'engineering',
      'data',
      'design',
      'marketing',
      'finance',
      'ops',
      'tools',
    ])
      expect(cats).toContain(c);
  });

  it('has unique names and no alias shared by two skills', () => {
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const s of skills) {
      for (const phrase of [s.n, ...(s.a ?? [])]) {
        const k = keyOf(phrase);
        const prev = owner.get(k);
        if (prev && prev !== s.n) clashes.push(`${phrase}: ${prev} / ${s.n}`);
        owner.set(k, s.n);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('references only existing parents', () => {
    const names = new Set(skills.map((s) => s.n.toLowerCase()));
    const missing = skills
      .flatMap((s) => ((s as { p?: string }).p ?? '').split(';').filter(Boolean))
      .filter((p) => !names.has(p.toLowerCase()));
    expect(missing).toEqual([]);
  });

  it('stays under 80 KB gzipped', () => {
    const raw = readFileSync(new URL('../src/engine/data/skills.json', import.meta.url));
    expect(gzipSync(raw).length).toBeLessThan(80 * 1024);
  });

  it('maps every family skill to a real entry', () => {
    const lex = lexicon();
    for (const id of Object.values(titles.familySkills).flat())
      expect(lex.skills.has(id)).toBe(true);
  });
});
