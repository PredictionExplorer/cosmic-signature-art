import type { WordList, Words } from '@/lib/i18n/words';

/** What the venue says when a page fails: the one line, and the word that tries again. */
export const ERROR_PAGE_WORDS = ['errorTitle', 'retry'] as const satisfies WordList;
export type ErrorPageWords = Words<typeof ERROR_PAGE_WORDS>;
