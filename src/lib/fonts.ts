import type { Locale } from './i18n/routing';

/**
 * The CJK display face each locale links, published by scripts/build-font-subsets.mjs as a
 * static stylesheet of unicode-range slices under /fonts/cjk. Latin, Cyrillic, Greek and
 * Vietnamese come from Literata and IBM Plex Mono, bundled with the layout for every locale.
 */
export const CJK_STYLESHEETS: Partial<Record<Locale, string>> = {
  zh: '/fonts/cjk/sc.css',
  'zh-TW': '/fonts/cjk/tc.css',
  'zh-HK': '/fonts/cjk/hk.css',
  ja: '/fonts/cjk/ja.css',
  ko: '/fonts/cjk/ko.css',
};
