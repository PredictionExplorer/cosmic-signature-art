import { describe, expect, it } from 'vitest';
import { getPlateGround, getPlateRecord, parsePlateRecords } from './plate-records';
import plateRecords from './plate-records.json';
import curatedMedia from './curated-media.json';
import curatedRecords from './curated-records.json';

const seed = `0x${'a'.repeat(64)}` as const;
const sha = 'b'.repeat(64);

describe('parsePlateRecords', () => {
  it('keeps well-formed records with a stable shape', () => {
    const parsed = parsePlateRecords({
      schemaVersion: 1,
      measuredOn: '2026-10-26',
      records: [
        {
          id: 31,
          seed,
          ink: { stillSha256: sha, tone: '#efe9dd', edge: true, extra: 1 },
          light: { stillSha256: sha, tone: '#000000', edge: false },
        },
      ],
    });
    expect(parsed.get(31)).toEqual({
      id: 31,
      seed,
      ink: { stillSha256: sha, tone: '#efe9dd', edge: true },
      light: { stillSha256: sha, tone: '#000000', edge: false },
    });
  });

  it('drops malformed files, records and grounds without guessing', () => {
    expect(parsePlateRecords(null).size).toBe(0);
    expect(parsePlateRecords({ schemaVersion: 2, records: [] }).size).toBe(0);
    expect(parsePlateRecords({ schemaVersion: 1, records: 'nope' }).size).toBe(0);
    const parsed = parsePlateRecords({
      schemaVersion: 1,
      measuredOn: null,
      records: [
        null,
        { id: 'x', seed },
        { id: 1, seed: '0xshort' },
        { id: 2, seed, ink: { stillSha256: 'bad', tone: '#efe9dd', edge: true } },
        { id: 3, seed, ink: { stillSha256: sha, tone: 'efe9dd', edge: true } },
        { id: 4, seed, ink: { stillSha256: sha, tone: '#efe9dd', edge: 'yes' } },
        { id: 5, seed, light: { stillSha256: sha, tone: '#000000', edge: false } },
      ],
    });
    expect([...parsed.keys()]).toEqual([2, 3, 4, 5]);
    expect(parsed.get(2)?.ink).toBeUndefined();
    expect(parsed.get(3)?.ink).toBeUndefined();
    expect(parsed.get(4)?.ink).toBeUndefined();
    expect(parsed.get(5)?.light?.tone).toBe('#000000');
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
  const media = new Map(curatedMedia.map((work) => [work.id, work.media]));
  const seeds = new Map(curatedRecords.records.map((record) => [record.id, record.seed]));

  it('match the curated archive hash for hash and seed for seed', () => {
    expect(plateRecords.schemaVersion).toBe(1);
    expect(plateRecords.records.length).toBeGreaterThan(0);
    for (const record of plateRecords.records) {
      expect(record.seed).toBe(seeds.get(record.id));
      const entries = media.get(record.id);
      expect(entries).toBeDefined();
      for (const expression of ['ink', 'light'] as const) {
        const ground = record[expression];
        const entry = entries?.find((item) => item.id === expression);
        if (!entry) {
          expect(ground).toBeUndefined();
          continue;
        }
        expect(ground?.stillSha256).toBe(entry.stillSha256);
      }
    }
  });

  it('record every Light field as true black and every curated Ink sheet as paper', () => {
    for (const record of plateRecords.records) {
      if (record.light) expect(record.light.tone).toBe('#000000');
      if (record.ink) expect(record.ink.tone).toMatch(/^#[ef][0-9a-f][ef][0-9a-f][de][0-9a-f]$/);
    }
  });
});
