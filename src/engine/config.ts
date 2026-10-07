/**
 * Every tunable number in the scoring engine lives here.
 * Lexicons live in ./data/*.json. Changing values here never requires touching logic.
 */
export const CONFIG = {
  /** Weights for the overall score (dims 1–8). Education folds into "required" when specified. */
  weights: {
    required: 0.25,
    keywords: 0.2,
    years: 0.15,
    responsibilities: 0.1,
    seniority: 0.08,
    preferred: 0.08,
    domain: 0.07,
    impact: 0.07,
  },

  strength: { meets: 1, partial: 0.5, missing: 0 },

  /** Requirement weights by kind (before per-bullet normalization). */
  requirementWeight: {
    years: 1.5,
    skill: 1,
    domain: 1,
    degree: 1,
    cert: 1,
    clause: 1,
  },
  /** Soft-skill items ("excellent communication") count at this fraction of a normal item. */
  softSkillWeight: 0.5,
  /** Soft-skill items: bullets showing the behavior needed for Meets / Partial. */
  softEvidence: { meets: 2, partial: 1 },
  /** Skills split from the same bullet share weight: each gets 1/sqrt(n). */
  splitBulletDamping: true,

  /** Clause matching against resume bullets (normalized BM25, 0–1). */
  clause: { meets: 0.55, partial: 0.3, minTermCoverage: 0.5 },

  bm25: { k1: 1.2, b: 0.75, backgroundDocs: 20 },

  keywords: {
    requiredBoost: 1.5,
    listedOnlyCredit: 0.5,
  },

  recency: { recentYears: 5, oldRoleWeight: 0.7 },

  years: {
    /** Score by how many years short of the minimum the resume is. */
    gapScores: [
      { maxGap: 0, score: 100 },
      { maxGap: 1, score: 75 },
      { maxGap: 2, score: 50 },
      { maxGap: 3, score: 25 },
    ],
    floorScore: 10,
    overqualifiedMultiple: 2,
    /** Partial credit in "required" when within this many years. */
    partialWithin: 2,
  },

  seniority: {
    perLevelUnder: 15,
    perLevelOver: 10,
    familyMismatch: 40,
    adjacentFamily: 20,
    adjacentFamilies: [
      ['product', 'design'],
      ['product', 'data'],
      ['product', 'engineering'],
      ['data', 'engineering'],
      ['marketing', 'sales'],
      ['ops', 'finance'],
      ['ops', 'product'],
    ] as [string, string][],
  },

  responsibilities: {
    verbWeight: 0.4,
    objectWeight: 0.6,
    /** Average best-match at which the dimension reads 100. */
    fullCreditAt: 0.6,
    topPairs: 3,
  },

  impact: {
    quantifiedWeight: 70,
    demonstratedWeight: 30,
    /** Share of quantified bullets that earns full quantified credit. */
    quantifiedTarget: 0.6,
  },

  education: {
    /** Total years of experience that satisfy "or equivalent experience". */
    equivalentYears: 4,
  },

  ats: {
    penalties: [
      { below: 40, points: 10 },
      { below: 60, points: 5 },
    ],
    checks: {
      contact: 15,
      headings: 20,
      dates: 15,
      length: 15,
      bullets: 10,
      stuffing: 25,
    },
    minWords: 250,
    maxWords: 1100,
    minBullets: 8,
    maxBullets: 40,
    parseableDateShare: 0.8,
    stuffing: { minCount: 6, rateMultiple: 3, maxSkillItems: 40, maxSkillsWordShare: 0.35 },
  },

  grade: {
    A: { overall: 85, required: 90 },
    B: { overall: 70, required: 75 },
    C: { overall: 50 },
    capAtCIfRequiredBelow: 60,
  },

  labels: [
    { min: 80, label: 'Strong match' },
    { min: 65, label: 'Good match' },
    { min: 45, label: 'Partial match' },
    { min: 0, label: 'Limited match' },
  ] as const,

  fixes: { max: 5, minGain: 0.5 },

  limits: { maxFileBytes: 5 * 1024 * 1024, minPdfChars: 200 },
} as const;
