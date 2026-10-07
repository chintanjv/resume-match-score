import { readFileSync } from 'node:fs';
import { monthIndex } from '../src/engine/resume/dates';

export const fixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

/** Pinned "now" (Oct 2026) so "Present" is deterministic. */
export const NOW = monthIndex(2026, 9);

export const PAIRS = [
  { jd: 'jd-pm-fintech.txt', resume: 'resume-pm-fintech.txt' },
  { jd: 'jd-senior-swe.txt', resume: 'resume-senior-swe.txt' },
  { jd: 'jd-product-designer.txt', resume: 'resume-designer.txt' },
  { jd: 'jd-data-analyst.txt', resume: 'resume-analyst.txt' },
] as const;
