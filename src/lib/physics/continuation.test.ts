import { describe, expect, it } from 'vitest';
import { workOrbit } from '@/lib/art/orbit-records';
import { performedOrbits } from '@/lib/art/orbit-windows';
import { Continuation, restingStep } from './continuation';
import { CHECK_INTERVAL, HYSTERESIS, deriveFate, escapingBody, type DerivedFate } from './orbit';

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
    lead: 40_000,
  },
);
const fromTheEnd = (end = restingStep(fate, 0), stride = 100) =>
  new Continuation({
    masses: orbit.published.masses,
    dt: orbit.generation.dt,
    origin: { taken: steps, ...fate.windowEnd },
    end,
    stride,
    plane,
  });

describe('After the frame’s physics', () => {
  it('meets the published fate, so the escape it performs is the record’s', () => {
    expect(fate).toMatchObject({
      outcome: orbit.fate.outcome,
      escaper: orbit.fate.escaper,
      ejectionStep: orbit.fate.ejectionStep,
    });
  });

  it('passes through the fate run’s states bit for bit', () => {
    const continued = fromTheEnd();
    expect(fate.approach).not.toBeNull();
    continued.advanceTo(fate.approach!.taken);
    expect(continued.taken).toBe(fate.approach!.taken);
    expect(Array.from(continued.state.positions)).toEqual(Array.from(fate.approach!.positions));
    expect(Array.from(continued.state.velocities)).toEqual(Array.from(fate.approach!.velocities));
  });

  it('rests where the escape is confirmed, with the escaping body unbound', () => {
    const continued = fromTheEnd();
    continued.advanceTo(Number.MAX_SAFE_INTEGER);
    expect(continued.resting).toBe(true);
    expect(continued.taken).toBe(fate.ejectionStep! + 1 + (HYSTERESIS - 1) * CHECK_INTERVAL);
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

  it('can be brought to rest where it stands, and takes no step past it', () => {
    const continued = fromTheEnd();
    continued.advanceTo(steps + 2_500);
    continued.restHere();
    expect(continued.resting).toBe(true);
    expect(continued.end).toBe(steps + 2_500);
    continued.advanceTo(steps + 10_000);
    continued.perform(0.1, 1_000, 0.5);
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

describe('where After the frame rests', () => {
  const ejection = {
    outcome: 'ejection',
    ejectionStep: 1_090_000,
    horizonSteps: 8_000_000,
  } as const;
  it('a little after the fifth answer confirms an escape', () => {
    expect(restingStep(ejection, 0)).toBe(1_090_000 + 1 + 4 * CHECK_INTERVAL);
    expect(restingStep(ejection, 1_000)).toBe(1_131_001);
  });
  it('never past the horizon, where an eternal dance rests', () => {
    expect(restingStep({ ...ejection, ejectionStep: 7_990_000 }, 100_000)).toBe(8_000_000);
    expect(
      restingStep({ outcome: 'eternal_dance', ejectionStep: null, horizonSteps: 8_000_000 }, 5),
    ).toBe(8_000_000);
  });
});
