import {
  CHECK_INTERVAL,
  ENERGY_INTERVAL,
  EnergyWatch,
  HYSTERESIS,
  integrator,
  type DerivedFate,
  type EnergyKept,
} from './orbit.ts';
import type { HeldPlacement } from './framing.ts';

/*
  After the frame's path (docs/after-the-frame.md §8.3): the orbit carried on past its recorded
  window, once, off the main thread, from the bodies the fate run kept at the window's end. Every
  step is the generator's own integrator's, so it passes through every state the fate run passed
  through, bit for bit. Every `stride`-th step is placed where a page draws it: on the work's
  plate, with the camera held where the film's frame ended (framing.ts).

  How far it is carried:
  - where the record finds the three bound, to the record's horizon;
  - where the record finds a body free, on past the step that confirms it, for long enough that
    the two it leaves are seen to go their way too, and never past the horizon;
  - and never past a step at which the computation lost its energy: what comes after is not an
    orbit (EnergyWatch in orbit.ts), so it is not sampled, and a page cannot perform it.
*/

/**
 * Past the step that confirms an escape, the path runs on for this many seconds of the Light
 * film, the energy allowing. In every work but № 016 the two left behind have left the picture
 * by then, the slowest 49 seconds after the confirmation; № 030's computation loses its energy
 * seven seconds past its own (measured over the collection; docs/after-the-frame.md §8.3).
 */
export const PAST_ESCAPE_SECONDS = 60;

/** The orbit past its window, placed on the work's plate with the camera held. */
export interface BeyondPath {
  /** The step the first sample stands at: the window's steps. */
  from: number;
  /** Steps between samples. */
  stride: number;
  /** Samples taken; the last stands at `from + (samples − 1) × stride`. */
  samples: number;
  /**
   * x then y, in the frame's pixels, for the three bodies of every symmetry copy, sample by
   * sample: 72 bytes a sample for one copy, 20 MB for the longest path of a work with twelve.
   */
  pixels: Float32Array;
  /** Symmetry copies of each body in `pixels`. */
  copies: number;
  /** Where the computation lost its energy, when that is what ended the path. */
  lost: EnergyKept['broken'];
}

/** The step at which the generator's fifth answer in a row confirms an escape dated `ejectionStep`. */
export const confirmedAt = (ejectionStep: number) =>
  ejectionStep + 1 + (HYSTERESIS - 1) * CHECK_INTERVAL;

/** The last step a path past the window is carried to (the energy allowing). */
export function beyondEnd(
  fate: Pick<DerivedFate, 'outcome' | 'ejectionStep' | 'horizonSteps'>,
  pace: number,
): number {
  if (fate.outcome !== 'ejection' || fate.ejectionStep === null) return fate.horizonSteps;
  return Math.min(
    fate.horizonSteps,
    confirmedAt(fate.ejectionStep) + Math.round(PAST_ESCAPE_SECONDS * pace),
  );
}

export function beyondPath({
  masses,
  dt,
  steps,
  fate,
  pace,
  stride,
  plate,
}: {
  masses: readonly [number, number, number];
  dt: number;
  /** The window's steps: where the path begins. */
  steps: number;
  /** The fate run this carries on from: its bodies at the window's end, and its energy. */
  fate: Pick<DerivedFate, 'outcome' | 'ejectionStep' | 'horizonSteps' | 'windowEnd' | 'energy'>;
  /** The Light film's pace, in steps a second. */
  pace: number;
  stride: number;
  /** The work's plate, the camera held where the film's frame ended. */
  plate: HeldPlacement;
}): BeyondPath {
  const P = Float64Array.from(fate.windowEnd.positions);
  const V = Float64Array.from(fate.windowEnd.velocities);
  const step = integrator(masses, P, V, dt);
  // The same question the fate run asked, of the same first energy; past its last step, the
  // only one asking.
  const watch = new EnergyWatch(masses, P, V, steps, fate.energy.first);
  const end = Math.max(steps, beyondEnd(fate, pace));
  const room = Math.floor((end - steps) / stride) + 1;
  const copies = plate.copies.length;
  const pixels = new Float32Array(room * copies * 6);
  const placed = new Float64Array(copies * 6);
  let samples = 0;
  const sample = () => {
    pixels.set(plate.place(P, V, placed), samples * copies * 6);
    samples += 1;
  };
  // A window that lost its energy inside itself has no path past it: only where it ended.
  const before = fate.energy.broken;
  sample();
  let lost: EnergyKept['broken'] = before && before.step <= steps ? before : null;
  for (let taken = steps + 1; taken <= end && !lost; taken++) {
    step();
    watch.observe(taken);
    if (watch.kept.broken) {
      // The energy jumped somewhere since the watch last asked: nothing since then is kept.
      lost = watch.kept.broken;
      const kept = Math.floor((lost.step - ENERGY_INTERVAL - steps) / stride) + 1;
      samples = Math.max(1, Math.min(samples, kept));
      break;
    }
    if ((taken - steps) % stride === 0) sample();
  }
  return {
    from: steps,
    stride,
    samples,
    // Copied only where samples were dropped: a kaleidoscope's whole path is 20 MB.
    pixels: samples === room ? pixels : pixels.slice(0, samples * copies * 6),
    copies,
    lost,
  };
}
