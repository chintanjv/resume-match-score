import { tokenize, type Token } from './tokenize';

interface AliasHit {
  id: string;
  start: number;
  end: number; // exclusive token index
}

interface Entry {
  id: string;
  /** Exact surface tokens required (case-sensitive alias). */
  surface?: string[];
  /** Requires programming context nearby. */
  ctx?: boolean;
}

const CONTEXT_WORDS = new Set([
  'programming',
  'language',
  'languages',
  'code',
  'coding',
  'scripting',
  'developer',
  'engineer',
  'software',
  'backend',
  'stack',
  'lang',
]);

interface AliasSpec {
  id: string;
  phrases: string[];
  caseSensitive?: boolean;
  needsContext?: boolean;
}

/**
 * Greedy longest-match phrase index over plural-folded tokens. Deliberately not Porter-stemmed:
 * aggressive stems conflate "solid"/"Solidity" and "explain"/"explainability".
 * Used for skills, domains and certifications.
 */
export class AliasIndex {
  private readonly map = new Map<string, Entry>();
  private maxLen = 1;
  /** Ids whose matches count as programming context for guarded aliases. */
  contextIds = new Set<string>();

  add(spec: AliasSpec): void {
    for (const phrase of spec.phrases) {
      const toks = tokenize(phrase);
      if (!toks.length) continue;
      const key = toks.map((t) => t.light).join(' ');
      if (this.map.has(key)) continue;
      const entry: Entry = { id: spec.id };
      if (spec.caseSensitive) entry.surface = toks.map((t) => t.raw);
      if (spec.needsContext) entry.ctx = true;
      this.map.set(key, entry);
      if (toks.length > this.maxLen) this.maxLen = toks.length;
    }
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  keys(): IterableIterator<string> {
    return this.map.keys();
  }

  lookup(key: string): string | undefined {
    return this.map.get(key)?.id;
  }

  match(tokens: Token[]): AliasHit[] {
    const hits: AliasHit[] = [];
    const guarded: AliasHit[] = [];
    let i = 0;
    while (i < tokens.length) {
      let found: { entry: Entry; len: number } | null = null;
      const limit = Math.min(this.maxLen, tokens.length - i);
      for (let len = limit; len >= 1; len--) {
        let key = tokens[i]!.light;
        for (let k = 1; k < len; k++) key += ' ' + tokens[i + k]!.light;
        const entry = this.map.get(key);
        if (!entry) continue;
        if (entry.surface && !entry.surface.every((s, k) => tokens[i + k]!.raw === s)) continue;
        found = { entry, len };
        break;
      }
      if (found) {
        const hit = { id: found.entry.id, start: i, end: i + found.len };
        (found.entry.ctx ? guarded : hits).push(hit);
        i += found.len;
      } else {
        i++;
      }
    }
    for (const g of guarded) {
      const near = (idx: number) => Math.abs(idx - g.start) <= 6;
      const ctxHit = hits.some((h) => near(h.start) && this.contextIds.has(h.id));
      const ctxWord = tokens.some((t, idx) => near(idx) && CONTEXT_WORDS.has(t.norm));
      const ctxPeer = guarded.some((o) => o !== g && near(o.start));
      // A list item that is only the name ("- Go") is unambiguous.
      const alone = g.start === 0 && g.end === tokens.length;
      if (ctxHit || ctxWord || ctxPeer || alone) hits.push(g);
    }
    return hits.sort((a, b) => a.start - b.start);
  }

  /** Unique ids found in text. */
  find(text: string): string[] {
    return [...new Set(this.match(tokenize(text)).map((h) => h.id))];
  }
}
