import type { Messages } from './i18n/en';

/** One navigation vocabulary, in this order, everywhere the venue lists its rooms. */
export const NAVIGATION = ['/collection', '/auctions', '/process', '/statement'] as const;
export type NavigationPath = (typeof NAVIGATION)[number];
export const NAVIGATION_LABEL: Record<NavigationPath, keyof Messages> = {
  '/collection': 'collection',
  '/auctions': 'auctions',
  '/process': 'process',
  '/statement': 'statement',
};
/** On phones the Index sheet lists Auctions first, so a collector never hunts. */
export const POCKET_NAVIGATION: readonly NavigationPath[] = [
  '/auctions',
  '/collection',
  '/process',
  '/statement',
];
