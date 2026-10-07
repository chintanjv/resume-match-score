/// <reference lib="webworker" />
import { analyzeParsed, parseJob, parseResume } from '../engine';
import { lexicon } from '../engine/lexicon';
import type { ParsedResume } from '../engine/types';
import type { WorkerRequest, WorkerResponse } from './protocol';

let lastResume: { text: string; parsed: ParsedResume } | null = null;

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  let res: WorkerResponse;
  try {
    if (msg.type === 'warm') {
      lexicon();
      res = { id: msg.id, ok: true, result: null };
    } else if (msg.type === 'preview') {
      const job = parseJob(msg.jobText);
      res = {
        id: msg.id,
        ok: true,
        result: { title: job.title, requirements: job.requirements.length },
      };
    } else {
      // Block toggles re-run with the same resume: reuse its parse.
      if (lastResume?.text !== msg.resumeText)
        lastResume = { text: msg.resumeText, parsed: parseResume(msg.resumeText) };
      res = {
        id: msg.id,
        ok: true,
        result: analyzeParsed(parseJob(msg.jobText, msg.overrides), lastResume.parsed),
      };
    }
  } catch (err) {
    res = { id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(res);
};
