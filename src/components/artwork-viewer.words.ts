import type { WordList, Words } from '@/lib/i18n/words';
import { ARTWORK_GATEFOLD_WORDS } from './artwork-gatefold.words';
import { ARTWORK_NEIGHBOURS_WORDS } from './artwork-neighbours.words';
import { ARTWORK_OPTIONS_WORDS } from './artwork-options.words';
import { ARTWORK_ROOM_WORDS } from './artwork-room.words';

/**
 * A plate and everything a visitor can do from it: the strip under the plate and its Turn, what
 * a film says as it plays and after its frame, and the words of the parts it opens (the ways to
 * look, the gatefold, the neighbours, the viewing room).
 */
export const ARTWORK_VIEWER_WORDS = [
  'ink',
  'light',
  'showInk',
  'showLight',
  'noInkPublished',
  'still',
  'film',
  'excerpt',
  'arriving',
  'again',
  'filmInRoom',
  'filmPhysics',
  'throughSpectrum',
  'afterTheFrame',
  'sentences',
  'ways',
  'preparingExpression',
  'expressionFailed',
  'mediaUnavailable',
  ...ARTWORK_OPTIONS_WORDS,
  ...ARTWORK_GATEFOLD_WORDS,
  ...ARTWORK_NEIGHBOURS_WORDS,
  ...ARTWORK_ROOM_WORDS,
] as const satisfies WordList;
export type ArtworkViewerWords = Words<typeof ARTWORK_VIEWER_WORDS>;
