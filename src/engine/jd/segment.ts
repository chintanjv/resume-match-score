import headings from '../data/jd-headings.json';
import type { Line } from '../types';
import { normalizeText, toLines, wordCount } from '../nlp/normalize';

export interface RawBlock {
  heading: string | null;
  lines: Line[];
  /** Came from a "Key: value" line. */
  meta?: boolean;
}

const HEADING_PHRASES = new Set(
  Object.values(headings.headings)
    .flat()
    .map((h) => cleanHeading(h)),
);
const META_KEYS = new Set(Object.values(headings.metaKeys).flat());

export function cleanHeading(s: string): string {
  return s
    .toLowerCase()
    .replace(/[:：]\s*$/, '')
    .replace(/[^\p{L}\p{N}' &-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isTitleCase(s: string): boolean {
  const words = s.split(/\s+/).filter((w) => /^\p{L}/u.test(w) && w.length > 3);
  if (!words.length) return /^\p{Lu}/u.test(s);
  return words.filter((w) => /^\p{Lu}/u.test(w)).length / words.length >= 0.6;
}

function isAllCaps(s: string): boolean {
  const letters = s.replace(/[^\p{L}]/gu, '');
  return letters.length >= 3 && letters === letters.toUpperCase();
}

/** Heading-like: short, unpunctuated, and either known, colon-terminated, ALL CAPS or Title Case after a break. */
function isHeadingLine(line: Line, prevBlank: boolean): boolean {
  if (line.bullet) return false;
  const t = line.text;
  const words = wordCount(t);
  if (words === 0 || words > 9 || /[.!?;,]$/.test(t)) return false;
  if (HEADING_PHRASES.has(cleanHeading(t))) return true;
  if (/:\s*$/.test(t) && words <= 8) return true;
  if (isAllCaps(t) && words <= 6) return true;
  return prevBlank && isTitleCase(t) && words <= 6 && !/\d{4}|\$/.test(t);
}

const META_LINE = /^([A-Za-z][A-Za-z /&-]{1,28}):\s+(\S.{0,200})$/;

/**
 * Splits pasted text into blocks using headings, bullets and blank lines.
 * A heading opens a block; a blank line after prose opens a heading-less block;
 * a run of bullets is never split.
 */
export function segment(input: string): RawBlock[] {
  const lines = toLines(normalizeText(input));
  const blocks: RawBlock[] = [];
  let cur: RawBlock | null = null;
  let prevBlank = true;
  let blankRun = 0;

  const open = (heading: string | null): RawBlock => {
    const b: RawBlock = { heading, lines: [] };
    blocks.push(b);
    return b;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) {
      prevBlank = true;
      blankRun++;
      continue;
    }

    const meta = !line.bullet ? META_LINE.exec(line.text) : null;
    if (meta && META_KEYS.has(meta[1]!.toLowerCase().trim())) {
      blocks.push({
        heading: meta[1]!.trim(),
        lines: [{ text: meta[2]!.trim(), bullet: false }],
        meta: true,
      });
      cur = null;
      prevBlank = false;
      blankRun = 0;
      continue;
    }

    if (isHeadingLine(line, prevBlank)) {
      cur = open(line.text.replace(/:\s*$/, '').trim());
      prevBlank = false;
      blankRun = 0;
      continue;
    }

    const last = cur?.lines[cur.lines.length - 1];
    const continuesBullets = !!last?.bullet && line.bullet && blankRun < 2;
    const headingAwaitingBody = !!cur && cur.heading !== null && cur.lines.length === 0;
    if (!cur || (blankRun > 0 && !continuesBullets && !headingAwaitingBody)) {
      // A bulleted list directly under a heading's intro sentence stays with it.
      const introThenList =
        !!cur && !!last && !last.bullet && line.bullet && blankRun === 1 && /:$/.test(last.text);
      if (!introThenList) cur = open(null);
    }
    cur!.lines.push(line);
    prevBlank = false;
    blankRun = 0;
  }
  return blocks.filter((b) => b.heading || b.lines.length);
}
