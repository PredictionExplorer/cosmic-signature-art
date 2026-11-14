import type { WordList, Words } from '@/lib/i18n/words';

/** The spectral sweep's player: what it is, its one control, and what it says if it cannot play. */
export const SWEEP_PLAYER_WORDS = [
  'light',
  'spectralSweep',
  'playSweep',
  'again',
  'mediaUnavailable',
] as const satisfies WordList;
export type SweepPlayerWords = Words<typeof SWEEP_PLAYER_WORDS>;
