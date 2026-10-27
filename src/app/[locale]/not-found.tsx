import { getCuratedArtwork } from '@/lib/art/catalog';
import { getInterpretation } from '@/lib/art/types';
import { NotFoundView } from './not-found-view';

/** The work next door: a curated Light still that is always held locally. */
const NEIGHBOUR = 31;

/**
 * The server hands the client view one interpretation of one work, so the page never carries
 * the curated catalog and its derivative registries into the browser.
 */
export default function NotFound() {
  const light = getInterpretation(getCuratedArtwork(NEIGHBOUR)!, 'light');
  return <NotFoundView neighbour={NEIGHBOUR} light={light} />;
}
