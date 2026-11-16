import { describe, expect, it } from 'vitest';
import { curatedArtworks, getCuratedArtwork } from './catalog';
import { artworkFromIndex } from './collection-cards';
import { collectionIndex, indexedWork } from './collection-index';
import { heldWork } from './held';

/** In the index and not in the registry, as most works are. */
const UNCURATED = 17;

describe('what the venue holds of a work', () => {
  it('opens a registry work from the registry when it holds the opening still', () => {
    const registry = getCuratedArtwork(31)!;
    for (const opening of ['ink', 'light'])
      expect(heldWork(registry, indexedWork(31), opening)).toEqual({
        artwork: registry,
        curated: true,
      });
  });

  it('opens from the index when the registry lacks the opening expression', () => {
    // The registry keeps a Light still alone for most of its works; on an Ink day the index's
    // copy opens the plate instead, and nothing waits for the indexer.
    const lightOnly = curatedArtworks.find(
      (work) => !work.media.some((item) => item.id === 'ink') && indexedWork(work.id)?.media.ink,
    )!;
    expect(lightOnly).toBeDefined();
    const indexed = indexedWork(lightOnly.id)!;
    expect(heldWork(lightOnly, indexed, 'light')).toEqual({ artwork: lightOnly, curated: true });
    expect(heldWork(lightOnly, indexed, 'ink')).toEqual({
      artwork: artworkFromIndex(indexed),
      curated: false,
    });
  });

  it('opens every other indexed work from the index', () => {
    expect(getCuratedArtwork(UNCURATED)).toBeUndefined();
    const indexed = indexedWork(UNCURATED)!;
    expect(heldWork(undefined, indexed, 'ink')).toEqual({
      artwork: artworkFromIndex(indexed),
      curated: false,
    });
  });

  it('holds every indexed work in every expression it publishes', () => {
    // The promise a work's page rests on: no work the index knows waits for the indexer.
    const waiting = collectionIndex.works.flatMap((work) =>
      (['ink', 'light'] as const)
        .filter((expression) => work.media[expression])
        .filter((expression) => !heldWork(getCuratedArtwork(work.id), work, expression))
        .map((expression) => `${work.id} ${expression}`),
    );
    expect(waiting).toEqual([]);
  });

  it('holds nothing of an expression neither copy publishes, nor of an unknown work', () => {
    expect(heldWork(getCuratedArtwork(31), indexedWork(31), 'silk')).toBeUndefined();
    expect(heldWork(undefined, undefined, 'ink')).toBeUndefined();
  });
});
