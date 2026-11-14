import { describe, expect, it } from 'vitest';
import { workOrbit } from '@/lib/art/orbit-records';
import { performedOrbits } from '@/lib/art/orbit-windows';
import { plateFrame } from '@/lib/art/orbit-frames';
import { beyondPath, confirmedAt } from './beyond';
import { Continuation } from './continuation';
import { HeldPlacement } from './framing';
import { deriveFate, escapingBody, type DerivedFate } from './orbit';

/** № 054 ejects soonest: 90,000 steps after its window, so its fate is a tenth of a second. */
const orbit = workOrbit(54)!;
const [performed] = performedOrbits([54]);
const steps = orbit.generation.steps;
const plane = performed.window.plane;
const fate: DerivedFate = deriveFate(
  {
    masses: orbit.published.masses,
    dt: orbit.generation.dt,
    positions: performed.window.positions,
    velocities: performed.window.velocities,
  },
  {
    steps,
    threshold: orbit.fate.escapeThreshold,
    horizonSteps: orbit.fate.horizonSteps,
  },
);
const fromTheEnd = (end = confirmedAt(fate.ejectionStep!), stride = 100) =>
  new Continuation({
    masses: orbit.published.masses,
    dt: orbit.generation.dt,
    origin: { taken: steps, ...fate.windowEnd },
    end,
    stride,
    plane,
  });

describe('the orbit stepped on past its window', () => {
  it('meets the published fate, so the escape it performs is the record’s', () => {
    expect(fate).toMatchObject({
      outcome: orbit.fate.outcome,
      escaper: orbit.fate.escaper,
      ejectionStep: orbit.fate.ejectionStep,
    });
  });

  it('passes through the same states as the path carried once, sample for sample', () => {
    // Two loops over the generator's one integrator, from the same bodies, placed on the same
    // plate: beyond.ts carries After the frame's path off the main thread, and this class steps
    // as a page watches.
    const start = { masses: orbit.published.masses, dt: orbit.generation.dt, steps };
    const continued = new Continuation({
      masses: orbit.published.masses,
      dt: orbit.generation.dt,
      origin: { taken: steps, ...fate.windowEnd },
      end: confirmedAt(fate.ejectionStep!),
      stride: 100,
      plate: new HeldPlacement(plateFrame(54)!, start),
    });
    continued.advanceTo(Number.MAX_SAFE_INTEGER);
    const carried = beyondPath({
      ...start,
      fate,
      pace: 33_300,
      stride: 100,
      plate: new HeldPlacement(plateFrame(54)!, start),
    });
    expect(carried.samples).toBeGreaterThan(continued.samples);
    expect(continued.path.length).toBe(continued.samples * carried.copies * 6);
    expect([...carried.pixels.subarray(0, continued.path.length)]).toEqual([...continued.path]);
  });

  it('rests where the escape is confirmed, with the escaping body unbound', () => {
    const continued = fromTheEnd();
    continued.advanceTo(Number.MAX_SAFE_INTEGER);
    expect(continued.resting).toBe(true);
    expect(continued.taken).toBe(confirmedAt(fate.ejectionStep!));
    const { positions, velocities } = continued.state;
    expect(
      escapingBody(orbit.published.masses, positions, velocities, orbit.fate.escapeThreshold),
    ).toBe(fate.escaper);
  });

  it('samples every stride in the window’s plane, from its first state', () => {
    const continued = fromTheEnd(steps + 1_000, 250);
    expect(continued.samples).toBe(1);
    continued.advanceTo(steps + 999);
    expect(continued.samples).toBe(4);
    continued.advanceTo(steps + 1_000);
    expect(continued.samples).toBe(5);
    expect(continued.path).toHaveLength(5 * 6);
    // The first sample is the window's last state, projected as the drawing projects it.
    const [e1] = plane.axes;
    const [x, y, z] = fate.windowEnd.positions;
    const u =
      (x - plane.mean[0]) * e1[0] + (y - plane.mean[1]) * e1[1] + (z - plane.mean[2]) * e1[2];
    expect(continued.path[0]).toBeCloseTo(u, 3);
  });

  it('samples every copy of every body on the plate, the camera held where the film ended', () => {
    // № 054 ejects soonest and draws a cross braid: positions, one coordinate borrowed.
    const placement = new HeldPlacement(plateFrame(54)!, performed.window);
    const continued = new Continuation({
      masses: orbit.published.masses,
      dt: orbit.generation.dt,
      origin: { taken: steps, ...fate.windowEnd },
      end: steps + 1_000,
      stride: 250,
      plate: placement,
    });
    expect(continued.width).toBe(placement.copies.length * 6);
    // The first sample is the window's last state, placed as the window's own bodies are.
    const first = placement.place(fate.windowEnd.positions, fate.windowEnd.velocities);
    expect([...continued.path.subarray(0, continued.width)]).toEqual([...first]);
    continued.advanceTo(steps + 1_000);
    expect(continued.samples).toBe(5);
    expect(continued.path).toHaveLength(5 * continued.width);
  });

  it('is drawn in a plane or on a plate, never both and never neither', () => {
    const placement = new HeldPlacement(plateFrame(54)!, performed.window);
    const begin = (where: { plane?: typeof plane; plate?: HeldPlacement }) =>
      new Continuation({
        masses: orbit.published.masses,
        dt: orbit.generation.dt,
        origin: { taken: steps, ...fate.windowEnd },
        end: steps + 100,
        stride: 100,
        ...where,
      });
    expect(() => begin({})).toThrow(/plane or on a plate/);
    expect(() => begin({ plane, plate: placement })).toThrow(/plane or on a plate/);
    expect(begin({ plane }).width).toBe(6);
  });

  it('takes no step past its end', () => {
    const continued = fromTheEnd(steps + 2_500);
    continued.advanceTo(steps + 10_000);
    continued.perform(0.1, 1_000, 0.5);
    expect(continued.resting).toBe(true);
    expect(continued.taken).toBe(steps + 2_500);
  });

  it('never moves the state it was handed', () => {
    const before = Array.from(fate.windowEnd.positions);
    fromTheEnd().advanceTo(steps + 5_000);
    expect(Array.from(fate.windowEnd.positions)).toEqual(before);
  });

  it('performs at the film’s pace, fades on its own clock, and resumes after a jump', () => {
    const continued = fromTheEnd();
    expect(continued.perform(0.1, 1_000, 0.5)).toBe(false);
    expect(continued.taken).toBe(steps + 100);
    for (let frame = 0; frame < 3; frame++) continued.perform(0.1, 1_000, 0.5);
    expect(continued.perform(0.1, 1_000, 0.5)).toBe(true);
    expect(continued.taken).toBe(steps + 500);
    // Drawn on at once in the meantime, the next frame carries on from the steps, not the clock.
    continued.advanceTo(steps + 20_000);
    continued.perform(0.1, 1_000, 0.5);
    expect(continued.taken).toBe(steps + 20_100);
  });
});
