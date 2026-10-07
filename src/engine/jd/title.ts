import type { Block } from '../types';
import { hasRoleNoun } from '../titles';
import { wordCount } from '../nlp/normalize';

const PREFIX = /^(job title|title|position|role|we're hiring|we are hiring|hiring)\s*[:-]\s*/i;
const SPLIT =
  /\s+(?:[-|@·•]|at)\s+|\s*\(|,\s+(?=(?:remote|hybrid|on-?site|[A-Z][a-z]+,\s*[A-Z]{2}\b))/;

/** Trim company/location tails: "Senior PM - Payments | Acme (Remote)" → "Senior PM - Payments". */
function cleanTitle(line: string): string {
  const t = line.replace(PREFIX, '').trim();
  const parts = t
    .split(SPLIT)
    .map((p) => p?.trim())
    .filter(Boolean) as string[];
  const first = parts[0] ?? t;
  // Keep a functional suffix ("Product Manager - Payments") if the second part has no role noun.
  if (
    parts.length > 1 &&
    hasRoleNoun(first) &&
    /^[A-Z][\w&/ ]{2,30}$/.test(parts[1]!) &&
    !hasRoleNoun(parts[1]!) &&
    / - /.test(t) &&
    !/remote|hybrid|on-?site|inc\b|llc|ltd/i.test(parts[1]!)
  ) {
    return `${first} - ${parts[1]}`;
  }
  return hasRoleNoun(first) ? first : t;
}

/** First title-like line: a block labeled title, else an early short line with a role noun. */
export function findTitle(blocks: Block[]): string | null {
  const titled = blocks.find((b) => b.label === 'title');
  if (titled) return cleanTitle(titled.heading ?? titled.lines[0]?.text ?? '');
  let seen = 0;
  for (const b of blocks) {
    if (b.disposition === 'drop') continue;
    for (const cand of [b.heading, ...b.lines.map((l) => l.text)]) {
      if (!cand) continue;
      if (++seen > 8) break;
      if (wordCount(cand) <= 10 && !/[.!?]$/.test(cand) && hasRoleNoun(cand))
        return cleanTitle(cand);
    }
  }
  // Fall back to "looking for a Senior Product Manager to..." in prose.
  for (const b of blocks) {
    if (b.disposition !== 'keep') continue;
    for (const l of b.lines) {
      const m =
        /(?:looking for|seeking|hiring)\s+(?:an?|our)\s+(?:(?:first|next|new)\s+)?([A-Z][\w/&,-]*(?:\s+[A-Z][\w/&,-]*){0,5})/.exec(
          l.text,
        );
      if (m && hasRoleNoun(m[1]!)) return m[1]!.replace(/,$/, '');
    }
  }
  return null;
}
