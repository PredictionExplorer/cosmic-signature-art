import { describe, expect, it } from 'vitest';
import { artworkFromIndex } from './collection-cards';
import { indexedWork } from './collection-index';
import { getCuratedArtwork } from './catalog';

describe('cards from the index', () => {
  it('attaches the curated local stills and the hash-verified excerpt to a curated work', () => {
    const card = artworkFromIndex(indexedWork(31)!);
    const ink = card.media.find((media) => media.id === 'ink')!;
    const light = card.media.find((media) => media.id === 'light')!;
    expect(card.seed).toBe(getCuratedArtwork(31)!.seed);
    expect(card.cycle).toBe(1);
    expect(ink.still).toBe('/art/31-ink.webp');
    expect(ink.thumbnail).toBe('/art/31-ink-640.webp');
    expect(ink.availability).toBe('local-copy');
    expect(ink.previewFilm?.src).toMatch(/^\/art\/previews\/31-[a-f0-9]+\.mp4$/);
    expect(ink.previewFilm?.startSeconds).toBe(6);
    // The complete local 1280 film stands in for the published original, which stays named.
    expect(ink.films[0]).toMatchObject({ id: 'normal', delivery: 'local-preview' });
    expect(ink.films[0].sourceUrl).toContain(`/${card.seed}/videos/web/ember.mp4`);
    expect(ink.films.map((film) => film.id)).toEqual(['normal', 'medium', 'slow']);
    expect(light.still).toBe('/art/31-light.webp');
    expect(light.films.map((film) => film.id)).toEqual(['normal', 'sweep']);
    expect(card.availability).toMatchObject({ media: 'local-copy', ink: 'known' });
    expect(card.provenance.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('builds a published card for any other work, with the manifest’s own URLs and hashes', () => {
    const work = indexedWork(1)!;
    const card = artworkFromIndex(work);
    const ink = card.media.find((media) => media.id === 'ink')!;
    const light = card.media.find((media) => media.id === 'light')!;
    expect(ink.still).toBe(
      `https://a1.cosmicsignature.com/images/new/cosmicsignature/${work.seed}/images/web/ember_full.webp`,
    );
    expect(ink.thumbnail).toMatch(/\/images\/web\/ember_preview\.webp$/);
    expect(ink.stillSha256).toBe(work.media.ink?.still?.sha256);
    expect(ink.source).toBe('published-manifest');
    expect(ink.availability).toBe('advertised');
    expect(ink.previewFilm?.src).toMatch(/^\/art\/previews\/1-[a-f0-9]+\.mp4$/);
    expect(light.thumbnailWidth).toBe(640);
    expect(card.title).toBe(work.name);
    expect(card.provenance.manifestUrl).toContain(`/${work.seed}/metadata/assets.json`);
    expect(card.availability).toMatchObject({ record: 'indexed', media: 'advertised' });
  });

  it('leaves out an expression the manifest never advertised', () => {
    const work = indexedWork(1)!;
    const card = artworkFromIndex({ ...work, media: { light: work.media.light } });
    expect(card.media.map((media) => media.id)).toEqual(['light']);
    expect(card.availability.ink).toBe('not-advertised');
    const empty = artworkFromIndex({ ...work, media: {} });
    expect(empty.media).toEqual([]);
    expect(empty.availability.media).toBe('unavailable');
  });
});
