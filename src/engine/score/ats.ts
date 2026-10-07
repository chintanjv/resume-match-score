import { CONFIG } from '../config';
import { tokenize } from '../nlp/tokenize';
import type { AtsCheck, Dimension } from '../types';
import { dim } from './dimensions';
import type { Ctx } from './match';

interface StuffedTerm {
  name: string;
  count: number;
}

/** Terms repeated far above the posting's own rate, or a bloated skills section. */
function detectStuffing(ctx: Ctx): { terms: StuffedTerm[]; dump: boolean } {
  const { resume, job, lex } = ctx;
  const S = CONFIG.ats.stuffing;
  const counts = new Map<string, number>();
  for (const h of lex.skillIndex.match(tokenize(resume.text)))
    counts.set(h.id, (counts.get(h.id) ?? 0) + 1);
  const resumeWords = Math.max(1, resume.wordCount);
  const jdWords = Math.max(1, job.wordCount);
  const terms: StuffedTerm[] = [];
  for (const k of job.keywords) {
    const c = counts.get(k.id) ?? 0;
    if (c >= S.minCount && c / resumeWords > S.rateMultiple * (k.tf / jdWords)) {
      terms.push({ name: lex.skills.get(k.id)?.name ?? k.id, count: c });
    }
  }
  const dump =
    resume.skillsSectionItems > S.maxSkillItems ||
    resume.skillsSectionWords / resumeWords > S.maxSkillsWordShare;
  return { terms, dump };
}

export function atsDim(ctx: Ctx): Dimension & { checks: AtsCheck[] } {
  const { resume } = ctx;
  const A = CONFIG.ats;
  const checks: (AtsCheck & { weight: number; credit: number })[] = [];
  const add = (id: string, label: string, weight: number, credit: number, detail: string) =>
    checks.push({ id, label, weight, credit, passed: credit >= 1, detail });

  const contact = (resume.contact.email ? 0.6 : 0) + (resume.contact.phone ? 0.4 : 0);
  add(
    'contact',
    'Contact info',
    A.checks.contact,
    contact,
    contact >= 1
      ? 'Email and phone found.'
      : resume.contact.email
        ? 'Email found; add a phone number.'
        : 'Add an email address and phone number at the top.',
  );

  const core = ['experience', 'education', 'skills'] as const;
  const have = core.filter((s) => resume.headingsFound.includes(s));
  add(
    'headings',
    'Standard section headings',
    A.checks.headings,
    have.length / core.length,
    have.length === core.length
      ? 'Experience, Education and Skills are clearly labeled.'
      : `Add standard headings for: ${core.filter((s) => !have.includes(s)).join(', ')}.`,
  );

  const totalRoles = resume.roles.length + resume.undatedRoles;
  const datedShare = totalRoles ? resume.roles.length / totalRoles : 0;
  add(
    'dates',
    'Parseable dates',
    A.checks.dates,
    totalRoles ? Math.min(1, datedShare / A.parseableDateShare) : 0,
    !totalRoles
      ? 'No dated roles found — use formats like "Jan 2020 – Present".'
      : datedShare >= A.parseableDateShare
        ? `${resume.roles.length} roles with readable dates.`
        : `${resume.undatedRoles} role(s) have dates an ATS may not read.`,
  );

  const w = resume.wordCount;
  const lengthOk = w >= A.minWords && w <= A.maxWords;
  add(
    'length',
    'Length (1–2 pages)',
    A.checks.length,
    lengthOk ? 1 : w < A.minWords ? w / A.minWords : Math.max(0, 1 - (w - A.maxWords) / A.maxWords),
    lengthOk
      ? `${w} words — about ${w > 650 ? 'two pages' : 'one page'}.`
      : w < A.minWords
        ? `Only ${w} words — likely too thin.`
        : `${w} words — likely over two pages.`,
  );

  const n = resume.bullets.length;
  const bulletsOk = n >= A.minBullets && n <= A.maxBullets;
  add(
    'bullets',
    'Bullet count',
    A.checks.bullets,
    bulletsOk ? 1 : n < A.minBullets ? n / A.minBullets : 0.5,
    bulletsOk
      ? `${n} bullets.`
      : n < A.minBullets
        ? `Only ${n} bullets — add specifics under each role.`
        : `${n} bullets — trim to the strongest.`,
  );

  const stuffing = detectStuffing(ctx);
  const stuffed = stuffing.terms.length > 0 || stuffing.dump;
  add(
    'stuffing',
    'No keyword stuffing',
    A.checks.stuffing,
    stuffed ? (stuffing.terms.length && stuffing.dump ? 0 : 0.3) : 1,
    !stuffed
      ? 'Terms appear at natural rates.'
      : [
          stuffing.terms.length
            ? `Repeated far above the posting: ${stuffing.terms.map((t) => `${t.name} ×${t.count}`).join(', ')}.`
            : '',
          stuffing.dump ? 'Skills section reads as a keyword dump.' : '',
        ]
          .filter(Boolean)
          .join(' '),
  );

  const total = checks.reduce((a, c) => a + c.weight, 0);
  const score =
    (100 * checks.reduce((a, c) => a + c.weight * Math.max(0, Math.min(1, c.credit)), 0)) / total;
  const failed = checks.filter((c) => !c.passed);
  const why = failed.length
    ? `${checks.length - failed.length} of ${checks.length} checks pass; fix ${failed[0]!.label.toLowerCase()}.`
    : 'Clean, parseable structure.';
  const d = dim(
    'ats',
    score,
    why,
    checks.map((c) => ({
      label: c.label,
      detail: c.detail,
      strength: c.passed ? 'meets' : c.credit > 0.4 ? 'partial' : 'missing',
    })),
  );
  return {
    ...d,
    checks: checks.map(({ id, label, passed, detail }) => ({ id, label, passed, detail })),
  };
}
