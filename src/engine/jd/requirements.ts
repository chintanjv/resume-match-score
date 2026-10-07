import degreesData from '../data/degrees.json';
import titlesData from '../data/titles.json';
import softEvidence from '../data/soft-evidence.json';
import { CONFIG } from '../config';
import { lexicon, type Lexicon } from '../lexicon';
import { analyzeText } from '../terms';
import { tokenize, type Token } from '../nlp/tokenize';
import type { Block, DegreeSpec, Requirement, Tier, YearsSpec } from '../types';
import { hasPreferredCue, preferredCueIndex } from './classify';

const WORD_NUM: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
};
const NUM =
  '(\\d{1,2}(?:\\.\\d)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)';
const LEAD = '(?:minimum\\s+(?:of\\s+)?|min\\.?\\s+|at\\s+least\\s+|over\\s+|more\\s+than\\s+)?';
const YEARS_RANGE = new RegExp(
  `${LEAD}${NUM}\\s*\\+?\\s*(?:-|to)\\s*${NUM}\\s*\\+?\\s*(?:years?|yrs?)\\b`,
  'i',
);
const YEARS_MIN = new RegExp(
  `${LEAD}${NUM}\\s*(\\+|plus)?\\s*(?:\\(\\d+\\)\\s*)?(?:years?|yrs?)\\b`,
  'i',
);
const YEARS_SUFFIX = /years?|yrs?/i;

const num = (s: string) => WORD_NUM[s.toLowerCase()] ?? parseFloat(s);

interface YearsMatch {
  min: number;
  max: number | null;
  index: number;
  end: number;
}

/** Parse "5+ years", "3-5 years", "minimum of 7 years", "at least five years". */
export function parseYears(text: string): YearsMatch | null {
  const r = YEARS_RANGE.exec(text);
  if (r) {
    const a = num(r[1]!);
    const b = num(r[2]!);
    if (a <= 30 && b <= 40 && b >= a)
      return { min: a, max: b, index: r.index, end: r.index + r[0].length };
  }
  const m = YEARS_MIN.exec(text);
  if (m) {
    const a = num(m[1]!);
    if (a > 0 && a <= 30) return { min: a, max: null, index: m.index, end: m.index + m[0].length };
  }
  return null;
}

// Function families that a years phrase can be scoped to ("5+ years of PM experience").
const FAMILY_SCOPE: { stems: string[]; family: string }[] = Object.entries(titlesData.families)
  .flatMap(([family, phrases]) =>
    phrases
      .filter((p) => p !== 'product' && p !== 'data' && p !== 'design' && p !== 'software')
      .map((p) => ({ stems: tokenize(p).map((t) => t.stem), family })),
  )
  .concat(
    [
      ['product management', 'product'],
      ['product', 'product'],
      ['software development', 'engineering'],
      ['software', 'engineering'],
      ['design', 'design'],
      ['data analysis', 'data'],
      ['analytics', 'data'],
      ['data science', 'data'],
      ['ux', 'design'],
    ].map(([p, f]) => ({ stems: tokenize(p!).map((t) => t.stem), family: f! })),
  )
  .sort((a, b) => b.stems.length - a.stems.length);

const FAMILY_LABEL: Record<string, string> = {
  product: 'product management',
  engineering: 'software engineering',
  design: 'design',
  data: 'data/analytics',
  marketing: 'marketing',
  sales: 'sales',
  ops: 'operations',
  finance: 'finance',
};

function scopeFamily(tokens: Token[]): string | null {
  const stems = tokens.map((t) => t.stem);
  for (const f of FAMILY_SCOPE) {
    for (let i = 0; i + f.stems.length <= stems.length; i++) {
      if (f.stems.every((s, k) => stems[i + k] === s)) return f.family;
    }
  }
  return null;
}

function resolveScope(after: string, lex: Lexicon): YearsSpec['scope'] {
  // Scope text runs until the end of the clause.
  const text = after.split(/[;.]|,\s+(?:and|with|including)\b|\s+and\s+(?=\w+ing\b)/)[0] ?? '';
  const tokens = tokenize(text).slice(0, 12);
  const fam = scopeFamily(tokens);
  if (fam) return { kind: 'family', id: fam, label: FAMILY_LABEL[fam] ?? fam };
  const doms = lex.domainIndex.match(tokens);
  if (doms[0])
    return { kind: 'domain', id: doms[0].id, label: lex.domainNames.get(doms[0].id) ?? doms[0].id };
  const skills = lex.skillIndex
    .match(tokens)
    .filter((h) => lex.skills.get(h.id)?.category !== 'soft');
  if (skills[0])
    return {
      kind: 'skill',
      id: skills[0].id,
      label: lex.skills.get(skills[0].id)?.name ?? skills[0].id,
    };
  return null;
}

// ---- Degrees ------------------------------------------------------------------------------

const DEGREE_LEVELS: { re: RegExp; level: number }[] = Object.entries(degreesData.levels).flatMap(
  ([lvl, list]) =>
    list.map((p) => ({
      re: new RegExp(
        `(?:^|[^\\p{L}])${p.replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === '.' ? '\\.?' : '\\' + c))}(?:'?s)?(?=$|[^\\p{L}])`,
        'iu',
      ),
      level: Number(lvl),
    })),
);
const FIELD_RES = Object.entries(degreesData.fields).map(([field, list]) => ({
  field,
  re: new RegExp(
    `\\b(?:${list.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
    'i',
  ),
}));
const EQUIV_RE = new RegExp(degreesData.equivalentCues.join('|'), 'i');
const DEGREE_WORDS =
  /\b(degree|bachelor'?s?|masters?|master's|ph\.?d|doctorate|mba|diploma|undergraduate)\b/i;
const DEGREE_ABBR =
  /\b(B\.?S\.?c?|M\.?S\.?c?|B\.?A|M\.?A|BFA|MFA|BBA|B\.?Eng|M\.?Eng|B\.?Tech|M\.?Tech|B\.?Com|MPH|MPP|Ph\.?D|J\.?D|M\.?D)\b\.?(?!\s*(?:Office|Excel|Word|Project|Teams|Access|SQL|Dynamics|Visio))/;

export function parseDegree(text: string): DegreeSpec | null {
  if (!DEGREE_WORDS.test(text) && !DEGREE_ABBR.test(text)) return null;
  const levels: number[] = [];
  for (const { re, level } of DEGREE_LEVELS) {
    const m = re.exec(text);
    if (!m) continue;
    const letters = m[0].replace(/[^\p{L}]/gu, '');
    // Two-letter abbreviations ("BS", "MA") only count when written in capitals.
    if (letters.length <= 2 && letters !== letters.toUpperCase()) continue;
    if (letters.length <= 3 && /^(M\.?S|MS)$/.test(letters) && !DEGREE_ABBR.test(text)) continue;
    levels.push(level);
  }
  if (!levels.length && /\bdegree\b/i.test(text)) levels.push(2);
  if (!levels.length) return null;
  const fields = FIELD_RES.filter((f) => f.re.test(text)).map((f) => f.field);
  return { level: Math.min(...levels), fields, equivalent: EQUIV_RE.test(text) };
}

const DEGREE_NAMES = degreesData.levelNames;

// ---- Atomic split ---------------------------------------------------------------------------

const RUN_GLUE = new Set([
  'or',
  'and',
  '/',
  '&',
  'etc',
  'also',
  'either',
  'plus',
  'as',
  'well',
  'such',
  'like',
  'e.g',
  'eg',
  'i.e',
  'ie',
  'including',
  'especially',
  'particularly',
  'other',
  'similar',
  'another',
  'related',
  'comparable',
  'modern',
  'any',
  'tool',
  'tools',
  'platform',
  'platforms',
  'technologies',
  'framework',
  'frameworks',
  'language',
  'languages',
  'software',
  'system',
  'systems',
  'stack',
  'with',
  'in',
]);
// Glue that turns a list into alternatives: "Go, Python, or Java", "databases such as PostgreSQL".
const ANY_GLUE = new Set([
  'or',
  '/',
  'such',
  'like',
  'e.g',
  'eg',
  'i.e',
  'ie',
  'including',
  'especially',
  'particularly',
  'other',
  'similar',
  'another',
  'comparable',
]);
const EXAMPLE_CUE =
  /\b(such as|e\.g\.?|eg\.|including|like|for example|for instance|i\.e\.?|ideally)\b|\(/i;
const OR_TAIL = /\b(or (?:similar|equivalent|comparable|other|another|related)|or a similar)\b/i;

interface Group {
  ids: string[];
  anyOf: boolean;
}

/** Groups adjacent skill hits into lists; "or"-lists and example lists become any-of groups. */
function groupSkills(
  text: string,
  tokens: Token[],
  hits: { id: string; start: number; end: number }[],
): Group[] {
  const groups: Group[] = [];
  let run: typeof hits = [];
  let sawOr = false;
  const flush = () => {
    if (!run.length) return;
    const ids = [...new Set(run.map((h) => h.id))];
    const before = tokens
      .slice(Math.max(0, run[0]!.start - 4), run[0]!.start)
      .map((t) => t.raw)
      .join(' ');
    const anyOf = ids.length > 1 && (sawOr || EXAMPLE_CUE.test(before) || OR_TAIL.test(text));
    if (anyOf) groups.push({ ids, anyOf: true });
    else for (const id of ids) groups.push({ ids: [id], anyOf: false });
    run = [];
    sawOr = false;
  };
  for (const h of hits) {
    const prev = run[run.length - 1];
    if (prev) {
      const gap = tokens.slice(prev.end, h.start).map((t) => t.norm);
      if (gap.length <= 4 && gap.every((g) => RUN_GLUE.has(g))) {
        if (gap.some((g) => ANY_GLUE.has(g))) sawOr = true;
        run.push(h);
        continue;
      }
      flush();
    }
    run.push(h);
  }
  flush();
  return groups;
}

const SOFT = softEvidence as Record<string, string[]>;
const FIELD_SKILLS = new Set(
  Object.values(degreesData.fields)
    .flat()
    .flatMap((f) => lexicon().skillIndex.find(f)),
);
const FAMILY_SKILLS = new Set(
  Object.values(titlesData.families)
    .flat()
    .flatMap((f) => lexicon().skillIndex.find(f))
    .concat(Object.values(titlesData.familySkills).flat()),
);

/** Character offset of each token in the original line. */
function tokenOffsets(line: string, tokens: Token[]): number[] {
  const out: number[] = [];
  let from = 0;
  const lower = line.toLowerCase();
  for (const t of tokens) {
    const at = lower.indexOf(t.norm, from);
    out.push(at < 0 ? from : at);
    if (at >= 0) from = at + t.norm.length;
  }
  return out;
}

let seq = 0;
const nextId = () => `r${++seq}`;

/** Split one qualification line into atomic requirements. */
export function atomize(line: string, tier: Tier, lex: Lexicon = lexicon()): Requirement[] {
  const reqs: Requirement[] = [];
  const W = CONFIG.requirementWeight;
  const source = line;
  const tokens = tokenize(line);
  const covered = new Uint8Array(tokens.length);

  // Years
  const years = parseYears(line);
  if (years) {
    const scope = resolveScope(line.slice(years.end), lex);
    const label = `${years.min}${years.max ? `–${years.max}` : '+'} years${scope ? ` in ${scope.label}` : ''}`;
    reqs.push({
      id: nextId(),
      kind: 'years',
      tier,
      source,
      label,
      anyOf: [],
      years: { min: years.min, max: years.max, scope },
      weight: W.years,
    });
  }

  // Degree
  const degree = parseDegree(line);
  if (degree) {
    const lvl = DEGREE_NAMES[degree.level] ?? 'Degree';
    const fields = degree.fields.filter((f) => f !== 'quantitative');
    const label = `${lvl} degree${fields.length ? ` in ${fields.slice(0, 2).join(' / ')}` : degree.fields.length ? ' in a quantitative field' : ''}${degree.equivalent ? ' (or equivalent)' : ''}`;
    reqs.push({
      id: nextId(),
      kind: 'degree',
      tier,
      source,
      label,
      anyOf: [],
      degree,
      weight: W.degree,
    });
  }

  // Certifications / licenses
  const certHits = lex.certIndex.match(tokens);
  if (certHits.length) {
    const ids = [...new Set(certHits.map((h) => h.id))];
    for (const h of certHits) covered.fill(1, h.start, h.end);
    reqs.push({
      id: nextId(),
      kind: 'cert',
      tier,
      source,
      label: ids.map((i) => lex.certs.get(i)?.name ?? i).join(' or '),
      anyOf: ids,
      weight: W.cert,
    });
  }

  // Skills vs domains on the same words: the longer phrase wins ("PCI DSS" is a skill, "payments" a domain).
  const scopeStart = years ? years.end : -1;
  const scopeEnd = years ? years.end + 60 : -1;
  let skillHits = lex.skillIndex.match(tokens).filter((h) => !covered[h.start]);
  let domHits = lex.domainIndex.match(tokens).filter((h) => !covered[h.start]);
  const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) =>
    a.start < b.end && b.start < a.end;
  domHits = domHits.filter(
    (d) => !skillHits.some((k) => overlaps(k, d) && k.end - k.start >= d.end - d.start),
  );
  skillHits = skillHits.filter((k) => !domHits.some((d) => overlaps(k, d)));
  // Degree fields ("BS in Statistics") are not skill requirements.
  if (degree) skillHits = skillHits.filter((h) => !FIELD_SKILLS.has(h.id));
  // The function a years phrase is scoped to ("5+ years of product management") is already covered.
  if (years) {
    const scope = reqs[0]?.years?.scope;
    const offsets = tokenOffsets(line, tokens);
    skillHits = skillHits.filter((h) => {
      const at = offsets[h.start] ?? 0;
      const inScope = at >= scopeStart && at <= scopeEnd;
      return !(
        inScope &&
        (scope?.kind === 'family'
          ? FAMILY_SKILLS.has(h.id)
          : scope?.kind === 'skill' && scope.id === h.id)
      );
    });
  }

  // Domains (fintech or payments → one any-of item)
  if (domHits.length) {
    const ids = [...new Set(domHits.map((h) => h.id))];
    for (const h of domHits) covered.fill(1, h.start, h.end);
    const names = ids.map((i) => lex.domainNames.get(i) ?? i);
    reqs.push({
      id: nextId(),
      kind: 'domain',
      tier,
      source,
      label: `${names.join(' or ')} experience`,
      anyOf: ids,
      weight: W.domain,
    });
  }

  // Hard skills; soft skills are evidenced through what the bullets show, below.
  const softHits = skillHits.filter((h) => lex.skills.get(h.id)?.category === 'soft');
  const hardHits = skillHits.filter((h) => lex.skills.get(h.id)?.category !== 'soft');
  for (const g of groupSkills(line, tokens, hardHits)) {
    reqs.push({
      id: nextId(),
      kind: 'skill',
      tier,
      source,
      label: g.ids.map((i) => lex.skills.get(i)?.name ?? i).join(' or '),
      anyOf: g.ids,
      weight: W.skill,
    });
  }
  for (const h of skillHits) covered.fill(1, h.start, h.end);

  // Residual meaning → clause (matched by BM25 against bullets)
  const yearsTokens = years ? tokenize(line.slice(years.index, years.end)).length : 0;
  const residual = tokens.filter(
    (t, i) =>
      !covered[i] &&
      t.norm.length > 1 &&
      !lex.stop.has(t.norm) &&
      !/^\d/.test(t.norm) &&
      !YEARS_SUFFIX.test(t.norm),
  );
  const structured = reqs.length;
  const label = line.length > 96 ? line.slice(0, 93).replace(/\s+\S*$/, '') + '…' : line;
  if (!structured && softHits.length && residual.length < 5) {
    // "Excellent written communication" — evidenced by bullets that show the behavior.
    const verbs = [...new Set(softHits.flatMap((h) => SOFT[h.id] ?? SOFT._default!))];
    reqs.push({
      id: nextId(),
      kind: 'clause',
      tier,
      source,
      label,
      anyOf: [],
      verbs,
      weight: W.clause * CONFIG.softSkillWeight,
    });
  } else if (
    structured === 0 ? residual.length >= 2 : residual.length - yearsTokens >= 5 && !degree
  ) {
    const terms = analyzeText(line, lex).terms;
    reqs.push({
      id: nextId(),
      kind: 'clause',
      tier,
      source,
      label,
      anyOf: [],
      terms,
      weight: W.clause,
    });
  }

  // Items split from one bullet share its weight.
  if (CONFIG.splitBulletDamping && reqs.length > 1) {
    const d = 1 / Math.sqrt(reqs.length);
    for (const r of reqs) r.weight = +(r.weight * d).toFixed(3);
  }
  return reqs;
}

/** Split "main requirement, ideally qualifier" into [main, qualifier]; [null, line] when the cue governs it all. */
function splitAtCue(line: string): [string | null, string] {
  const at = preferredCueIndex(line);
  if (at > 0) {
    const before = line.slice(0, at);
    const sep = /[,;(–-]\s*$/.exec(before);
    if (sep && before.split(/\s+/).length >= 5)
      return [before.slice(0, sep.index).trim(), line.slice(at).trim()];
  }
  return [null, line];
}

/** Break prose into sentence-sized qualification lines. */
function qualLines(block: Block): string[] {
  const out: string[] = [];
  for (const l of block.lines) {
    if (l.bullet || l.text.length < 140) out.push(l.text);
    else
      out.push(
        ...l.text
          .split(/(?<=[.;])\s+(?=[A-Z])/)
          .map((s) => s.trim())
          .filter(Boolean),
      );
  }
  return out.filter((t) => t.trim().length > 1 && !/:$/.test(t));
}

const QUAL_CUE =
  /\b(years|experience|degree|proficien|knowledge of|familiar|expertise|background in|ability to|skills?)\b/i;

export function extractRequirements(blocks: Block[], lex: Lexicon = lexicon()): Requirement[] {
  seq = 0;
  const reqs: Requirement[] = [];
  const included = blocks.filter((b) => b.included);
  let qualBlocks = included.filter(
    (b) =>
      b.label === 'required_qualifications' ||
      b.label === 'preferred_qualifications' ||
      b.disposition !== 'keep',
  );
  // No qualification section: fall back to qualification-sounding lines anywhere kept.
  const fallback = !qualBlocks.some((b) => b.disposition === 'keep');
  if (fallback) qualBlocks = included;
  for (const b of qualBlocks) {
    const blockTier: Tier = b.label === 'preferred_qualifications' ? 'preferred' : 'required';
    for (const line of qualLines(b)) {
      if (fallback && !QUAL_CUE.test(line)) continue;
      if (blockTier === 'required' && hasPreferredCue(line)) {
        // "5+ years as a designer, ideally on mobile" — only the qualifier after the comma is preferred.
        const [head, tail] = splitAtCue(line);
        if (head) reqs.push(...atomize(head, 'required', lex));
        reqs.push(...atomize(tail, 'preferred', lex));
      } else {
        reqs.push(...atomize(line, blockTier, lex));
      }
    }
  }
  return reqs;
}
