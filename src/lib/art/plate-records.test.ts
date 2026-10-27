import { describe, expect, it } from 'vitest';
import { getPlateGround, getPlateRecord, parsePlateRecords } from './plate-records';
import plateRecords from './plate-records.json';
import { collectionIndex } from './collection-index';

const seed = `0x${'a'.repeat(64)}` as const;
const sha = 'b'.repeat(64);
const centre = { x: 0.5123, y: 0.4 };
const detail = [{ x: 1152, y: 736, width: 1152, height: 736, share: 0.312 }];

describe('parsePlateRecords', () => {
  it('keeps well-formed records with a stable shape', () => {
    const parsed = parsePlateRecords({
      schemaVersion: 2,
      measuredOn: '2026-10-27',
      records: [
        {
          id: 31,
          seed,
          ink: { stillSha256: sha, tone: '#efe9dd', edge: true, centre, detail, extra: 1 },
          light: { stillSha256: sha, tone: '#000000', edge: false, centre, detail: [] },
        },
      ],
    });
    expect(parsed.get(31)).toEqual({
      id: 31,
      seed,
      ink: { stillSha256: sha, tone: '#efe9dd', edge: true, centre, detail },
      light: { stillSha256: sha, tone: '#000000', edge: false, centre, detail: [] },
    });
  });

  it('drops malformed files, records and grounds without guessing', () => {
    expect(parsePlateRecords(null).size).toBe(0);
    expect(parsePlateRecords({ schemaVersion: 1, records: [] }).size).toBe(0);
    expect(parsePlateRecords({ schemaVersion: 2, records: 'nope' }).size).toBe(0);
    const ground = { stillSha256: sha, tone: '#efe9dd', edge: true, centre, detail };
    const parsed = parsePlateRecords({
      schemaVersion: 2,
      measuredOn: null,
      records: [
        null,
        { id: 'x', seed },
        { id: 1, seed: '0xshort' },
        { id: 2, seed, ink: { ...ground, stillSha256: 'bad' } },
        { id: 3, seed, ink: { ...ground, tone: 'efe9dd' } },
        { id: 4, seed, ink: { ...ground, edge: 'yes' } },
        { id: 5, seed, ink: { ...ground, centre: { x: 1.5, y: 0 } } },
        { id: 6, seed, ink: { ...ground, detail: [{ ...detail[0], width: 0 }] } },
        { id: 7, seed, ink: { ...ground, detail: [...detail, ...detail, ...detail, ...detail] } },
        { id: 8, seed, light: { ...ground, tone: '#000000', edge: false } },
      ],
    });
    expect([...parsed.keys()]).toEqual([2, 3, 4, 5, 6, 7, 8]);
    for (const id of [2, 3, 4, 5, 6, 7]) expect(parsed.get(id)?.ink).toBeUndefined();
    expect(parsed.get(8)?.light?.tone).toBe('#000000');
  });
});

describe('getPlateGround', () => {
  it('returns a ground only for the exact still it was measured from', () => {
    const record = getPlateRecord(31);
    expect(record?.ink?.tone).toBe('#efe9dd');
    expect(getPlateGround(31, 'ink', record!.ink!.stillSha256)).toEqual(record!.ink);
    expect(getPlateGround(31, 'ink', 'c'.repeat(64))).toBeUndefined();
    expect(getPlateGround(31, 'ink')).toBeUndefined();
    expect(getPlateGround(31, 'spectral', record!.ink!.stillSha256)).toBeUndefined();
    expect(getPlateGround(999, 'ink', record!.ink!.stillSha256)).toBeUndefined();
  });
});

describe('the committed plate records', () => {
  it('measure every indexed work in both expressions, hash for hash and seed for seed', () => {
    expect(plateRecords.schemaVersion).toBe(2);
    expect(plateRecords.records.length).toBe(collectionIndex.works.length);
    for (const work of collectionIndex.works) {
      const record = plateRecords.records.find((candidate) => candidate.id === work.id);
      expect(record?.seed).toBe(work.seed);
      for (const expression of ['ink', 'light'] as const) {
        const still = work.media[expression]?.still;
        const ground = record?.[expression];
        if (!still) {
          expect(ground).toBeUndefined();
          continue;
        }
        expect(ground?.stillSha256).toBe(still.sha256);
        expect(ground!.centre.x).toBeGreaterThan(0);
        expect(ground!.centre.x).toBeLessThan(1);
        expect(ground!.centre.y).toBeGreaterThan(0);
        expect(ground!.centre.y).toBeLessThan(1);
        expect(ground!.detail.length).toBeLessThanOrEqual(3);
        for (const window of ground!.detail) {
          expect(window.x + window.width).toBeLessThanOrEqual(still.width!);
          expect(window.y + window.height).toBeLessThanOrEqual(still.height!);
        }
      }
    }
  });

  it('record every Light field as true black and every Ink sheet as warm paper', () => {
    for (const record of plateRecords.records) {
      if (record.light) expect(record.light.tone).toBe('#000000');
      if (!record.ink) continue;
      // Kozo measures between #e2ddd2 and #f1ebdf across the collection: light, and warm.
      expect(record.ink.tone).toMatch(/^#[d-f][0-9a-f][d-f][0-9a-f][c-f][0-9a-f]$/);
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(record.ink!.tone.slice(i, i + 2), 16));
      expect(r).toBeGreaterThanOrEqual(g);
      expect(g).toBeGreaterThanOrEqual(b);
    }
  });
});
