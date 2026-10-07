import type { Report } from '../engine/types';
import type { Preview, WorkerRequest, WorkerResponse } from './protocol';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };
type Body<T> = T extends unknown ? Omit<T, 'id'> : never;

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

function ensure(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./analyze.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.ok) p.resolve(e.data.result);
    else p.reject(new Error(e.data.error));
  };
  return worker;
}

function call<T>(body: Body<WorkerRequest>): Promise<T> {
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    ensure().postMessage({ ...body, id } as WorkerRequest);
  });
}

/** Start the worker and build the taxonomy index ahead of the first analysis. */
export const warm = (): Promise<null> => call({ type: 'warm' });
export const preview = (jobText: string): Promise<Preview> => call({ type: 'preview', jobText });
export const analyzeInWorker = (
  jobText: string,
  resumeText: string,
  overrides: Record<string, boolean>,
): Promise<Report> => call({ type: 'analyze', jobText, resumeText, overrides });
