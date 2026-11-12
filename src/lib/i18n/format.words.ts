import type { WordList, Words } from './words';

/** The two expressions' names (expressionWord). */
export const EXPRESSION_WORDS = ['ink', 'light'] as const satisfies WordList;
export type ExpressionWords = Words<typeof EXPRESSION_WORDS>;

/** The published film roles' names (filmLabel). */
export const FILM_LABEL_WORDS = [
  'film',
  'longStudy',
  'extendedStudy',
  'sweepFilm',
] as const satisfies WordList;
export type FilmLabelWords = Words<typeof FILM_LABEL_WORDS>;

/** A stretch of film time in words (filmSpan). */
export const FILM_SPAN_WORDS = ['fateSeconds', 'fateMinutes'] as const satisfies WordList;
export type FilmSpanWords = Words<typeof FILM_SPAN_WORDS>;
