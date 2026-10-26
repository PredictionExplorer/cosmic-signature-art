import { describe, expect, it } from 'vitest';
import data from './collection-index.json';
import {
  collectionIndex,
  compactWorks,
  cycles,
  indexedAssetUrl,
  indexedWork,
  loadCollectionIndex,
  parseCollectionIndex,
  spectralNeighbour,
  spectrum,
} from './collection-index';

const seed = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;
const work = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  seed: seed(id + 1),
  cycle: Math.floor(id / 2),
  mintedAt: `2026-0${1 + Math.floor(id / 2)}-01T00:00:00.000Z`,
  traits: {},
  media: {
    light: { preview: { path: 'images/web/preview.webp' }, films: {} },
    ink: { still: { path: 'images/web/ember_full.webp' }, films: {} },
  },
  ...extra,
});
const index = (works: unknown[]) => ({
  schemaVersion: 1,
  origin: 'https://a1.cosmicsignature.com',
  checkedOn: '2026-10-26',
  total: works.length,
  works,
});

describe('collection index', () => {
  it('reads the committed index: every published work with its identity, cycle and media', () => {
    expect(collectionIndex.total).toBe((data as { total: number }).total);
    expect(collectionIndex.works.length).toBe(collectionIndex.total);
    expect(collectionIndex.total).toBeGreaterThanOrEqual(72);
    for (const entry of collectionIndex.works) {
      expect(entry.seed).toMatch(/^0x[a-f0-9]{64}$/);
      expect(entry.cycle).toBeDefined();
      expect(entry.media.light?.still?.path).toBe('images/web/full.webp');
    }
    const thirtyOne = indexedWork(31)!;
    expect(thirtyOne.wavelengthNm).toBe(632);
    expect(thirtyOne.traits.fate).toBe('Eternal Dance');
    expect(thirtyOne.borda?.selectedIndex).toBe(77741);
    expect(thirtyOne.borda?.totalCandidates).toBe(100000);
    expect(indexedAssetUrl(thirtyOne, thirtyOne.media.ink?.preview?.path)).toBe(
      `https://a1.cosmicsignature.com/images/new/cosmicsignature/${thirtyOne.seed}/images/web/ember_preview.webp`,
    );
    expect(indexedAssetUrl(thirtyOne, undefined)).toBeUndefined();
  });

  it('refuses a malformed index and drops duplicate ids', () => {
    expect(parseCollectionIndex(null).works).toEqual([]);
    expect(parseCollectionIndex({ schemaVersion: 2, works: [] }).works).toEqual([]);
    const parsed = parseCollectionIndex(index([work(3), work(1), work(3)]));
    expect(parsed.works.map((entry) => entry.id)).toEqual([1, 3]);
    expect(parsed.checkedOn).toBe('2026-10-26');
    expect(parseCollectionIndex(index([work(1, { wavelengthNm: 900 })])).works).toEqual([]);
    expect(() => loadCollectionIndex(index([work(1, { wavelengthNm: 900 })]))).toThrow(
      /malformed/,
    );
    expect(loadCollectionIndex(data).total).toBe(collectionIndex.total);
  });

  it('groups cycles with counts and their earliest mint', () => {
    const parsed = parseCollectionIndex(
      index([work(0), work(1, { mintedAt: '2025-12-31T00:00:00.000Z' }), work(2), work(3)]),
    );
    expect(cycles(parsed)).toEqual([
      { cycle: 0, count: 2, mintedAt: '2025-12-31T00:00:00.000Z', ids: [0, 1] },
      { cycle: 1, count: 2, mintedAt: '2026-02-01T00:00:00.000Z', ids: [2, 3] },
    ]);
    expect(cycles().map((cycle) => cycle.count)).toEqual([24, 24, 24]);
  });

  it('orders the spectrum by published wavelength and shelves the unmeasured', () => {
    const parsed = parseCollectionIndex(
      index([
        work(0, { wavelengthNm: 700 }),
        work(1),
        work(2, { wavelengthNm: 480 }),
        work(3, { wavelengthNm: 480 }),
      ]),
    );
    const { measured, unmeasured } = spectrum(parsed);
    expect(measured.map((entry) => entry.id)).toEqual([2, 3, 0]);
    expect(unmeasured.map((entry) => entry.id)).toEqual([1]);
    expect(spectralNeighbour(2, 'redder', parsed)).toEqual({ work: measured[1], deltaNm: 0 });
    expect(spectralNeighbour(3, 'redder', parsed)).toEqual({ work: measured[2], deltaNm: 220 });
    expect(spectralNeighbour(0, 'redder', parsed)).toBeUndefined();
    expect(spectralNeighbour(2, 'bluer', parsed)).toBeUndefined();
    expect(spectralNeighbour(1, 'redder', parsed)).toBeUndefined();
    expect(spectralNeighbour(9, 'redder', parsed)).toBeUndefined();
  });

  it('compacts the index to what a client view needs', () => {
    const [compact] = compactWorks(parseCollectionIndex(index([work(4, { wavelengthNm: 500 })])));
    expect(compact).toEqual({
      id: 4,
      cycle: 2,
      mintedAt: '2026-03-01T00:00:00.000Z',
      wavelengthNm: 500,
      inkPreview: undefined,
      lightPreview: `https://a1.cosmicsignature.com/images/new/cosmicsignature/${seed(5)}/images/web/preview.webp`,
    });
    expect(compactWorks().length).toBe(collectionIndex.total);
  });
});
