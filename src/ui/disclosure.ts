import type { BlockLabel, BlockSummary } from '../engine/types';
import { curtain } from './curtain';
import { h } from './dom';

const NAMES: Record<BlockLabel, string> = {
  title: 'Job title',
  role_summary: 'Role summary',
  responsibilities: 'Responsibilities',
  required_qualifications: 'Required qualifications',
  preferred_qualifications: 'Preferred qualifications',
  location: 'Location',
  work_arrangement: 'Work arrangement',
  salary: 'Salary',
  employment_type: 'Employment type',
  about_company: 'About the company',
  mission_values: 'Mission & values',
  benefits: 'Benefits & perks',
  eeo_legal: 'EEO / legal',
  accommodations: 'Accommodations',
  how_to_apply: 'How to apply',
  privacy_notice: 'Privacy notice',
  boilerplate: 'Page boilerplate',
};

/** "What we analyzed": which blocks fed the score. Tap a block to include or exclude it. */
export function analyzedDisclosure(
  blocks: BlockSummary[],
  open: boolean,
  onToggle: (id: string, include: boolean) => void,
): HTMLElement {
  const kept = blocks.filter((b) => b.included).length;
  const block = (b: BlockSummary) =>
    h(
      'button',
      {
        type: 'button',
        class: 'block',
        'aria-pressed': String(b.included),
        onclick: () => onToggle(b.id, !b.included),
      },
      h(
        'span',
        { class: 'state' },
        h(
          'span',
          { class: 'badge', 'data-s': b.included ? 'meets' : 'missing' },
          b.included ? 'Scored' : b.disposition === 'extract' ? 'Info' : 'Ignored',
        ),
      ),
      h(
        'span',
        { class: 'text' },
        h('span', { class: 'kind' }, NAMES[b.label]),
        h(
          'span',
          { class: 'preview' },
          b.heading && b.heading !== b.preview ? `${b.heading} — ${b.preview}` : b.preview,
        ),
      ),
    );
  const panel = curtain(
    'analyzed-body',
    open,
    'body',
    h(
      'p',
      { class: 'section-sub' },
      'We score the role, responsibilities and qualifications, and ignore company blurbs, benefits and legal text. Tap a section to include or exclude it — the score updates instantly.',
    ),
    h('div', { class: 'blocks' }, blocks.map(block)),
  );
  const toggle = h(
    'button',
    {
      type: 'button',
      class: 'analyzed-toggle',
      'aria-expanded': String(open),
      'aria-controls': 'analyzed-body',
      onclick: () => {
        const next = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', String(next));
        wrap.classList.toggle('is-open', next);
        panel.set(next);
      },
    },
    h('span', { class: 'pm', 'aria-hidden': 'true' }),
    `What we analyzed · ${kept} of ${blocks.length} sections scored`,
  );
  const wrap = h('div', { class: `analyzed ${open ? 'is-open' : ''}`.trim() }, toggle, panel.el);
  return wrap;
}
