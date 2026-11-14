import { EXPRESSION_WORDS } from '@/lib/i18n/format.words';
import type { WordList, Words } from '@/lib/i18n/words';

/** A wall of plates: each card's expression and clip, and the strip that heads a cycle. */
export const PLATE_SEQUENCE_WORDS = [
  'noInkPublished',
  'lightOnly',
  'settling',
  'excerpt',
  // The chapter strip: a cycle, its count and its date.
  'cycle',
  'oneWork',
  'worksCount',
  'imprintedOn',
  ...EXPRESSION_WORDS,
] as const satisfies WordList;
export type PlateSequenceWords = Words<typeof PLATE_SEQUENCE_WORDS>;
