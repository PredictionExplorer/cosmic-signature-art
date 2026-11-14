import type { WordList, Words } from '@/lib/i18n/words';
import { AUCTION_SUMMARY_WORDS } from './auction-summary.words';

/** The bid sheet's own words, and the summary of the sale it opens with. */
export const BID_SHEET_WORDS = [
  'bidSheet',
  'close',
  'sheetHandle',
  ...AUCTION_SUMMARY_WORDS,
] as const satisfies WordList;
export type BidSheetWords = Words<typeof BID_SHEET_WORDS>;
