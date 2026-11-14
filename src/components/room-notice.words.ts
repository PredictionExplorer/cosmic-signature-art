import type { WordList, Words } from '@/lib/i18n/words';

/**
 * Every line the room's notice may come to say, for which it holds room before the line is
 * there: what it says while an expression or a film is on its way, the loupe's readout at its
 * widest, and the two lenses' labels.
 */
export const ROOM_NOTICE_WORDS = [
  'preparingExpression',
  'expressionFailed',
  'mediaUnavailable',
  'fullScreenUnavailable',
  'loadingFilm',
  'slowRoom',
  'elapsed',
  'studyWaits',
  'playAnyway',
  'durationSeconds',
  'detailOf',
  'scaleReadout',
  'analysisNotWork',
  'whenLight',
  'whenInk',
  'whenUnavailable',
  'wavelengthCaption',
  'wavelengthLoading',
  'wavelengthUnavailable',
] as const satisfies WordList;
export type RoomNoticeWords = Words<typeof ROOM_NOTICE_WORDS>;
