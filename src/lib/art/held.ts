import { artworkFromIndex } from './collection-cards';
import type { IndexedWork } from './collection-index';
import type { Artwork } from './types';

/**
 * What the venue itself holds of a work before its live record has been read: the copy a
 * work's page paints its plate from at once, while the record streams after it
 * (src/app/[locale]/art/[id]/page.tsx). The work is then in the first bytes of its page, and it
 * stands there whether or not a script ever runs.
 */
export interface HeldWork {
  /** The copy the plate opens from. */
  artwork: Artwork;
  /** The identity-verified registry's copy, whose stills carry inline previews. */
  curated: boolean;
}

/**
 * The registry's copy comes first. For every other indexed work the build-time index names the
 * same media the indexer advertises, bound to the venue's own hash-checked cuts by the checks
 * the live path uses (collection-cards.ts).
 *
 * Either stands only when it holds a still of the expression the plate opens on (opening.ts):
 * a copy without that still must not decide the opening otherwise. Nothing is held of a work
 * the index does not know, one imprinted after the index was read, and its page waits for the
 * record.
 */
export function heldWork(
  registry: Artwork | undefined,
  indexed: IndexedWork | undefined,
  opening: string,
): HeldWork | undefined {
  const holds = (artwork: Artwork | undefined): artwork is Artwork =>
    !!artwork?.media.some((item) => item.id === opening && item.still);
  if (holds(registry)) return { artwork: registry, curated: true };
  const snapshot = indexed ? artworkFromIndex(indexed) : undefined;
  return holds(snapshot) ? { artwork: snapshot, curated: false } : undefined;
}
