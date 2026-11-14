import type { WordList, Words } from '@/lib/i18n/words';

/** The collection's bar: its name, the Index word, and the two ways through the pages. */
export const COLLECTION_BAR_WORDS = [
  'collectionControls',
  'index',
  'newer',
  'older',
] as const satisfies WordList;
export type CollectionBarWords = Words<typeof COLLECTION_BAR_WORDS>;
