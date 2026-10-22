export const locales = ['en', 'zh', 'zh-TW', 'zh-HK', 'uk', 'ko', 'ja', 'vi'] as const;
export type Locale = (typeof locales)[number];
export const localeNames: Record<Locale, string> = {
  en: 'English',
  zh: '简体中文',
  'zh-TW': '繁體中文 · 台灣',
  'zh-HK': '繁體中文 · 香港',
  uk: 'Українська',
  ko: '한국어',
  ja: '日本語',
  vi: 'Tiếng Việt',
};
export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}
export function localizedPath(locale: Locale, path = '/'): string {
  return `${locale === locales[0] ? '' : `/${locale}`}${path === '/' ? '' : path}` || '/';
}
export function unlocalizedPath(path: string): string {
  const segments = path.split('/');
  if (isLocale(segments[1])) segments.splice(1, 1);
  return segments.join('/') || '/';
}
