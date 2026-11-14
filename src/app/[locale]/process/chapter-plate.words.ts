import { EXPRESSION_WORDS } from '@/lib/i18n/format.words';
import type { WordList, Words } from '@/lib/i18n/words';

/** A chapter's live plate: its expression, its still and film, and the words of its strip. */
export const CHAPTER_PLATE_WORDS = [
  'arriving',
  'film',
  'still',
  'play',
  'again',
  'sit',
  ...EXPRESSION_WORDS,
] as const satisfies WordList;
export type ChapterPlateWords = Words<typeof CHAPTER_PLATE_WORDS>;
