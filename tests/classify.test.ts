import { describe, expect, it } from 'vitest';
import { blocksOf, parseJob } from '../src/engine/jd';
import { fixture, PAIRS } from './helpers';

const labelOf = (text: string, needle: string) => {
  const b = blocksOf(text).find((x) =>
    [x.heading ?? '', ...x.lines.map((l) => l.text)].join(' ').includes(needle),
  );
  if (!b) throw new Error(`no block containing "${needle}"`);
  return b;
};

describe('block classification', () => {
  it.each(PAIRS)('drops company, benefits and EEO noise in $jd', ({ jd }) => {
    const blocks = blocksOf(fixture(jd));
    const dropped = blocks.filter((b) => b.disposition === 'drop').map((b) => b.label);
    expect(dropped).toContain('about_company');
    expect(dropped).toContain('eeo_legal');
    expect(dropped.some((l) => l === 'benefits')).toBe(true);
    // Everything that feeds scoring must be a KEEP label.
    for (const b of blocks.filter((x) => x.included)) expect(b.disposition).toBe('keep');
  });

  it('labels the core sections of a posting', () => {
    const text = fixture('jd-pm-fintech.txt');
    expect(labelOf(text, 'About Ledgerly').label).toBe('about_company');
    expect(labelOf(text, 'What you’ll do'.replace('’', "'")).label).toBe('responsibilities');
    expect(labelOf(text, "What you'll need").label).toBe('required_qualifications');
    expect(labelOf(text, 'Nice to have').label).toBe('preferred_qualifications');
    expect(labelOf(text, '401(k) with company match').label).toBe('benefits');
    expect(labelOf(text, 'reasonable accommodation').disposition).toBe('drop');
    expect(labelOf(text, 'Share this job').disposition).toBe('drop');
  });

  it('extracts metadata without scoring it', () => {
    const job = parseJob(fixture('jd-pm-fintech.txt'));
    expect(job.meta.salary).toContain('$175,000');
    expect(job.meta.arrangement).toBe('hybrid');
    expect(job.meta.location).toBe('New York, NY');
    const salary = job.blocks.find((b) => b.label === 'salary');
    expect(salary?.disposition).toBe('extract');
    expect(salary?.included).toBe(false);
  });

  it.each([
    ['jd-pm-fintech.txt', 'Senior Product Manager, Payments'],
    ['jd-senior-swe.txt', 'Senior Software Engineer, Backend Platform'],
    ['jd-product-designer.txt', 'Product Designer'],
    ['jd-data-analyst.txt', 'Data Analyst, Marketplace Analytics'],
  ])('finds the job title in %s', (file, title) => {
    expect(parseJob(fixture(file)).title).toBe(title);
  });

  it('classifies heading-less noise by its body', () => {
    const text = [
      'Growth Product Manager',
      '',
      'We are a fast-growing startup backed by top investors, founded in 2019 and trusted by 5,000 companies.',
      '',
      '- 4+ years of product management experience',
      '- Experience with SQL',
      '',
      'We are an equal opportunity employer and do not discriminate on the basis of race, religion, gender identity or veteran status.',
      '',
      'Medical, dental and vision insurance. 401(k) matching. Unlimited PTO.',
    ].join('\n');
    const labels = blocksOf(text).map((b) => b.label);
    expect(labels).toEqual([
      'title',
      'about_company',
      'required_qualifications',
      'eeo_legal',
      'benefits',
    ]);
  });

  it('lets a user override a block and recomputes requirements', () => {
    const text = fixture('jd-senior-swe.txt');
    const base = parseJob(text);
    const prefBlock = base.blocks.find((b) => b.label === 'preferred_qualifications')!;
    const without = parseJob(text, { [prefBlock.id]: false });
    expect(without.requirements.some((r) => r.tier === 'preferred')).toBe(false);
    expect(without.requirements.length).toBeLessThan(base.requirements.length);
  });
});
