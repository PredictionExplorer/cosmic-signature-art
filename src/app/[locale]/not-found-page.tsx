import { getCuratedArtwork } from '@/lib/art/catalog';
import { artworkFromIndex } from '@/lib/art/collection-cards';
import { indexedWork } from '@/lib/art/collection-index';
import { getInterpretation } from '@/lib/art/types';
import { askedWork, asksForWork, nearestWork } from '@/lib/addresses';
import type { Locale } from '@/lib/i18n/routing';
import { NotFoundView } from './not-found-view';

/** The work next door where the address names none: a curated Light still, always held locally. */
const NEIGHBOUR = 31;

/**
 * The venue's not-found. The server hands the client view one interpretation of one work, so
 * the page never carries the curated catalog and its derivative registries into the browser.
 * Inside the venue's frame the locale is the route's; where no route answered, the venue's 404
 * names it and the address the visitor asked for (src/app/global-not-found.tsx). A work asked for
 * by a number the collection does not hold is next door to the nearest one it does: № 999 to the
 * last work, never to a work that happens to be the venue's favourite.
 */
export function NotFoundPage({ locale, address }: { locale?: Locale; address?: string }) {
  const asked = askedWork(address);
  const neighbour = (asked === undefined ? undefined : nearestWork(asked)) ?? NEIGHBOUR;
  const indexed = indexedWork(neighbour);
  const work = getCuratedArtwork(neighbour) ?? (indexed ? artworkFromIndex(indexed) : undefined);
  const light = work ? getInterpretation(work, 'light') : undefined;
  // A page's own notFound() has no address to read: the work pages are the ones that call it.
  const page = address !== undefined && !asksForWork(address);
  return (
    <NotFoundView neighbour={neighbour} light={light} locale={locale} asked={asked} page={page} />
  );
}
