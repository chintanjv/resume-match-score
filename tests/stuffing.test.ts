import { describe, expect, it } from 'vitest';
import { analyze } from '../src/engine';
import { fixture, NOW } from './helpers';

const jd = fixture('jd-data-analyst.txt');

describe('keyword stuffing', () => {
  it('passes a natural resume', () => {
    const report = analyze(jd, fixture('resume-analyst.txt'), { now: NOW });
    expect(report.ats.checks.find((c) => c.id === 'stuffing')?.passed).toBe(true);
  });

  it('flags a term repeated far above the posting rate', () => {
    const stuffed =
      fixture('resume-analyst.txt') +
      '\n' +
      Array(12).fill('Tableau expert with Tableau dashboards.').join(' ');
    const check = analyze(jd, stuffed, { now: NOW }).ats.checks.find((c) => c.id === 'stuffing')!;
    expect(check.passed).toBe(false);
    expect(check.detail).toMatch(/Tableau ×\d+/);
  });

  it('flags a skills dump', () => {
    const dump = Array.from({ length: 60 }, (_, i) => `Skill${i}`).join(', ');
    const resume = fixture('resume-analyst.txt').replace('SKILLS\n', `SKILLS\n${dump}\n`);
    const report = analyze(jd, resume, { now: NOW });
    expect(report.ats.checks.find((c) => c.id === 'stuffing')?.detail).toMatch(/keyword dump/);
  });

  it('costs overall points through the ATS penalty, not extra keyword credit', () => {
    const clean = analyze(jd, fixture('resume-analyst.txt'), { now: NOW });
    const stuffed = analyze(
      jd,
      fixture('resume-analyst.txt') +
        '\n' +
        Array(12).fill('Tableau Tableau Looker Looker dbt dbt').join(' '),
      { now: NOW },
    );
    expect(stuffed.ats.score!).toBeLessThan(clean.ats.score!);
    expect(stuffed.overall).toBeLessThanOrEqual(clean.overall);
  });
});
