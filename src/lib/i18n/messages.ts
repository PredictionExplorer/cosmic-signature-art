import { en, type Messages } from './en';
import { zh } from './zh';
import { zhTW } from './zh-TW';
import { zhHK } from './zh-HK';
import { uk } from './uk';
import { ko } from './ko';
import { ja } from './ja';
import { vi } from './vi';
import type { Locale } from './routing';
// Every production locale is checked for exact key parity in the test suite.
export const catalogs: Record<Locale, Messages> = {
  en,
  zh,
  'zh-TW': zhTW,
  'zh-HK': zhHK,
  uk,
  ko,
  ja,
  vi,
};
export function messages(locale: Locale): Messages {
  return catalogs[locale];
}
