import type { Report } from '../engine/types';
import { analyzeInWorker } from '../workers/client';
import { copyText, reportText } from './clipboard';
import { $ } from './dom';
import { wireDropzone, type ResumeState } from './dropzone';
import { wireJobInput } from './input';
import { reducedMotion } from './motion';
import { announce, renderResults } from './results';

interface State {
  jobText: string;
  resume: ResumeState | null;
  overrides: Record<string, boolean>;
  report: Report | null;
  busy: boolean;
}

export function mountApp(): void {
  const state: State = { jobText: '', resume: null, overrides: {}, report: null, busy: false };
  const field = $<HTMLTextAreaElement>('#job');
  const button = $<HTMLButtonElement>('#analyze');
  const results = $('#results');
  const resultActions = $('#result-actions');
  const copyBtn = $<HTMLButtonElement>('#copy');
  const live = $('#live');

  const ready = () => state.jobText.trim().length > 0 && !!state.resume;
  const sync = () => {
    button.disabled = !ready() || state.busy;
    button.setAttribute('aria-busy', String(state.busy));
  };

  const run = async (opts: { animate: boolean }) => {
    if (!ready() || state.busy) return;
    state.busy = true;
    sync();
    const disclosureOpen =
      results.querySelector('.analyzed')?.classList.contains('is-open') ?? false;
    try {
      state.report = await analyzeInWorker(state.jobText, state.resume!.text, state.overrides);
      results.hidden = false;
      resultActions.hidden = false;
      renderResults(results, state.report, handlers, { animate: opts.animate, disclosureOpen });
      live.textContent = announce(state.report);
      if (opts.animate) {
        results.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
        $<HTMLElement>('#results-title', results).focus({ preventScroll: true });
      }
    } catch {
      live.textContent = 'Something went wrong while analyzing. Please try again.';
    } finally {
      state.busy = false;
      sync();
    }
  };

  const handlers = {
    onToggleBlock: (id: string, include: boolean) => {
      state.overrides = { ...state.overrides, [id]: include };
      void run({ animate: false }).then(() => focusBlock(id));
    },
  };

  const actions = {
    onCopy: async (btn: HTMLButtonElement) => {
      if (!state.report) return;
      const ok = await copyText(reportText(state.report));
      btn.textContent = ok ? 'Copied' : 'Copy failed';
      live.textContent = ok ? 'Report copied to clipboard.' : 'Could not copy the report.';
      window.setTimeout(() => (btn.textContent = 'Copy report'), 1800);
    },
    onReset: () => {
      state.jobText = '';
      state.overrides = {};
      state.report = null;
      state.resume = null;
      clearJob();
      clearResume();
      results.hidden = true;
      resultActions.hidden = true;
      results.replaceChildren();
      sync();
      window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
      field.focus({ preventScroll: true });
    },
  };

  // Keep keyboard focus on the toggled block after the re-render.
  const focusBlock = (id: string) => {
    const blocks = state.report?.job.blocks ?? [];
    const idx = blocks.findIndex((b) => b.id === id);
    results.querySelectorAll<HTMLElement>('.block')[idx]?.focus();
  };

  const clearJob = wireJobInput(field, $('#job-hint'), (text) => {
    state.jobText = text;
    state.overrides = {};
    sync();
  });
  const clearResume = wireDropzone({
    zone: $('#dropzone'),
    input: $<HTMLInputElement>('#file'),
    status: $('#resume-status'),
    onResume: (r) => {
      state.resume = r;
      sync();
    },
  });

  button.addEventListener('click', () => void run({ animate: true }));
  copyBtn.addEventListener('click', () => void actions.onCopy(copyBtn));
  $('#reset').addEventListener('click', actions.onReset);
  sync();
}
