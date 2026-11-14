import type { WordList, Words } from '@/lib/i18n/words';

/** The sale at a glance: the opening bid, the two clocks, the raise and the fee. */
export const AUCTION_SUMMARY_WORDS = [
  'auctionAtAGlance',
  'openingBid',
  'ruleFirst',
  'auctionDuration',
  'ruleTime',
  'auctionSoftClose',
  'ruleRaise',
  'auctionNoFee',
  'auctionReadMore',
] as const satisfies WordList;
export type AuctionSummaryWords = Words<typeof AUCTION_SUMMARY_WORDS>;
