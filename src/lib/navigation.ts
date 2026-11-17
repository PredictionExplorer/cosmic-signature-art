import type { Messages } from './i18n/en';

/**
 * The public rooms beside the home, which is the essay on how a work is made and is reached by
 * the venue's name. Auction pages remain available only by direct URL until launch.
 */
export const NAVIGATION = ['/collection', '/exhibitions', '/statement'] as const;
export type NavigationPath = (typeof NAVIGATION)[number];
/** The running head leaves the full directory to Index and the colophon. */
export const PRIMARY_NAVIGATION = [
  '/collection',
  '/exhibitions',
] as const satisfies readonly NavigationPath[];
/** Each room's word, by its literal key, so a component that reads some rooms names only theirs. */
export const NAVIGATION_LABEL = {
  '/collection': 'collection',
  '/exhibitions': 'exhibitions',
  '/statement': 'statement',
} as const satisfies Record<NavigationPath, keyof Messages>;
