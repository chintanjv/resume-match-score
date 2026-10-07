import headingsData from '../data/resume-headings.json';
import { normalizeText, toLines, wordCount } from '../nlp/normalize';
import type { Line, ResumeSection } from '../types';

const HEADINGS = Object.entries(headingsData)
  .flatMap(([section, list]) => list.map((h) => ({ section: section as ResumeSection, phrase: h })))
  .sort((a, b) => b.phrase.length - a.phrase.length);

const clean = (s: string) =>
  s
    .toLowerCase()
    .replace(/[:：|]+\s*$/, '')
    .replace(/[^\p{L}&' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Recognize a resume section heading line. */
function headingSection(line: Line): ResumeSection | null {
  if (line.bullet || wordCount(line.text) > 6 || /[.,;]$/.test(line.text)) return null;
  const c = clean(line.text);
  const exact = HEADINGS.find((h) => h.phrase === c);
  if (exact) return exact.section;
  const letters = line.text.replace(/[^\p{L}]/gu, '');
  const shouty = letters.length >= 4 && letters === letters.toUpperCase();
  if (shouty || /:\s*$/.test(line.text)) {
    const hit = HEADINGS.find((h) => new RegExp(`(^| )${h.phrase}( |$)`).test(c));
    if (hit) return hit.section;
  }
  return null;
}

interface SectionedResume {
  lines: Record<ResumeSection, Line[]>;
  found: ResumeSection[];
}

export function splitSections(text: string): SectionedResume {
  const lines: Record<ResumeSection, Line[]> = {
    contact: [],
    summary: [],
    experience: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    other: [],
  };
  const found: ResumeSection[] = [];
  let cur: ResumeSection = 'contact';
  for (const line of toLines(normalizeText(text))) {
    if (!line) continue;
    const s = headingSection(line);
    if (s) {
      cur = s;
      if (!found.includes(s)) found.push(s);
      continue;
    }
    lines[cur].push(line);
  }
  // No headings at all: treat everything after the first few lines as experience.
  if (!found.length && lines.contact.length > 6) {
    lines.experience = lines.contact.splice(4);
  }
  return { lines, found };
}
