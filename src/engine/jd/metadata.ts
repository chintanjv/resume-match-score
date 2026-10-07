import type { Block, JobMeta } from '../types';

const SALARY =
  /(?:[$£€]\s?\d[\d,.]*\s?[kK]?(?:\s*(?:-|to)\s*[$£€]?\s?\d[\d,.]*\s?[kK]?)?(?:\s*(?:USD|EUR|GBP|per year|\/yr|\/year|annually|per hour|\/hr))?)/;
const CITY_ST = /\b([A-Z][a-zA-Z.]+(?: [A-Z][a-zA-Z.]+){0,2}), ?([A-Z]{2})\b/;
const ARRANGEMENT: [JobMeta['arrangement'], RegExp][] = [
  ['hybrid', /\bhybrid\b/i],
  ['onsite', /\b(on-?site|in[- ]office|in person|in-person)\b/i],
  ['remote', /\b(remote|fully remote|remote-first|work from home|wfh|distributed)\b/i],
];
const EMPLOYMENT =
  /\b(full[- ]time|part[- ]time|contract(?:or)?|temporary|internship|permanent|freelance)\b/i;

export function extractMeta(blocks: Block[]): JobMeta {
  const meta: JobMeta = { location: null, arrangement: null, salary: null, employmentType: null };
  const extract = blocks.filter((b) => b.disposition === 'extract');
  // Benefits/legal text mentions "remote" or "$" for other reasons — skip it for metadata.
  const scan = blocks.filter((b) => b.disposition !== 'drop' || b.label === 'about_company');
  const textOf = (bs: Block[]) =>
    bs.map((b) => [b.heading ?? '', ...b.lines.map((l) => l.text)].join('\n')).join('\n');

  for (const b of extract) {
    const v = b.lines.map((l) => l.text).join(' ');
    if (b.label === 'location' && !meta.location) meta.location = v.slice(0, 80);
    if (b.label === 'salary' && !meta.salary)
      meta.salary = SALARY.exec(v)?.[0]?.trim() ?? v.slice(0, 60);
    if (b.label === 'employment_type' && !meta.employmentType)
      meta.employmentType = EMPLOYMENT.exec(v)?.[1] ?? v.slice(0, 30);
    if (b.label === 'work_arrangement' || b.label === 'location') {
      for (const [k, re] of ARRANGEMENT) if (!meta.arrangement && re.test(v)) meta.arrangement = k;
    }
  }
  const head = textOf(scan.slice(0, 6));
  const all = textOf(scan);
  if (!meta.arrangement)
    for (const [k, re] of ARRANGEMENT)
      if (re.test(head)) {
        meta.arrangement = k;
        break;
      }
  if (!meta.arrangement)
    for (const [k, re] of ARRANGEMENT)
      if (re.test(all)) {
        meta.arrangement = k;
        break;
      }
  if (!meta.location) {
    const m = CITY_ST.exec(head);
    if (m) meta.location = m[0];
  }
  if (!meta.salary) meta.salary = SALARY.exec(all)?.[0]?.trim() ?? null;
  if (!meta.employmentType) meta.employmentType = EMPLOYMENT.exec(head)?.[1] ?? null;
  return meta;
}
