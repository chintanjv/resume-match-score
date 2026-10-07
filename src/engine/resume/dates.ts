/** Month index: year * 12 + month (0-based). */
export const monthIndex = (year: number, month: number): number => year * 12 + month;

export function currentMonth(d = new Date()): number {
  return monthIndex(d.getFullYear(), d.getMonth());
}

const MONTH =
  'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const SEASON = 'spring|summer|fall|autumn|winter';
const YEAR = '(?:19|20)\\d{2}';
const YY = "['’]\\d{2}";
const POINT = `(?:(?:${MONTH})\\.?,?\\s*(?:${YEAR}|${YY})|(?:${SEASON})\\s+(?:${YEAR}|${YY})|q[1-4]\\s*(?:${YEAR}|${YY})|\\d{1,2}\\s*/\\s*(?:${YEAR}|\\d{2})(?!\\d)|${YEAR}\\s*[./]\\s*\\d{1,2}(?!\\d)|${YEAR}|${YY})`;
const NOW = 'present|current(?:ly)?|now|today|ongoing|to date|date';
const SEP = '\\s*(?:-|–|—|to|until|till|through|thru)\\s*';
const RANGE_RE = new RegExp(`(?<![\\w/.])(${POINT})${SEP}(${POINT}|${NOW})(?![\\w/])`, 'i');
const SINGLE_RE = new RegExp(
  `(?<![\\w/.])((?:${MONTH})\\.?,?\\s*(?:${YEAR}|${YY})|(?:${SEASON})\\s+(?:${YEAR}|${YY})|${YEAR})(?![\\w/])`,
  'i',
);

const MONTH_NUM: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};
const SEASON_SPAN: Record<string, [number, number]> = {
  spring: [2, 4],
  summer: [5, 7],
  fall: [8, 10],
  autumn: [8, 10],
  winter: [0, 2],
};

function fullYear(y: string, now: number): number {
  const digits = y.replace(/\D/g, '');
  if (digits.length === 4) return Number(digits);
  const yy = Number(digits);
  const cur = Math.floor(now / 12) % 100;
  return yy <= cur + 1 ? 2000 + yy : 1900 + yy;
}

/** A date point as an inclusive month span, e.g. "Summer 2017" → Jun–Aug 2017. */
function parsePoint(
  raw: string,
  now: number,
): { start: number; end: number; yearOnly: boolean } | null {
  const s = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  let m: RegExpExecArray | null;
  if ((m = new RegExp(`^(${MONTH})\\.?,? ?(\\S+)$`).exec(s))) {
    const y = fullYear(m[2]!, now);
    const mi = MONTH_NUM[m[1]!.slice(0, 3)]!;
    return { start: monthIndex(y, mi), end: monthIndex(y, mi), yearOnly: false };
  }
  if ((m = new RegExp(`^(${SEASON}) (\\S+)$`).exec(s))) {
    const y = fullYear(m[2]!, now);
    const [a, b] = SEASON_SPAN[m[1]!]!;
    return { start: monthIndex(y, a), end: monthIndex(y, b), yearOnly: false };
  }
  if ((m = /^q([1-4]) ?(\S+)$/.exec(s))) {
    const y = fullYear(m[2]!, now);
    const q = Number(m[1]) - 1;
    return { start: monthIndex(y, q * 3), end: monthIndex(y, q * 3 + 2), yearOnly: false };
  }
  if ((m = /^(\d{1,2}) ?\/ ?(\d{2}|\d{4})$/.exec(s))) {
    const mo = Number(m[1]) - 1;
    if (mo < 0 || mo > 11) return null;
    const y = fullYear(m[2]!, now);
    return { start: monthIndex(y, mo), end: monthIndex(y, mo), yearOnly: false };
  }
  if ((m = /^(\d{4}) ?[./] ?(\d{1,2})$/.exec(s))) {
    const mo = Number(m[2]) - 1;
    if (mo < 0 || mo > 11) return null;
    return {
      start: monthIndex(Number(m[1]), mo),
      end: monthIndex(Number(m[1]), mo),
      yearOnly: false,
    };
  }
  if ((m = /^(\d{4}|['’]\d{2})$/.exec(s))) {
    const y = fullYear(m[1]!, now);
    return { start: monthIndex(y, 0), end: monthIndex(y, 11), yearOnly: true };
  }
  return null;
}

interface DateRange {
  start: number;
  end: number;
  raw: string;
  index: number;
}

/** Find the first date range (or single dated term) in a line. */
export function parseDateRange(text: string, now: number): DateRange | null {
  const r = RANGE_RE.exec(text);
  if (r) {
    const a = parsePoint(r[1]!, now);
    const isNow = new RegExp(`^(${NOW})$`, 'i').test(r[2]!.trim());
    const b = isNow ? null : parsePoint(r[2]!, now);
    if (a && (isNow || b)) {
      // Year-only ends ("2019–2021") count to the start of the end year — a conservative reading.
      const end = isNow ? now : b!.yearOnly && a.yearOnly ? b!.start : b!.end;
      if (end >= a.start && valid(a.start, now) && end <= now + 12) {
        return {
          start: a.start,
          end: Math.min(end, now),
          raw: r[0],
          index: r.index,
        };
      }
    }
  }
  const s = SINGLE_RE.exec(text);
  if (s) {
    const p = parsePoint(s[1]!, now);
    if (p && valid(p.start, now))
      return {
        start: p.start,
        end: Math.min(p.end, now),
        raw: s[0],
        index: s.index,
      };
  }
  return null;
}

const valid = (m: number, now: number) => m >= monthIndex(1960, 0) && m <= now + 12;

/** Union of inclusive month ranges, in months. */
export function mergedMonths(ranges: [number, number][]): number {
  const sorted = ranges.filter(([a, b]) => b >= a).sort((x, y) => x[0] - y[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const [a, b] of sorted) {
    if (!cur || a > cur[1] + 1) {
      if (cur) total += cur[1] - cur[0] + 1;
      cur = [a, b];
    } else cur[1] = Math.max(cur[1], b);
  }
  if (cur) total += cur[1] - cur[0] + 1;
  return total;
}
