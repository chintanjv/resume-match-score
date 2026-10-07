import { CONFIG } from '../config';
import type { Dimension, DimensionId, Fix, RequirementResult } from '../types';
import type { Ctx, State } from './match';

/** A unit of evidence the user could add: a skill/domain/cert id, or a specific requirement. */
type Lever =
  | { kind: 'id'; id: string; via: 'skill' | 'domain' | 'cert' }
  | { kind: 'req'; req: RequirementResult };

const HINTS: Record<string, string> = {
  experimentation: 'experimentation results (e.g. an A/B test with its measured lift)',
  sql: 'an analysis you ran in SQL and the decision it drove',
  'product roadmap': 'a roadmap you owned — what you prioritized and what shipped',
  'stakeholder management': 'how you aligned stakeholders on a contested decision',
  'go-to-market': 'a launch you took to market, with adoption or revenue numbers',
  'product analytics': 'a metric you instrumented and moved',
  'user research': 'research you ran and the design decision it changed',
  'design systems': 'a design system contribution and how teams adopted it',
  prototyping: 'a prototype you built and what testing it revealed',
  'machine learning': 'a model you shipped and the metric it improved',
  'large language models': 'an LLM feature you built or shipped, with its quality or usage result',
  'distributed systems': 'a distributed system you designed and the scale it handles',
  'system design': 'an architecture you designed, with its scale or reliability outcome',
  'data visualization': 'a dashboard or visualization and who used it to decide what',
  'stakeholder reporting': 'a report you owned and the decisions it informed',
};

const CATEGORY_ADVICE: Record<string, (n: string) => string> = {
  engineering: (n) => `where you used ${n} — what you built with it and the result`,
  data: (n) => `an analysis or model built with ${n} and the metric or decision it moved`,
  product: (n) => `${n} in practice — what you did and the measurable outcome`,
  design: (n) => `${n} work and its effect on users (link a case study if you can)`,
  marketing: (n) => `a ${n} effort with its results (reach, conversion or CAC)`,
  finance: (n) => `${n} work and the business decision it informed`,
  ops: (n) => `${n} — the process you ran and what improved`,
  tools: (n) => `the work you did in ${n}, inside a role bullet`,
};

function apply(state: State, lever: Lever): State {
  const s: State = {
    reqs: state.reqs.map((r) => ({ ...r })),
    keywords: new Map(state.keywords),
    domains: new Set(state.domains),
  };
  const meet = (r: RequirementResult) => {
    r.strength = 'meets';
    r.credit = CONFIG.strength.meets;
  };
  if (lever.kind === 'req') {
    const r = s.reqs.find((x) => x.id === lever.req.id);
    if (r) meet(r);
    return s;
  }
  for (const r of s.reqs) if (r.anyOf.includes(lever.id)) meet(r);
  if (lever.via === 'skill' && s.keywords.has(lever.id))
    s.keywords.set(lever.id, { status: 'demonstrated', recency: 1 });
  if (lever.via === 'domain') s.domains.add(lever.id);
  return s;
}

function describe(ctx: Ctx, lever: Lever, state: State): { title: string; advice: string } {
  const { lex } = ctx;
  if (lever.kind === 'id') {
    if (lever.via === 'skill') {
      const sk = lex.skills.get(lever.id);
      const name = sk?.name ?? lever.id;
      const listed =
        state.keywords.get(lever.id)?.status === 'listed' ||
        state.reqs.some((r) => r.anyOf.includes(lever.id) && r.strength === 'partial');
      if (listed)
        return {
          title: name,
          advice: `Show ${name} inside a role bullet, not only in your Skills list — say what you did with it`,
        };
      const what =
        HINTS[lever.id] ??
        (CATEGORY_ADVICE[sk?.category ?? 'tools'] ?? CATEGORY_ADVICE.tools!)(name);
      return { title: name, advice: `Add a bullet showing ${what}` };
    }
    if (lever.via === 'domain') {
      const name = lex.domainNames.get(lever.id) ?? lever.id;
      return {
        title: `${name} experience`,
        advice: `Make your ${name.toLowerCase()} exposure explicit — name the product area, customers or company context in a bullet`,
      };
    }
    const name = lex.certs.get(lever.id)?.name ?? lever.id;
    return { title: name, advice: `If you hold ${name}, list it under Certifications` };
  }
  const r = lever.req;
  if (r.kind === 'years') {
    const scope = r.years?.scope?.label;
    return {
      title: r.label,
      advice: `Make your ${scope ?? 'relevant'} tenure visible: give every relevant role clear dates${scope ? ` and name the ${scope} work in its title or bullets` : ''}, and include earlier roles if you trimmed them`,
    };
  }
  if (r.kind === 'degree') {
    return {
      title: r.label,
      advice: `State your degree and field clearly under Education${r.degree?.equivalent ? ', or call out the equivalent experience the posting allows' : ''}`,
    };
  }
  return {
    title: r.label,
    advice: `Add a bullet that speaks directly to “${r.label.replace(/[.…]$/, '')}”, with a concrete result`,
  };
}

const SHORT: Partial<Record<DimensionId, string>> = {
  required: 'Required',
  keywords: 'Keywords',
  preferred: 'Preferred',
  years: 'Years',
  domain: 'Domain',
  impact: 'Impact',
  education: 'Education',
};

export function topFixes(
  ctx: Ctx,
  base: State,
  scoreState: (s: State) => { overall: number; dims: Dimension[] },
): Fix[] {
  const levers: Lever[] = [];
  const seen = new Set<string>();
  const push = (key: string, l: Lever) => {
    if (!seen.has(key)) {
      seen.add(key);
      levers.push(l);
    }
  };
  for (const r of base.reqs) {
    if (r.strength === 'meets') continue;
    if (r.kind === 'skill') push(`k:${r.anyOf[0]}`, { kind: 'id', id: r.anyOf[0]!, via: 'skill' });
    else if (r.kind === 'domain')
      push(`d:${r.anyOf[0]}`, { kind: 'id', id: r.anyOf[0]!, via: 'domain' });
    else if (r.kind === 'cert')
      push(`c:${r.anyOf[0]}`, { kind: 'id', id: r.anyOf[0]!, via: 'cert' });
    else push(`r:${r.id}`, { kind: 'req', req: r });
  }
  // Alternatives inside an unmet "any of" item are the same fix; keep only its first option.
  const alternates = new Set(
    base.reqs.filter((r) => r.strength !== 'meets').flatMap((r) => r.anyOf.slice(1)),
  );
  for (const [id, st] of base.keywords) {
    if (st.status !== 'demonstrated' && !alternates.has(id))
      push(`k:${id}`, { kind: 'id', id, via: 'skill' });
  }

  const before = scoreState(base);
  const beforeDims = new Map(before.dims.map((d) => [d.id, d.score ?? 0]));
  const fixes: Fix[] = [];
  for (const lever of levers) {
    const after = scoreState(apply(base, lever));
    const gain = after.overall - before.overall;
    if (gain < CONFIG.fixes.minGain) continue;
    const lifts = after.dims
      .map((d) => ({
        dimension: SHORT[d.id] ?? d.name,
        delta: Math.round((d.score ?? 0) - (beforeDims.get(d.id) ?? 0)),
      }))
      .filter((l) => l.delta >= 1)
      .sort((a, b) => b.delta - a.delta);
    const { title, advice } = describe(ctx, lever, base);
    fixes.push({ title, advice, gain: Math.round(gain * 10) / 10, lifts });
  }
  return fixes.sort((a, b) => b.gain - a.gain).slice(0, CONFIG.fixes.max);
}
