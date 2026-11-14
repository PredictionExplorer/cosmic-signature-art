import { CHAIN_STATE_WORDS } from '@/lib/auction/catalogue.words';
import { EXPRESSION_WORDS } from '@/lib/i18n/format.words';
import type { WordList, Words } from '@/lib/i18n/words';
import { YOUR_ACTIVITY_WORDS } from './your-activity.words';

/**
 * The sale as a catalogue of lots: its head and paging, each lot's numeral, plate and line of
 * chain state, and the collector's activity it opens.
 */
export const AUCTION_GALLERY_WORDS = [
  'browseLots',
  'orderOfSale',
  'lotNumeral',
  'yourActivity',
  'newer',
  'older',
  'noWorks',
  'readingRecord',
  'liveUnavailable',
  // Each lot.
  'cycle',
  'sit',
  'collect',
  'mediaNotPublished',
  'mediaUnavailable',
  ...EXPRESSION_WORDS,
  ...CHAIN_STATE_WORDS,
  ...YOUR_ACTIVITY_WORDS,
] as const satisfies WordList;
export type AuctionGalleryWords = Words<typeof AUCTION_GALLERY_WORDS>;
