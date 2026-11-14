import type { WordList, Words } from '../i18n/words';

/** A chain date's reading in the visitor's own zone (formatChainDate). */
export const CHAIN_DATE_WORDS = ['inYourZone'] as const satisfies WordList;
export type ChainDateWords = Words<typeof CHAIN_DATE_WORDS>;

/** The one line a lot states about its phase on the chain (chainStateLine). */
export const CHAIN_STATE_WORDS = [
  'lotAvailable',
  'openingMinimum',
  'preview',
  'lotEligibleFrom',
  'active',
  'lotCloses',
  'lotLateBids',
  'ended',
  'settled',
  'lotWonBy',
  'lotDeliveredWord',
  'lotAwaitingDelivery',
  ...CHAIN_DATE_WORDS,
] as const satisfies WordList;
export type ChainStateWords = Words<typeof CHAIN_STATE_WORDS>;
