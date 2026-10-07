import type { Report } from '../engine/types';

export interface Preview {
  title: string | null;
  requirements: number;
}

export type WorkerRequest =
  | { id: number; type: 'warm' }
  | { id: number; type: 'preview'; jobText: string }
  | {
      id: number;
      type: 'analyze';
      jobText: string;
      resumeText: string;
      overrides: Record<string, boolean>;
    };

export type WorkerResponse =
  | { id: number; ok: true; result: Report | Preview | null }
  | { id: number; ok: false; error: string };
