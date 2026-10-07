import { CONFIG } from '../config';
import { LEVEL_NAMES } from '../titles';
import { analyzeText, leadVerbClasses } from '../terms';
import type { Dimension, DimensionId, Evidence, RequirementResult, Role, Tier } from '../types';
import { toQuery, yearsFor, yearsGapScore, type Ctx, type State } from './match';

const NAMES: Record<DimensionId, string> = {
  keywords: 'Keyword match',
  required: 'Required qualifications',
  preferred: 'Preferred qualifications',
  years: 'Years of experience',
  seniority: 'Seniority & title fit',
  domain: 'Domain match',
  responsibilities: 'Responsibilities alignment',
  impact: 'Impact & evidence',
  education: 'Education & certifications',
  ats: 'ATS readability',
};

export function dim(
  id: DimensionId,
  score: number | null,
  why: string,
  evidence: Evidence[] = [],
  notes: string[] = [],
): Dimension {
  return {
    id,
    name: NAMES[id],
    score: score === null ? null : Math.round(Math.max(0, Math.min(100, score))),
    weight: 0,
    why,
    evidence,
    notes,
  };
}

const pct = (n: number, d: number) => (d > 0 ? (100 * n) / d : 0);
const yrs = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '');

// ---- 1. Keywords --------------------------------------------------------------------------

function keywordWeight(tf: number, required: boolean): number {
  return (1 + Math.log(tf)) * (required ? CONFIG.keywords.requiredBoost : 1);
}

export function keywordsDim(ctx: Ctx, s: State): Dimension {
  const kws = ctx.job.keywords;
  if (!kws.length)
    return dim('keywords', null, 'The posting names no specific tools or hard skills.');
  let num = 0;
  let den = 0;
  let demo = 0;
  let listed = 0;
  for (const k of kws) {
    const w = keywordWeight(k.tf, k.required);
    const st = s.keywords.get(k.id)!;
    const m =
      st.status === 'demonstrated'
        ? st.recency
        : st.status === 'listed'
          ? CONFIG.keywords.listedOnlyCredit
          : 0;
    num += w * m;
    den += w;
    if (st.status === 'demonstrated') demo++;
    if (st.status === 'listed') listed++;
  }
  const missing = kws.length - demo - listed;
  const why = `${demo} of ${kws.length} skills shown in your experience${listed ? `, ${listed} only listed` : ''}${missing ? `, ${missing} missing` : ''}.`;
  return dim('keywords', pct(num, den), why);
}

// ---- 2/3/9. Requirement coverage ---------------------------------------------------------

function coverage(reqs: RequirementResult[]): number | null {
  const den = reqs.reduce((a, r) => a + r.weight, 0);
  return den
    ? pct(
        reqs.reduce((a, r) => a + r.weight * r.credit, 0),
        den,
      )
    : null;
}

const reqEvidence = (reqs: RequirementResult[]): Evidence[] =>
  reqs.map((r) => ({
    label: r.label,
    detail: r.evidence ?? r.note ?? 'No matching line found',
    strength: r.strength,
  }));

export function tierDim(id: 'required' | 'preferred', s: State, tier: Tier): Dimension {
  const reqs = s.reqs.filter((r) => r.tier === tier);
  const score = coverage(reqs);
  if (score === null) {
    return dim(
      id,
      null,
      tier === 'required'
        ? 'No qualifications found in the posting.'
        : 'The posting lists no preferred qualifications.',
    );
  }
  const meets = reqs.filter((r) => r.strength === 'meets').length;
  const partial = reqs.filter((r) => r.strength === 'partial').length;
  return dim(
    id,
    score,
    `Meets ${meets} of ${reqs.length}${partial ? `, partially ${partial}` : ''}.`,
    reqEvidence(reqs),
  );
}

export function educationDim(s: State): Dimension {
  const reqs = s.reqs.filter((r) => r.kind === 'degree' || r.kind === 'cert');
  const score = coverage(reqs);
  if (score === null)
    return dim('education', null, 'The posting specifies no degree or certification.');
  const met = reqs.filter((r) => r.strength === 'meets').length;
  return dim(
    'education',
    score,
    `${met} of ${reqs.length} education/certification items met. Counted within Required.`,
    reqEvidence(reqs),
  );
}

// ---- 4. Years ------------------------------------------------------------------------------

export function yearsDim(ctx: Ctx, s: State): Dimension {
  const reqs = s.reqs.filter((r) => r.kind === 'years');
  const ev: Evidence[] = [
    {
      label: 'Total experience',
      detail: `${yrs(ctx.totalYears)} years across ${ctx.resume.roles.length} dated roles`,
    },
  ];
  if (ctx.job.family)
    ev.push({
      label: `Relevant (${ctx.job.family}) experience`,
      detail: `${yrs(ctx.relevantYears)} years`,
    });
  if (!reqs.length) return dim('years', null, 'The posting states no years requirement.', ev);

  let num = 0;
  let den = 0;
  const notes: string[] = [];
  let primary = '';
  for (const r of reqs) {
    const w = r.tier === 'required' ? 1 : 0.5;
    // A fix may mark the requirement as met; otherwise grade by the gap.
    const { used } = yearsFor(ctx, r);
    const score = r.strength === 'meets' ? 100 : yearsGapScore(r.years!.min - used);
    num += w * score;
    den += w;
    ev.push({ label: r.label, detail: `You have ${yrs(used)}`, strength: r.strength });
    if (!primary) primary = `${r.label} asked; you have ${yrs(used)}.`;
    const max = r.years!.max;
    if (max && used > max * CONFIG.years.overqualifiedMultiple) {
      notes.push(
        `At ${yrs(used)} years against a ${r.years!.min}–${max} year range, this may read as overqualified.`,
      );
    }
  }
  return dim('years', num / den, primary, ev, notes);
}

// ---- 5. Seniority --------------------------------------------------------------------------

function adjacent(a: string, b: string): boolean {
  return CONFIG.seniority.adjacentFamilies.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a),
  );
}

function currentRole(roles: Role[]): Role | undefined {
  return [...roles].sort(
    (a, b) => (b.end ?? 0) - (a.end ?? 0) || (b.start ?? 0) - (a.start ?? 0),
  )[0];
}

export function seniorityDim(ctx: Ctx): Dimension {
  const { job, resume } = ctx;
  const cur = currentRole(resume.roles);
  if (!job.title || job.level === null)
    return dim('seniority', null, 'Could not find a job title in the posting.');
  if (!cur) return dim('seniority', null, 'Could not read job titles from your resume.');
  const S = CONFIG.seniority;
  const gap = job.level - (cur.level ?? 2);
  let score = 100 - (gap > 0 ? S.perLevelUnder * gap : S.perLevelOver * -gap);
  let famNote = 'same function';
  if (job.family && cur.family !== job.family) {
    const recentSame = resume.roles.some(
      (r) => r.family === job.family && (r.end ?? 0) >= (cur.end ?? 0) - 60,
    );
    if (recentSame) {
      score -= 10;
      famNote = `recent ${job.family} experience`;
    } else if (cur.family && adjacent(cur.family, job.family)) {
      score -= S.adjacentFamily;
      famNote = `adjacent function (${cur.family})`;
    } else {
      score -= S.familyMismatch;
      famNote = cur.family ? `different function (${cur.family})` : 'function unclear';
    }
  }
  const jl = LEVEL_NAMES[job.level] ?? '';
  const rl = LEVEL_NAMES[cur.level ?? 2] ?? '';
  const why =
    gap === 0
      ? `${rl} to ${jl}, ${famNote}.`
      : `${rl} → ${jl} (${Math.abs(gap)} level${Math.abs(gap) > 1 ? 's' : ''} ${gap > 0 ? 'up' : 'down'}), ${famNote}.`;
  return dim('seniority', score, why, [
    { label: 'Posting', detail: `${job.title} · ${jl}${job.family ? ` · ${job.family}` : ''}` },
    {
      label: 'Your latest',
      detail: `${cur.title || 'Untitled role'} · ${rl}${cur.family ? ` · ${cur.family}` : ''}`,
    },
  ]);
}

// ---- 6. Domain -----------------------------------------------------------------------------

export function domainDim(ctx: Ctx, s: State): Dimension {
  const weights = new Map(ctx.job.domains.map((d) => [d.id, d.weight]));
  for (const r of s.reqs)
    if (r.kind === 'domain') for (const id of r.anyOf) weights.set(id, (weights.get(id) ?? 0) + 1);
  if (!weights.size) return dim('domain', null, 'The posting names no specific industry.');
  let num = 0;
  let den = 0;
  const ev: Evidence[] = [];
  for (const [id, w] of weights) {
    const has = s.domains.has(id);
    num += has ? w : 0;
    den += w;
    ev.push({
      label: ctx.lex.domainNames.get(id) ?? id,
      detail: has ? 'Found in your experience' : 'Not found',
      strength: has ? 'meets' : 'missing',
    });
  }
  ev.sort(
    (a, b) => (weights.get(b.label.toLowerCase()) ?? 0) - (weights.get(a.label.toLowerCase()) ?? 0),
  );
  const hit = ev.filter((e) => e.strength === 'meets').map((e) => e.label);
  const why = hit.length
    ? `Your background covers ${hit.slice(0, 2).join(' and ')}.`
    : `No ${ev
        .slice(0, 2)
        .map((e) => e.label)
        .join(' or ')} experience found.`;
  return dim('domain', pct(num, den), why, ev);
}

// ---- 7. Responsibilities ------------------------------------------------------------------

export function responsibilitiesDim(ctx: Ctx): Dimension {
  const resps = ctx.job.responsibilities;
  if (!resps.length) return dim('responsibilities', null, 'No responsibilities section found.');
  if (!ctx.resume.bullets.length)
    return dim('responsibilities', 0, 'No experience bullets found to compare.');
  const { verbWeight, objectWeight, fullCreditAt, topPairs } = CONFIG.responsibilities;
  const pairs: { resp: string; bullet: string; score: number }[] = [];
  for (const resp of resps) {
    const a = analyzeText(resp, ctx.lex);
    const classes = leadVerbClasses(a.tokens, ctx.lex);
    const leadStems = new Set(a.tokens.slice(0, 2).map((t) => t.stem));
    const q = toQuery(a.terms.filter((t) => !leadStems.has(t)));
    let best = { i: -1, score: 0 };
    for (let i = 0; i < ctx.bulletCount; i++) {
      const lead = [...classes].some((c) => ctx.bulletLead[i]!.has(c));
      const anyVerb = lead || [...classes].some((c) => ctx.bulletVerbs[i]!.has(c));
      const v = lead ? 1 : anyVerb ? 0.5 : 0;
      const o = q.size ? ctx.bm25.normalized(q, i) : 0;
      const score = verbWeight * v + objectWeight * o;
      if (score > best.score) best = { i, score };
    }
    pairs.push({
      resp,
      bullet: best.i >= 0 ? ctx.resume.bullets[best.i]!.text : '',
      score: best.score,
    });
  }
  const avg = pairs.reduce((a, p) => a + p.score, 0) / pairs.length;
  const top = [...pairs]
    .sort((a, b) => b.score - a.score)
    .slice(0, topPairs)
    .filter((p) => p.bullet);
  const strong = pairs.filter((p) => p.score >= fullCreditAt).length;
  const ev: Evidence[] = top.map((p) => ({
    label: p.resp,
    detail: p.bullet,
    strength:
      p.score >= fullCreditAt ? 'meets' : p.score >= fullCreditAt / 2 ? 'partial' : 'missing',
  }));
  const weakest = [...pairs].sort((a, b) => a.score - b.score)[0];
  if (weakest && weakest.score < fullCreditAt / 2)
    ev.push({ label: weakest.resp, detail: 'Least covered responsibility', strength: 'missing' });
  return dim(
    'responsibilities',
    100 * Math.min(1, avg / fullCreditAt),
    `${strong} of ${pairs.length} responsibilities closely mirrored by your bullets.`,
    ev,
  );
}

// ---- 8. Impact -----------------------------------------------------------------------------

export function impactDim(ctx: Ctx, s: State): Dimension {
  const bullets = ctx.resume.bullets;
  if (!bullets.length) return dim('impact', 0, 'No experience bullets found.');
  const { quantifiedWeight, demonstratedWeight, quantifiedTarget } = CONFIG.impact;
  let qn = 0;
  let qd = 0;
  for (const b of bullets) {
    qn += b.quantified ? b.recency : 0;
    qd += b.recency;
  }
  const share = qd ? qn / qd : 0;
  const qScore = Math.min(1, share / quantifiedTarget);
  let demo = 0;
  let matched = 0;
  for (const st of s.keywords.values()) {
    if (st.status !== 'missing') matched++;
    if (st.status === 'demonstrated') demo++;
  }
  const dShare = matched ? demo / matched : qScore;
  const score = quantifiedWeight * qScore + demonstratedWeight * dShare;
  const nQuant = bullets.filter((b) => b.quantified).length;
  const listedOnly = [...s.keywords]
    .filter(([, v]) => v.status === 'listed')
    .map(([id]) => ctx.lex.skills.get(id)?.name ?? id);
  const ev: Evidence[] = [
    {
      label: 'Quantified bullets',
      detail: `${nQuant} of ${bullets.length} (${Math.round(share * 100)}%, recency-weighted)`,
    },
    {
      label: 'Skills demonstrated vs only listed',
      detail: matched
        ? `${demo} demonstrated, ${matched - demo} listed only`
        : 'No posting skills found on resume',
    },
  ];
  if (listedOnly.length)
    ev.push({
      label: 'Listed only',
      detail: listedOnly.slice(0, 8).join(', '),
      strength: 'partial',
    });
  return dim(
    'impact',
    score,
    `${Math.round(share * 100)}% of bullets show a measurable result.`,
    ev,
  );
}
