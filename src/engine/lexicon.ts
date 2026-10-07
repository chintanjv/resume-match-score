import skillsData from './data/skills.json';
import domainsData from './data/domains.json';
import certsData from './data/certs.json';
import stopData from './data/stopwords.json';
import verbsData from './data/verbs.json';
import { AliasIndex } from './nlp/aliasIndex';
import { stem } from './nlp/stem';

interface SkillRow {
  n: string;
  c: string;
  a?: string[];
  p?: string;
  f?: string;
}
interface DomainRow {
  n: string;
  a: string[];
  co: string[];
}
interface CertRow {
  n: string;
  a: string[];
  license?: boolean;
}

interface Skill {
  id: string;
  name: string;
  category: string;
  /** Transitive parents: having this skill implies these. */
  implies: string[];
  aliases: string[];
}

export interface Lexicon {
  skills: Map<string, Skill>;
  skillIndex: AliasIndex;
  domainNames: Map<string, string>;
  domainIndex: AliasIndex;
  companyIndex: AliasIndex;
  certs: Map<string, { name: string; license: boolean }>;
  certIndex: AliasIndex;
  stop: Set<string>;
  generic: Set<string>;
  /** Stemmed verb → verb classes. */
  verbClasses: Map<string, string[]>;
}

const skillId = (name: string): string => name.toLowerCase();

let cached: Lexicon | null = null;

/** Builds (once) every phrase index the engine needs. ~10 ms on a laptop. */
export function lexicon(): Lexicon {
  if (cached) return cached;

  const rows = skillsData as SkillRow[];
  const skills = new Map<string, Skill>();
  const skillIndex = new AliasIndex();
  for (const r of rows) {
    const id = skillId(r.n);
    skills.set(id, { id, name: r.n, category: r.c, implies: [], aliases: r.a ?? [] });
    const flags = r.f?.split(',') ?? [];
    skillIndex.add({
      id,
      phrases: [r.n, ...(r.a ?? [])],
      caseSensitive: flags.includes('cs'),
      needsContext: flags.includes('ctx'),
    });
    if (r.c === 'engineering' || r.c === 'data') skillIndex.contextIds.add(id);
  }
  // "p" holds one or more parents ("SQL;Data warehousing"); having a skill implies its ancestors.
  const parentsOf = new Map(
    rows.map((r) => [skillId(r.n), (r.p ?? '').split(';').filter(Boolean).map(skillId)]),
  );
  for (const id of skills.keys()) {
    const implies: string[] = [];
    const queue = [...(parentsOf.get(id) ?? [])];
    while (queue.length && implies.length < 8) {
      const pid = queue.shift()!;
      if (implies.includes(pid) || !skills.has(pid)) continue;
      implies.push(pid);
      queue.push(...(parentsOf.get(pid) ?? []));
    }
    skills.get(id)!.implies = implies;
  }

  const domainNames = new Map<string, string>();
  const domainIndex = new AliasIndex();
  const companyIndex = new AliasIndex();
  for (const d of domainsData as DomainRow[]) {
    const id = d.n.toLowerCase();
    domainNames.set(id, d.n);
    domainIndex.add({ id, phrases: d.a });
    companyIndex.add({ id, phrases: d.co });
  }

  const certs = new Map<string, { name: string; license: boolean }>();
  const certIndex = new AliasIndex();
  for (const c of certsData as CertRow[]) {
    const id = c.n.toLowerCase();
    certs.set(id, { name: c.n, license: !!c.license });
    certIndex.add({ id, phrases: [c.n, ...c.a] });
  }

  const verbClasses = new Map<string, string[]>();
  for (const [cls, verbs] of Object.entries(verbsData as Record<string, string[]>)) {
    for (const v of verbs) {
      const s = stem(v.toLowerCase());
      const list = verbClasses.get(s) ?? [];
      if (!list.includes(cls)) list.push(cls);
      verbClasses.set(s, list);
    }
  }

  cached = {
    skills,
    skillIndex,
    domainNames,
    domainIndex,
    companyIndex,
    certs,
    certIndex,
    stop: new Set(stopData.stopwords),
    generic: new Set(stopData.generic.map((w) => stem(w))),
    verbClasses,
  };
  return cached;
}
