import type { WordList, Words } from '@/lib/i18n/words';

/** The field of candidate orbits: what it says while it derives them, and of what it found. */
export const CHOICE_FIELD_WORDS = [
  'choiceFieldCaption',
  'choiceFieldWaiting',
  'choiceFieldProgress',
  'choiceFieldDerived',
  'choiceFieldUnavailable',
  'choiceFieldSummary',
  'choiceFieldAllPassed',
  'choiceFieldSomePassed',
  'choiceFieldSearch',
  'choiceFieldMassesExact',
  'choiceFieldMassesDiffer',
  'orbitMomentum',
  'orbitEnergy',
] as const satisfies WordList;
export type ChoiceFieldWords = Words<typeof CHOICE_FIELD_WORDS>;
