import { describe, expect, it } from 'vitest';
import raw from './orbit-windows.json' with { type: 'json' };
import {
  bindWindow,
  filmOrbit,
  loadOrbitWindows,
  orbitElongation,
  performedOrbits,
} from './orbit-windows';
import { workOrbit } from './orbit-records';
import { inkClock } from './ink-clocks';
import { closestApproachOf, WindowPerformance } from '@/lib/physics/orbit';
import { principalPlane } from '@/lib/physics/plane';

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

  it('measure how long an orbit’s figure is against how wide, from its committed bounds', () => {
    // № 051 is the longest in the collection: twice as long as it is wide.
    expect(orbitElongation(51)).toBeCloseTo(2.015, 3);
    const [u0, u1, v0, v1] = windows.get(51)!.plane.bounds;
    expect(orbitElongation(51)).toBe((u1 - u0) / (v1 - v0));
    // Every work has one, and none without a window bound to its record.
    for (const id of ids) expect(orbitElongation(id), `№ ${id}`).toBeGreaterThan(0.5);
    expect(orbitElongation(9999)).toBeUndefined();
  });

  it('reach № 051’s committed bounds again by replaying its window, as a browser would', () => {
    // The measure is the venue's own, so it must be one anyone can take again: the recorded
    // window replayed from its first step, every hundredth step kept as the work page keeps
    // them, and the plane of greatest extent found over those samples.
    const [orbit] = performedOrbits([51]);
    const stride = 100;
    const replay = new WindowPerformance(orbit.window);
    const samples = new Float32Array(Math.ceil(orbit.window.steps / stride) * 9);
    let count = 0;
    replay.run(orbit.window.steps, stride, () => {
      samples.set(replay.positions, count * 9);
      count += 1;
    });
    const { bounds } = principalPlane(samples, count);
    expect([bounds.u0, bounds.u1, bounds.v0, bounds.v1]).toEqual([...orbit.window.plane.bounds]);
    expect((bounds.u1 - bounds.u0) / (bounds.v1 - bounds.v0)).toBe(orbitElongation(51));
  }, 60_000);

  it('hand a work’s viewer its films’ score: the window, the hues, the record’s closest approach and the Ink film’s clock', () => {
    const [performed] = performedOrbits([31]);
    expect(filmOrbit(31)).toEqual({
      ...performed,
      closestApproach: workOrbit(31)!.published.closestApproach,
      ink: inkClock(31),
    });
    expect(filmOrbit(31)!.ink!.firstInked).toBe(71);
    expect(filmOrbit(9999)).toBeUndefined();
  });
});
