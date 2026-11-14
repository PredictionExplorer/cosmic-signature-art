import type { WordList, Words } from '@/lib/i18n/words';

/** The key sheet's name, its close word, and what each key does. */
export const KEY_SHEET_WORDS = [
  'keysSheet',
  'close',
  'keyPlay',
  'keyNeighbours',
  'keyExpressions',
  'keyFilm',
  'keySit',
  'keyStudy',
  'keyIndex',
  'keyJump',
  'keyHelp',
] as const satisfies WordList;
export type KeySheetWords = Words<typeof KEY_SHEET_WORDS>;
