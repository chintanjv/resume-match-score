/** Porter (1980) stemmer for lowercase ASCII words. Non-alphabetic tokens pass through. */

const cache = new Map<string, string>();

function isConsonant(w: string, i: number): boolean {
  const c = w[i];
  if (c === 'a' || c === 'e' || c === 'i' || c === 'o' || c === 'u') return false;
  if (c === 'y') return i === 0 ? true : !isConsonant(w, i - 1);
  return true;
}

/** m() — number of VC sequences in w[0..end). */
function measure(w: string, end: number): number {
  let n = 0;
  let i = 0;
  while (i < end && isConsonant(w, i)) i++;
  while (i < end) {
    while (i < end && !isConsonant(w, i)) i++;
    if (i >= end) break;
    n++;
    while (i < end && isConsonant(w, i)) i++;
  }
  return n;
}

function hasVowel(w: string, end: number): boolean {
  for (let i = 0; i < end; i++) if (!isConsonant(w, i)) return true;
  return false;
}

function endsDoubleConsonant(w: string): boolean {
  const n = w.length;
  return n >= 2 && w[n - 1] === w[n - 2] && isConsonant(w, n - 1);
}

/** *o — stem ends cvc, where the second c is not w, x or y. */
function endsCvc(w: string, end: number): boolean {
  if (end < 3) return false;
  const c = w[end - 1];
  return (
    isConsonant(w, end - 3) &&
    !isConsonant(w, end - 2) &&
    isConsonant(w, end - 1) &&
    c !== 'w' &&
    c !== 'x' &&
    c !== 'y'
  );
}

function replaceIf(w: string, suffix: string, repl: string, minM: number): string | null {
  if (!w.endsWith(suffix)) return null;
  const stemEnd = w.length - suffix.length;
  return measure(w, stemEnd) > minM ? w.slice(0, stemEnd) + repl : w;
}

const STEP2: [string, string][] = [
  ['ational', 'ate'],
  ['tional', 'tion'],
  ['enci', 'ence'],
  ['anci', 'ance'],
  ['izer', 'ize'],
  ['bli', 'ble'],
  ['alli', 'al'],
  ['entli', 'ent'],
  ['eli', 'e'],
  ['ousli', 'ous'],
  ['ization', 'ize'],
  ['ation', 'ate'],
  ['ator', 'ate'],
  ['alism', 'al'],
  ['iveness', 'ive'],
  ['fulness', 'ful'],
  ['ousness', 'ous'],
  ['aliti', 'al'],
  ['iviti', 'ive'],
  ['biliti', 'ble'],
  ['logi', 'log'],
];
const STEP3: [string, string][] = [
  ['icate', 'ic'],
  ['ative', ''],
  ['alize', 'al'],
  ['iciti', 'ic'],
  ['ical', 'ic'],
  ['ful', ''],
  ['ness', ''],
];
const STEP4 = [
  'al',
  'ance',
  'ence',
  'er',
  'ic',
  'able',
  'ible',
  'ant',
  'ement',
  'ment',
  'ent',
  'ion',
  'ou',
  'ism',
  'ate',
  'iti',
  'ous',
  'ive',
  'ize',
];

function stemWord(input: string): string {
  let w = input;
  if (w.length <= 2) return w;

  // Step 1a
  if (w.endsWith('sses')) w = w.slice(0, -2);
  else if (w.endsWith('ies')) w = w.slice(0, -2);
  else if (!w.endsWith('ss') && w.endsWith('s')) w = w.slice(0, -1);

  // Step 1b
  let extra = false;
  if (w.endsWith('eed')) {
    if (measure(w, w.length - 3) > 0) w = w.slice(0, -1);
  } else if (w.endsWith('ed') && hasVowel(w, w.length - 2)) {
    w = w.slice(0, -2);
    extra = true;
  } else if (w.endsWith('ing') && hasVowel(w, w.length - 3)) {
    w = w.slice(0, -3);
    extra = true;
  }
  if (extra) {
    if (w.endsWith('at') || w.endsWith('bl') || w.endsWith('iz')) w += 'e';
    else if (endsDoubleConsonant(w) && !/[lsz]$/.test(w)) w = w.slice(0, -1);
    else if (measure(w, w.length) === 1 && endsCvc(w, w.length)) w += 'e';
  }

  // Step 1c
  if (w.endsWith('y') && hasVowel(w, w.length - 1)) w = w.slice(0, -1) + 'i';

  // Step 2
  for (const [s, r] of STEP2) {
    if (w.endsWith(s)) {
      w = replaceIf(w, s, r, 0) ?? w;
      break;
    }
  }
  // Step 3
  for (const [s, r] of STEP3) {
    if (w.endsWith(s)) {
      w = replaceIf(w, s, r, 0) ?? w;
      break;
    }
  }
  // Step 4
  for (const s of STEP4) {
    if (!w.endsWith(s)) continue;
    const stemEnd = w.length - s.length;
    if (measure(w, stemEnd) > 1) {
      if (s === 'ion') {
        const c = w[stemEnd - 1];
        if (c === 's' || c === 't') w = w.slice(0, stemEnd);
      } else {
        w = w.slice(0, stemEnd);
      }
    }
    break;
  }
  // Step 5a
  if (w.endsWith('e')) {
    const m = measure(w, w.length - 1);
    if (m > 1 || (m === 1 && !endsCvc(w, w.length - 1))) w = w.slice(0, -1);
  }
  // Step 5b
  if (measure(w, w.length) > 1 && endsDoubleConsonant(w) && w.endsWith('l')) w = w.slice(0, -1);
  return w;
}

export function stem(word: string): string {
  if (!/^[a-z]+$/.test(word)) return word;
  let s = cache.get(word);
  if (s === undefined) {
    s = stemWord(word);
    if (cache.size < 50000) cache.set(word, s);
  }
  return s;
}
