import degreesData from '../data/degrees.json';
import { CONFIG } from '../config';
import type { Lexicon } from '../lexicon';
import { Bm25, type Query } from '../nlp/bm25';
import { familySkills, monthsWhere } from '../resume';
import { leadVerbClasses, verbClasses, analyzeText } from '../terms';
import type {
  ParsedJob,
  ParsedResume,
  Requirement,
  RequirementResult,
  Role,
  Strength,
} from '../types';

export interface Ctx {
  /** Number of bullet docs; BM25 docs past this index are summary sentences. */
  bulletCount: number;
  job: ParsedJob;
  resume: ParsedResume;
  lex: Lexicon;
  bm25: Bm25;
  summary: string[];
  bulletLead: Set<string>[];
  bulletVerbs: Set<string>[];
  totalYears: number;
  relevantYears: number;
}

interface KeywordState {
  status: 'demonstrated' | 'listed' | 'missing';
  recency: number;
  /** Satisfied through an alternative the posting allows ("Tableau, Looker or Power BI"). */
  via?: string;
}

/** Everything that a counterfactual "fix" can change. */
export interface State {
  reqs: RequirementResult[];
  keywords: Map<string, KeywordState>;
  domains: Set<string>;
}

export function buildCtx(job: ParsedJob, resume: ParsedResume, lex: Lexicon): Ctx {
  const analyzed = resume.bullets.map((b) => analyzeText(b.text, lex, true));
  // Summary sentences can support a clause, but only as partial evidence.
  const summary = (resume.sections.summary ?? [])
    .flatMap((l) => l.split(/(?<=[.;])\s+/))
    .filter((l) => l.length > 20);
  const bm25 = new Bm25(
    [...analyzed.map((a) => a.terms), ...summary.map((l) => analyzeText(l, lex, true).terms)],
    lex.generic,
  );
  const relevant = job.family
    ? monthsWhere(resume, (r) => r.family === job.family)
    : resume.totalMonths;
  return {
    bulletCount: analyzed.length,
    summary,
    job,
    resume,
    lex,
    bm25,
    bulletLead: analyzed.map((a) => leadVerbClasses(a.tokens, lex)),
    bulletVerbs: analyzed.map((a) => verbClasses(a.tokens, lex)),
    totalYears: resume.totalMonths / 12,
    relevantYears: relevant / 12,
  };
}

export const toQuery = (terms: string[]): Query => {
  const q: Query = new Map();
  for (const t of terms) q.set(t, Math.min(2, (q.get(t) ?? 0) + 1));
  return q;
};

const credit = (s: Strength) => CONFIG.strength[s];
const yrs = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '');

/** Best bullet for a skill: recent first, then quantified. */
function bestBulletFor(ctx: Ctx, pred: (i: number) => boolean): number | null {
  let best: number | null = null;
  let bestScore = -1;
  ctx.resume.bullets.forEach((b, i) => {
    if (!pred(i)) return;
    const s = b.recency * 2 + (b.quantified ? 1 : 0);
    if (s > bestScore) [best, bestScore] = [i, s];
  });
  return best;
}

function roleHasDomain(ctx: Ctx, role: Role, id: string): boolean {
  if (ctx.lex.companyIndex.find(role.company).includes(id)) return true;
  if (ctx.lex.domainIndex.find(`${role.company} ${role.title}`).includes(id)) return true;
  return role.bullets.some((b) => ctx.resume.bullets[b]!.domains.includes(id));
}

export function yearsFor(ctx: Ctx, req: Requirement): { used: number; scopeLabel: string | null } {
  const scope = req.years?.scope;
  if (!scope) return { used: ctx.totalYears, scopeLabel: null };
  const months =
    scope.kind === 'family'
      ? monthsWhere(ctx.resume, (r) => r.family === scope.id)
      : scope.kind === 'domain'
        ? monthsWhere(ctx.resume, (r) => roleHasDomain(ctx, r, scope.id))
        : monthsWhere(ctx.resume, (r) =>
            r.bullets.some((b) => ctx.resume.bullets[b]!.skills.includes(scope.id)),
          );
  return { used: months / 12, scopeLabel: scope.label };
}

export function yearsGapScore(gap: number): number {
  for (const g of CONFIG.years.gapScores) if (gap <= g.maxGap) return g.score;
  return CONFIG.years.floorScore;
}

function result(
  r: Requirement,
  strength: Strength,
  evidence: string | null,
  note?: string,
): RequirementResult {
  const out: RequirementResult = { ...r, strength, credit: credit(strength), evidence };
  if (note) out.note = note;
  return out;
}

function matchRequirement(ctx: Ctx, r: Requirement): RequirementResult {
  const { resume, lex } = ctx;
  switch (r.kind) {
    case 'skill': {
      for (const id of r.anyOf) {
        const b = bestBulletFor(ctx, (i) => resume.bullets[i]!.skills.includes(id));
        if (b !== null) return result(r, 'meets', resume.bullets[b]!.text);
      }
      const titled = r.anyOf.find((id) => resume.titleSkills.includes(id));
      if (titled) {
        const role = resume.roles.find(
          (ro) =>
            ro.title &&
            ctx.lex.skillIndex.find(ro.title).concat(familySkills(ro.family)).includes(titled),
        );
        return result(
          r,
          'meets',
          role ? `${role.title}${role.company ? `, ${role.company}` : ''}` : 'Job titles',
        );
      }
      const listed = r.anyOf.find((id) => resume.listedSkills.includes(id));
      if (listed)
        return result(
          r,
          'partial',
          null,
          `${lex.skills.get(listed)?.name ?? listed} is listed but not shown in a role`,
        );
      return result(r, 'missing', null);
    }
    case 'domain': {
      const id = r.anyOf.find((d) => resume.domains.includes(d));
      if (!id) return result(r, 'missing', null);
      const b = bestBulletFor(ctx, (i) => resume.bullets[i]!.domains.includes(id));
      const role = resume.roles.find((ro) => roleHasDomain(ctx, ro, id));
      return result(
        r,
        'meets',
        b !== null
          ? resume.bullets[b]!.text
          : role
            ? `${role.title}${role.company ? `, ${role.company}` : ''}`
            : 'Summary',
      );
    }
    case 'cert': {
      const id = r.anyOf.find((c) => resume.certs.includes(c));
      return id
        ? result(r, 'meets', `${lex.certs.get(id)?.name ?? id} found on resume`)
        : result(r, 'missing', null);
    }
    case 'degree': {
      const spec = r.degree!;
      const best = [...resume.degrees].sort((a, b) => b.level - a.level)[0];
      const equivOk = spec.equivalent && ctx.totalYears >= CONFIG.education.equivalentYears;
      if (!best) {
        return equivOk
          ? result(
              r,
              'meets',
              `${yrs(ctx.totalYears)} years of experience`,
              'Satisfied by equivalent experience',
            )
          : result(r, 'missing', null);
      }
      const wanted = spec.fields.filter((f) => f !== 'quantitative');
      const quantOk =
        spec.fields.includes('quantitative') &&
        best.fields.some((f) => degreesData.quantitativeFields.includes(f));
      const fieldOk =
        !spec.fields.length ||
        quantOk ||
        best.fields.some((f) => wanted.includes(f)) ||
        (/related field|related discipline/i.test(r.source) && best.fields.length > 0);
      if (best.level >= spec.level && fieldOk) return result(r, 'meets', best.line);
      if (best.level >= spec.level)
        return result(r, 'partial', best.line, 'Different field of study');
      if (equivOk) return result(r, 'meets', best.line, 'Satisfied by equivalent experience');
      return best.level === spec.level - 1
        ? result(r, 'partial', best.line, 'One degree level below')
        : result(r, 'missing', best.line);
    }
    case 'years': {
      const { used, scopeLabel } = yearsFor(ctx, r);
      const gap = r.years!.min - used;
      const strength: Strength =
        gap <= 0 ? 'meets' : gap <= CONFIG.years.partialWithin ? 'partial' : 'missing';
      const ev = scopeLabel
        ? `${yrs(used)} yrs in ${scopeLabel} (${yrs(ctx.totalYears)} total)`
        : `${yrs(used)} yrs total`;
      return result(r, strength, ev);
    }
    case 'clause': {
      if (r.verbs) {
        // Soft skills: count bullets whose action shows the behavior.
        const shows = (i: number) => r.verbs!.some((v) => ctx.bulletVerbs[i]!.has(v));
        const hits = resume.bullets.map((_, i) => i).filter(shows);
        const { meets, partial } = CONFIG.softEvidence;
        const strength: Strength =
          hits.length >= meets ? 'meets' : hits.length >= partial ? 'partial' : 'missing';
        const b = bestBulletFor(ctx, shows);
        return result(
          r,
          strength,
          b !== null ? resume.bullets[b]!.text : null,
          strength === 'missing'
            ? undefined
            : `Shown in ${hits.length} bullet${hits.length === 1 ? '' : 's'}`,
        );
      }
      const q = toQuery(r.terms ?? []);
      let best = -1;
      let bestNorm = 0;
      for (let i = 0; i < ctx.bm25.size; i++) {
        const n = ctx.bm25.normalized(q, i);
        if (n > bestNorm) [best, bestNorm] = [i, n];
      }
      if (best < 0) return result(r, 'missing', null);
      const cov = ctx.bm25.coverage(q, best);
      const { meets, partial, minTermCoverage } = CONFIG.clause;
      const fromSummary = best >= ctx.bulletCount;
      let strength: Strength =
        bestNorm >= meets && cov >= minTermCoverage
          ? 'meets'
          : bestNorm >= partial
            ? 'partial'
            : 'missing';
      if (fromSummary && strength === 'meets') strength = 'partial';
      const text = fromSummary ? ctx.summary[best - ctx.bulletCount]! : resume.bullets[best]!.text;
      return result(
        r,
        strength,
        strength === 'missing' ? null : text,
        fromSummary && strength !== 'missing' ? 'Only in your summary' : undefined,
      );
    }
  }
}

export function initialState(ctx: Ctx): State {
  const { resume, job } = ctx;
  const keywords = new Map<string, KeywordState>();
  for (const k of job.keywords) {
    const b = bestBulletFor(ctx, (i) => resume.bullets[i]!.skills.includes(k.id));
    if (b !== null)
      keywords.set(k.id, { status: 'demonstrated', recency: resume.bullets[b]!.recency });
    else if (resume.titleSkills.includes(k.id))
      keywords.set(k.id, { status: 'demonstrated', recency: 1 });
    else if (resume.listedSkills.includes(k.id))
      keywords.set(k.id, { status: 'listed', recency: 1 });
    else keywords.set(k.id, { status: 'missing', recency: 1 });
  }
  // "Python or R": once one alternative is shown, the others aren't gaps.
  for (const r of job.requirements) {
    if (r.kind !== 'skill' || r.anyOf.length < 2) continue;
    const best =
      r.anyOf
        .map((id) => [id, keywords.get(id)] as const)
        .find(([, st]) => st?.status === 'demonstrated') ??
      r.anyOf
        .map((id) => [id, keywords.get(id)] as const)
        .find(([, st]) => st?.status === 'listed');
    if (!best) continue;
    for (const id of r.anyOf) {
      const st = keywords.get(id);
      if (st && st.status === 'missing')
        keywords.set(id, { ...best[1]!, via: ctx.lex.skills.get(best[0])?.name ?? best[0] });
    }
  }
  return {
    reqs: job.requirements.map((r) => matchRequirement(ctx, r)),
    keywords,
    domains: new Set(resume.domains),
  };
}
