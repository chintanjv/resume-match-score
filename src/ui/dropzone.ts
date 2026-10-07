import { extractText, ResumeParseError } from '../parsers';
import { h } from './dom';

export interface ResumeState {
  name: string;
  text: string;
  detail: string;
}

interface Opts {
  zone: HTMLElement;
  input: HTMLInputElement;
  status: HTMLElement;
  onResume: (r: ResumeState | null) => void;
}

const wordsIn = (s: string) => (s.match(/\S+/g) ?? []).length;

/** Drag-and-drop or click to choose; shows the file name and a parsed-OK check. Offers paste on failure. */
export function wireDropzone({ zone, input, status, onResume }: Opts): () => void {
  const idle = zone.innerHTML;
  let depth = 0;

  const showFile = (r: ResumeState) => {
    zone.classList.add('has-file');
    zone.replaceChildren(
      h('span', { class: 'check', 'aria-hidden': 'true' }, '✓'),
      h(
        'span',
        null,
        h('span', { class: 'file-name' }, r.name),
        h('span', { class: 'small', style: 'display:block' }, r.detail),
      ),
      h('span', { class: 'small' }, 'Replace'),
    );
  };

  const reset = () => {
    zone.classList.remove('has-file', 'is-over');
    zone.innerHTML = idle;
    status.replaceChildren();
    input.value = '';
  };

  const pasteFallback = (message: string) => {
    const area = h('textarea', {
      class: 'field',
      rows: 6,
      placeholder: 'Paste the text of your resume here',
      'aria-label': 'Resume text',
    });
    area.addEventListener('input', () => {
      const text = area.value.trim();
      onResume(
        text.length > 40 ? { name: 'Pasted resume', text, detail: `${wordsIn(text)} words` } : null,
      );
    });
    status.replaceChildren(
      h('p', { class: 'error', role: 'alert' }, message),
      h(
        'button',
        {
          type: 'button',
          class: 'linkish',
          onclick: () => {
            status.replaceChildren(area);
            area.focus();
          },
        },
        'Paste resume text instead',
      ),
    );
  };

  const handle = async (file: File | undefined) => {
    if (!file) return;
    status.replaceChildren(h('p', { class: 'hint', role: 'status' }, `Reading ${file.name}…`));
    try {
      const parsed = await extractText(file);
      const detail = [
        parsed.kind.toUpperCase(),
        parsed.pages ? `${parsed.pages} page${parsed.pages > 1 ? 's' : ''}` : null,
        `${wordsIn(parsed.text)} words`,
        'parsed',
      ]
        .filter(Boolean)
        .join(' · ');
      const r = { name: file.name, text: parsed.text, detail };
      status.replaceChildren();
      showFile(r);
      onResume(r);
    } catch (err) {
      reset();
      onResume(null);
      const kind = err instanceof ResumeParseError ? err.kind : 'unreadable';
      const msg = err instanceof Error ? err.message : 'We couldn’t read that file.';
      if (kind === 'scanned' || kind === 'unreadable' || kind === 'empty') pasteFallback(msg);
      else status.replaceChildren(h('p', { class: 'error', role: 'alert' }, msg));
    }
  };

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  input.addEventListener('change', () => void handle(input.files?.[0]));
  zone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    depth++;
    zone.classList.add('is-over');
  });
  zone.addEventListener('dragover', (e) => e.preventDefault());
  zone.addEventListener('dragleave', () => {
    if (--depth <= 0) zone.classList.remove('is-over');
  });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    zone.classList.remove('is-over');
    void handle(e.dataTransfer?.files[0]);
  });
  // Dropping a file anywhere else shouldn't navigate away from the page.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    if (!(e.target instanceof Node && zone.contains(e.target))) e.preventDefault();
  });
  return reset;
}
