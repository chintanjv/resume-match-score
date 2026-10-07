import type { Knockout } from '../types';
import type { Ctx } from './match';

const SPONSORSHIP =
  /\b(?:(?:unable|not able) to|cannot|can't|will not|won't|do(?:es)? not|are not able to)\s+(?:provide\s+|offer\s+)?(?:visa\s+)?sponsor|\bwithout (?:the need for )?(?:current or future )?(?:visa |employment )?sponsorship|\bno (?:visa )?sponsorship|\bmust be (?:legally )?authori[sz]ed to work|\bwork authori[sz]ation (?:is )?required|\b(?:us|u\.s\.) citizenship (?:is )?required|\bmust be an? (?:us|u\.s\.) citizen/i;
const AUTH_ON_RESUME =
  /authori[sz]ed to work|citizen(?:ship)?|permanent resident|green card|work permit|no sponsorship (?:needed|required)|eligible to work/i;
const CLEARANCE =
  /\b(security clearance|secret clearance|top secret|ts\/sci|active clearance|clearance (?:is )?required|public trust clearance|dod clearance)\b/i;
const CLEARANCE_ON_RESUME = /clearance|ts\/sci|top secret|\bsecret\b/i;
const LICENSE =
  /\b(?:licen[sc]e|licensure) (?:is )?required|\bmust (?:be|hold)(?: an?)? (?:active |valid )?(?:licensed|licen[sc]e)/i;
const MUST_LOCATE =
  /\bmust (?:be|live|reside)(?: located| based)? (?:in|within(?: commuting distance (?:of|to))?) (?:the )?([A-Z][\w.]+(?:[ ,]+[A-Z][\w.]+){0,3})/;

const cityOf = (loc: string) => loc.split(/[,(]/)[0]!.trim().toLowerCase();
const stateOf = (loc: string) => /,\s*([A-Z]{2})\b/.exec(loc)?.[1] ?? null;

/** Same place, or plausibly the same metro (same US state). */
function samePlace(a: string, b: string): boolean {
  const sa = stateOf(a);
  const sb = stateOf(b);
  if (sa && sb) return sa === sb;
  const ca = cityOf(a);
  const cb = cityOf(b);
  return !ca || !cb || ca.includes(cb) || cb.includes(ca);
}

export function knockouts(ctx: Ctx): Knockout[] {
  const { job, resume, lex } = ctx;
  const out: Knockout[] = [];
  const text = job.fullText;

  // Location / arrangement
  const where =
    MUST_LOCATE.exec(text)?.[1] ?? (job.meta.arrangement !== 'remote' ? job.meta.location : null);
  const mine = resume.contact.location;
  if (where && mine && !/remote/i.test(where) && job.meta.arrangement !== 'remote') {
    if (!samePlace(where, mine)) {
      const mode = job.meta.arrangement === 'hybrid' ? 'hybrid' : 'on-site';
      out.push({
        id: 'location',
        message: `This role is ${mode} in ${where}; your resume lists ${mine}. Note relocation plans if you have them.`,
      });
    }
  }

  if (SPONSORSHIP.test(text) && !AUTH_ON_RESUME.test(resume.text)) {
    out.push({
      id: 'authorization',
      message:
        'The posting requires work authorization without sponsorship. Your resume doesn’t say — state it if it applies.',
    });
  }

  const clearance = CLEARANCE.exec(text);
  if (clearance && !CLEARANCE_ON_RESUME.test(resume.text)) {
    out.push({
      id: 'clearance',
      message: `The posting asks for ${clearance[1]!.toLowerCase()}, which your resume doesn’t mention.`,
    });
  }

  const licenseReqs = job.requirements.filter(
    (r) => r.kind === 'cert' && r.anyOf.some((id) => lex.certs.get(id)?.license),
  );
  const missingLicense = licenseReqs.find((r) => !r.anyOf.some((id) => resume.certs.includes(id)));
  if (missingLicense) {
    out.push({
      id: 'license',
      message: `The posting requires a ${missingLicense.label} license, which your resume doesn’t mention.`,
    });
  } else if (
    !licenseReqs.length &&
    LICENSE.test(text) &&
    !/licen[sc]ed|licen[sc]e/i.test(resume.text)
  ) {
    out.push({
      id: 'license',
      message: 'The posting requires a professional license, which your resume doesn’t mention.',
    });
  }
  return out;
}
