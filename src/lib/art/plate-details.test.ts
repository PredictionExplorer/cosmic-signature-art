import { describe, expect, it } from 'vitest';
import {
  getPlateDetail,
  getPlateRecord,
  parsePlateRecords,
  withPlateDetail,
} from './plate-details';
import { getPlateGround } from './plate-records';
import plateRecords from './plate-records.json';
import plateGrounds from './plate-grounds.json';
import { collectionIndex } from './collection-index';
import { getCuratedArtwork } from './catalog';

const seed = `0x${'a'.repeat(64)}` as const;
const sha = 'b'.repeat(64);
const centre = { x: 0.5123, y: 0.4 };
const detail = [{ x: 1152, y: 736, width: 1152, height: 736, share: 0.312 }];
const ground = { stillSha256: sha, tone: '#efe9dd', edge: true, centre, detail };

describe('parsePlateRecords', () => {
  it('keeps well-formed records with a stable shape', () => {
    const parsed = parsePlateRecords({
      schemaVersion: 2,
      measuredOn: '2026-10-27',
      records: [
        {
          id: 31,
          seed,
          ink: { ...ground, extra: 1 },
          light: { ...ground, tone: '#000000', edge: false, detail: [] },
        },
      ],
    });
    expect(parsed.get(31)).toEqual({
      id: 31,
      seed,
      ink: ground,
      light: { stillSha256: sha, tone: '#000000', edge: false, centre, detail: [] },
    });
  });

  it('drops malformed files, records and grounds without guessing', () => {
    expect(parsePlateRecords(null).size).toBe(0);
    expect(parsePlateRecords({ schemaVersion: 1, records: [] }).size).toBe(0);
    expect(parsePlateRecords({ schemaVersion: 2, records: 'nope' }).size).toBe(0);
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
        { id: 8, seed, ink: { ...ground, detail: undefined } },
        { id: 9, seed, light: { ...ground, tone: '#000000', edge: false } },
      ],
    });
    expect([...parsed.keys()]).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    for (const id of [2, 3, 4, 5, 6, 7, 8]) expect(parsed.get(id)?.ink).toBeUndefined();
    expect(parsed.get(9)?.light?.detail).toEqual(detail);
  });
});

describe('detail windows', () => {
  it("belong to the exact still and travel with the work's media", () => {
    const record = getPlateRecord(31)!;
    expect(getPlateDetail(31, 'ink', record.ink!.stillSha256)).toEqual(record.ink!.detail);
    expect(getPlateDetail(31, 'ink', 'c'.repeat(64))).toBeUndefined();
    expect(getPlateDetail(31, 'ink')).toBeUndefined();
    expect(getPlateDetail(31, 'spectral', record.ink!.stillSha256)).toBeUndefined();
    const work = getCuratedArtwork(31)!;
    const ink = work.media.find((media) => media.id === 'ink')!;
    expect(ink.detail).toEqual(record.ink!.detail);
    expect(
      withPlateDetail({ id: 31, seed: `0x${'f'.repeat(64)}` }, [ink])[0].detail,
    ).toBeUndefined();
    expect(
      withPlateDetail({ id: 31, seed: work.seed }, [{ ...ink, stillSha256: sha }])[0].detail,
    ).toBeUndefined();
    expect(
      withPlateDetail({ id: 31, seed: work.seed }, [{ ...ink, id: 'spectral' }])[0].detail,
    ).toBeUndefined();
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
        const measured = record?.[expression];
        if (!still) {
          expect(measured).toBeUndefined();
          continue;
        }
        expect(measured?.stillSha256).toBe(still.sha256);
        expect(measured!.centre.x).toBeGreaterThan(0);
        expect(measured!.centre.x).toBeLessThan(1);
        expect(measured!.centre.y).toBeGreaterThan(0);
        expect(measured!.centre.y).toBeLessThan(1);
        expect(measured!.detail.length).toBeLessThanOrEqual(3);
        for (const window of measured!.detail) {
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

  it('project the same grounds into the client file, without seeds or detail windows', () => {
    expect(plateGrounds.schemaVersion).toBe(2);
    expect(plateGrounds.measuredOn).toBe(plateRecords.measuredOn);
    expect(plateGrounds.grounds.length).toBe(plateRecords.records.length);
    for (const record of plateRecords.records) {
      const lean = plateGrounds.grounds.find((entry) => entry.id === record.id)!;
      expect(Object.keys(lean)).not.toContain('seed');
      for (const expression of ['ink', 'light'] as const) {
        const full = record[expression];
        const projected = lean[expression];
        if (!full) {
          expect(projected).toBeUndefined();
          continue;
        }
        expect(projected).toEqual({
          stillSha256: full.stillSha256,
          tone: full.tone,
          edge: full.edge,
          centre: full.centre,
        });
        expect(getPlateGround(record.id, expression, full.stillSha256)).toEqual(projected);
      }
    }
  });
});
