import { integrator } from './orbit';
import { FramedWindow, HeldPlacement, type PlateFrame, type WindowStart } from './framing';

/*
  One part in a trillion (docs/first-light.md §15): the work's orbit beside a twin started from the
  same first state, with one body moved by a trillionth of a unit.

  Within the recorded window the two stay one line: the gap grows, but never to a pixel of the
  plate. Past the frame the same physics carries both on, and the gap keeps doubling, every few
  tens of thousands of steps, until the twin parts from the work and dances a dance of its own.
  That is why a seed is a work's identity, and why the venue checks it to the last bit.

  This module is pure. The worker runs it; the orbit section draws what it found.
*/

/** A trillionth of the orbit's unit of length. */
export const NUDGE = 1e-12;
/** The twin has parted when one of its bodies stands this many pixels of the plate from the work's. */
export const PART_PIXELS = 3;
/** Past the parting the pair is followed a little further, so the two dances are seen apart. */
const AFTER_PARTING = 0.4;

/** The twin's first state: body `body`'s coordinate `axis` (0 is x) moved by `nudge`. */
export function nudged(start: WindowStart, body: number, axis: number, nudge: number): WindowStart {
  const positions = Float64Array.from(start.positions);
  positions[body * 3 + axis] += nudge;
  return { ...start, positions, velocities: Float64Array.from(start.velocities) };
}

/** What following the twin found. */
export interface TwinRun {
  /** Which body moved, along which axis (0 is x), and by how much, in the orbit's units. */
  body: number;
  axis: number;
  nudge: number;
  /** The twin's bodies at the window's end, from which it goes on past the frame beside the work. */
  windowEnd: { positions: Float64Array; velocities: Float64Array };
  /**
   * The gap every `every` steps from the window's first: the largest distance between a body of
   * the work and the same body of its twin, in the orbit's units.
   */
  gaps: Float64Array;
  every: number;
  /** The first step at which the twin stood `PART_PIXELS` from the work on the plate, or null. */
  parted: number | null;
  /** About how many steps the gap took to double, fitted while it grew from 10⁻¹¹ to 10⁻³. */
  doubling: number | null;
  /** The last step followed: a little past the parting, or the horizon. */
  until: number;
}

/** The largest distance between matching bodies of two states, in the orbit's units. */
export function gapBetween(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let gap = 0;
  for (let body = 0; body < 3; body++) {
    const i = body * 3;
    gap = Math.max(gap, Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1], a[i + 2] - b[i + 2]));
  }
  return gap;
}

/** Whether any body stands more than `PART_PIXELS` from its twin in the plate's primary copy. */
function apart(a: Float64Array, b: Float64Array): boolean {
  for (let body = 0; body < 3; body++) {
    const i = body * 2;
    if (Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1]) > PART_PIXELS) return true;
  }
  return false;
}

/**
 * About how many steps the gap takes to double: a straight line fitted to its logarithm while it
 * grows from 10⁻¹¹ to 10⁻³, where the growth is clean. Null when it never grows that far, or does
 * not grow.
 */
export function doublingOf(gaps: ArrayLike<number>, every: number): number | null {
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < gaps.length; i++) {
    const gap = gaps[i];
    if (!(gap > 1e-11 && gap < 1e-3)) continue;
    const x = i * every;
    const y = Math.log(gap);
    n += 1;
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
  }
  if (n < 8) return null;
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return slope > 0 ? Math.LN2 / slope : null;
}

/**
 * The work and its twin, side by side: through the recorded window as the films placed it, then
 * past the frame with the camera held where the film's frame ended, until the twin parts, and a
 * little after; or to `horizon` steps, if it never does.
 */
export function twinRun(
  start: WindowStart,
  frame: PlateFrame,
  {
    horizon,
    body = 0,
    axis = 0,
    nudge = NUDGE,
    every = 1_000,
    check = 100,
  }: {
    horizon: number;
    body?: number;
    axis?: number;
    nudge?: number;
    /** Steps between the gaps kept. */
    every?: number;
    /** Steps between the looks for a parting; `every` must be a multiple of it. */
    check?: number;
  },
): TwinRun {
  if (every % check !== 0) throw new Error(`Gaps every ${every} steps, looks every ${check}`);
  const steps = start.steps;
  const work = new FramedWindow(start, frame);
  const twin = new FramedWindow(nudged(start, body, axis, nudge), frame);
  const gaps: number[] = [];
  let parted: number | null = null;
  let until = horizon;
  const part = (step: number) => {
    parted = step;
    until = Math.min(
      horizon,
      Math.max(step + every, step + Math.round((step - steps) * AFTER_PARTING)),
    );
  };

  // Within the window, both replayed and placed as the films placed them.
  let step = 0;
  for (;;) {
    if (step % every === 0) gaps.push(gapBetween(work.positions, twin.positions));
    if (parted === null && apart(work.place(), twin.place())) part(step);
    if (step >= steps) break;
    const next = Math.min(step + check, steps);
    work.run(next, check);
    twin.run(next, check);
    step = next;
  }

  // Past the frame, both carried on from where the window left them.
  const P = Float64Array.from(work.positions);
  const V = Float64Array.from(work.velocities);
  const Q = Float64Array.from(twin.positions);
  const W = Float64Array.from(twin.velocities);
  const windowEnd = { positions: Float64Array.from(Q), velocities: Float64Array.from(W) };
  const held = new HeldPlacement(frame, start);
  const here = new Float64Array(held.copies.length * 6);
  const there = new Float64Array(held.copies.length * 6);
  const advanceWork = integrator(start.masses, P, V, start.dt);
  const advanceTwin = integrator(start.masses, Q, W, start.dt);
  while (step < until) {
    advanceWork();
    advanceTwin();
    step += 1;
    if (step % every === 0) gaps.push(gapBetween(P, Q));
    if (
      parted === null &&
      step % check === 0 &&
      apart(held.place(P, V, here), held.place(Q, W, there))
    )
      part(step);
  }

  const kept = Float64Array.from(gaps);
  return {
    body,
    axis,
    nudge,
    windowEnd,
    gaps: kept,
    every,
    parted,
    doubling: doublingOf(kept, every),
    until,
  };
}

/** The gap at a step, between the kept ones: evenly in its logarithm, as it grows. */
export function gapAt(run: Pick<TwinRun, 'gaps' | 'every'>, step: number): number {
  const at = Math.max(0, step / run.every);
  const lower = Math.min(run.gaps.length - 1, Math.floor(at));
  const upper = Math.min(run.gaps.length - 1, lower + 1);
  const a = run.gaps[lower];
  const b = run.gaps[upper];
  // On a kept step, the kept gap itself; between them, evenly in its logarithm.
  if (at === lower || lower === upper || !(a > 0) || !(b > 0)) return a;
  return Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * (at - lower));
}

/**
 * How fast to carry the pair past the frame, in steps a second: the film's own pace where the
 * twin parts soon after it, else fast enough that it parts about `seconds` in. A twin that never
 * parts is carried to its horizon in about twice that.
 */
export function twinPace(
  run: Pick<TwinRun, 'parted' | 'until'>,
  steps: number,
  filmPace: number,
  seconds = 10,
): number {
  const reach = run.parted === null ? run.until - steps : run.parted - steps;
  const over = run.parted === null ? seconds * 2 : seconds;
  return Math.max(filmPace, reach / over);
}
