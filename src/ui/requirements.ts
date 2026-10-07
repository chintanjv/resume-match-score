import type { KeywordChip, RequirementResult } from '../engine/types';
import { badge } from './breakdown';
import { h } from './dom';

export function requirementsPanel(reqs: RequirementResult[]): HTMLElement | null {
  if (!reqs.length) return null;
  const order = { required: 0, preferred: 1 };
  const sorted = [...reqs].sort((a, b) => order[a.tier] - order[b.tier]);
  return h(
    'section',
    { class: 'panel glass', 'aria-labelledby': 'req-title' },
    h(
      'div',
      null,
      h('h2', { class: 'section-title', id: 'req-title' }, 'Requirements'),
      h(
        'p',
        { class: 'section-sub' },
        'Each item from the posting, with the line on your resume that best supports it.',
      ),
    ),
    h(
      'table',
      { class: 'req-table' },
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          h('th', { scope: 'col' }, 'Requirement'),
          h('th', { scope: 'col' }, 'Status'),
          h('th', { scope: 'col' }, 'Evidence on your resume'),
        ),
      ),
      h(
        'tbody',
        null,
        sorted.map((r) =>
          h(
            'tr',
            null,
            h(
              'td',
              null,
              r.label,
              h('span', { class: 'tier' }, r.tier === 'preferred' ? 'Preferred' : 'Required'),
            ),
            h('td', null, badge(r.strength)),
            h(
              'td',
              { class: 'cite' },
              r.evidence ? `“${r.evidence}”` : (r.note ?? 'No supporting line found'),
              r.evidence && r.note ? ` — ${r.note}` : null,
            ),
          ),
        ),
      ),
    ),
  );
}

export function keywordsPanel(chips: KeywordChip[]): HTMLElement | null {
  if (!chips.length) return null;
  const chip = (k: KeywordChip) =>
    h(
      'li',
      { class: 'chip', 'data-s': k.status },
      k.name,
      k.via ? h('small', null, `via ${k.via}`) : null,
      k.status !== 'demonstrated'
        ? h(
            'span',
            { class: 'visually-hidden' },
            k.status === 'listed' ? '(listed only)' : '(missing)',
          )
        : null,
    );
  const groups: [string, KeywordChip[]][] = [
    ['Shown in your experience', chips.filter((k) => k.status === 'demonstrated')],
    ['Only listed in Skills', chips.filter((k) => k.status === 'listed')],
    ['Missing', chips.filter((k) => k.status === 'missing')],
  ];
  return h(
    'section',
    { class: 'panel glass', 'aria-labelledby': 'kw-title' },
    h(
      'div',
      null,
      h('h2', { class: 'section-title', id: 'kw-title' }, 'Keywords'),
      h('p', { class: 'section-sub' }, 'Hard skills and tools named in the posting.'),
    ),
    h(
      'div',
      { class: 'legend', 'aria-hidden': 'true' },
      h('span', null, h('i', { style: 'background:var(--accent)' }), 'Shown'),
      h('span', null, h('i', { style: 'background:var(--accent-40)' }), 'Listed only'),
      h('span', null, h('i', { style: 'box-shadow:inset 0 0 0 1px var(--ink)' }), 'Missing'),
    ),
    groups
      .filter(([, list]) => list.length)
      .map(([title, list]) =>
        h(
          'div',
          { class: 'step' },
          h('h3', { class: 'dim-name' }, `${title} · ${list.length}`),
          h('ul', { class: 'chips' }, list.map(chip)),
        ),
      ),
  );
}
