import type { Fix } from '../engine/types';
import { h } from './dom';

export function fixesPanel(fixes: Fix[]): HTMLElement {
  return h(
    'section',
    { class: 'panel glass', 'aria-labelledby': 'fix-title' },
    h(
      'div',
      null,
      h('h2', { class: 'section-title', id: 'fix-title' }, 'Top fixes'),
      h(
        'p',
        { class: 'section-sub' },
        'Ranked by how much each would raise your score. Add real evidence — not keywords.',
      ),
    ),
    fixes.length
      ? h(
          'ol',
          { class: 'fixes' },
          fixes.map((f) =>
            h(
              'li',
              { class: 'fix' },
              h('h3', { class: 'fix-title' }, f.title),
              h('p', { class: 'fix-advice' }, `${f.advice}.`),
              f.lifts.length
                ? h(
                    'div',
                    { class: 'lifts' },
                    f.lifts.map((l) => h('span', { class: 'lift' }, `${l.dimension} +${l.delta}`)),
                  )
                : null,
            ),
          ),
        )
      : h(
          'p',
          { class: 'fix-advice' },
          'Nothing stands out — your resume already covers what this posting asks for.',
        ),
  );
}
