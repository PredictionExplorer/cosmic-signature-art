import { describe, expect, it } from 'vitest';
import data from './essay-figures.json' with { type: 'json' };
import {
  bindEssayWork,
  essayFigures,
  essayWork,
  essayWorkCount,
  loadEssayFigures,
} from './essay-figures';
import { orbitIds, workOrbit } from './orbit-records';

const copy = () => structuredClone(data) as typeof data;

describe('the essay’s figures', () => {
  it('hold an entry for every work with an orbit record, bound to it by the seed', () => {
    expect(essayWorkCount).toBe(orbitIds().length);
    for (const id of orbitIds()) {
      const work = essayWork(id);
      expect(work, `№ ${id}`).toBeDefined();
      expect(work!.seed).toBe(workOrbit(id)!.generation.seed);
      // Each pair once, and the plait's letters as many as its crossings.
      expect(work!.pairs.map(({ pair }) => pair.join())).toEqual(['0,1', '0,2', '1,2']);
      expect(work!.sheet.word).toHaveLength(work!.sheet.crossings);
      expect([...work!.sheet.startOrder].sort()).toEqual([0, 1, 2]);
      // The gap is kept from the first step, a trillionth of a unit, to the run's end.
      // (A trillionth added to a place of some hundreds is kept to a part in a hundred.)
      expect(work!.twin.gaps.values[0] / essayFigures.twins.nudge).toBeCloseTo(1, 1);
      expect((work!.twin.gaps.values.length - 1) * work!.twin.gaps.every).toBeGreaterThanOrEqual(
        essayFigures.clock.steps,
      );
    }
    expect(essayWork(9999)).toBeUndefined();
  });

  it('look past the horizon only for the works the record finds bound there', () => {
    for (const id of orbitIds())
      expect(essayWork(id)!.beyond === null, `№ ${id}`).toBe(
        workOrbit(id)!.fate.outcome !== 'eternal_dance',
      );
  });

  it('drop an entry whose seed is no longer the record’s', () => {
    const work = essayWork(31)!;
    expect(bindEssayWork(work, 31)).toBe(work);
    expect(bindEssayWork({ ...work, seed: `0x${'0'.repeat(64)}` }, 31)).toBeUndefined();
    expect(bindEssayWork(work, 9999)).toBeUndefined();
    expect(bindEssayWork(undefined, 31)).toBeUndefined();
  });

  it('refuse a file that is malformed, partial or names a work twice', () => {
    expect(loadEssayFigures(data).works.size).toBe(data.works.length);
    expect(() => loadEssayFigures({})).toThrow(/malformed or partial/);
    const twice = copy();
    twice.works.push(twice.works[0]);
    expect(() => loadEssayFigures(twice)).toThrow(/names a work twice/);
    // A run without the look past the horizon, or without the Ink certificates, is not the page's.
    const noPast = copy() as unknown as { past: unknown };
    noPast.past = null;
    expect(() => loadEssayFigures(noPast)).toThrow(/art:essay -- --beyond --online/);
    const noInk = copy() as unknown as { works: { ink: unknown }[] };
    noInk.works[0].ink = null;
    expect(() => loadEssayFigures(noInk)).toThrow(/malformed or partial/);
    const badPair = copy();
    badPair.works[0].pairs[0].anomaly = 4;
    expect(() => loadEssayFigures(badPair)).toThrow(/malformed or partial/);
  });
});
