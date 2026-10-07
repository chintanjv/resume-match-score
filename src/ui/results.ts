import type { Report } from '../engine/types';
import { dimensionCard } from './breakdown';
import { analyzedDisclosure } from './disclosure';
import { h } from './dom';
import { fixesPanel } from './fixes';
import { keywordsPanel, requirementsPanel } from './requirements';
import { scoreRing } from './ring';

interface ResultHandlers {
  onToggleBlock: (id: string, include: boolean) => void;
}

/** Render the full report. `animate` is false for in-place recomputes (block toggles). */
export function renderResults(
  root: HTMLElement,
  r: Report,
  handlers: ResultHandlers,
  opts: { animate: boolean; disclosureOpen: boolean },
): void {
  const { animate } = opts;
  let i = 0;
  const step = () => (animate ? { class: 'reveal', style: `--i:${i++}` } : {});
  const role = [r.job.title, r.job.meta.location, r.job.meta.arrangement]
    .filter(Boolean)
    .join(' · ');

  const hero = h(
    'section',
    { class: `hero glass ${animate ? 'fade-in' : ''}`.trim(), 'aria-labelledby': 'results-title' },
    scoreRing(r.overall, animate),
    h(
      'div',
      { class: 'hero-meta' },
      role ? h('p', { class: 'for-role' }, role) : null,
      h(
        'div',
        { class: 'grade-row' },
        h('span', { class: 'grade', 'aria-label': `Grade ${r.grade}` }, r.grade),
        h('h2', { class: 'match-label', id: 'results-title', tabindex: '-1' }, r.label),
      ),
      h('p', { class: 'verdict' }, r.verdict),
    ),
  );

  const banners = r.knockouts.length
    ? h(
        'div',
        { class: 'banners', role: 'note', 'aria-label': 'Possible deal-breakers', ...step() },
        r.knockouts.map((k) =>
          h(
            'div',
            { class: 'banner' },
            h('span', { class: 'mark', 'aria-hidden': 'true' }, '!'),
            h('p', null, k.message),
          ),
        ),
      )
    : null;

  const breakdown = h(
    'section',
    { 'aria-labelledby': 'bd-title', class: 'step' },
    h(
      'div',
      step(),
      h('h2', { class: 'section-title', id: 'bd-title' }, 'Breakdown'),
      h(
        'p',
        { class: 'section-sub' },
        'Tap a card to see its evidence. ATS readability is scored separately.',
      ),
    ),
    h(
      'div',
      { class: 'grid' },
      r.dimensions.map((d, n) => dimensionCard(d, n, animate)),
      dimensionCard(r.ats, r.dimensions.length, animate, 'ats'),
    ),
  );

  const wrap = (el: HTMLElement | null) => {
    if (el && animate) {
      el.classList.add('reveal');
      el.style.setProperty('--i', String(i++));
    }
    return el;
  };

  root.replaceChildren(
    hero,
    banners ?? '',
    wrap(
      h('div', null, analyzedDisclosure(r.job.blocks, opts.disclosureOpen, handlers.onToggleBlock)),
    ) ?? '',
    breakdown,
    wrap(fixesPanel(r.fixes)) ?? '',
    wrap(requirementsPanel(r.requirements)) ?? '',
    wrap(keywordsPanel(r.keywords)) ?? '',
  );
}

export function announce(r: Report): string {
  const ko = r.knockouts.length
    ? ` ${r.knockouts.length} possible deal-breaker${r.knockouts.length > 1 ? 's' : ''} flagged.`
    : '';
  return `Match score ${r.overall} out of 100, grade ${r.grade}, ${r.label}.${ko} ${r.verdict}`;
}
