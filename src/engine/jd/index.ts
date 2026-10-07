import { lexicon } from '../lexicon';
import { normalizeText, wordCount } from '../nlp/normalize';
import { classifyTitle } from '../titles';
import { analyzeText } from '../terms';
import type { Block, ParsedJob } from '../types';
import { classifyBlocks } from './classify';
import { extractMeta } from './metadata';
import { extractRequirements } from './requirements';
import { segment } from './segment';
import { findTitle } from './title';

/** Segment + classify. Separate from parseJob so overrides can be applied in between. */
export function blocksOf(jobText: string): Block[] {
  return classifyBlocks(segment(jobText));
}

function applyOverrides(blocks: Block[], overrides?: Record<string, boolean>): Block[] {
  if (!overrides) return blocks;
  return blocks.map((b) => (b.id in overrides ? { ...b, included: !!overrides[b.id] } : b));
}

const blockText = (b: Block) => [b.heading ?? '', ...b.lines.map((l) => l.text)].join('\n');

function responsibilitiesOf(blocks: Block[]): string[] {
  const resp = blocks.filter((b) => b.included && b.label === 'responsibilities');
  const lines = resp.flatMap((b) =>
    b.lines.flatMap((l) =>
      l.bullet || l.text.length < 160 ? [l.text] : l.text.split(/(?<=[.;])\s+(?=[A-Z])/),
    ),
  );
  if (lines.length) return lines.filter((t) => t.split(/\s+/).length >= 3);
  // No responsibilities section: use "you will…" sentences from the summary.
  return blocks
    .filter((b) => b.included && b.label === 'role_summary')
    .flatMap((b) => b.lines.flatMap((l) => l.text.split(/(?<=[.;])\s+/)))
    .filter((s) => /\b(you will|you'll|responsible for|own|lead|drive|build|partner)\b/i.test(s));
}

export function parseJob(jobText: string, overrides?: Record<string, boolean>): ParsedJob {
  const lex = lexicon();
  const blocks = applyOverrides(blocksOf(jobText), overrides);
  const title = findTitle(blocks);
  const { family, level } = title ? classifyTitle(title) : { family: null, level: null };
  const requirements = extractRequirements(blocks, lex);

  // Keyword and domain frequencies come only from included blocks.
  const kw = new Map<string, { tf: number; required: boolean }>();
  const dom = new Map<string, number>();
  for (const b of blocks) {
    if (!b.included) continue;
    const a = analyzeText(blockText(b), lex);
    const isReq = b.label === 'required_qualifications';
    for (const t of a.terms) {
      if (t.startsWith('k:')) {
        const id = t.slice(2);
        if (lex.skills.get(id)?.category === 'soft') continue;
        const e = kw.get(id) ?? { tf: 0, required: false };
        e.tf++;
        e.required ||= isReq;
        kw.set(id, e);
      } else if (t.startsWith('d:')) {
        dom.set(t.slice(2), (dom.get(t.slice(2)) ?? 0) + 1);
      }
    }
  }
  // Skills named in required items count as required even if their block wasn't labeled so.
  for (const r of requirements) {
    if (r.kind !== 'skill' || r.tier !== 'required') continue;
    for (const id of r.anyOf) {
      const e = kw.get(id) ?? { tf: 1, required: true };
      e.required = true;
      kw.set(id, e);
    }
  }

  const normalized = normalizeText(jobText);
  return {
    blocks,
    title,
    family,
    level,
    requirements,
    responsibilities: responsibilitiesOf(blocks),
    keywords: [...kw].map(([id, v]) => ({ id, ...v })),
    domains: [...dom].map(([id, weight]) => ({ id, weight })),
    meta: extractMeta(blocks),
    fullText: normalized,
    wordCount: wordCount(
      blocks
        .filter((b) => b.included)
        .map(blockText)
        .join(' '),
    ),
  };
}
