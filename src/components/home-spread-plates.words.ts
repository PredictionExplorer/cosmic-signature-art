import type { WordList, Words } from '@/lib/i18n/words';

/** The home's spread of two plates: its name, each leaf's expression, and what its clip is. */
export const SPREAD_PLATES_WORDS = [
  'selectedWorks',
  'ink',
  'light',
  'settling',
  'excerpt',
] as const satisfies WordList;
export type SpreadPlatesWords = Words<typeof SPREAD_PLATES_WORDS>;
