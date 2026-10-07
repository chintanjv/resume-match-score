import { describe, expect, it } from 'vitest';
import { atomize, parseDegree, parseYears } from '../src/engine/jd/requirements';
import { parseJob } from '../src/engine/jd';

const kinds = (line: string) => atomize(line, 'required').map((r) => r.kind);

describe('required vs preferred', () => {
  it('splits by headings', () => {
    const job = parseJob(
      [
        'Data Analyst',
        '',
        'Minimum qualifications',
        '- Advanced SQL',
        '- Tableau',
        '',
        'Preferred qualifications',
        '- dbt',
      ].join('\n'),
    );
    const tiers = Object.fromEntries(job.requirements.map((r) => [r.label, r.tier]));
    expect(tiers).toEqual({ SQL: 'required', Tableau: 'required', dbt: 'preferred' });
  });

  it.each(['Pluses', 'Bonus points', 'Nice to have', 'What would make you stand out'])(
    'treats "%s" as preferred',
    (h) => {
      const job = parseJob(
        ['Product Designer', '', 'Requirements', '- Figma', '', h, '- Framer'].join('\n'),
      );
      expect(job.requirements.find((r) => r.label === 'Framer')?.tier).toBe('preferred');
    },
  );

  it('detects inline cues', () => {
    const job = parseJob(
      [
        'Software Engineer',
        '',
        'Requirements',
        '- Python',
        '- Experience with Kafka is a plus',
        '- Rust preferred',
      ].join('\n'),
    );
    const tiers = Object.fromEntries(job.requirements.map((r) => [r.label, r.tier]));
    expect(tiers.Python).toBe('required');
    expect(tiers['Apache Kafka']).toBe('preferred');
    expect(tiers.Rust).toBe('preferred');
  });

  it('keeps the main clause required when only a trailing qualifier is preferred', () => {
    const job = parseJob(
      [
        'Product Designer',
        '',
        'Requirements',
        '- 3+ years of experience as a product designer, ideally on consumer mobile apps',
      ].join('\n'),
    );
    expect(job.requirements.find((r) => r.kind === 'years')?.tier).toBe('required');
    expect(job.requirements.some((r) => r.tier === 'preferred')).toBe(true);
  });

  it('treats everything as required without an explicit split', () => {
    const job = parseJob(
      ['Backend Engineer', '', 'Qualifications', '- Go', '- PostgreSQL', '- Kubernetes'].join('\n'),
    );
    expect(job.requirements.every((r) => r.tier === 'required')).toBe(true);
    expect(job.requirements).toHaveLength(3);
  });
});

describe('atomic requirements', () => {
  it('splits years + domain', () => {
    const reqs = atomize('5+ years of PM experience in fintech or payments', 'required');
    const years = reqs.find((r) => r.kind === 'years')!;
    expect(years.years).toMatchObject({
      min: 5,
      max: null,
      scope: { kind: 'family', id: 'product' },
    });
    const domain = reqs.find((r) => r.kind === 'domain')!;
    expect(domain.anyOf).toEqual(['fintech / payments']);
    expect(reqs).toHaveLength(2);
  });

  it('groups "or" lists and examples into any-of items, "and" lists into separate items', () => {
    expect(atomize('Strong proficiency in Go, Python, or Java', 'required')[0]!.anyOf).toEqual([
      'go',
      'python',
      'java',
    ]);
    expect(
      atomize('Experience with a BI tool such as Tableau, Looker or Power BI', 'required')[0]!
        .anyOf,
    ).toEqual(['business intelligence', 'tableau', 'looker', 'power bi']);
    const and = atomize('Hands-on experience with Kubernetes, Docker and Terraform', 'required');
    expect(and.map((r) => r.anyOf)).toEqual([['kubernetes'], ['docker'], ['terraform']]);
  });

  it('extracts degrees and certifications', () => {
    expect(kinds("Bachelor's degree in Computer Science or related field")).toEqual(['degree']);
    expect(kinds('PMP certification')).toEqual(['cert']);
    expect(parseDegree('MS or PhD in Statistics')).toMatchObject({
      level: 3,
      fields: ['statistics'],
    });
    expect(parseDegree('BS in CS or equivalent practical experience')).toMatchObject({
      level: 2,
      equivalent: true,
    });
    expect(parseDegree('Expert in MS Excel')).toBeNull();
  });

  it('falls back to a clause for prose requirements', () => {
    expect(
      kinds('Track record of influencing senior leaders and resolving conflicts across teams'),
    ).toContain('clause');
  });

  it.each([
    ['5+ years of experience', 5, null],
    ['3-5 years in product', 3, 5],
    ['3 to 5 years', 3, 5],
    ['minimum of 7 years', 7, null],
    ['at least five years', 5, null],
    ['10+ yrs', 10, null],
    ['Two (2) years of experience', 2, null],
  ])('parses years in "%s"', (text, min, max) => {
    expect(parseYears(text)).toMatchObject({ min, max });
  });
});
