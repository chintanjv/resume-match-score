import { digits, h, svg } from './dom';
import { countUp, nextFrame, reducedMotion } from './motion';

const R = 78;
const C = 2 * Math.PI * R;

/** Score ring: the arc draws in and the number counts up. */
export function scoreRing(score: number, animate: boolean): HTMLElement {
  const arc = svg('circle', {
    class: 'arc',
    cx: 88,
    cy: 88,
    r: R,
    fill: 'none',
    'stroke-width': 8,
    'stroke-dasharray': C,
    'stroke-dashoffset': C,
  });
  const num = h('span', { class: 'score' });
  const render = (n: number) => num.replaceChildren(digits(n));
  const ring = h(
    'div',
    { class: 'ring', role: 'img', 'aria-label': `Overall score ${score} out of 100` },
    svg(
      'svg',
      { viewBox: '0 0 176 176', 'aria-hidden': 'true' },
      svg('circle', { class: 'track', cx: 88, cy: 88, r: R, fill: 'none', 'stroke-width': 8 }),
      arc,
    ),
    num,
    h('span', { class: 'of', 'aria-hidden': 'true' }, 'of 100'),
  );
  const target = String(C * (1 - score / 100));
  if (!animate || reducedMotion()) {
    arc.setAttribute('stroke-dashoffset', target);
    render(score);
  } else {
    render(0);
    nextFrame(() => {
      arc.setAttribute('stroke-dashoffset', target);
      countUp(num, score, render);
    });
  }
  return ring;
}
