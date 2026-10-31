import { describe, expect, it } from 'vitest';
import raw from './orbit-windows.json' with { type: 'json' };
import { bindWindow, loadOrbitWindows, performedOrbits } from './orbit-windows';
import { workOrbit } from './orbit-records';
import { closestApproachOf } from '@/lib/physics/orbit';

const windows = loadOrbitWindows(raw);
const ids = [...windows.keys()];

describe('the orbit windows', () => {
  it('bind every work of the collection to its verified record', () => {
    expect(ids).toHaveLength(72);
    const performed = performedOrbits(ids);
    expect(performed.map((orbit) => orbit.id)).toEqual(ids);
    for (const orbit of performed) {
      expect(orbit.window.positions).toHaveLength(9);
      expect(orbit.window.velocities).toHaveLength(9);
      expect(orbit.bodyHues).toEqual(workOrbit(orbit.id)!.bodyHues);
    }
  });

  it('carry each double exactly, as the decimal the build wrote', () => {
    const entry = raw.windows.find((candidate) => candidate.id === 31)!;
    const bound = performedOrbits([31])[0];
    entry.positions.forEach((text, index) =>
      expect(Object.is(bound.window.positions[index], Number(text))).toBe(true),
    );
    expect(bound.window.dt).toBe(0.001);
    expect(bound.window.steps).toBe(1_000_000);
  });

  it('drop a window whose seed, trait file or plane no longer agrees', () => {
    const entry = windows.get(31)!;
    expect(bindWindow(entry, 31)).toBeDefined();
    expect(bindWindow({ ...entry, seed: `0x${'0'.repeat(64)}` }, 31)).toBeUndefined();
    expect(bindWindow({ ...entry, traitsSha256: '0'.repeat(64) }, 31)).toBeUndefined();
    const flat = { ...entry.plane, bounds: [1, 1, 0, 2] as [number, number, number, number] };
    expect(bindWindow({ ...entry, plane: flat }, 31)).toBeUndefined();
    expect(bindWindow(undefined, 31)).toBeUndefined();
    expect(bindWindow(entry, 9999)).toBeUndefined();
    expect(() => loadOrbitWindows({ ...raw, schemaVersion: 2 })).toThrow(/art:windows/);
  });

  it('replay № 031’s recorded window to its published closest approach, bit for bit', () => {
    const [orbit] = performedOrbits([31]);
    expect(closestApproachOf(orbit.window)).toEqual(workOrbit(31)!.published.closestApproach);
  });
});
