import { describe, expect, it } from 'vitest';
import { getCuratedArtwork } from './catalog';
import { parseMediaManifest, preferVerifiedLocalDelivery } from './media';
import { parseTokenRecord } from './validation';

const art = getCuratedArtwork(31)!;
const ink = art.media.find((item) => item.id === 'ink')!;
const manifest = (assets: unknown[]) => ({ schema_version: 2, assets });
const still = {
  role: 'ember_web_full',
  path: 'images/web/ember_full.webp',
  kind: 'image',
  width: 3456,
  height: 2234,
  sha256: ink.stillSha256,
};
const film = {
  role: 'ember_web',
  path: 'videos/web/ember.mp4',
  kind: 'video',
  duration_seconds: 30.033333,
  sha256: ink.films[0].sourceSha256,
};

describe('authentic media manifest', () => {
  it('only advertises interpretations present in the package', () => {
    const parsed = parseMediaManifest(manifest([still, film]), art)!;
    expect(parsed.map((item) => item.id)).toEqual(['ink']);
    expect(parsed[0].films[0]).toMatchObject({
      id: 'normal',
      variantKey: '31:ink:normal',
      delivery: 'original-web',
    });
    expect(parsed[0].films[0].src).toContain(`${art.seed}/videos/web/ember.mp4`);
  });

  it.each([
    'https://evil.example/film.mp4',
    '//evil.example/film.mp4',
    '../../other/film.mp4',
    'videos/web/ember_medium.mp4',
  ])('rejects a role with unsafe or mismatched path %s', (path) => {
    const parsed = parseMediaManifest(manifest([still, { ...film, path }]), art)!;
    expect(parsed[0].films).toEqual([]);
  });

  it('rejects ambiguous duplicate roles and unsupported manifest versions', () => {
    expect(parseMediaManifest(manifest([still, film, film]), art)![0].films).toEqual([]);
    expect(parseMediaManifest({ schema_version: 99, assets: [still] }, art)).toBeNull();
  });

  it('uses lightweight delivery only when both still and video source hashes agree', () => {
    const parsed = parseMediaManifest(manifest([still, film]), art)!;
    const delivered = preferVerifiedLocalDelivery(art, parsed)[0];
    expect(delivered.still).toBe('/art/31-ink.webp');
    expect(delivered.films[0].src).toBe('/art/31-ink-preview.mp4');
    expect(delivered.films[0].sourceUrl).toContain('/videos/web/ember.mp4');
  });

  it('does not pair a newer rendition with an older local film', () => {
    const parsed = parseMediaManifest(manifest([{ ...still, sha256: 'a'.repeat(64) }, film]), art)!;
    const delivered = preferVerifiedLocalDelivery(art, parsed)[0];
    expect(delivered.still).not.toMatch(/^\/art\//);
    expect(delivered.films[0].src).not.toMatch(/^\/art\//);
  });

  it('never swaps a medium film with the normal local preview', () => {
    const parsed = parseMediaManifest(
      manifest([still, { ...film, role: 'ember_medium_web', path: 'videos/web/ember_medium.mp4' }]),
      art,
    )!;
    const delivered = preferVerifiedLocalDelivery(art, parsed)[0];
    expect(delivered.films[0].id).toBe('medium');
    expect(delivered.films[0].src).toContain('/videos/web/ember_medium.mp4');
  });

  it('does not bind any seed-derived URL when the token seed is malformed', () => {
    const parsed = parseTokenRecord({ TokenId: 8, Seed: '../../admin' })!;
    expect(parsed.seed).toBeUndefined();
    expect(parsed.media).toEqual([]);
  });
});
