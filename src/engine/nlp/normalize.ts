import type { Line } from '../types';

const DASHES = /[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g;
const SINGLE_QUOTES = /[\u2018\u2019\u201A\u201B\u2032\u00B4`]/g;
const DOUBLE_QUOTES = /[\u201C\u201D\u201E\u201F\u2033\u00AB\u00BB]/g;
const INVISIBLE = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;
const SPACES = /[\t\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;
const PICTOGRAPHS = /\p{Extended_Pictographic}\uFE0F?/gu;
const BULLET_PREFIX = /^\s*(?:[•●○◦▪▫■□►▸▹‣⁃∙·*\-+»✓✔➤➢→◆◇–]|\(?\d{1,2}[.)]|\(?[a-h][.)])\s+/;

/** Unicode-normalize and unify dashes, quotes and whitespace. Keeps line breaks. */
export function normalizeText(input: string): string {
  return input
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(INVISIBLE, '')
    .replace(DASHES, '-')
    .replace(SINGLE_QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
    .replace(SPACES, ' ')
    .replace(PICTOGRAPHS, ' ')
    .replace(/[ ]{2,}/g, ' ');
}

/** Split normalized text into lines, recording whether each was a bullet. */
export function toLines(text: string): (Line | null)[] {
  return text.split('\n').map((raw) => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const m = BULLET_PREFIX.exec(trimmed);
    if (m) {
      const rest = trimmed.slice(m[0].length).trim();
      return rest ? { text: rest, bullet: true } : null;
    }
    return { text: trimmed, bullet: false };
  });
}

export function wordCount(s: string): number {
  const m = s.match(/[\p{L}\p{N}][\p{L}\p{N}'+#.-]*/gu);
  return m ? m.length : 0;
}
