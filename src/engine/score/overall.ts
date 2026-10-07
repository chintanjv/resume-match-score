import { CONFIG } from '../config';
import type { Dimension, Grade, MatchLabel } from '../types';

type Weighted = keyof typeof CONFIG.weights;

/** Renormalize weights over applicable dimensions and return the weighted mean. */
export function weightedOverall(dims: Dimension[], atsScore: number): number {
  const applicable = dims.filter((d) => d.score !== null && d.id in CONFIG.weights);
  const total = applicable.reduce((a, d) => a + CONFIG.weights[d.id as Weighted], 0);
  for (const d of dims)
    d.weight =
      d.score !== null && d.id in CONFIG.weights && total
        ? CONFIG.weights[d.id as Weighted] / total
        : 0;
  let overall = applicable.reduce((a, d) => a + d.weight * d.score!, 0);
  const penalty = CONFIG.ats.penalties.find((p) => atsScore < p.below);
  if (penalty) overall -= penalty.points;
  return Math.max(0, Math.min(100, overall));
}

export function gradeOf(overall: number, required: number | null): Grade {
  const G = CONFIG.grade;
  const req = required ?? 100;
  let grade: Grade =
    overall >= G.A.overall && req >= G.A.required
      ? 'A'
      : overall >= G.B.overall && req >= G.B.required
        ? 'B'
        : overall >= G.C.overall
          ? 'C'
          : 'D';
  if (req < G.capAtCIfRequiredBelow && (grade === 'A' || grade === 'B')) grade = 'C';
  return grade;
}

export function labelOf(overall: number): MatchLabel {
  return CONFIG.labels.find((l) => overall >= l.min)!.label;
}
