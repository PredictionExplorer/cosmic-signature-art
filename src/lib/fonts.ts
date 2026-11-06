import type { Locale } from './i18n/routing';

/**
 * The CJK display face each locale links, published by scripts/build-font-subsets.mjs as a
 * static stylesheet of unicode-range slices under /fonts/cjk. Latin, Cyrillic, Greek and
 * Vietnamese come from Literata (src/app/typefaces.css) and IBM Plex Mono, bundled with the
 * layout for every locale.
 */
export const CJK_STYLESHEETS: Partial<Record<Locale, string>> = {
  zh: '/fonts/cjk/sc.css',
  'zh-TW': '/fonts/cjk/tc.css',
  'zh-HK': '/fonts/cjk/hk.css',
  ja: '/fonts/cjk/ja.css',
  ko: '/fonts/cjk/ko.css',
};

/** A published cut of Literata, as src/app/typefaces.css declares it. */
export function literataCut(subset: string, style: 'roman' | 'italic' = 'roman') {
  return `/fonts/literata/literata-${subset}-${style}.woff2`;
}

/**
 * The cuts a locale's first paint reads in, preloaded with the page so the running head and
 * the label strip are set in Literata, not in its stand-in, on a first visit: the Latin roman
 * everywhere (a CJK page sets its Latin words and figures in it), and the locale's own script
 * where it has one. Italics and the other scripts arrive on use.
 */
export const LITERATA_PRELOADS: Record<Locale, string[]> = {
  en: [literataCut('latin')],
  uk: [literataCut('latin'), literataCut('cyrillic')],
  vi: [literataCut('latin'), literataCut('vietnamese')],
  ja: [literataCut('latin')],
  ko: [literataCut('latin')],
  zh: [literataCut('latin')],
  'zh-TW': [literataCut('latin')],
  'zh-HK': [literataCut('latin')],
};
