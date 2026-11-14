import { EXPRESSION_WORDS, FILM_LABEL_WORDS } from '@/lib/i18n/format.words';
import type { WordList, Words } from '@/lib/i18n/words';
import { ROOM_NOTICE_WORDS } from './room-notice.words';

/**
 * The viewing room: its strip of expressions and films, the transport, the loupe's readout, the
 * two lenses, its key sheet, and what it says while a film or an expression is on its way. Its
 * notice holds room for the lines it may come to say, and lists them itself.
 */
export const ARTWORK_ROOM_WORDS = [
  'viewingRoom',
  'close',
  'ways',
  'sources',
  'still',
  'wholePlate',
  'detail',
  'detailWindow',
  'detailOf',
  'scaleNative',
  'scaleReadout',
  'loupeKeys',
  'fullScreen',
  'exitFullScreen',
  'fullScreenUnavailable',
  // The films and their transport.
  'durationSeconds',
  'filmPhysics',
  'filmPosition',
  'timeOf',
  'elapsed',
  'loadingFilm',
  'slowRoom',
  'studyWaits',
  'playAnyway',
  'retry',
  'preparingExpression',
  'expressionFailed',
  'mediaUnavailable',
  // The When lens and the Wavelength lens.
  'analysisNotWork',
  'whenLens',
  'whenLight',
  'whenInk',
  'whenFirst',
  'whenLast',
  'whenAlt',
  'whenUnavailable',
  'wavelengthLens',
  'wavelengthCaption',
  'wavelengthValue',
  'wavelengthAlt',
  'wavelengthLoading',
  'wavelengthUnavailable',
  // The room's keys.
  'roomKeys',
  'keyPlay',
  'keyScrub',
  'keyExpressions',
  'keyFilm',
  'keyDetail',
  'keyWhole',
  'keyWhen',
  'keyWavelength',
  'keyHelp',
  ...EXPRESSION_WORDS,
  ...FILM_LABEL_WORDS,
  ...ROOM_NOTICE_WORDS,
] as const satisfies WordList;
export type ArtworkRoomWords = Words<typeof ARTWORK_ROOM_WORDS>;
