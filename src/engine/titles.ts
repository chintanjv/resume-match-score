import titlesData from './data/titles.json';
import { tokenize } from './nlp/tokenize';

interface PhraseRef {
  stems: string[];
  value: string;
}

const toStems = (p: string) => tokenize(p).map((t) => t.stem);
const byLength = (a: PhraseRef, b: PhraseRef) => b.stems.length - a.stems.length;

const FAMILY_PHRASES: PhraseRef[] = Object.entries(titlesData.families)
  .flatMap(([family, phrases]) => phrases.map((p) => ({ stems: toStems(p), value: family })))
  .sort(byLength);

const LEVEL_PHRASES: PhraseRef[] = Object.entries(titlesData.levels)
  .flatMap(([lvl, phrases]) => phrases.map((p) => ({ stems: toStems(p), value: lvl })))
  .sort(byLength);

const ROLE_NOUNS = new Set(titlesData.roleNouns.map((n) => toStems(n)[0]));
const IC_MANAGER = new Set(titlesData.icManagerFamilies);
const MANAGER_LEVEL = 6;
const MANAGER_STEM = toStems('manager')[0];

export const LEVEL_NAMES = titlesData.levelNames;

function findPhrases(stems: string[], phrases: PhraseRef[]): { ref: PhraseRef; start: number }[] {
  const used = new Uint8Array(stems.length);
  const out: { ref: PhraseRef; start: number }[] = [];
  for (const ref of phrases) {
    const n = ref.stems.length;
    for (let i = 0; i + n <= stems.length; i++) {
      if (used.subarray(i, i + n).some((u) => u)) continue;
      if (ref.stems.every((s, k) => stems[i + k] === s)) {
        out.push({ ref, start: i });
        used.fill(1, i, i + n);
      }
    }
  }
  return out;
}

function titleFamily(title: string): string | null {
  const stems = toStems(title);
  const hits = findPhrases(stems, FAMILY_PHRASES);
  if (!hits.length) return null;
  // Longest phrase wins; ties go to the phrase nearest the end (the head noun).
  hits.sort((a, b) => b.ref.stems.length - a.ref.stems.length || b.start - a.start);
  return hits[0]!.ref.value;
}

function titleLevel(title: string, family: string | null): number {
  const stems = toStems(title);
  const hits = findPhrases(stems, LEVEL_PHRASES);
  const modifiers: number[] = [];
  let manager = false;
  for (const h of hits) {
    const lvl = Number(h.ref.value);
    if (h.ref.stems.length === 1 && h.ref.stems[0] === MANAGER_STEM) {
      manager = true;
      continue;
    }
    modifiers.push(lvl);
  }
  const peopleManager = manager && !(family && IC_MANAGER.has(family));
  if (peopleManager) modifiers.push(MANAGER_LEVEL);
  if (!modifiers.length) return titlesData.defaultLevel;
  return Math.max(...modifiers);
}

export function classifyTitle(title: string): { family: string | null; level: number } {
  const family = titleFamily(title);
  return { family, level: titleLevel(title, family) };
}

/** Whether a short line reads like a job title. */
export function hasRoleNoun(line: string): boolean {
  return toStems(line).some((s) => ROLE_NOUNS.has(s));
}
