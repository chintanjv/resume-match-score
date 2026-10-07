import { CONFIG } from '../config';

/** Weighted bag of terms (stems or concept terms like "skill:sql"). */
export type Query = Map<string, number>;

/**
 * BM25 over a small corpus (resume bullets). A pseudo-background of generic terms
 * keeps IDF stable when the resume is short.
 */
export class Bm25 {
  private readonly df = new Map<string, number>();
  private readonly tfs: Map<string, number>[];
  private readonly lens: number[];
  private readonly avgdl: number;
  private readonly n: number;

  constructor(
    docs: string[][],
    private readonly generic: Set<string>,
  ) {
    const { backgroundDocs } = CONFIG.bm25;
    this.n = docs.length + backgroundDocs;
    this.tfs = docs.map((terms) => {
      const tf = new Map<string, number>();
      for (const t of terms) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      return tf;
    });
    this.lens = docs.map((d) => d.length);
    this.avgdl = this.lens.reduce((a, b) => a + b, 0) / Math.max(1, docs.length) || 1;
  }

  idf(term: string): number {
    const bg = this.generic.has(term) ? CONFIG.bm25.backgroundDocs / 2 : 0;
    const df = (this.df.get(term) ?? 0) + bg;
    return Math.log(1 + (this.n - df + 0.5) / (df + 0.5));
  }

  score(query: Query, doc: number): number {
    const { k1, b } = CONFIG.bm25;
    const tf = this.tfs[doc];
    if (!tf) return 0;
    const norm = k1 * (1 - b + (b * this.lens[doc]!) / this.avgdl);
    let s = 0;
    for (const [term, w] of query) {
      const f = tf.get(term);
      if (!f) continue;
      s += w * this.idf(term) * ((f * (k1 + 1)) / (f + norm));
    }
    return s;
  }

  /**
   * Score normalized to 0–1 against an "ideal" document containing every query term once
   * at average length — so 1.0 means full coverage of the query's information.
   */
  normalized(query: Query, doc: number): number {
    let ideal = 0;
    for (const [term, w] of query) ideal += w * this.idf(term);
    return ideal > 0 ? Math.min(1, this.score(query, doc) / ideal) : 0;
  }

  /** Share of query terms (by weight) present in the doc. */
  coverage(query: Query, doc: number): number {
    const tf = this.tfs[doc];
    let total = 0;
    let hit = 0;
    for (const [term, w] of query) {
      total += w;
      if (tf?.has(term)) hit += w;
    }
    return total > 0 ? hit / total : 0;
  }

  get size(): number {
    return this.tfs.length;
  }
}
