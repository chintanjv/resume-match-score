import { describe, expect, it } from 'vitest';
import { analyze } from '../src/engine';
import { lexicon } from '../src/engine/lexicon';
import { NOW } from './helpers';

const find = (text: string) => lexicon().skillIndex.find(text);
const implied = (text: string) => {
  const lex = lexicon();
  return [...new Set(find(text).flatMap((id) => [id, ...(lex.skills.get(id)?.implies ?? [])]))];
};

describe('skill synonyms', () => {
  it.each([
    ['Ran A/B tests on onboarding', 'experimentation'],
    ['Designed split testing for pricing', 'experimentation'],
    ['multivariate testing program', 'experimentation'],
    ['Built features with large language models', 'large language models'],
    ['Shipped GenAI search', 'large language models'],
    ['go-to-market plan', 'go-to-market'],
    ['GTM strategy', 'go-to-market'],
    ['machine learning models', 'machine learning'],
    ['Node.js and C++ services', 'node.js'],
    ['dashboards in Power BI', 'power bi'],
  ])('"%s" → %s', (text, id) => {
    expect(find(text)).toContain(id);
  });

  it('lets specific tools satisfy their parent skill', () => {
    expect(implied('Optimized Postgres queries')).toContain('sql');
    expect(implied('Modeled data in BigQuery')).toEqual(
      expect.arrayContaining(['sql', 'data warehousing']),
    );
    expect(implied('Streamed events through Kafka')).toContain('message queues');
  });

  it('guards ambiguous names', () => {
    expect(find('Go to the customer')).not.toContain('go');
    expect(find('Services written in Go and Python')).toContain('go');
    expect(find('R and Python for statistical modeling')).toContain('r');
    expect(find('Solid understanding of statistics')).not.toContain('solidity');
    expect(find('Partner with product managers')).not.toContain('product management');
    expect(find('the rest of the team')).not.toContain('rest apis');
  });

  it('matches a JD requirement through a synonym end to end', () => {
    const jd = 'Product Analyst\n\nRequirements\n- Experience with A/B testing\n- Strong SQL';
    const resume =
      'EXPERIENCE\nProduct Analyst | Acme | Jan 2021 – Present\n- Ran split tests on checkout, lifting conversion 4%\n- Wrote Postgres queries for weekly reporting';
    const report = analyze(jd, resume, { now: NOW });
    const byLabel = Object.fromEntries(report.requirements.map((r) => [r.label, r.strength]));
    expect(byLabel).toEqual({ Experimentation: 'meets', SQL: 'meets' });
  });
});
