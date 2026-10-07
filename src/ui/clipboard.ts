import { APP_NAME } from '../brand';
import type { Report } from '../engine/types';

const STATE = { meets: 'Meets', partial: 'Partial', missing: 'Missing' } as const;

/** Plain-text summary for pasting into notes or a message. */
export function reportText(r: Report): string {
  const lines: string[] = [];
  lines.push(`${APP_NAME} — ${r.job.title ?? 'Job posting'}`);
  lines.push(`Overall ${r.overall}/100 · Grade ${r.grade} · ${r.label}`);
  lines.push(r.verdict, '');
  if (r.knockouts.length) {
    lines.push('Heads up');
    for (const k of r.knockouts) lines.push(`! ${k.message}`);
    lines.push('');
  }
  lines.push('Breakdown');
  for (const d of r.dimensions)
    lines.push(`- ${d.name}: ${d.score === null ? 'N/A' : d.score} — ${d.why}`);
  lines.push(`- ${r.ats.name} (not in overall): ${r.ats.score} — ${r.ats.why}`, '');
  lines.push('Requirements');
  for (const q of r.requirements) {
    lines.push(
      `[${STATE[q.strength]}] ${q.label}${q.tier === 'preferred' ? ' (preferred)' : ''}${q.evidence ? ` — “${q.evidence}”` : ''}`,
    );
  }
  const missing = r.keywords.filter((k) => k.status === 'missing').map((k) => k.name);
  if (missing.length) lines.push('', `Missing keywords: ${missing.join(', ')}`);
  if (r.fixes.length) {
    lines.push('', 'Top fixes');
    r.fixes.forEach((f, i) => {
      const lifts = f.lifts.map((l) => `${l.dimension} +${l.delta}`).join(', ');
      lines.push(`${i + 1}. ${f.advice}${lifts ? ` — lifts ${lifts}` : ''}.`);
    });
  }
  return lines.join('\n');
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
