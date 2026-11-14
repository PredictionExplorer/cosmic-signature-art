import { CHAIN_STATE_WORDS } from '@/lib/auction/catalogue.words';
import type { WordList, Words } from '@/lib/i18n/words';
import { BID_HISTORY_WORDS } from './bid-history.words';
import { BID_SHEET_WORDS } from './bid-sheet.words';
import { YOUR_ACTIVITY_WORDS } from './your-activity.words';

/**
 * One lot's rail: its line of chain state, the two words that open its sheets, and the words of
 * the bid history, the bid sheet and the collector's activity it holds.
 */
export const AUCTION_LOT_WORDS = [
  'collectThisWork',
  'yourActivity',
  'readingRecord',
  'liveUnavailable',
  'unregistered',
  'configMismatch',
  ...CHAIN_STATE_WORDS,
  ...BID_HISTORY_WORDS,
  ...BID_SHEET_WORDS,
  ...YOUR_ACTIVITY_WORDS,
] as const satisfies WordList;
export type AuctionLotWords = Words<typeof AUCTION_LOT_WORDS>;
