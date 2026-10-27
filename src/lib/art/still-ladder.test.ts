import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createStillLadderLookup, rungFor } from './still-ladder';
import { getCuratedArtwork } from './catalog';
import publishedRegistry from './still-ladder.json';

const work = getCuratedArtwork(31)!;
const ink = work.media.find((media) => media.id === 'ink')!;
const outputHash = 'a'.repeat(64);
const masterUrl = ink.sourceUrl!.replace('images/web/ember_full.webp', 'images/source/ember.png');
function entry(width: 1280 | 1920 = 1280) {
  return {
    id: work.id,
    seed: work.seed,
    expression: 'ink',
    width,
    height: width === 1280 ? 828 : 1242,
    src: `/art/stills/31-ink-${width}-${outputHash.slice(0, 16)}.webp`,
    sha256: outputHash,
    bytes: 180_000,
    masterUrl,
    masterSha256: 'b'.repeat(64),
    stillSha256: ink.stillSha256,
    masterMatch: { mean: 1.58, max: 18, over: 0 },
    publishedMatch: { mean: 1.9, max: 32, over: 0 },
  };
}
const registry = (rungs: unknown[] = [entry()]) => ({ schemaVersion: 1, rungs });

describe('still ladder binding', () => {
  it('attaches the rungs ascending by width and leaves the published still in place', () => {
    const result = createStillLadderLookup(registry([entry(1920), entry(1280)]))(work, ink);
    expect(result.rungs?.map((rung) => rung.width)).toEqual([1280, 1920]);
    expect(result.rungs?.[0]).toEqual({
      src: entry().src,
      width: 1280,
      height: 828,
      sha256: outputHash,
      bytes: 180_000,
    });
    expect(result.still).toBe(ink.still);
    expect(result.films).toBe(ink.films);
  });
  it.each([
    { id: 32 },
    { seed: '0x12' },
    { stillSha256: 'c'.repeat(64) },
    { masterUrl: 'https://example.org/master.png' },
    { src: '/art/stills/32-ink-1280-aaaaaaaaaaaaaaaa.webp' },
    { src: '/art/stills/31-ink-1280-bbbbbbbbbbbbbbbb.webp' },
    { bytes: 1536 * 1024 + 1 },
    { width: 640 },
    { height: 1242 },
  ])('refuses a stale, mismatched or unbounded rung: %j', (change) => {
    expect(
      createStillLadderLookup(registry([{ ...entry(), ...change }]))(work, ink).rungs,
    ).toBeUndefined();
  });
  it('drops a width recorded twice and keeps the unambiguous rung', () => {
    const result = createStillLadderLookup(registry([entry(), entry(), entry(1920)]))(work, ink);
    expect(result.rungs?.map((rung) => rung.width)).toEqual([1920]);
    expect(
      createStillLadderLookup({ schemaVersion: 2, rungs: [] })(work, ink).rungs,
    ).toBeUndefined();
    expect(
      createStillLadderLookup(registry())(work, { ...ink, id: 'spectral' }).rungs,
    ).toBeUndefined();
  });
  it('picks the smallest rung that is at least as wide as the plate', () => {
    const rungs = [
      { src: 'a', width: 1280, height: 828, sha256: outputHash, bytes: 1 },
      { src: 'b', width: 1920, height: 1242, sha256: outputHash, bytes: 1 },
    ];
    expect(rungFor(rungs, 375)?.width).toBe(1280);
    expect(rungFor(rungs, 1280)?.width).toBe(1280);
    expect(rungFor(rungs, 1281)?.width).toBe(1920);
    expect(rungFor(rungs, 3000)?.width).toBe(1920);
    expect(rungFor(undefined, 375)).toBeUndefined();
    expect(rungFor([], 375)).toBeUndefined();
  });
  it('ships content-addressed, bounded files matching every registered output hash', () => {
    expect(publishedRegistry.rungs.length).toBeGreaterThan(0);
    const keys = publishedRegistry.rungs.map(
      (rung) => `${rung.id}:${rung.expression}:${rung.width}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
    for (const rung of publishedRegistry.rungs) {
      expect(rung.src).toBe(
        `/art/stills/${rung.id}-${rung.expression}-${rung.width}-${rung.sha256.slice(0, 16)}.webp`,
      );
      const bytes = readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), '../../../public', rung.src.slice(1)),
      );
      expect(bytes.length).toBe(rung.bytes);
      expect(bytes.length).toBeLessThanOrEqual(1536 * 1024);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(rung.sha256);
      expect(rung.masterMatch.mean).toBeLessThanOrEqual(3);
      expect(rung.publishedMatch.mean).toBeLessThanOrEqual(4);
    }
  });
});
