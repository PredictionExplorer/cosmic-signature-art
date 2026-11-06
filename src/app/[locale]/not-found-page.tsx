import { getCuratedArtwork } from '@/lib/art/catalog';
import { getInterpretation } from '@/lib/art/types';
import type { Locale } from '@/lib/i18n/routing';
import { NotFoundView } from './not-found-view';

/** The work next door: a curated Light still that is always held locally. */
const NEIGHBOUR = 31;

/**
 * The venue's not-found. The server hands the client view one interpretation of one work, so
 * the page never carries the curated catalog and its derivative registries into the browser.
 * Inside the venue's frame the locale is the route's; where no route answered, the venue's 404
 * names it (src/app/global-not-found.tsx).
 */
export function NotFoundPage({ locale }: { locale?: Locale }) {
  const light = getInterpretation(getCuratedArtwork(NEIGHBOUR)!, 'light');
  return <NotFoundView neighbour={NEIGHBOUR} light={light} locale={locale} />;
}
