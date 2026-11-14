import type { WordList, Words } from '@/lib/i18n/words';

/** What the venue's 404 says: which of three things is missing, and the two ways on. */
export const NOT_FOUND_WORDS = [
  'notImprinted',
  'pageNotFound',
  'notFound',
  'light',
  'nextDoor',
  'collection',
] as const satisfies WordList;
export type NotFoundWords = Words<typeof NOT_FOUND_WORDS>;
