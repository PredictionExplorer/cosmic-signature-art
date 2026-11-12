import type { WordList, Words } from '@/lib/i18n/words';

/**
 * What the Index sheet says: its orderings, hangings and views, the search, the venue's rooms
 * (it is the menu on a phone), the cycles, the filter chips and the languages.
 */
export const INDEX_SHEET_WORDS = [
  'indexSheet',
  'closeIndex',
  'indexWallHint',
  'ordering',
  'orderNumber',
  'orderCycle',
  'orderSpectrum',
  'hangTogether',
  'hangAlone',
  'ink',
  'light',
  'collectionViews',
  'allTheLight',
  'orrery',
  'search',
  'searchPlaceholder',
  'find',
  'siteNavigation',
  // Every room (NAVIGATION, src/lib/navigation.ts).
  'collection',
  'exhibitions',
  'process',
  'statement',
  'pauseAmbientMotion',
  'index',
  'cycle',
  'imprintedOn',
  'filters',
  'clearFilters',
  // The traits a chip can filter by (TRAIT_KEYS, src/lib/art/collection-traits.ts).
  'structure',
  'underlay',
  'palette',
  'spectralClass',
  'massBalance',
  'fate',
  'language',
] as const satisfies WordList;
export type IndexSheetWords = Words<typeof INDEX_SHEET_WORDS>;
