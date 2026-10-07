import type { Lexicon } from './lexicon';
import { tokenize, type Token } from './nlp/tokenize';

interface Analyzed {
  tokens: Token[];
  /** Skill ids found (with implied parents when `implies` is set). */
  skills: string[];
  domains: string[];
  /** Bag of matching terms: concept terms (k:<skill>, d:<domain>) plus content stems. */
  terms: string[];
}

/**
 * Turns text into concept-aware terms. Synonyms collapse to one concept term, so
 * "A/B testing" in a JD and "split tests" in a resume become the same term.
 */
export function analyzeText(text: string, lex: Lexicon, implies = false): Analyzed {
  const tokens = tokenize(text);
  const covered = new Uint8Array(tokens.length);
  const skills = new Set<string>();
  const domains = new Set<string>();
  const terms: string[] = [];

  for (const h of lex.skillIndex.match(tokens)) {
    skills.add(h.id);
    terms.push('k:' + h.id);
    if (implies) {
      for (const p of lex.skills.get(h.id)?.implies ?? []) {
        skills.add(p);
        terms.push('k:' + p);
      }
    }
    covered.fill(1, h.start, h.end);
  }
  for (const h of lex.domainIndex.match(tokens)) {
    domains.add(h.id);
    terms.push('d:' + h.id);
    covered.fill(1, h.start, h.end);
  }
  tokens.forEach((t, i) => {
    if (covered[i] || t.norm.length < 2 || lex.stop.has(t.norm) || /^[\d.+]+$/.test(t.norm)) return;
    if (t.norm === '/' || t.norm === '&') return;
    terms.push(t.stem);
  });
  return { tokens, skills: [...skills], domains: [...domains], terms };
}

/** Verb classes of the first few tokens (the action of a bullet). */
export function leadVerbClasses(tokens: Token[], lex: Lexicon, window = 3): Set<string> {
  const out = new Set<string>();
  let seen = 0;
  for (const t of tokens) {
    if (lex.stop.has(t.norm) && seen === 0) continue;
    for (const c of lex.verbClasses.get(t.stem) ?? []) out.add(c);
    if (++seen >= window) break;
  }
  return out;
}

/** All verb classes anywhere in the text. */
export function verbClasses(tokens: Token[], lex: Lexicon): Set<string> {
  const out = new Set<string>();
  for (const t of tokens) for (const c of lex.verbClasses.get(t.stem) ?? []) out.add(c);
  return out;
}
