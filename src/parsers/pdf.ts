import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

interface Item {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Rebuild reading-order lines from positioned text runs. */
function toLines(items: Item[]): string[] {
  const rows: Item[][] = [];
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  for (const it of sorted) {
    const row = rows[rows.length - 1];
    const tol = Math.max(2, (row?.[0]?.h ?? it.h) * 0.45);
    if (row && Math.abs(row[0]!.y - it.y) <= tol) row.push(it);
    else rows.push([it]);
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    let line = '';
    let end = -Infinity;
    for (const it of row) {
      const gap = it.x - end;
      // Wide gaps (columns, right-aligned dates) become a separator the resume parser understands.
      if (line && gap > it.h * 2.5) line += ' | ';
      else if (line && gap > it.h * 0.15 && !line.endsWith(' ') && !it.str.startsWith(' '))
        line += ' ';
      line += it.str;
      end = it.x + it.w;
    }
    return line.replace(/\s+/g, ' ').trim();
  });
}

export async function pdfToText(data: ArrayBuffer): Promise<{ text: string; pages: number }> {
  // No font, cmap or wasm fetches: text extraction only, fully offline.
  const task = getDocument({
    data: new Uint8Array(data),
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
    isOffscreenCanvasSupported: false,
  });
  const doc = await task.promise;
  const out: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items: Item[] = [];
    for (const raw of content.items) {
      if (!('str' in raw) || !raw.str.trim()) continue;
      const [, , , d, e, f] = raw.transform as number[];
      items.push({ str: raw.str, x: e!, y: f!, w: raw.width, h: Math.abs(d!) || raw.height || 10 });
    }
    out.push(toLines(items).filter(Boolean).join('\n'));
    page.cleanup();
  }
  const pages = doc.numPages;
  await task.destroy();
  return { text: out.join('\n\n'), pages };
}
