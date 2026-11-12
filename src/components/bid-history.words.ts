import { CHAIN_DATE_WORDS } from '@/lib/auction/catalogue.words';
import type { WordList, Words } from '@/lib/i18n/words';

/** A lot's bids as the chain recorded them, and what the list says when it cannot be read. */
export const BID_HISTORY_WORDS = [
  'bidHistory',
  'historyNone',
  'bidHistoryUnavailable',
  'historyStale',
  'historyPartial',
  'historyDeliveredTo',
  'viewChain',
  'readingRecord',
  ...CHAIN_DATE_WORDS,
] as const satisfies WordList;
export type BidHistoryWords = Words<typeof BID_HISTORY_WORDS>;
