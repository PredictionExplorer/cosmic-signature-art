import type { WordList, Words } from '@/lib/i18n/words';

/** The gatefold: both expressions of one work across the seam, and the seam's own control. */
export const ARTWORK_GATEFOLD_WORDS = [
  'gatefold',
  'gatefoldCaption',
  'gatefoldSpread',
  'gatefoldSeam',
  'gatefoldSeamLabel',
  'ink',
  'light',
] as const satisfies WordList;
export type ArtworkGatefoldWords = Words<typeof ARTWORK_GATEFOLD_WORDS>;
