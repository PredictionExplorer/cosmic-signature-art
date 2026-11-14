import type { WordList, Words } from '@/lib/i18n/words';

/** The ways to look at a plate: the room, the sitting, and the film from its closest approach. */
export const ARTWORK_OPTIONS_WORDS = [
  'ways',
  'keyStudy',
  'enlarge',
  'keySit',
  'sit',
  'closestApproachAt',
  'toClosestApproach',
] as const satisfies WordList;
export type ArtworkOptionsWords = Words<typeof ARTWORK_OPTIONS_WORDS>;
