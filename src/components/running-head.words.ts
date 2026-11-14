import type { WordList, Words } from '@/lib/i18n/words';

/** The label of the mark beside the venue's name, wherever the wordmark is set. */
export const WORDMARK_WORDS = ['markLabel'] as const satisfies WordList;
export type WordmarkWords = Words<typeof WORDMARK_WORDS>;

/** What the running head says: the skip link, its two rooms, Index, motion and language. */
export const RUNNING_HEAD_WORDS = [
  'skip',
  'siteNavigation',
  // The two primary rooms (PRIMARY_NAVIGATION, src/lib/navigation.ts).
  'collection',
  'exhibitions',
  'index',
  'pauseAmbientMotion',
  'language',
  ...WORDMARK_WORDS,
] as const satisfies WordList;
export type RunningHeadWords = Words<typeof RUNNING_HEAD_WORDS>;
