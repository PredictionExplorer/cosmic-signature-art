import { EXPRESSION_WORDS } from '@/lib/i18n/format.words';
import type { WordList, Words } from '@/lib/i18n/words';

/** A hang names each plate's expression and nothing else. */
export const HANG_WORDS = [...EXPRESSION_WORDS] as const satisfies WordList;
export type HangWords = Words<typeof HANG_WORDS>;
