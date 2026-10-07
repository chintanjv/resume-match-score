import { stem } from './stem';

export interface Token {
  /** Surface form as written (case preserved). */
  raw: string;
  /** Lowercased form. */
  norm: string;
  /** Porter stem of the lowercased form (used for BM25 and verb classes). */
  stem: string;
  /** Plural-folded form (used for exact-ish phrase matching of skills and domains). */
  light: string;
}

// A few gerunds that are used interchangeably with their noun ("split tests" / "split testing").
const IRREGULAR: Record<string, string> = {
  testing: 'test',
  modelling: 'model',
  modeling: 'model',
};

/** Fold plurals only: "dashboards" → "dashboard", "companies" → "company". */
function lightStem(w: string): string {
  const irregular = IRREGULAR[w];
  if (irregular) return irregular;
  if (w.length <= 3 || !/^[a-z]+$/.test(w)) return w;
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (/(?:ss|us|is|ys)$/.test(w)) return w;
  if (/(?:ches|shes|xes|sses)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s')) return w.slice(0, -1);
  return w;
}

// ".net"-style leading dot, words with inner dots/plus/hash (node.js, c++, c#), or a lone / or &.
const TOKEN = /\.(?=[a-z])[a-z0-9]+|[\p{L}\p{N}](?:[\p{L}\p{N}+#]|\.(?=[\p{L}\p{N}]))*|[/&]/giu;

export function tokenize(text: string): Token[] {
  // Hyphens join words ("go-to-market") — treat them as spaces so variants align.
  const prepared = text.replace(/(?<=\S)-(?=\S)/g, ' ');
  const out: Token[] = [];
  for (const m of prepared.matchAll(TOKEN)) {
    const raw = m[0];
    const norm = raw.toLowerCase();
    out.push({ raw, norm, stem: stem(norm), light: lightStem(norm) });
  }
  return out;
}
