// mammoth's browser build; resolved through its package "browser" field.
import mammoth from 'mammoth';

/** DOCX → text, keeping list items as bullets and paragraphs as lines. */
export async function docxToText(arrayBuffer: ArrayBuffer): Promise<string> {
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const lines: string[] = [];
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      const tag = child.tagName;
      if (tag === 'UL' || tag === 'OL') walk(child);
      else if (tag === 'LI') {
        const nested = Array.from(child.children).filter(
          (c) => c.tagName === 'UL' || c.tagName === 'OL',
        );
        nested.forEach((n) => n.remove());
        lines.push(`- ${child.textContent?.trim() ?? ''}`);
        nested.forEach(walk);
      } else if (tag === 'TABLE') {
        for (const row of Array.from(child.querySelectorAll('tr'))) {
          lines.push(
            Array.from(row.children)
              .map((c) => c.textContent?.trim())
              .filter(Boolean)
              .join(' | '),
          );
        }
      } else lines.push(child.textContent?.trim() ?? '');
    }
  };
  walk(doc.body);
  return lines.filter((l, i) => l || lines[i - 1]).join('\n');
}
