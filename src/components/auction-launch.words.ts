import type { WordList, Words } from '@/lib/i18n/words';
import { AUCTION_GALLERY_WORDS } from './auction-gallery.words';

/** The sale's opening: what it says while no sale is offered, and the catalogue once one is. */
export const AUCTION_LAUNCH_WORDS = [
  'contractStatusLabel',
  'auctionNotLiveCopy',
  'auctionBrowseArt',
  'cycle',
  ...AUCTION_GALLERY_WORDS,
] as const satisfies WordList;
export type AuctionLaunchWords = Words<typeof AUCTION_LAUNCH_WORDS>;
