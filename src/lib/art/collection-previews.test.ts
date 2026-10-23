import { describe, expect, it } from 'vitest';
import { createCollectionPreviewLookup } from './collection-previews';
import { getCuratedArtwork } from './catalog';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import publishedRegistry from './collection-previews.json';

const work = getCuratedArtwork(31)!;
const ink = work.media.find((media) => media.id === 'ink')!;
const outputHash = 'a'.repeat(64);
function entry() {
  return {
    id: work.id,
    seed: work.seed,
    src: `/art/previews/31-${outputHash.slice(0, 16)}.mp4`,
    sourceUrl: ink.films[0].sourceUrl,
    sourceSha256: ink.films[0].sourceSha256,
    stillSha256: ink.stillSha256,
    sha256: outputHash,
    bytes: 500_000,
    width: 640,
    height: 414,
    startSeconds: 6,
    durationSeconds: 8,
    sourceDurationSeconds: 30.033333,
  };
}
const registry = (previews: unknown[] = [entry()]) => ({ schemaVersion: 1, previews });
describe('catalogue preview source binding', () => {
  it('attaches a small dedicated excerpt without replacing any complete film', () => {
    const result = createCollectionPreviewLookup(registry())(work, ink);
    expect(result.previewFilm?.src).toBe(entry().src);
    expect(result.previewFilm?.durationSeconds).toBe(8);
    expect(result.films).toBe(ink.films);
    expect(result.films[0].durationSeconds).toBeGreaterThan(30);
  });
  it.each([
    { id: 32 },
    { seed: '0x12' },
    { sourceSha256: 'b'.repeat(64) },
    { stillSha256: 'c'.repeat(64) },
    { sourceUrl: 'https://example.org/film.mp4' },
    { src: '/art/previews/32-aaaaaaaaaaaaaaaa.mp4' },
    { src: '/art/previews/31-bbbbbbbbbbbbbbbb.mp4' },
    { bytes: 2_097_153 },
    { width: 3456 },
    { durationSeconds: 30 },
    { startSeconds: 28 },
  ])('refuses stale, mismatched or unbounded delivery: %j', (change) => {
    expect(
      createCollectionPreviewLookup(registry([{ ...entry(), ...change }]))(work, ink).previewFilm,
    ).toBeUndefined();
  });
  it('rejects ambiguous identities, unsupported registries, and non-Ink interpretations', () => {
    expect(
      createCollectionPreviewLookup(registry([entry(), entry()]))(work, ink).previewFilm,
    ).toBeUndefined();
    expect(
      createCollectionPreviewLookup({ ...registry(), schemaVersion: 2 })(work, ink).previewFilm,
    ).toBeUndefined();
    expect(
      createCollectionPreviewLookup(registry())(work, { ...ink, id: 'light' }).previewFilm,
    ).toBeUndefined();
  });
  it('removes a previously attached excerpt when its source no longer matches', () => {
    const lookup = createCollectionPreviewLookup(registry());
    const attached = lookup(work, ink);
    expect(lookup({ ...work, seed: '0x123' }, attached).previewFilm).toBeUndefined();
    expect(attached.previewFilm).toBeDefined();
  });
  it('ships content-addressed, bounded files matching every registered output hash', () => {
    expect(publishedRegistry.previews.length).toBeGreaterThan(0);
    expect(new Set(publishedRegistry.previews.map((preview) => preview.id)).size).toBe(
      publishedRegistry.previews.length,
    );
    for (const preview of publishedRegistry.previews) {
      expect(preview.src).toBe(`/art/previews/${preview.id}-${preview.sha256.slice(0, 16)}.mp4`);
      const bytes = readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), '../../../public', preview.src.slice(1)),
      );
      expect(bytes.length).toBe(preview.bytes);
      expect(bytes.length).toBeLessThanOrEqual(2 * 1024 * 1024);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(preview.sha256);
    }
  });
});
