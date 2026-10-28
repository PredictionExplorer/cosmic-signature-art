import type { Messages } from './i18n/en';

/** The public rooms. Auction pages remain available only by direct URL until launch. */
export const NAVIGATION = ['/collection', '/exhibitions', '/process', '/statement'] as const;
export type NavigationPath = (typeof NAVIGATION)[number];
/** The running head leaves the full directory to Index and the colophon. */
export const PRIMARY_NAVIGATION = [
  '/collection',
  '/exhibitions',
] as const satisfies readonly NavigationPath[];
export const NAVIGATION_LABEL: Record<NavigationPath, keyof Messages> = {
  '/collection': 'collection',
  '/exhibitions': 'exhibitions',
  '/process': 'process',
  '/statement': 'statement',
};
