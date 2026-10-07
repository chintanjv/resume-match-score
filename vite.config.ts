import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { APP_NAME, AUTHOR, DESCRIPTION, PAGE_TITLE, TAGLINE } from './src/brand.ts';

const BASE = process.env.BASE_PATH ?? '/';
/** Public URL of the deployed site (set by the deploy workflow). Social previews need absolute URLs. */
const SITE_URL = process.env.SITE_URL?.replace(/\/?$/, '/') ?? '';
const OG_IMAGE = `${SITE_URL || BASE}og.jpg`;
const SITE_TAGS = SITE_URL
  ? `<link rel="canonical" href="${SITE_URL}" />\n    <meta property="og:url" content="${SITE_URL}" />`
  : '';

/** Structured data so search and answer engines know what the page is. */
const jsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: APP_NAME,
  description: DESCRIPTION,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Any (runs in the browser)',
  isAccessibleForFree: true,
  ...(SITE_URL && { url: SITE_URL }),
  image: OG_IMAGE,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  featureList: [
    'Resume vs. job description match score',
    'Keyword and skills gap analysis',
    'ATS readability check',
    'Ranked fixes to improve your score',
  ],
  author: { '@type': 'Person', name: AUTHOR },
}).replace(/</g, '\\u003c');

/** Injects brand constants into index.html so a rename touches one file. */
function brand(): Plugin {
  return {
    name: 'brand',
    transformIndexHtml: (html) =>
      html
        .replaceAll('%PAGE_TITLE%', PAGE_TITLE)
        .replaceAll('%OG_IMAGE%', OG_IMAGE)
        .replace('<!--%SITE_TAGS%-->', SITE_TAGS)
        .replaceAll('%JSON_LD%', jsonLd)
        .replaceAll('%APP_NAME%', APP_NAME)
        .replaceAll('%TAGLINE%', TAGLINE)
        .replaceAll('%DESCRIPTION%', DESCRIPTION)
        .replaceAll('%AUTHOR%', AUTHOR),
  };
}

export default defineConfig({
  base: BASE,
  plugins: [brand()],
  worker: { format: 'es' },
  build: { target: 'es2022', modulePreload: { polyfill: false }, reportCompressedSize: false },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
