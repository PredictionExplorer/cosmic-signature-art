import { describe, expect, it } from 'vitest';
import { createArrivalLookup, withArrivalMaps } from './arrival-maps';
import { getCuratedArtwork } from './catalog';
import type { ArtInterpretation } from './types';

const seed = `0x${'a'.repeat(64)}` as const;
const still = 'b'.repeat(64);
const source = 'c'.repeat(64);
const sha = 'd'.repeat(64);

const entry = {
  id: 7,
  seed,
  expression: 'light',
  src: `/art/arrival/7-light-${sha.slice(0, 16)}.webp`,
  sha256: sha,
  bytes: 12_000,
  width: 576,
  height: 372,
  sourceSha256: source,
  stillSha256: still,
  frames: 901,
  figureShare: 0.15,
};
const registry = (maps: unknown[]) => ({
  schemaVersion: 1,
  measuredOn: '2026-10-30',
  parameters: { spread: 0.35, width: 576 },
  maps,
});
const light: ArtInterpretation = {
  id: 'light',
  label: 'Light',
  still: '/light.webp',
  stillSha256: still,
  films: [
    {
      id: 'normal',
      label: 'Film',
      src: 'https://example.test/main.mp4',
      sourceSha256: source,
      mimeType: 'video/mp4',
      variantKey: '7:light:normal',
      delivery: 'original-web',
    },
  ],
  source: 'published-manifest',
  availability: 'advertised',
};

describe('the arrival maps', () => {
  it('bind to the expression whose film and still they were measured from', () => {
    const bind = createArrivalLookup(registry([entry]));
    expect(bind({ id: 7, seed }, light).arrival).toEqual({
      src: entry.src,
      sha256: sha,
      width: 576,
      height: 372,
      spread: 0.35,
    });
  });

  it('bind by the still alone where the archive keeps the still without its film', () => {
    const bind = createArrivalLookup(registry([entry]));
    expect(bind({ id: 7, seed }, { ...light, films: [] }).arrival?.src).toBe(entry.src);
    // A film whose hash is unknown cannot be checked, so it cannot vouch for the map.
    const unhashed = { ...light.films[0], sourceSha256: undefined };
    expect(bind({ id: 7, seed }, { ...light, films: [unhashed] }).arrival).toBeUndefined();
  });

  it('drop a map whose seed, still or film no longer agrees, or that is duplicated', () => {
    const bind = createArrivalLookup(registry([entry]));
    expect(bind({ id: 7, seed: `0x${'e'.repeat(64)}` }, light).arrival).toBeUndefined();
    expect(
      bind({ id: 7, seed }, { ...light, stillSha256: 'f'.repeat(64) }).arrival,
    ).toBeUndefined();
    expect(
      bind({ id: 7, seed }, { ...light, films: [{ ...light.films[0], sourceSha256: sha }] })
        .arrival,
    ).toBeUndefined();
    expect(bind({ id: 8, seed }, light).arrival).toBeUndefined();
    expect(
      createArrivalLookup(registry([entry, entry]))({ id: 7, seed }, light).arrival,
    ).toBeUndefined();
    expect(
      createArrivalLookup({ schemaVersion: 2 })({ id: 7, seed }, light).arrival,
    ).toBeUndefined();
    const stale = { ...light, arrival: { src: '/x', sha256: sha, width: 1, height: 1, spread: 1 } };
    expect(createArrivalLookup(registry([]))({ id: 7, seed }, stale).arrival).toBeUndefined();
  });

  it('are bound for a curated work in both expressions', () => {
    const work = getCuratedArtwork(31)!;
    const media = withArrivalMaps(work, work.media);
    for (const id of ['ink', 'light'])
      expect(media.find((item) => item.id === id)?.arrival?.src).toMatch(
        new RegExp(`^/art/arrival/31-${id}-[a-f0-9]{16}\\.webp$`),
      );
  });
});
