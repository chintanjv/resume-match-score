import { describe, expect, it } from 'vitest';
import { analyze } from '../src/engine';
import { fixture, NOW, PAIRS } from './helpers';

const score = (jd: string, resume: string) => analyze(jd, resume, { now: NOW }).overall;

describe('golden: matched pairs', () => {
  it.each(PAIRS)('$resume vs $jd scores ≥ 75', ({ jd, resume }) => {
    expect(score(fixture(jd), fixture(resume))).toBeGreaterThanOrEqual(75);
  });
});

describe('golden: mismatched pairs', () => {
  const MISMATCHED = [
    ['jd-senior-swe.txt', 'resume-designer.txt'],
    ['jd-product-designer.txt', 'resume-senior-swe.txt'],
    ['jd-pm-fintech.txt', 'resume-designer.txt'],
    ['jd-data-analyst.txt', 'resume-designer.txt'],
    ['jd-product-designer.txt', 'resume-analyst.txt'],
    ['jd-senior-swe.txt', 'resume-pm-fintech.txt'],
  ] as const;
  it.each(MISMATCHED)('%s vs %s scores ≤ 45', (jd, resume) => {
    expect(score(fixture(jd), fixture(resume))).toBeLessThanOrEqual(45);
  });
});

describe('golden: noise robustness', () => {
  const about = fixture('noise-about.txt');
  const benefits = fixture('noise-benefits.txt');
  it.each(PAIRS)('company/benefits/EEO text moves $jd by ≤ 2 points', ({ jd, resume }) => {
    const base = score(fixture(jd), fixture(resume));
    for (const noisy of [
      `${about}\n\n${fixture(jd)}`,
      `${fixture(jd)}\n\n${benefits}`,
      `${about}\n\n${fixture(jd)}\n\n${benefits}`,
    ]) {
      expect(Math.abs(score(noisy, fixture(resume)) - base)).toBeLessThanOrEqual(2);
    }
  });
});

describe('report shape', () => {
  it('renders every dimension with evidence, plus fixes', () => {
    const r = analyze(fixture('jd-pm-fintech.txt'), fixture('resume-pm-fintech.txt'), { now: NOW });
    expect(r.dimensions.map((d) => d.id)).toEqual([
      'keywords',
      'required',
      'preferred',
      'years',
      'seniority',
      'domain',
      'responsibilities',
      'impact',
      'education',
    ]);
    expect(r.ats.checks.length).toBe(6);
    expect(r.fixes.length).toBeGreaterThan(0);
    expect(r.fixes.length).toBeLessThanOrEqual(5);
    for (const f of r.fixes) expect(f.advice).toMatch(/^(Add|Show|Make|State|If you)/);
    const weights = r.dimensions.reduce((a, d) => a + d.weight, 0);
    expect(weights).toBeCloseTo(1, 5);
    expect(['A', 'B', 'C', 'D']).toContain(r.grade);
  });

  it('marks dimensions N/A and renormalizes when the posting is silent', () => {
    const r = analyze(
      'Product Designer\n\nRequirements\n- Figma\n- Prototyping',
      fixture('resume-designer.txt'),
      { now: NOW },
    );
    const byId = Object.fromEntries(r.dimensions.map((d) => [d.id, d]));
    expect(byId.education!.score).toBeNull();
    expect(byId.years!.score).toBeNull();
    expect(byId.years!.weight).toBe(0);
  });

  it('raises knockout banners', () => {
    const r = analyze(fixture('jd-data-analyst.txt'), fixture('resume-analyst.txt'), { now: NOW });
    expect(r.knockouts.map((k) => k.id)).toEqual(['authorization']);
    const cleared = analyze(
      'Security Engineer\n\nRequirements\n- Active TS/SCI security clearance required\n- Python',
      fixture('resume-senior-swe.txt'),
      { now: NOW },
    );
    expect(cleared.knockouts.map((k) => k.id)).toContain('clearance');
  });

  it('is deterministic', () => {
    const a = analyze(fixture('jd-senior-swe.txt'), fixture('resume-senior-swe.txt'), { now: NOW });
    const b = analyze(fixture('jd-senior-swe.txt'), fixture('resume-senior-swe.txt'), { now: NOW });
    expect(a).toEqual(b);
  });
});
