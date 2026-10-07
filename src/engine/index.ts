import { lexicon } from './lexicon';
import { parseJob } from './jd';
import { parseResume } from './resume';
import { currentMonth } from './resume/dates';
import { atsDim } from './score/ats';
import {
  domainDim,
  educationDim,
  impactDim,
  keywordsDim,
  responsibilitiesDim,
  seniorityDim,
  tierDim,
  yearsDim,
} from './score/dimensions';
import { topFixes } from './score/fixes';
import { knockouts } from './score/knockouts';
import { buildCtx, initialState, type Ctx, type State } from './score/match';
import { gradeOf, labelOf, weightedOverall } from './score/overall';
import type {
  AnalyzeOptions,
  Dimension,
  KeywordChip,
  ParsedJob,
  ParsedResume,
  Report,
} from './types';

export { parseJob } from './jd';
export { parseResume } from './resume';

/** Dimensions that depend only on inputs, not on the (fixable) match state. */
interface FixedDims {
  seniority: Dimension;
  responsibilities: Dimension;
}

function scoreState(ctx: Ctx, fixed: FixedDims, ats: number, s: State) {
  const dims: Dimension[] = [
    tierDim('required', s, 'required'),
    keywordsDim(ctx, s),
    yearsDim(ctx, s),
    fixed.responsibilities,
    fixed.seniority,
    tierDim('preferred', s, 'preferred'),
    domainDim(ctx, s),
    impactDim(ctx, s),
    educationDim(s),
  ].map((d) => ({ ...d }));
  return { overall: weightedOverall(dims, ats), dims };
}

function keywordChips(ctx: Ctx, s: State): KeywordChip[] {
  const { lex, job, resume } = ctx;
  return job.keywords
    .map((k) => {
      const st = s.keywords.get(k.id)!;
      const chip: KeywordChip = {
        id: k.id,
        name: lex.skills.get(k.id)?.name ?? k.id,
        required: k.required,
        status: st.status,
      };
      if (st.via) chip.via = st.via;
      else if (st.status === 'demonstrated') {
        // Matched through a more specific skill (e.g. SQL via PostgreSQL)?
        const direct = resume.bullets.some(
          (b) => b.skills.includes(k.id) && lex.skillIndex.find(b.text).includes(k.id),
        );
        if (!direct) {
          const child = resume.allSkills.find((c) => lex.skills.get(c)?.implies.includes(k.id));
          if (child) chip.via = lex.skills.get(child)?.name ?? child;
        }
      }
      return { chip, w: (k.required ? 2 : 1) * k.tf };
    })
    .sort((a, b) => b.w - a.w)
    .map((x) => x.chip);
}

function verdictOf(report: Pick<Report, 'label' | 'requirements' | 'fixes'>): string {
  const req = report.requirements.filter((r) => r.tier === 'required');
  const met = req.filter((r) => r.strength === 'meets').length;
  const part = req.filter((r) => r.strength === 'partial').length;
  const base = req.length
    ? `${report.label}: you meet ${met} of ${req.length} required qualifications${part ? ` and partly meet ${part} more` : ''}`
    : `${report.label}`;
  const gap = report.fixes[0];
  const lower = (t: string) => (/^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);
  return gap ? `${base}. The biggest lift: ${lower(gap.title)}.` : `${base}.`;
}

export function analyzeParsed(job: ParsedJob, resume: ParsedResume): Report {
  const lex = lexicon();
  const ctx = buildCtx(job, resume, lex);
  const state = initialState(ctx);
  const fixed: FixedDims = {
    seniority: seniorityDim(ctx),
    responsibilities: responsibilitiesDim(ctx),
  };
  const ats = atsDim(ctx);
  const { overall, dims } = scoreState(ctx, fixed, ats.score ?? 100, state);
  const fixes = topFixes(ctx, state, (s) => scoreState(ctx, fixed, ats.score ?? 100, s));
  const requiredScore = dims.find((d) => d.id === 'required')?.score ?? null;
  const label = labelOf(overall);
  const order = [
    'keywords',
    'required',
    'preferred',
    'years',
    'seniority',
    'domain',
    'responsibilities',
    'impact',
    'education',
  ];
  const partial = { label, requirements: state.reqs, fixes };

  return {
    overall: Math.round(overall),
    grade: gradeOf(overall, requiredScore),
    label,
    verdict: verdictOf(partial),
    dimensions: order.map((id) => dims.find((d) => d.id === id)!),
    ats,
    knockouts: knockouts(ctx),
    requirements: state.reqs,
    keywords: keywordChips(ctx, state),
    fixes,
    job: {
      title: job.title,
      family: job.family,
      meta: job.meta,
      blocks: job.blocks.map((b) => ({
        id: b.id,
        label: b.label,
        disposition: b.disposition,
        included: b.included,
        heading: b.heading,
        preview: (b.lines.map((l) => l.text).join(' ') || b.heading || '').slice(0, 400),
      })),
    },
  };
}

/** Score a resume against a job posting. Pure and deterministic for a given `now`. */
export function analyze(jobText: string, resumeText: string, opts: AnalyzeOptions = {}): Report {
  const now = opts.now ?? currentMonth();
  return analyzeParsed(parseJob(jobText, opts.overrides), parseResume(resumeText, now));
}
