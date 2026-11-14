import type { WordList, Words } from '@/lib/i18n/words';

/** The ways on from a work: its neighbours by number and by wavelength, and the sale. */
export const ARTWORK_NEIGHBOURS_WORDS = [
  'previousWork',
  'nextWork',
  'nextByWavelength',
  'nmRedder',
  'nmBluer',
  'collect',
  'auctions',
] as const satisfies WordList;
export type ArtworkNeighboursWords = Words<typeof ARTWORK_NEIGHBOURS_WORDS>;
