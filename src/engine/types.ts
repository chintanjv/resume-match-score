export type BlockLabel =
  | 'title'
  | 'role_summary'
  | 'responsibilities'
  | 'required_qualifications'
  | 'preferred_qualifications'
  | 'location'
  | 'work_arrangement'
  | 'salary'
  | 'employment_type'
  | 'about_company'
  | 'mission_values'
  | 'benefits'
  | 'eeo_legal'
  | 'accommodations'
  | 'how_to_apply'
  | 'privacy_notice'
  | 'boilerplate';

export type Disposition = 'keep' | 'extract' | 'drop';

export interface Line {
  text: string;
  bullet: boolean;
}

export interface Block {
  id: string;
  heading: string | null;
  lines: Line[];
  label: BlockLabel;
  disposition: Disposition;
  /** Whether the block feeds scoring (keep blocks by default, or a user override). */
  included: boolean;
}

export type Tier = 'required' | 'preferred';
type ReqKind = 'years' | 'skill' | 'domain' | 'degree' | 'cert' | 'clause';
export type Strength = 'meets' | 'partial' | 'missing';

export interface YearsSpec {
  min: number;
  max: number | null;
  /** What the years must be in: a function family, a domain id, a skill id, or nothing. */
  scope: { kind: 'family' | 'domain' | 'skill'; id: string; label: string } | null;
}

export interface DegreeSpec {
  level: number;
  fields: string[];
  equivalent: boolean;
}

export interface Requirement {
  id: string;
  kind: ReqKind;
  tier: Tier;
  /** The JD line this item came from. */
  source: string;
  /** Short display label, e.g. "SQL or Python". */
  label: string;
  /** Canonical ids (skills, domains, certs); any one satisfies the requirement. */
  anyOf: string[];
  years?: YearsSpec;
  degree?: DegreeSpec;
  /** Content terms for clause matching. */
  terms?: string[];
  /** Soft-skill items: verb classes that count as evidence (e.g. "communicate"). */
  verbs?: string[];
  weight: number;
}

export interface RequirementResult extends Requirement {
  strength: Strength;
  /** 0–1 credit used in coverage (strength value, or graded years score). */
  credit: number;
  evidence: string | null;
  note?: string;
}

export interface JobMeta {
  location: string | null;
  arrangement: 'remote' | 'hybrid' | 'onsite' | null;
  salary: string | null;
  employmentType: string | null;
}

export interface ParsedJob {
  blocks: Block[];
  title: string | null;
  family: string | null;
  level: number | null;
  requirements: Requirement[];
  responsibilities: string[];
  /** Skill id → weighted frequency info across kept blocks. */
  keywords: { id: string; tf: number; required: boolean }[];
  domains: { id: string; weight: number }[];
  meta: JobMeta;
  /** Normalized full text, used only for knockout scanning. */
  fullText: string;
  wordCount: number;
}

export type ResumeSection =
  | 'contact'
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'certifications'
  | 'other';

export interface Role {
  title: string;
  company: string;
  start: number | null; // month index (year*12 + month)
  end: number | null;
  family: string | null;
  level: number | null;
  bullets: number[]; // indexes into ParsedResume.bullets
}

export interface Bullet {
  text: string;
  recency: number; // 1.0 or 0.7
  quantified: boolean;
  skills: string[]; // matched skill ids incl. implied parents
  domains: string[];
}

export interface ParsedResume {
  text: string;
  sections: Partial<Record<ResumeSection, string[]>>;
  headingsFound: ResumeSection[];
  roles: Role[];
  /** Role headers whose dates could not be parsed. */
  undatedRoles: number;
  bullets: Bullet[];
  listedSkills: string[];
  /** Skills evidenced by job titles ("Data Analyst" → data analysis). */
  titleSkills: string[];
  allSkills: string[];
  domains: string[];
  certs: string[];
  degrees: { level: number; fields: string[]; line: string }[];
  totalMonths: number;
  contact: { email: boolean; phone: boolean; location: string | null };
  wordCount: number;
  skillsSectionItems: number;
  skillsSectionWords: number;
}

export type DimensionId =
  | 'keywords'
  | 'required'
  | 'preferred'
  | 'years'
  | 'seniority'
  | 'domain'
  | 'responsibilities'
  | 'impact'
  | 'education'
  | 'ats';

export interface Evidence {
  label: string;
  detail?: string;
  strength?: Strength;
}

export interface Dimension {
  id: DimensionId;
  name: string;
  /** 0–100, or null when not applicable. */
  score: number | null;
  /** Effective weight in the overall score after renormalization (0 when N/A or unweighted). */
  weight: number;
  why: string;
  evidence: Evidence[];
  notes: string[];
}

export interface AtsCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface Knockout {
  id: 'location' | 'authorization' | 'clearance' | 'license';
  message: string;
}

export interface KeywordChip {
  id: string;
  name: string;
  required: boolean;
  status: 'demonstrated' | 'listed' | 'missing';
  via?: string;
}

export interface Fix {
  title: string;
  advice: string;
  gain: number;
  lifts: { dimension: string; delta: number }[];
}

export type Grade = 'A' | 'B' | 'C' | 'D';
export type MatchLabel = 'Strong match' | 'Good match' | 'Partial match' | 'Limited match';

export interface BlockSummary {
  id: string;
  label: BlockLabel;
  disposition: Disposition;
  included: boolean;
  heading: string | null;
  preview: string;
}

export interface Report {
  overall: number;
  grade: Grade;
  label: MatchLabel;
  verdict: string;
  dimensions: Dimension[];
  ats: Dimension & { checks: AtsCheck[] };
  knockouts: Knockout[];
  requirements: RequirementResult[];
  keywords: KeywordChip[];
  fixes: Fix[];
  job: {
    title: string | null;
    family: string | null;
    meta: JobMeta;
    blocks: BlockSummary[];
  };
}

export interface AnalyzeOptions {
  /** Block id → include (true) / exclude (false). */
  overrides?: Record<string, boolean>;
  /** Month index used for "Present"; defaults to the current month. */
  now?: number;
}
