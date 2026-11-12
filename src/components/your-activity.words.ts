import type { WordList, Words } from '@/lib/i18n/words';

/** A collector's own activity in the sale, looked up by wallet or by address. */
export const YOUR_ACTIVITY_WORDS = [
  'yourActivity',
  'close',
  'sheetHandle',
  'activityIntro',
  'activityAddress',
  'activityLookUp',
  'activityUseWallet',
  'invalidAddress',
  'activityUnavailable',
  'activityFor',
  'activityLeading',
  'activityNone',
  'activityCommitted',
  'activityRefundable',
  'activityWon',
  'activityHeld',
  'readingRecord',
] as const satisfies WordList;
export type YourActivityWords = Words<typeof YOUR_ACTIVITY_WORDS>;
