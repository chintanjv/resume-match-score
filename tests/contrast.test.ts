import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// WCAG contrast of text tokens over the worst-case glass composite (glass over the strongest blob tint).
const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
const hex = (name: string) => {
  const m = new RegExp(`--${name}:\\s*#([0-9a-f]{6})`, 'i').exec(css)!;
  return [0, 2, 4].map((i) => parseInt(m[1]!.slice(i, i + 2), 16)) as [number, number, number];
};
const alpha = (name: string) =>
  Number(new RegExp(`--${name}:\\s*rgb\\([^/]+/\\s*([\\d.]+)\\)`).exec(css)![1]);
type RGB = [number, number, number];
const over = (fg: RGB, a: number, bg: RGB): RGB =>
  fg.map((c, i) => c * a + bg[i]! * (1 - a)) as RGB;
const lum = (c: RGB) => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const ratio = (a: RGB, b: RGB) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

const paper = hex('paper');
const ink = hex('ink');
const accent = hex('accent');
const white: RGB = [255, 255, 255];
// Darkest point behind glass: the accent blob at 20% over paper (plus the ink blob at 7%).
const backdrop = over(ink, 0.07, over(accent, 0.2, paper));
const glass = over(white, alpha('glass-bg'), backdrop);

describe('WCAG AA contrast on glass', () => {
  it('body text', () => expect(ratio(ink, glass)).toBeGreaterThanOrEqual(4.5));
  it('muted text', () =>
    expect(ratio(over(ink, alpha('ink-muted'), glass), glass)).toBeGreaterThanOrEqual(4.5));
  it('accent text and accent buttons', () => {
    expect(ratio(accent, glass)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(paper, accent)).toBeGreaterThanOrEqual(4.5);
  });
  it('ink on a partial (40% accent) badge', () => {
    expect(ratio(ink, over(accent, alpha('accent-40'), glass))).toBeGreaterThanOrEqual(4.5);
  });
});
