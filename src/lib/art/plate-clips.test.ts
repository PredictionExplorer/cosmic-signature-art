import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createPlateClipLookup } from './plate-clips';
import { getCuratedArtwork } from './catalog';
import publishedRegistry from './plate-clips.json';

const work = getCuratedArtwork(31)!;
const ink = work.media.find((media) => media.id === 'ink')!;
const outputHash = 'a'.repeat(64);
function entry(kind: 'settling' | 'opening' = 'settling') {
  return {
    id: work.id,
    seed: work.seed,
    expression: 'ink',
    kind,
    src: `/art/clips/31-ink-${kind}-${outputHash.slice(0, 16)}.mp4`,
    sourceUrl: ink.films[0].sourceUrl,
    sourceSha256: ink.films[0].sourceSha256,
    stillSha256: ink.stillSha256,
    sha256: outputHash,
    bytes: 4_000_000,
    width: 1280,
    height: 828,
    frameRate: 60,
    frames: kind === 'settling' ? 480 : 600,
    durationSeconds: kind === 'settling' ? 8 : 10,
    startSeconds: kind === 'settling' ? 22.033333333333335 : 0,
    sourceDurationSeconds: 30.033333333333335,
    ...(kind === 'settling' ? { stillMatch: { mean: 2.958, max: 43, over: 0 } } : {}),
  };
}
const registry = (clips: unknown[] = [entry()]) => ({ schemaVersion: 1, clips });

describe('plate clip binding', () => {
  it('attaches the settling and opening clips without touching the complete films', () => {
    const result = createPlateClipLookup(registry([entry(), entry('opening')]))(work, ink);
    expect(result.settlingFilm).toMatchObject({
      id: 'settling',
      src: entry().src,
      durationSeconds: 8,
      startSeconds: 22.033333333333335,
      frameRate: 60,
      poster: ink.still,
      variantKey: '31:ink:settling',
      delivery: 'local-preview',
    });
    expect(result.openingFilm).toMatchObject({
      id: 'opening',
      durationSeconds: 10,
      startSeconds: 0,
    });
    expect(result.films).toBe(ink.films);
    expect(result.films[0].durationSeconds).toBeGreaterThan(30);
  });
  it.each([
    { id: 32 },
    { seed: '0x12' },
    { sourceSha256: 'b'.repeat(64) },
    { stillSha256: 'c'.repeat(64) },
    { sourceUrl: 'https://example.org/film.mp4' },
    { src: '/art/clips/32-ink-settling-aaaaaaaaaaaaaaaa.mp4' },
    { src: '/art/clips/31-ink-settling-bbbbbbbbbbbbbbbb.mp4' },
    { bytes: 8 * 1024 * 1024 + 1 },
    { width: 640 },
    { frameRate: 30 },
    { frames: 479 },
    { durationSeconds: 8.5 },
    { startSeconds: 20 },
    { stillMatch: undefined },
    { stillMatch: { mean: 16, max: 240, over: 0.097 } },
    { stillMatch: { mean: 3, max: 40, over: 0.01 } },
  ])('refuses a stale, mismatched, unbounded or unproven settling clip: %j', (change) => {
    const clips = [{ ...entry(), ...change }];
    expect(createPlateClipLookup(registry(clips))(work, ink).settlingFilm).toBeUndefined();
  });
  it('refuses an opening clip that does not start at frame 0 or has the wrong length', () => {
    for (const change of [{ startSeconds: 1 }, { frames: 480 }, { durationSeconds: 8 }])
      expect(
        createPlateClipLookup(registry([{ ...entry('opening'), ...change }]))(work, ink)
          .openingFilm,
      ).toBeUndefined();
  });
  it('rejects ambiguous identities, unsupported registries and foreign interpretations', () => {
    expect(
      createPlateClipLookup(registry([entry(), entry()]))(work, ink).settlingFilm,
    ).toBeUndefined();
    expect(
      createPlateClipLookup({ ...registry(), schemaVersion: 2 })(work, ink).settlingFilm,
    ).toBeUndefined();
    expect(
      createPlateClipLookup(registry())(work, { ...ink, id: 'spectral' }).settlingFilm,
    ).toBeUndefined();
    expect(createPlateClipLookup(null)(work, ink).settlingFilm).toBeUndefined();
  });
  it('removes a previously attached clip when its source no longer matches', () => {
    const lookup = createPlateClipLookup(registry());
    const attached = lookup(work, ink);
    expect(attached.settlingFilm).toBeDefined();
    expect(lookup({ ...work, seed: '0x123' }, attached).settlingFilm).toBeUndefined();
  });
  it('ships content-addressed, bounded files matching every registered output hash', () => {
    expect(publishedRegistry.clips.length).toBeGreaterThan(0);
    const keys = publishedRegistry.clips.map(
      (clip) => `${clip.id}:${clip.expression}:${clip.kind}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
    for (const clip of publishedRegistry.clips) {
      expect(clip.src).toBe(
        `/art/clips/${clip.id}-${clip.expression}-${clip.kind}-${clip.sha256.slice(0, 16)}.mp4`,
      );
      const bytes = readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), '../../../public', clip.src.slice(1)),
      );
      expect(bytes.length).toBe(clip.bytes);
      expect(bytes.length).toBeLessThanOrEqual(8 * 1024 * 1024);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(clip.sha256);
      if (clip.kind === 'settling') {
        expect(clip.frames).toBe(480);
        expect(clip.stillMatch?.mean).toBeLessThanOrEqual(6);
        expect(clip.stillMatch?.over).toBeLessThanOrEqual(0.005);
        expect(clip.startSeconds + clip.durationSeconds).toBeCloseTo(clip.sourceDurationSeconds, 1);
      } else expect(clip.frames).toBe(600);
    }
  });
});
