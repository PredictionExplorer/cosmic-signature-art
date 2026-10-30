import { describe, expect, it } from 'vitest';
import data from './orbit-records.json' with { type: 'json' };
import { collectionIndex } from './collection-index';
import { loadOrbitRecords, workOrbit } from './orbit-records';

describe('the orbit records', () => {
  it('cover every indexed work', () => {
    const missing = collectionIndex.works.filter((work) => !workOrbit(work.id)).map((w) => w.id);
    expect(missing).toEqual([]);
  });

  it('carry each measured double exactly, past the bundler', () => {
    const orbit = workOrbit(31)!;
    expect(orbit.published.masses).toEqual([
      130.67371638058603, 250.9920858730805, 124.96327743951707,
    ]);
    expect(orbit.published.totalEnergy).toBe(-2142.8907060284882);
    expect(orbit.published.closestApproach).toEqual({
      distance: 80.20379580764032,
      pair: [0, 2],
      step: 255_842,
    });
    expect(orbit.generation).toMatchObject({
      seed: '0x4a0d5b57e13cf40c56cddb4ee2c10f50ab7aff755e24c61a687855663713f5b5',
      selectedIndex: 77_741,
      candidatesPerAttempt: 100_000,
      weightsRandomized: true,
      dt: 0.001,
      steps: 1_000_000,
      warmupSteps: 1_000_000,
    });
  });

  it('agree with the collection index on every seed and mass', () => {
    for (const work of collectionIndex.works) {
      const orbit = workOrbit(work.id)!;
      expect(orbit.generation.seed).toBe(work.seed);
      if (work.masses) expect(orbit.published.masses).toEqual(work.masses);
    }
  });

  it('refuse a registry whose doubles are not exact decimals', () => {
    const broken = structuredClone(data) as { records: { physics: { totalEnergy: unknown } }[] };
    broken.records[0].physics.totalEnergy = -2142.89;
    expect(() => loadOrbitRecords(broken)).toThrow(/malformed/);
    expect(() =>
      loadOrbitRecords({ schemaVersion: 2, readOn: '2026-10-29', records: [] }),
    ).toThrow();
  });

  it('know no work outside the collection', () => {
    expect(workOrbit(100_000)).toBeUndefined();
  });
});
