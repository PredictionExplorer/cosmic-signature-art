import { describe, expect, it } from 'vitest';
import { getPlateGround, getPlateRecord, parsePlateGrounds } from './plate-records';

const sha = 'b'.repeat(64);
const centre = { x: 0.5123, y: 0.4 };
const ground = { stillSha256: sha, tone: '#efe9dd', edge: true, centre };

describe('parsePlateGrounds', () => {
  it('keeps well-formed grounds with a stable shape', () => {
    const parsed = parsePlateGrounds({
      schemaVersion: 2,
      measuredOn: '2026-10-27',
      grounds: [
        {
          id: 31,
          ink: { ...ground, extra: 1, detail: [] },
          light: { ...ground, tone: '#000000', edge: false },
        },
      ],
    });
    expect(parsed.get(31)).toEqual({
      id: 31,
      ink: ground,
      light: { stillSha256: sha, tone: '#000000', edge: false, centre },
    });
  });

  it('drops malformed files, entries and grounds without guessing', () => {
    expect(parsePlateGrounds(null).size).toBe(0);
    expect(parsePlateGrounds({ schemaVersion: 1, grounds: [] }).size).toBe(0);
    expect(parsePlateGrounds({ schemaVersion: 2, grounds: 'nope' }).size).toBe(0);
    const parsed = parsePlateGrounds({
      schemaVersion: 2,
      measuredOn: null,
      grounds: [
        null,
        { id: 'x' },
        { id: 2, ink: { ...ground, stillSha256: 'bad' } },
        { id: 3, ink: { ...ground, tone: 'efe9dd' } },
        { id: 4, ink: { ...ground, edge: 'yes' } },
        { id: 5, ink: { ...ground, centre: { x: 1.5, y: 0 } } },
        { id: 6, ink: { ...ground, centre: undefined } },
        { id: 7, light: { ...ground, tone: '#000000', edge: false } },
      ],
    });
    expect([...parsed.keys()]).toEqual([2, 3, 4, 5, 6, 7]);
    for (const id of [2, 3, 4, 5, 6]) expect(parsed.get(id)?.ink).toBeUndefined();
    expect(parsed.get(7)?.light?.tone).toBe('#000000');
  });
});

describe('getPlateGround', () => {
  it('returns a ground only for the exact still it was measured from', () => {
    const record = getPlateRecord(31);
    expect(record?.ink?.tone).toBe('#efe9dd');
    expect(record?.ink?.centre.x).toBeGreaterThan(0);
    expect(getPlateGround(31, 'ink', record!.ink!.stillSha256)).toEqual(record!.ink);
    expect(getPlateGround(31, 'ink', 'c'.repeat(64))).toBeUndefined();
    expect(getPlateGround(31, 'ink')).toBeUndefined();
    expect(getPlateGround(31, 'spectral', record!.ink!.stillSha256)).toBeUndefined();
    expect(getPlateGround(999, 'ink', record!.ink!.stillSha256)).toBeUndefined();
  });
});
