export const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Count a number up over ≤ 700 ms, calling `render` each frame. */
export function countUp(el: HTMLElement, to: number, render: (n: number) => void, ms = 700): void {
  if (reducedMotion() || to <= 0) {
    render(to);
    return;
  }
  const start = performance.now();
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    render(Math.round(to * ease(t)));
    if (t < 1 && el.isConnected) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Run after layout so CSS transitions start from their initial state. */
export const nextFrame = (fn: () => void): void => {
  requestAnimationFrame(() => requestAnimationFrame(fn));
};
