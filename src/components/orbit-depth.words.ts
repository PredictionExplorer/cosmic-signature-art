import type { WordList, Words } from '@/lib/i18n/words';

/** The orbit in depth: how it is turned, and the words of its controls. */
export const ORBIT_DEPTH_WORDS = [
  'depthHint',
  'depthHintTouch',
  'depthTurnLeft',
  'depthTurnRight',
  'depthTiltUp',
  'depthTiltDown',
  'depthOpen',
  'depthWaiting',
  'depthUnavailable',
  // The one name of the view it opens from, as the orbit on a work's page says it.
  'orbitGeneratorView',
  'light',
  'play',
  'pause',
  'again',
] as const satisfies WordList;
export type OrbitDepthWords = Words<typeof ORBIT_DEPTH_WORDS>;
