import titlesData from '../data/titles.json';
import { CONFIG } from '../config';
import { lexicon, type Lexicon } from '../lexicon';
import { parseDegree } from '../jd/requirements';
import { wordCount } from '../nlp/normalize';
import { tokenize } from '../nlp/tokenize';
import { analyzeText } from '../terms';
import { classifyTitle, hasRoleNoun } from '../titles';
import type { Bullet, Line, ParsedResume, Role } from '../types';
import { currentMonth, mergedMonths, parseDateRange } from './dates';
import { splitSections } from './sections';

const QUANT =
  /\d+(?:\.\d+)?\s?%|[$€£]\s?\d|\b\d+(?:\.\d+)?\s?x\b|\b\d+(?:\.\d+)?\s?(?:k|m|mm|b|bn)\b|\b\d{1,3}(?:,\d{3})+\b|\b(?!(?:19|20)\d{2}\b)\d{2,}\b|\b\d+\+?\s(?:users|customers|clients|merchants|engineers|people|countries|markets|teams|reports|accounts|stores|hours|days|weeks|months|points|bps|basis points)\b/i;
const LOCATION_FIELD =
  /^(?:remote|hybrid|on-?site|[A-Z][a-zA-Z.]+(?: [A-Z][a-zA-Z.]+){0,2}, ?(?:[A-Z]{2}|USA|US|UK|Canada|India|Germany|France|Ireland|Netherlands|Spain|Australia|Singapore|Japan|Brazil|Mexico)|(?:new york|san francisco|london|berlin|seattle|austin|boston|chicago|toronto|bangalore|bengaluru|singapore|paris|nyc|sf bay area|bay area)(?:,.*)?)$/i;
const STRONG_SPLIT = /\s*(?:\||—|–|\s-\s|·|•|\s@\s|\sat\s)\s*/;
const COMMA_SPLIT = /,\s*(?!(?:[A-Z]{2}\b|Inc\b|LLC\b|Ltd\b))/;
const PAST_TENSE =
  /^(?:\w+ed|led|built|ran|grew|drove|wrote|won|sold|made|took|set|cut|began|brought|saw|found|held|kept|met|paid|taught|thought|spoke|chose|rose|oversaw|shipped|shaped)$/i;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;
const PHONE = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;

const isQuantified = (s: string): boolean => QUANT.test(s);

function startsWithVerb(text: string, lex: Lexicon): boolean {
  const first = tokenize(text)[0];
  return !!first && lex.verbClasses.has(first.stem);
}

function isTitleCaseShort(s: string): boolean {
  const words = s.split(/\s+/).filter((w) => /^\p{L}/u.test(w) && w.length > 3);
  return words.length > 0 && words.filter((w) => /^\p{Lu}/u.test(w)).length / words.length >= 0.6;
}

interface Group {
  lines: string[];
}

/** Fields of a header line: strong separators first, commas only when there are none. */
function splitFields(s: string): string[] {
  const strong = s.split(STRONG_SPLIT);
  const parts = strong.length > 1 ? strong : s.split(COMMA_SPLIT);
  return parts
    .map((f) =>
      f
        .trim()
        .replace(/^[-–|,]+|[-–|,]+$/g, '')
        .trim(),
    )
    .filter((f) => f.length > 1);
}

function headerish(line: Line, now: number, lex: Lexicon): boolean {
  if (line.bullet) return false;
  if (parseDateRange(line.text, now)) return wordCount(line.text) <= 20;
  const words = wordCount(line.text);
  if (words > 12 || /[.;]$/.test(line.text)) return false;
  const first = line.text.split(/\s+/)[0] ?? '';
  // "Design Intern, IDEO" is a header; "Mentored 4 engineers" and "Design onboarding flows" are not.
  if (PAST_TENSE.test(first)) return false;
  const firstField = splitFields(line.text)[0] ?? '';
  if (hasRoleNoun(firstField) && wordCount(firstField) <= 6) return true;
  if (startsWithVerb(line.text, lex)) return false;
  return /[|—–@·]|\sat\s|,\s/.test(line.text) || isTitleCaseShort(line.text);
}

function roleFromGroup(group: Group, context: string[], now: number): Role | null {
  const joined = group.lines.join(' | ');
  const dr = parseDateRange(joined, now);
  if (!dr) return null;
  const rest = group.lines
    .map((l) => l.replace(dr.raw, ' ').replace(/[()]/g, ' ').trim())
    .flatMap(splitFields)
    .filter((f) => !LOCATION_FIELD.test(f) && !/^\d{4}$/.test(f));
  const fields = [...rest, ...context];
  const titleIdx = fields.findIndex((f) => hasRoleNoun(f));
  let title = titleIdx >= 0 ? fields[titleIdx]! : (fields[0] ?? '');
  let company = fields.find((f, i) => i !== titleIdx && f !== title) ?? '';
  // "Product Designer, Headspace" with no other company field: split on the comma.
  if (!company && title.includes(',')) {
    const parts = title.split(COMMA_SPLIT).map((p) => p.trim());
    const t = parts.find((p) => hasRoleNoun(p)) ?? parts[0]!;
    title = t;
    company = parts.find((p) => p !== t) ?? '';
  }
  const { family, level } = classifyTitle(title);
  return {
    title,
    company,
    start: dr.start,
    end: dr.end,
    family,
    level,
    bullets: [],
  };
}

/** Parse roles and their bullets from the experience section. */
function parseExperience(lines: Line[], now: number, lex: Lexicon) {
  const roles: Role[] = [];
  const bulletTexts: { text: string; role: number | null }[] = [];
  let group: Group | null = null;
  let pendingContext: string[] = [];
  let undatedRoles = 0;
  let undatedTitlePending = false;

  const closeGroup = () => {
    if (!group) return;
    const role = roleFromGroup(group, pendingContext, now);
    if (role) {
      roles.push(role);
      pendingContext = [];
      undatedTitlePending = false;
    } else {
      // A dated-less header (often the company line above several titles) is context for the next role.
      pendingContext = group.lines.flatMap(splitFields).filter((f) => !LOCATION_FIELD.test(f));
      undatedTitlePending = group.lines.some((l) => hasRoleNoun(l));
    }
    group = null;
  };

  for (const line of lines) {
    const header = headerish(line, now, lex);
    if (header) {
      // A dated header after a complete dated group starts a new role.
      if (group && parseDateRange(group.lines.join(' '), now) && parseDateRange(line.text, now))
        closeGroup();
      group ??= { lines: [] };
      group.lines.push(line.text);
      continue;
    }
    closeGroup();
    // A titled header with no dates followed by bullets is a role whose dates we couldn't read.
    if (undatedTitlePending) {
      undatedRoles++;
      undatedTitlePending = false;
    }
    bulletTexts.push({ text: line.text, role: roles.length ? roles.length - 1 : null });
  }
  closeGroup();
  return { roles, bulletTexts, undatedRoles };
}

function skillsSectionItems(lines: Line[]): string[] {
  return lines
    .flatMap((l) => l.text.replace(/^[^:]{2,30}:\s*/, '').split(/[,;|•·]|\s\/\s/))
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

export function parseResume(text: string, now: number = currentMonth()): ParsedResume {
  const lex = lexicon();
  const { lines, found } = splitSections(text);
  const { roles, bulletTexts, undatedRoles } = parseExperience(lines.experience, now, lex);
  const recentCutoff = now - CONFIG.recency.recentYears * 12;

  const bullets: Bullet[] = [];
  const pushBullet = (t: string, roleIndex: number | null) => {
    const a = analyzeText(t, lex, true);
    const role = roleIndex !== null ? roles[roleIndex] : undefined;
    const recency =
      role && role.end !== null && role.end < recentCutoff ? CONFIG.recency.oldRoleWeight : 1;
    const idx = bullets.length;
    bullets.push({
      text: t,
      recency,
      quantified: isQuantified(t),
      skills: a.skills,
      domains: a.domains,
    });
    role?.bullets.push(idx);
  };
  for (const b of bulletTexts) pushBullet(b.text, b.role);
  for (const l of lines.projects) pushBullet(l.text, null);

  // Listed skills: skills, summary, education and certifications (claimed, not demonstrated).
  const listedText = [
    ...lines.skills,
    ...lines.summary,
    ...lines.education,
    ...lines.certifications,
  ]
    .map((l) => l.text)
    .join('\n');
  const listed = analyzeText(listedText, lex, true).skills;
  // Job titles are evidence too: "Business Intelligence Analyst", or a product role → product management.
  const titleSkills = [
    ...new Set(
      roles.flatMap((r) => [...analyzeText(r.title, lex, true).skills, ...familySkills(r.family)]),
    ),
  ];
  const demonstrated = new Set(bullets.flatMap((b) => b.skills));
  const allSkills = [...new Set([...demonstrated, ...titleSkills, ...listed])];

  // Domains: bullets, summary, and company/title context (incl. known company names).
  const domains = new Set(bullets.flatMap((b) => b.domains));
  for (const d of analyzeText(lines.summary.map((l) => l.text).join(' '), lex).domains)
    domains.add(d);
  for (const r of roles) {
    for (const d of lex.companyIndex.find(r.company)) domains.add(d);
    for (const d of lex.domainIndex.find(`${r.company} ${r.title}`)) domains.add(d);
  }

  const certText = [
    ...lines.certifications,
    ...lines.education,
    ...lines.summary,
    ...lines.skills,
    ...lines.other,
  ]
    .map((l) => l.text)
    .join('\n');
  const certs = lex.certIndex.find(certText + '\n' + bullets.map((b) => b.text).join('\n'));

  const degrees = lines.education
    .map((l) => ({ spec: parseDegree(l.text), line: l.text }))
    .filter((d) => d.spec)
    .map((d) => ({ level: d.spec!.level, fields: d.spec!.fields, line: d.line }));

  const contactText = lines.contact.map((l) => l.text).join('\n');
  const headText = text.slice(0, 600);
  const loc = /\b([A-Z][a-zA-Z.]+(?: [A-Z][a-zA-Z.]+){0,2}), ?([A-Z]{2})\b/.exec(
    contactText || headText,
  );

  const items = skillsSectionItems(lines.skills);
  const fullCount = wordCount(text);

  return {
    text,
    sections: Object.fromEntries(Object.entries(lines).map(([k, v]) => [k, v.map((l) => l.text)])),
    headingsFound: found,
    roles,
    undatedRoles,
    bullets,
    listedSkills: listed,
    titleSkills,
    allSkills,
    domains: [...domains],
    certs,
    degrees,
    totalMonths: mergedMonths(
      roles
        .filter((r) => r.level !== 0 && r.start !== null && r.end !== null)
        .map((r) => [r.start!, r.end!]),
    ),
    contact: {
      email: EMAIL.test(contactText || headText),
      phone: PHONE.test(contactText || headText),
      location: loc ? loc[0] : /\bremote\b/i.test(contactText) ? 'Remote' : null,
    },
    wordCount: fullCount,
    skillsSectionItems: items.length,
    skillsSectionWords: wordCount(lines.skills.map((l) => l.text).join(' ')),
  };
}

const FAMILY_SKILLS = titlesData.familySkills as Record<string, string[]>;
export const familySkills = (family: string | null): string[] =>
  family ? (FAMILY_SKILLS[family] ?? []) : [];

/** Months in roles matching a predicate (merged). */
export function monthsWhere(resume: ParsedResume, pred: (r: Role, i: number) => boolean): number {
  return mergedMonths(
    resume.roles
      .filter((r, i) => r.level !== 0 && r.start !== null && r.end !== null && pred(r, i))
      .map((r) => [r.start!, r.end!]),
  );
}
