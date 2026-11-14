import { beforeAll, describe, expect, it } from 'vitest';
import { plateFrame } from '@/lib/art/orbit-frames';
import { workEnergy } from '@/lib/art/orbit-energy';
import { workOrbit } from '@/lib/art/orbit-records';
import { performedOrbits } from '@/lib/art/orbit-windows';
import { PAST_ESCAPE_SECONDS, beyondEnd, beyondPath, confirmedAt, type BeyondPath } from './beyond';
import { HeldPlacement } from './framing';
import { lightFilmDuration } from './light-film';
import { CHECK_INTERVAL, deriveFate, type DerivedFate } from './orbit';

const STRIDE = 100;
/** A work's fate run and its path past the window, as the worker makes them. */
function carried(id: number): { fate: DerivedFate; path: BeyondPath; pace: number } {
  const orbit = workOrbit(id)!;
  const [performed] = performedOrbits([id]);
  const steps = orbit.generation.steps;
  const pace = steps / lightFilmDuration(steps);
  const start = { masses: orbit.published.masses, dt: orbit.generation.dt, steps };
  const fate = deriveFate(
    { ...start, positions: performed.window.positions, velocities: performed.window.velocities },
    { steps, threshold: orbit.fate.escapeThreshold, horizonSteps: orbit.fate.horizonSteps },
  );
  const path = beyondPath({
    ...start,
    fate,
    pace,
    stride: STRIDE,
    plate: new HeldPlacement(plateFrame(id)!, start),
  });
  return { fate, path, pace };
}

describe('how far a path past the window is carried', () => {
  const ejection = {
    outcome: 'ejection',
    ejectionStep: 1_090_000,
    horizonSteps: 8_000_000,
  } as const;
  it('past the step that confirms an escape, for a minute of the film', () => {
    // The generator's fifth answer in a row, ten thousand steps apart.
    expect(confirmedAt(1_090_000)).toBe(1_090_000 + 1 + 4 * CHECK_INTERVAL);
    expect(beyondEnd(ejection, 1_000)).toBe(1_130_001 + PAST_ESCAPE_SECONDS * 1_000);
  });
  it('never past the horizon, where a bound orbit’s path ends', () => {
    expect(beyondEnd({ ...ejection, ejectionStep: 7_990_000 }, 33_300)).toBe(8_000_000);
    expect(
      beyondEnd({ outcome: 'eternal_dance', ejectionStep: null, horizonSteps: 8_000_000 }, 33_300),
    ).toBe(8_000_000);
  });
});

describe('the orbit past its window', () => {
  // № 054's record finds a body free soonest after its window: 90,000 steps.
  let soonest: ReturnType<typeof carried>;
  beforeAll(() => {
    soonest = carried(54);
  }, 60_000);

  it('begins where the window ended, placed as the window’s own bodies are', () => {
    const { fate, path } = soonest;
    const orbit = workOrbit(54)!;
    const steps = orbit.generation.steps;
    expect(path.from).toBe(steps);
    expect(path.stride).toBe(STRIDE);
    const placement = new HeldPlacement(plateFrame(54)!, {
      masses: orbit.published.masses,
      dt: orbit.generation.dt,
      steps,
    });
    const first = placement.place(fate.windowEnd.positions, fate.windowEnd.velocities);
    expect(path.copies).toBe(placement.copies.length);
    expect([...path.pixels.subarray(0, first.length)]).toEqual([...Float32Array.from(first)]);
    // Its bodies are the fate run's own, never moved by the carrying.
    expect(fate.windowEnd.positions).toHaveLength(9);
  });

  it('runs a minute of film past the step that confirms the escape, with its energy kept', () => {
    const { fate, path, pace } = soonest;
    expect(fate).toMatchObject({ outcome: 'ejection', ejectionStep: 1_090_000 });
    const end = beyondEnd(fate, pace);
    expect(path.samples).toBe(Math.floor((end - path.from) / STRIDE) + 1);
    expect(path.pixels).toHaveLength(path.samples * path.copies * 6);
    expect(path.lost).toBeNull();
    expect(path.pixels.every(Number.isFinite)).toBe(true);
    // The step that confirms the escape lies a minute of film before the path's last.
    const confirmed = (confirmedAt(fate.ejectionStep!) - path.from) / STRIDE;
    expect(
      Math.abs(path.samples - 1 - confirmed - (PAST_ESCAPE_SECONDS * pace) / STRIDE),
    ).toBeLessThan(1);
  });

  it('stops before the step at which the computation lost its energy, and says where', () => {
    // № 004 loses its energy 535,000 steps past its window, before its dated ejection.
    const { fate, path } = carried(4);
    expect(fate.energy.broken).toMatchObject({ step: 1_535_000 });
    expect(path.lost).toEqual(fate.energy.broken);
    expect(path.lost).toEqual(workEnergy(4)!.broken);
    // The energy jumped somewhere in the thousand steps before the watch asked: none is kept.
    const last = path.from + (path.samples - 1) * STRIDE;
    expect(last).toBe(1_534_000);
  }, 60_000);

  it('has nothing past a window that lost its energy inside itself', () => {
    // № 022: near step 44,000.
    const { fate, path } = carried(22);
    expect(fate.energy.broken!.step).toBeLessThan(path.from);
    expect(path.samples).toBe(1);
    expect(path.lost).toEqual(fate.energy.broken);
    expect(path.pixels).toHaveLength(path.copies * 6);
  }, 60_000);

  it('is cut short of its minute where the energy breaks after the escape is confirmed', () => {
    // № 030: the record finds body 3 free at step 4,830,000, and the computation loses its
    // energy near step 5,106,000, seven seconds of film past the confirmation.
    const { fate, path, pace } = carried(30);
    expect(fate).toMatchObject({ outcome: 'ejection', escaper: 2, ejectionStep: 4_830_000 });
    expect(path.lost).toMatchObject({ step: 5_106_000 });
    const last = path.from + (path.samples - 1) * STRIDE;
    expect(last).toBe(5_105_000);
    // The confirmation is in the path; the minute past it is not.
    expect(confirmedAt(4_830_000)).toBeLessThan(last);
    expect((last - confirmedAt(4_830_000)) / pace).toBeCloseTo(7.1, 1);
    expect(last).toBeLessThan(beyondEnd(fate, pace));
  }, 120_000);
});
