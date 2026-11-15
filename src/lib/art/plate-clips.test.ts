import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createPlateClipLookup } from './plate-clips';
import { getCuratedArtwork } from './catalog';
import { filmSourceFor, type ArtFilm } from './types';
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
const rungHash = 'b'.repeat(64);
/** A rung of 031's Ink settling clip as the pipeline records it. */
function rung(width = 640, hash = rungHash) {
  return {
    src: `/art/clips/31-ink-settling-${width}-${hash.slice(0, 16)}.mp4`,
    sha256: hash,
    bytes: 2_000_000,
    width,
    height: Math.round((width * 828) / 1280),
    crf: 22,
    stillMatch: { mean: 3.1, max: 52, over: 0.00002 },
  };
}
const withRungs = (...rungs: unknown[]) => ({ ...entry(), rungs });

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
  it("carries the opening's first mark onto the work as the film's own seconds", () => {
    const opening = { ...entry('opening'), firstMarkFrame: 71 };
    const result = createPlateClipLookup(registry([entry(), opening]))(work, ink);
    expect(result.firstMarkSeconds).toBe(71 / 60);
    // A mark the clip cannot hold, an opening that does not bind, or none measured: no mark.
    for (const change of [
      { firstMarkFrame: 600 },
      { startSeconds: 1 },
      { firstMarkFrame: undefined },
    ])
      expect(
        createPlateClipLookup(registry([{ ...opening, ...change }]))(work, ink).firstMarkSeconds,
      ).toBeUndefined();
    // A malformed mark refuses the registry whole, as any malformed field does.
    expect(
      createPlateClipLookup(registry([{ ...opening, firstMarkFrame: -1 }]))(work, ink).openingFilm,
    ).toBeUndefined();
    // A stale mark from an earlier binding never outlives its opening.
    expect(createPlateClipLookup(registry())(work, result).firstMarkSeconds).toBeUndefined();
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
  it('binds the proved rungs on the settling film, ascending, with what a card needs', () => {
    const wider = rung(960, 'c'.repeat(64));
    const result = createPlateClipLookup(registry([withRungs(wider, rung()), entry('opening')]))(
      work,
      ink,
    );
    expect(result.settlingFilm?.src).toBe(entry().src);
    expect(result.settlingFilm?.rungs).toEqual([
      { src: rung().src, width: 640, height: 414, sha256: rungHash, bytes: 2_000_000 },
      { src: wider.src, width: 960, height: 621, sha256: 'c'.repeat(64), bytes: 2_000_000 },
    ]);
    expect(result.openingFilm?.rungs).toBeUndefined();
    // A clip recorded without rungs binds as it did.
    expect(createPlateClipLookup(registry())(work, ink).settlingFilm?.rungs).toBeUndefined();
  });
  it.each([
    ['as wide as its clip', { ...rung(1280) }],
    ['out of the frame’s proportions', { height: 420 }],
    ['named for another work', { src: rung().src.replace('/31-', '/32-') }],
    ['named for the other expression', { src: rung().src.replace('-ink-', '-light-') }],
    ['named for another width', { src: rung(960).src }],
    ['named for other bytes', { src: rung(640, 'f'.repeat(64)).src }],
    ['as heavy as its clip', { bytes: 4_000_000 }],
    ['ending away from the still', { stillMatch: { mean: 16, max: 240, over: 0.097 } }],
    ['ending with too many samples off', { stillMatch: { mean: 3, max: 60, over: 0.01 } }],
  ])('drops a rung %s and keeps its clip', (_, change) => {
    const result = createPlateClipLookup(registry([withRungs({ ...rung(), ...change })]))(
      work,
      ink,
    );
    expect(result.settlingFilm?.src).toBe(entry().src);
    expect(result.settlingFilm?.rungs).toBeUndefined();
  });
  it('drops two rungs that claim one width, and refuses a malformed rung with its registry', () => {
    const twin = rung(640, 'c'.repeat(64));
    const paired = createPlateClipLookup(registry([withRungs(rung(), twin)]))(work, ink);
    expect(paired.settlingFilm?.src).toBe(entry().src);
    expect(paired.settlingFilm?.rungs).toBeUndefined();
    for (const change of [
      { width: 640.5 },
      { crf: undefined },
      { stillMatch: undefined },
      { src: '/art/clips/31-ink-settling-640.mp4' },
    ])
      expect(
        createPlateClipLookup(registry([withRungs({ ...rung(), ...change })]))(work, ink)
          .settlingFilm,
      ).toBeUndefined();
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
        // Every settling clip carries its 640 rung, a file as proved as the clip's own.
        expect(clip.rungs?.map(({ width, height }) => [width, height])).toEqual([[640, 414]]);
        for (const each of clip.rungs ?? []) {
          expect(each.src).toBe(
            `/art/clips/${clip.id}-${clip.expression}-settling-${each.width}-${each.sha256.slice(0, 16)}.mp4`,
          );
          const rungBytes = readFileSync(
            resolve(dirname(fileURLToPath(import.meta.url)), '../../../public', each.src.slice(1)),
          );
          expect(rungBytes.length).toBe(each.bytes);
          expect(each.bytes).toBeLessThan(clip.bytes);
          expect(createHash('sha256').update(rungBytes).digest('hex')).toBe(each.sha256);
          expect(each.stillMatch.mean).toBeLessThanOrEqual(6);
          expect(each.stillMatch.over).toBeLessThanOrEqual(0.005);
        }
      } else {
        expect(clip.rungs).toBeUndefined();
        expect(clip.frames).toBe(600);
        // Every opening records where its work first shows, inside its ten seconds.
        expect(clip.firstMarkFrame).toBeGreaterThanOrEqual(0);
        expect(clip.firstMarkFrame).toBeLessThan(clip.frames);
      }
    }
  });
});

describe('the encode a card loads', () => {
  const film: ArtFilm = createPlateClipLookup(registry([withRungs(rung())]))(
    work,
    ink,
  ).settlingFilm!;
  it('is the smallest rung at least as wide as the box in device pixels, else the clip', () => {
    // At 1440 CSS px a pair's card is 288 px and its lead 634: at one device pixel to the CSS
    // pixel the rung covers both; at two the card needs 576 and keeps the rung, the lead 1268
    // and takes the clip; the single hang's 1312 px plate always takes the clip.
    expect(filmSourceFor(film, 288)).toBe(rung().src);
    expect(filmSourceFor(film, 576)).toBe(rung().src);
    expect(filmSourceFor(film, 634)).toBe(rung().src);
    expect(filmSourceFor(film, 640)).toBe(rung().src);
    expect(filmSourceFor(film, 640.5)).toBe(film.src);
    expect(filmSourceFor(film, 1268)).toBe(film.src);
    expect(filmSourceFor(film, 1312)).toBe(film.src);
  });
  it('loads the clip for a box not yet measured, or a film without rungs', () => {
    for (const width of [0, -1, Number.NaN]) expect(filmSourceFor(film, width)).toBe(film.src);
    expect(filmSourceFor({ ...film, rungs: undefined }, 331)).toBe(film.src);
    expect(filmSourceFor({ ...film, rungs: [] }, 331)).toBe(film.src);
  });
  it('does not trust the rungs’ order: the smallest that is wide enough serves', () => {
    const wider = { ...rung(960, 'c'.repeat(64)) };
    const rungs = [wider, rung()];
    expect(filmSourceFor({ ...film, rungs }, 600)).toBe(rung().src);
    expect(filmSourceFor({ ...film, rungs }, 700)).toBe(wider.src);
    expect(filmSourceFor({ ...film, rungs }, 961)).toBe(film.src);
  });
});
