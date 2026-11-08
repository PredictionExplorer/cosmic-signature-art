import type { OrbitPlate } from '@/lib/art/orbit-plate';
import { Continuation } from '@/lib/physics/continuation';
import { HeldPlacement } from '@/lib/physics/framing';
import type { DerivedFate, Rederivation } from '@/lib/physics/orbit';
import type { TwinRun } from '@/lib/physics/twin';
import { MATERIALS, type Picture } from './orbit-picture';
import type { Painter } from './orbit-painter';
import styles from './orbit-score.module.css';

/*
  One part in a trillion, performed (docs/first-light.md §15).

  The recorded window stays, dimmed, as After the frame leaves it. Past the frame, the work and
  its twin are carried on together:
  - the work in its own hues, drained of colour;
  - the twin in vermilion, the red of a seal.

  Where they coincide the two read as one line. Then the twin parts and dances its own dance.
  The bodies of the twin are ringed in its red. On the score beneath, the gap's growth is drawn on
  a log scale, where doubling at a steady rate reads as a straight line (orbit-score.tsx).
*/

/** The twin's tone, in light on night and in ink on paper. */
export const TWIN_TONE = {
  light: (alpha: number) => `oklch(0.74 0.14 35 / ${alpha})`,
  ink: (alpha: number) => `oklch(0.52 0.15 32 / ${alpha})`,
} as const;

/** The trails past the frame fade to a twentieth over about thirty seconds… */
const MEMORY_SECONDS = 30;
/** …a step every half second, since a slower fade is lost to an 8-bit canvas. */
const FADE_EVERY_SECONDS = 0.5;
const FADE = 1 - 0.05 ** (FADE_EVERY_SECONDS / MEMORY_SECONDS);
const TRAIL_ALPHA = 0.3;
/** No frame carries the pair more than this far, so a tab coming back resumes where it was. */
const LONGEST_FRAME_SECONDS = 0.1;
/** Drawn at once, the steps are taken this many to a frame, so the page stays responsive. */
const STILL_STEPS_PER_FRAME = 200_000;

/** The work and its twin past the frame, as they stand, so a resize carries on from them. */
export interface TwinPair {
  key: string;
  work: Continuation;
  twin: Continuation;
}

export interface TwinStage {
  run: TwinRun;
  /** The work's own fate: its bodies at the window's end, from which it goes on. */
  fate: DerivedFate;
  /** Which performance this is: a repeat starts afresh, a redraw carries on. */
  key: string;
  picture: Picture;
  plate: OrbitPlate;
  result: Rederivation;
  dt: number;
  steps: number;
  /** The pair's pace, in steps a second, and the steps between the samples drawn. */
  pace: number;
  stride: number;
  /** Drawn at once rather than performed. */
  still: boolean;
  inView: boolean;
  beyondTrail: CanvasRenderingContext2D;
  mark: CanvasRenderingContext2D;
  width: number;
  height: number;
  ratio: number;
  hues: readonly number[];
  painter: Painter;
  /** The gap's growth on the score, drawn to a step. */
  growth: (taken: number) => void;
  live: { current: TwinPair | null };
  frame: { current: number };
  /** Says where the pair has reached. */
  speak: (taken: number) => void;
  onRested: () => void;
}

/** Performs the work and its twin past the frame, or draws them at once; returns what stops it. */
export function performTwin(stage: TwinStage): (() => void) | void {
  const { run, fate, picture, plate, result, steps, still, pace, painter, live, frame } = stage;
  const { beyondTrail, mark, width, height, ratio, hues } = stage;
  const paint = MATERIALS[picture.material];
  const tone = TWIN_TONE[picture.material];
  const begin = (origin: { positions: ArrayLike<number>; velocities: ArrayLike<number> }) =>
    new Continuation({
      masses: result.masses,
      dt: stage.dt,
      origin: { taken: steps, ...origin },
      end: run.until,
      stride: stage.stride,
      plate: new HeldPlacement(plate.frame, { masses: result.masses, dt: stage.dt, steps }),
    });
  const keyed = `${stage.key}:${picture.kind}`;
  const pair =
    live.current?.key === keyed
      ? live.current
      : { key: keyed, work: begin(fate.windowEnd), twin: begin(run.windowEnd) };
  live.current = pair;
  const { work, twin } = pair;

  const place = (at: Continuation, index: number, body: number) =>
    picture.continued(at.path, at.width, index, body);
  const trace = (
    at: Continuation,
    colour: (body: number, alpha: number) => string,
    first: number,
    last: number,
    alpha: number,
  ) => {
    if (last <= first) return;
    beyondTrail.globalCompositeOperation = paint.blend;
    beyondTrail.lineWidth = picture.material === 'ink' ? 0.75 * ratio : ratio;
    beyondTrail.lineJoin = 'round';
    for (let body = 0; body < picture.drawn; body++) {
      beyondTrail.strokeStyle = colour(body, alpha);
      beyondTrail.beginPath();
      beyondTrail.moveTo(...place(at, first, body));
      for (let index = first + 1; index <= last; index++)
        beyondTrail.lineTo(...place(at, index, body));
      beyondTrail.stroke();
    }
  };
  const workTone = (body: number, alpha: number) =>
    paint.continued(hues[picture.body(body)], alpha);
  const twinTone = (_body: number, alpha: number) => tone(alpha);
  // Redrawn whole (a resize, a return, a drawing made at once), the paths so far are traced in
  // quarters, each as faded as the performance would have left it.
  const retrace = () => {
    beyondTrail.clearRect(0, 0, width, height);
    const memory = Math.max(4, Math.round((MEMORY_SECONDS * pace) / stage.stride));
    for (const [at, colour] of [
      [work, workTone],
      [twin, twinTone],
    ] as const) {
      const last = at.samples - 1;
      for (let quarter = 3; quarter >= 0; quarter--)
        trace(
          at,
          colour,
          Math.max(0, last - Math.round(((quarter + 1) * memory) / 4)),
          Math.max(0, last - Math.round((quarter * memory) / 4)),
          TRAIL_ALPHA * 0.05 ** (quarter / 4),
        );
    }
  };
  /** The work's bodies as the window drew them, and the twin's ringed in its red. */
  const bodies = () => {
    mark.clearRect(0, 0, width, height);
    painter.lights((body) => place(work, work.samples - 1, body));
    mark.strokeStyle = tone(0.9);
    mark.lineWidth = ratio;
    for (let body = 0; body < picture.drawn; body++) {
      const [x, y] = place(twin, twin.samples - 1, body);
      mark.beginPath();
      mark.arc(x, y, 5 * ratio, 0, Math.PI * 2);
      mark.stroke();
    }
  };
  const show = () => {
    retrace();
    bodies();
    stage.growth(work.taken);
    stage.speak(work.taken);
  };

  // The window, dimmed: what the work recorded, behind what comes next.
  painter.strokes(0, picture.last, paint.dimmed);
  show();
  if (still) {
    const compute = () => {
      const until = Math.min(run.until, work.taken + STILL_STEPS_PER_FRAME);
      work.advanceTo(until);
      twin.advanceTo(until);
      if (work.taken < run.until) {
        frame.current = requestAnimationFrame(compute);
        return;
      }
      show();
      stage.onRested();
    };
    frame.current = requestAnimationFrame(compute);
    return () => cancelAnimationFrame(frame.current);
  }
  if (!stage.inView || work.resting) {
    if (work.resting) stage.onRested();
    return;
  }
  let last: number | null = null;
  let spoken = 0;
  const perform = (now: number) => {
    const elapsed = last === null ? 0 : Math.min(LONGEST_FRAME_SECONDS, (now - last) / 1000);
    last = now;
    const workBefore = work.samples - 1;
    const twinBefore = twin.samples - 1;
    const fading = work.perform(elapsed, pace, FADE_EVERY_SECONDS);
    twin.perform(elapsed, pace, FADE_EVERY_SECONDS);
    if (fading) {
      beyondTrail.globalCompositeOperation = 'destination-out';
      beyondTrail.fillStyle = `rgb(0 0 0 / ${FADE})`;
      beyondTrail.fillRect(0, 0, width, height);
    }
    trace(work, workTone, workBefore, work.samples - 1, TRAIL_ALPHA);
    trace(twin, twinTone, twinBefore, twin.samples - 1, TRAIL_ALPHA);
    bodies();
    stage.growth(work.taken);
    if (now - spoken > 250 || work.resting) {
      spoken = now;
      stage.speak(work.taken);
    }
    if (work.resting) {
      stage.onRested();
      return;
    }
    frame.current = requestAnimationFrame(perform);
  };
  frame.current = requestAnimationFrame(perform);
  return () => cancelAnimationFrame(frame.current);
}

/** The superscript digits of an exponent, with a true minus sign. */
function exponentText(exponent: number): string {
  return `${exponent < 0 ? '−' : ''}${Math.abs(exponent)}`;
}

/**
 * A length in the orbit's units as a × 10ⁿ, its mantissa to two figures in the reader's own
 * digits and its exponent raised, but never below the 12 px floor.
 */
export function Scientific({ value, locale }: { value: number; locale: string }) {
  if (!(value > 0)) return <>0</>;
  let exponent = Math.floor(Math.log10(value));
  let mantissa = value / 10 ** exponent;
  if (mantissa >= 9.95) {
    mantissa /= 10;
    exponent += 1;
  }
  const digits = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(mantissa);
  if (exponent === 0) return <>{digits}</>;
  return (
    <>
      {digits} × 10<sup className={styles.exponent}>{exponentText(exponent)}</sup>
    </>
  );
}
