import type { WordList, Words } from '@/lib/i18n/words';

/** Checking a downloaded file against its published hash, in the visitor's own browser. */
export const VERIFY_DOWNLOAD_WORDS = [
  'verifyDownload',
  'verifyIntro',
  'verifyChoose',
  'verifyReading',
  'verifyMatches',
  'verifyNoMatch',
  'verifyTooLarge',
  'verifyFailed',
  'publishedHashes',
  'copyAddress',
  'copied',
] as const satisfies WordList;
export type VerifyDownloadWords = Words<typeof VERIFY_DOWNLOAD_WORDS>;
