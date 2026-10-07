import { h } from './dom';

type Child = Parameters<typeof h>[2];

/**
 * A region that rolls down when opened and back up when closed.
 * Height animates via grid rows (0fr ↔ 1fr), so no measuring is needed.
 */
export function curtain(id: string, open: boolean, className: string, ...children: Child[]) {
  const content = h('div', { class: `curtain-content ${className}`.trim() }, ...children);
  const inner = h('div', { class: 'curtain-inner' }, content);
  const el = h('div', { class: 'curtain', id }, inner);
  const set = (next: boolean) => {
    el.classList.toggle('is-open', next);
    // Closed content is out of the tab order and hidden from assistive tech.
    inner.inert = !next;
  };
  set(open);
  return { el, set };
}
