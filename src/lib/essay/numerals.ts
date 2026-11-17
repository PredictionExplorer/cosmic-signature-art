import { catalogs } from '@/lib/i18n/messages';
import { sourceOrder, type SourceKey } from './sources';
import { chapterKeys } from './structure';

/**
 * The essay's sources in the order a reader of the English first meets them. Every language
 * shows these numerals, so a numeral names the same source whichever catalog is read; where a
 * translation turns a sentence about, two of its numerals may stand out of order.
 */
export const SOURCE_ORDER: readonly SourceKey[] = sourceOrder(
  chapterKeys().map((key) => catalogs.en[key]),
);

/** The numeral a source's mark shows, from 1. */
export function sourceNumber(key: SourceKey): number {
  const at = SOURCE_ORDER.indexOf(key);
  if (at < 0) throw new Error(`The essay lists a source its words never cite: ${key}`);
  return at + 1;
}
