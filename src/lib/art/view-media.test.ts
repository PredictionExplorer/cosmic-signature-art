import { describe, expect, it } from 'vitest';
import { artworkFromIndex } from './collection-cards';
import { indexedWork } from './collection-index';
import { getCuratedArtwork } from './catalog';
import { artworkForView, mediaForView } from './view-media';

const indexed = artworkFromIndex(indexedWork(40)!);
const curated = getCuratedArtwork(31)!;
const ink = (work = indexed) => work.media.find((media) => media.id === 'ink')!;
const light = (work = indexed) => work.media.find((media) => media.id === 'light')!;

describe('media for a view', () => {
  it('keeps what a card shows and may play, and drops the rest', () => {
    const full = ink();
    expect(full.settlingFilm).toBeDefined();
    expect(full.detail?.length).toBeGreaterThan(0);
    expect(full.films.length).toBeGreaterThan(0);
    const card = mediaForView(full, 'card');
    expect(card).toEqual({
      id: 'ink',
      label: full.label,
      still: full.still,
      thumbnail: full.thumbnail,
      thumbnailWidth: full.thumbnailWidth,
      thumbnailHeight: full.thumbnailHeight,
      stillSha256: full.stillSha256,
      width: full.width,
      height: full.height,
      films: [],
      source: full.source,
      availability: full.availability,
      rungs: full.rungs,
      previewFilm: full.previewFilm,
      settlingFilm: full.settlingFilm,
    });
    expect(card).not.toHaveProperty('detail');
    expect(card).not.toHaveProperty('openingFilm');
    expect(card).not.toHaveProperty('master');
  });

  it('gives a Light card and any still view the images and the ladder alone', () => {
    const lightCard = mediaForView(light(), 'card');
    expect(lightCard.rungs).toEqual(light().rungs);
    expect(lightCard).not.toHaveProperty('settlingFilm');
    expect(lightCard).not.toHaveProperty('previewFilm');
    const still = mediaForView(ink(), 'still');
    expect(still).not.toHaveProperty('settlingFilm');
    expect(still).not.toHaveProperty('previewFilm');
    expect(still.films).toEqual([]);
  });

  it('drops the opening clip and the complete films of a curated work, keeping its identity whole', () => {
    expect(ink(curated).openingFilm).toBeDefined();
    const work = artworkForView(curated, 'card');
    expect(work.id).toBe(curated.id);
    expect(work.seed).toBe(curated.seed);
    expect(work.provenance).toEqual(curated.provenance);
    expect(ink(work)).not.toHaveProperty('openingFilm');
    expect(ink(work).films).toEqual([]);
    expect(ink(work).previewFilm?.id).toBe('catalogue');
    // The original is untouched.
    expect(ink(curated).openingFilm).toBeDefined();
    expect(ink(curated).films.length).toBeGreaterThan(0);
  });

  it('weighs a page of cards at a fraction of the full records', () => {
    const page = Array.from({ length: 18 }, (_, i) => artworkFromIndex(indexedWork(71 - i)!));
    const full = JSON.stringify(page).length;
    const cards = JSON.stringify(page.map((work) => artworkForView(work, 'card'))).length;
    expect(cards).toBeLessThan(full * 0.6);
  });
});
