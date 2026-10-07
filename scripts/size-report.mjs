// Gzipped size report for dist/, checked against the performance budgets.
// "Initial" = what index.html loads up front; lazy chunks (worker, parsers) are reported separately.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = new URL('../dist/', import.meta.url).pathname;
const BUDGET = { js: 60 * 1024, css: 15 * 1024 };

const files = [];
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
};
walk(DIST);

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const referenced = new Set(
  [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1].split('/').pop()),
);
const gz = (p) => gzipSync(readFileSync(p), { level: 9 }).length;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

const rows = files
  .filter((p) => /\.(m?js|css|woff2|html|svg)$/.test(p))
  .map((p) => {
    const name = p.split('/').pop();
    return {
      file: relative(DIST, p),
      raw: statSync(p).size,
      gz: gz(p),
      initial: referenced.has(name) || name === 'index.html',
    };
  })
  .sort((a, b) => Number(b.initial) - Number(a.initial) || b.gz - a.gz);

console.log('\nfile'.padEnd(50) + 'raw'.padStart(12) + 'gzip'.padStart(12) + '  load');
for (const r of rows)
  console.log(
    r.file.padEnd(49) +
      kb(r.raw).padStart(12) +
      kb(r.gz).padStart(12) +
      `  ${r.initial ? 'initial' : 'lazy'}`,
  );

const initialJs = rows
  .filter((r) => r.initial && /\.m?js$/.test(r.file))
  .reduce((a, r) => a + r.gz, 0);
const initialCss = rows
  .filter((r) => r.initial && r.file.endsWith('.css'))
  .reduce((a, r) => a + r.gz, 0);
const ok = initialJs <= BUDGET.js && initialCss <= BUDGET.css;
console.log(
  `\nInitial JS  ${kb(initialJs)} / ${kb(BUDGET.js)}  ${initialJs <= BUDGET.js ? 'OK' : 'OVER'}`,
);
console.log(
  `Initial CSS ${kb(initialCss)} / ${kb(BUDGET.css)}  ${initialCss <= BUDGET.css ? 'OK' : 'OVER'}\n`,
);
process.exit(ok ? 0 : 1);
