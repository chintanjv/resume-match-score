import { preview } from '../workers/client';

/** Auto-growing textarea with a live "detected: title · N requirements" hint. */
export function wireJobInput(
  field: HTMLTextAreaElement,
  hint: HTMLElement,
  onChange: (text: string) => void,
): () => void {
  let timer = 0;
  let ticket = 0;
  const grow = () => {
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight + 2, window.innerHeight * 0.6)}px`;
  };
  const update = () => {
    const text = field.value;
    onChange(text);
    grow();
    window.clearTimeout(timer);
    if (text.trim().length < 40) {
      hint.textContent = text.trim() ? 'Keep going — paste the whole posting, noise and all.' : '';
      return;
    }
    const mine = ++ticket;
    timer = window.setTimeout(async () => {
      try {
        const p = await preview(text);
        if (mine !== ticket) return;
        const title = p.title ?? 'title not found';
        hint.replaceChildren(
          'Detected: ',
          Object.assign(document.createElement('b'), { textContent: title }),
          ` · ${p.requirements} requirement${p.requirements === 1 ? '' : 's'}`,
        );
      } catch {
        hint.textContent = '';
      }
    }, 220);
  };
  field.addEventListener('input', update);
  return () => {
    field.value = '';
    hint.textContent = '';
    grow();
  };
}
