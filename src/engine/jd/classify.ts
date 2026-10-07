import headings from '../data/jd-headings.json';
import type { Block, BlockLabel, Disposition } from '../types';
import { hasRoleNoun } from '../titles';
import { lexicon } from '../lexicon';
import { tokenize } from '../nlp/tokenize';
import { wordCount } from '../nlp/normalize';
import { cleanHeading, type RawBlock } from './segment';

const DISPOSITION: Record<BlockLabel, Disposition> = {
  title: 'keep',
  role_summary: 'keep',
  responsibilities: 'keep',
  required_qualifications: 'keep',
  preferred_qualifications: 'keep',
  location: 'extract',
  work_arrangement: 'extract',
  salary: 'extract',
  employment_type: 'extract',
  about_company: 'drop',
  mission_values: 'drop',
  benefits: 'drop',
  eeo_legal: 'drop',
  accommodations: 'drop',
  how_to_apply: 'drop',
  privacy_notice: 'drop',
  boilerplate: 'drop',
};

const HEADINGS = headings.headings as Partial<Record<BlockLabel, string[]>>;
const BODY = headings.body as Partial<Record<BlockLabel, string[]>>;
const ROLE_REFS = new Set([
  'the role',
  'this role',
  'the team',
  'the job',
  'the position',
  'you',
  'the opportunity',
  'this opportunity',
  'the work',
  'this position',
]);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cueRegex = (cues: string[]) =>
  new RegExp(`(?:^|[^\\p{L}])(?:${cues.map(escape).join('|')})(?=$|[^\\p{L}])`, 'iu');
const BODY_RE = Object.fromEntries(
  Object.entries(BODY).map(([label, cues]) => [label, cueRegex(cues)]),
) as Partial<Record<BlockLabel, RegExp>>;
const PREFERRED_RE = cueRegex(headings.preferredCues);

/** Heading → label with a strength (exact phrase beats contained phrase). */
function headingScores(heading: string): Map<BlockLabel, number> {
  const h = cleanHeading(heading);
  const scores = new Map<BlockLabel, number>();
  let best = 0;
  for (const [label, phrases] of Object.entries(HEADINGS) as [BlockLabel, string[]][]) {
    for (const p of phrases) {
      const cp = cleanHeading(p);
      let s = 0;
      if (h === cp) s = 10 + cp.length / 100;
      else if (cp.length >= 4 && new RegExp(`(^| )${escape(cp)}( |$)`).test(h))
        s = 5 + cp.length / 20;
      if (s > (scores.get(label) ?? 0)) scores.set(label, s);
      best = Math.max(best, s);
    }
  }
  // "About Acme" / "Life at Acme" — company, unless it is about the role.
  const about = /^(about|life at|why|join) (.+)$/.exec(h);
  if (about && !ROLE_REFS.has(about[2]!) && best < 10) {
    scores.set('about_company', Math.max(scores.get('about_company') ?? 0, 8));
  }
  return scores;
}

function bodyScores(lines: string[]): Map<BlockLabel, number> {
  const scores = new Map<BlockLabel, number>();
  if (!lines.length) return scores;
  for (const [label, re] of Object.entries(BODY_RE) as [BlockLabel, RegExp][]) {
    const hits = lines.filter((l) => re.test(l)).length;
    if (hits) scores.set(label, (3 * hits) / lines.length + Math.min(hits, 6) * 0.15);
  }
  return scores;
}

function verbLeadShare(lines: string[]): number {
  const lex = lexicon();
  let n = 0;
  for (const l of lines) {
    const first = tokenize(l)[0];
    if (first && lex.verbClasses.has(first.stem)) n++;
  }
  return lines.length ? n / lines.length : 0;
}

function pronounBias(text: string): number {
  const we = (text.match(/\b(we|we're|our|us|ours)\b/gi) ?? []).length;
  const you = (text.match(/\b(you|you'll|your|you're)\b/gi) ?? []).length;
  return we - you;
}

function add(m: Map<BlockLabel, number>, label: BlockLabel, v: number) {
  m.set(label, (m.get(label) ?? 0) + v);
}

/** A job title used as a heading over prose ("Growth PM" then "We are a startup…") is its own block. */
function splitTitleHeading(raw: RawBlock[]): RawBlock[] {
  const out: RawBlock[] = [];
  raw.forEach((rb, idx) => {
    const h = rb.heading;
    const prose = rb.lines.some((l) => !l.bullet && wordCount(l.text) > 12);
    if (
      idx <= 2 &&
      h &&
      !rb.meta &&
      prose &&
      hasRoleNoun(h) &&
      wordCount(h) <= 10 &&
      !headingScores(h).size
    ) {
      out.push({ heading: h, lines: [] }, { heading: null, lines: rb.lines });
    } else out.push(rb);
  });
  return out;
}

/** Rule-based block classifier: heading lexicon + body cues + position. */
export function classifyBlocks(input: RawBlock[]): Block[] {
  const raw = splitTitleHeading(input);
  const out: Block[] = [];
  let titleSeen = false;
  raw.forEach((rb, idx) => {
    const texts = rb.lines.map((l) => l.text);
    const scores = new Map<BlockLabel, number>();
    if (rb.heading) for (const [k, v] of headingScores(rb.heading)) add(scores, k, v);
    for (const [k, v] of bodyScores(texts)) add(scores, k, v);

    const bulletShare = texts.length ? rb.lines.filter((l) => l.bullet).length / texts.length : 0;
    const verbShare = verbLeadShare(texts);
    if (texts.length >= 2)
      add(scores, 'responsibilities', verbShare * 3 * (bulletShare > 0.5 ? 1 : 0.5));

    const allText = texts.join(' ');
    const bias = pronounBias(allText);
    if (bias >= 3 && !rb.heading) add(scores, 'about_company', 1.5);
    if (bias <= -2) add(scores, 'role_summary', 0.8);

    // Position: early short lines are titles; tail blocks lean legal/apply/benefits.
    const first = rb.heading ?? texts[0] ?? '';
    const titleLike =
      !titleSeen &&
      idx <= 3 &&
      texts.length <= 3 &&
      texts.every((t) => wordCount(t) <= 12) &&
      wordCount(first) <= 10 &&
      hasRoleNoun(first) &&
      !(rb.heading && headingScores(rb.heading).size);
    if (titleLike) add(scores, 'title', 12);
    const tail = raw.length > 4 && idx >= raw.length * 0.7;
    if (tail)
      for (const l of ['eeo_legal', 'how_to_apply', 'privacy_notice', 'benefits'] as const) {
        if (scores.has(l)) add(scores, l, 0.5);
      }

    // Preferred cues dominate the body → preferred quals.
    const prefShare = texts.length
      ? texts.filter((t) => PREFERRED_RE.test(t)).length / texts.length
      : 0;
    if (prefShare >= 0.6 && (scores.get('required_qualifications') ?? 0) > 0)
      add(scores, 'preferred_qualifications', 2);

    // Metadata "Key: value" lines.
    if (rb.meta && rb.heading) {
      const key = rb.heading.toLowerCase();
      for (const [label, keys] of Object.entries(headings.metaKeys) as [BlockLabel, string[]][]) {
        if (keys.includes(key)) add(scores, label, 20);
      }
    }

    let label: BlockLabel | null = null;
    let best = 0;
    for (const [k, v] of scores) if (v > best) [label, best] = [k, v];

    // Weak heading-less blocks continue the previous section.
    const prev = out[out.length - 1];
    if (!rb.heading && best < 2 && prev && prev.label !== 'title') label = prev.label;
    if (!label || best < 0.5) {
      label =
        bulletShare > 0.5
          ? verbShare > 0.4
            ? 'responsibilities'
            : 'required_qualifications'
          : 'role_summary';
      if (idx === 0 && !titleSeen && texts.length <= 1 && hasRoleNoun(first)) label = 'title';
    }
    if (label === 'title') titleSeen = true;

    out.push({
      id: `b${idx}`,
      heading: rb.heading,
      lines: rb.lines,
      label,
      disposition: DISPOSITION[label],
      included: DISPOSITION[label] === 'keep',
    });
  });
  return out;
}

export function hasPreferredCue(text: string): boolean {
  return PREFERRED_RE.test(text);
}

/** Character index where a preferred cue starts, or -1. */
export function preferredCueIndex(text: string): number {
  const m = PREFERRED_RE.exec(text);
  return m ? m.index + (/^[^\p{L}]/u.test(m[0]) ? 1 : 0) : -1;
}
