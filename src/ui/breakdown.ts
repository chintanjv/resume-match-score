import type { Dimension, Strength } from '../engine/types';
import { curtain } from './curtain';
import { h } from './dom';
import { nextFrame, reducedMotion } from './motion';

const STATE: Record<Strength, string> = { meets: 'Meets', partial: 'Partial', missing: 'Missing' };

export function badge(s: Strength, text = STATE[s]): HTMLElement {
  return h('span', { class: 'badge', 'data-s': s }, text);
}

let uid = 0;

/** A breakdown card: score, mini bar and one-line why; expands in place to show evidence. */
export function dimensionCard(
  d: Dimension,
  index: number,
  animate: boolean,
  extraClass = '',
): HTMLElement {
  const bodyId = `dim-${++uid}`;
  const na = d.score === null;
  const bar = h('i', { style: `--v:${animate && !reducedMotion() ? 0 : (d.score ?? 0) / 100}` });
  if (animate && !na) nextFrame(() => bar.style.setProperty('--v', String((d.score ?? 0) / 100)));

  const body = curtain(
    bodyId,
    false,
    'dim-body',
    d.evidence.length
      ? d.evidence.map((e) =>
          h(
            'div',
            { class: 'ev' },
            h(
              'div',
              { class: 'ev-label' },
              e.strength ? badge(e.strength) : null,
              h('span', null, e.label),
            ),
            e.detail ? h('div', { class: 'ev-detail' }, e.detail) : null,
          ),
        )
      : h('p', { class: 'ev-detail' }, 'Nothing more to show here.'),
    d.notes.map((n) => h('p', { class: 'note' }, n)),
    d.weight > 0
      ? h('p', { class: 'ev-detail' }, `Weight in overall: ${Math.round(d.weight * 100)}%`)
      : null,
  );

  const head = h(
    'button',
    {
      class: 'dim-head',
      type: 'button',
      'aria-expanded': 'false',
      'aria-controls': bodyId,
      onclick: (e: Event) => {
        const btn = e.currentTarget as HTMLButtonElement;
        const open = btn.getAttribute('aria-expanded') !== 'true';
        btn.setAttribute('aria-expanded', String(open));
        body.set(open);
        more.textContent = open ? 'Hide evidence' : 'Show evidence';
      },
    },
    h(
      'span',
      { class: 'dim-top' },
      h('span', { class: 'dim-name' }, d.name),
      na
        ? h('span', { class: 'dim-score na' }, 'N/A')
        : h(
            'span',
            { class: 'dim-score' },
            h('span', { 'aria-hidden': 'true' }, String(d.score)),
            h('span', { class: 'visually-hidden' }, `${d.score} out of 100`),
          ),
    ),
    h('span', { class: na ? 'bar na' : 'bar', 'aria-hidden': 'true' }, bar),
    h('span', { class: 'dim-why' }, d.why),
  );
  const more = h('span', { class: 'dim-more' }, 'Show evidence');
  head.append(more);

  return h(
    'article',
    { class: `dim glass ${extraClass} ${animate ? 'reveal' : ''}`.trim(), style: `--i:${index}` },
    head,
    body.el,
  );
}
