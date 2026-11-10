import type { Messages } from '@/lib/i18n/en';
import { clock, fill } from '@/lib/i18n/format';
import type { OrbitPlate } from '@/lib/art/orbit-plate';
import { Continuation, restingStep } from '@/lib/physics/continuation';
import { HeldPlacement } from '@/lib/physics/framing';
import type { DerivedFate, Rederivation } from '@/lib/physics/orbit';
import type { Plane } from '@/lib/physics/plane';
import { STRIDE } from './orbit-derivation';
import { shareText } from './orbit-proof';
import { MATERIALS, type Picture } from './orbit-picture';
import type { Painter } from './orbit-painter';

/*
  After the frame (third-physics.md §5.6). The recorded window stays, dimmed, and the same physics
  runs on from the bodies the worker kept: at the window's end, or a few seconds before an
  ejection. Its trails are the bodies' hues drained of colour, on a layer of their own that
  forgets them over about a film's length: the same bodies, beyond what the work recorded. On the
  plate they go on over the same still, the camera held where the film's frame ended.
*/

/** After the frame: where the performance starts, and a count so a repeat starts afresh. */
export type Beyond = { from: 'end' | 'approach'; run: number };

/**
 * After the frame rests once an escape is confirmed and the escaping body has left the drawing,
 * and never later than this many seconds of the film's pace after the confirmation: the pair it
 * leaves recoils the other way, and would follow it out.
 */
const AFTER_ESCAPE_SECONDS = 2;
/** After the confirmation, a drawing made at once looks for the escaper's exit this finely. */
const SETTLE_STEPS = 1_000;
/** Drawn at once, an eternal dance past the frame covers this share of a window. */
const STILL_WINDOWS = 0.5;
/** Past the frame a trail fades to a twentieth over about the film's length… */
const MEMORY_SECONDS = 30;
/** …a step every half second, since a slower fade is lost to an 8-bit canvas. */
const FADE_EVERY_SECONDS = 0.5;
const FADE = 1 - 0.05 ** (FADE_EVERY_SECONDS / MEMORY_SECONDS);
/** The continued trails: the bodies' hues drained of colour. */
const CONTINUED_ALPHA = 0.3;
/** No frame advances the performance by more than this, so a tab coming back resumes it. */
const LONGEST_FRAME_SECONDS = 0.1;
/** Drawn at once, the steps are taken this many to a frame, so the page stays responsive. */
const STILL_STEPS_PER_FRAME = 100_000;

/**
 * The line under the drawing past the frame: how far it has run, an escape, or the horizon. Once
 * the run is past a step at which the computation lost its energy (EnergyWatch in orbit.ts), the
 * line says that instead: what follows is no orbit, whatever the record dates there.
 */
export function beyondLine(
  fate: DerivedFate,
  at: { taken: number },
  steps: number,
  pace: number,
  t: Messages,
  number: Intl.NumberFormat,
): string {
  const { broken } = fate.energy;
  if (broken && at.taken >= broken.step)
    return fill(t.orbitAdrift, {
      step: number.format(broken.step),
      change: shareText(broken.change, number.resolvedOptions().locale),
    });
  const ejection = fate.outcome === 'ejection' ? fate.ejectionStep : null;
  return ejection !== null && at.taken > ejection
    ? fill(t.orbitEscaped, {
        body: (fate.escaper ?? 0) + 1,
        step: number.format(ejection),
      })
    : at.taken >= fate.horizonSteps
      ? fill(t.orbitHeld, { steps: number.format(fate.horizonSteps) })
      : fill(t.orbitBeyond, {
          step: number.format(at.taken),
          clock: clock((at.taken - steps) / pace),
        });
}

/** Everything After the frame draws with, and tells, as the section has set it out. */
export interface BeyondStage {
  fate: DerivedFate;
  from: Beyond['from'];
  /** Which performance this is: a repeat starts afresh, a redraw carries on. */
  key: string;
  picture: Picture;
  plate?: OrbitPlate;
  plane: Plane | null;
  result: Rederivation;
  /** The integrator's time step, the window's steps, and the Light film's pace in steps a second. */
  dt: number;
  steps: number;
  pace: number;
  /** Drawn at once rather than performed. */
  still: boolean;
  inView: boolean;
  /** The continued trails' canvas, and the bodies'. */
  beyondTrail: CanvasRenderingContext2D;
  mark: CanvasRenderingContext2D;
  width: number;
  height: number;
  ratio: number;
  hues: readonly number[];
  painter: Painter;
  /** The score, with its playhead at a step, or dimmed without one. */
  scoreAt: (step: number | null) => void;
  /** The orbit past the frame as it stands, so a resize or a return carries on from it. */
  live: { current: { key: string; continuation: Continuation } | null };
  /** The section's animation frame, cancelled before each redraw. */
  frame: { current: number };
  /** Says where the performance has reached. */
  speak: (at: Continuation) => void;
  /** The drawing made at once is complete. */
  onRested: () => void;
}

/** Performs After the frame, or draws it at once; returns what stops it. */
export function performBeyond(stage: BeyondStage): (() => void) | void {
  const { fate, from, key, picture, plate, plane, result, steps, pace, still } = stage;
  const { beyondTrail, mark, width, height, ratio, hues, painter, live, frame, speak } = stage;
  const paint = MATERIALS[picture.material];
  const where =
    picture.kind === 'plate' && plate
      ? {
          plate: new HeldPlacement(plate.frame, {
            masses: result.masses,
            dt: stage.dt,
            steps,
          }),
        }
      : { plane: plane! };
  const begin = (start: Beyond['from']) =>
    new Continuation({
      masses: result.masses,
      dt: stage.dt,
      origin:
        start === 'approach' && fate.approach ? fate.approach : { taken: steps, ...fate.windowEnd },
      end: restingStep(fate, Math.round(AFTER_ESCAPE_SECONDS * pace)),
      stride: STRIDE,
      ...where,
    });
  const place = (at: Continuation, index: number, body: number) =>
    picture.continued(at.path, at.width, index, body);
  const trace = (at: Continuation, first: number, last: number, alpha: number) => {
    if (last <= first) return;
    beyondTrail.globalCompositeOperation = paint.blend;
    beyondTrail.lineWidth = picture.material === 'ink' ? 0.75 * ratio : ratio;
    beyondTrail.lineJoin = 'round';
    for (let body = 0; body < picture.drawn; body++) {
      beyondTrail.strokeStyle = paint.continued(hues[picture.body(body)], alpha);
      beyondTrail.beginPath();
      beyondTrail.moveTo(...place(at, first, body));
      for (let index = first + 1; index <= last; index++)
        beyondTrail.lineTo(...place(at, index, body));
      beyondTrail.stroke();
    }
  };
  // Redrawn whole (a resize, a return, a still drawing), the last film's length of the path
  // is traced in quarters, each as faded as the performance would have left it.
  const retrace = (at: Continuation) => {
    beyondTrail.clearRect(0, 0, width, height);
    const last = at.samples - 1;
    const memory = Math.max(4, Math.round((MEMORY_SECONDS * pace) / STRIDE));
    for (let quarter = 3; quarter >= 0; quarter--)
      trace(
        at,
        Math.max(0, last - Math.round(((quarter + 1) * memory) / 4)),
        Math.max(0, last - Math.round((quarter * memory) / 4)),
        CONTINUED_ALPHA * 0.05 ** (quarter / 4),
      );
  };
  const lightsAt = (at: Continuation) => {
    mark.clearRect(0, 0, width, height);
    painter.lights((body) => place(at, at.samples - 1, body));
  };

  const confirmed = restingStep(fate, 0);
  const escaper = fate.outcome === 'ejection' ? fate.escaper : null;
  const copies = picture.drawn / 3;
  /**
   * Whether the escaping body's light has left the drawing altogether: on a kaleidoscope's
   * plate, every copy of it, since a turned copy may still be on the plate when the first
   * has left it.
   */
  const gone = (at: Continuation) => {
    if (escaper === null) return false;
    const reach = picture.reach(result.masses[escaper]);
    for (let copy = 0; copy < copies; copy++) {
      const [ex, ey] = place(at, at.samples - 1, copy * 3 + escaper);
      if (ex >= -reach && ex <= width + reach && ey >= -reach && ey <= height + reach) return false;
    }
    return true;
  };
  /** Once the escape is confirmed, the performance rests as soon as the escaper is gone. */
  const settle = (at: Continuation) => {
    if (!at.resting && at.taken >= confirmed && gone(at)) at.restHere();
  };

  // The window, dimmed, and its score: what the work recorded, behind what comes next.
  painter.strokes(0, picture.last, paint.dimmed);
  stage.scoreAt(null);
  // A plate and a plane place the bodies apart: a turn between Light and Ink keeps the path.
  const keyed = `${key}:${picture.kind}`;
  let at = live.current?.key === keyed ? live.current.continuation : begin(from);
  // Drawn at once, an escape is drawn from its approach rather than waited for.
  if (still && fate.approach && at.taken < fate.approach.taken) at = begin('approach');
  live.current = { key: keyed, continuation: at };
  retrace(at);
  lightsAt(at);
  if (still) {
    const target =
      fate.outcome === 'ejection'
        ? at.end
        : Math.max(at.taken, steps + Math.round(STILL_WINDOWS * steps));
    const compute = () => {
      const until = Math.min(target, at.taken + STILL_STEPS_PER_FRAME);
      // In long strides to the confirmation, then finely, so the rest finds the exit.
      while (at.taken < until && !at.resting) {
        at.advanceTo(
          at.taken < confirmed
            ? Math.min(until, confirmed)
            : Math.min(until, at.taken + SETTLE_STEPS),
        );
        settle(at);
      }
      if (at.taken < Math.min(target, at.end)) {
        frame.current = requestAnimationFrame(compute);
        return;
      }
      retrace(at);
      lightsAt(at);
      speak(at);
      stage.onRested();
    };
    frame.current = requestAnimationFrame(compute);
    return () => cancelAnimationFrame(frame.current);
  }
  if (!stage.inView || at.resting) return;
  let last: number | null = null;
  let spoken = 0;
  const perform = (now: number) => {
    const elapsed = last === null ? 0 : Math.min(LONGEST_FRAME_SECONDS, (now - last) / 1000);
    last = now;
    const before = at.samples - 1;
    if (at.perform(elapsed, pace, FADE_EVERY_SECONDS)) {
      beyondTrail.globalCompositeOperation = 'destination-out';
      beyondTrail.fillStyle = `rgb(0 0 0 / ${FADE})`;
      beyondTrail.fillRect(0, 0, width, height);
    }
    settle(at);
    trace(at, before, at.samples - 1, CONTINUED_ALPHA);
    lightsAt(at);
    if (now - spoken > 250 || at.resting) {
      spoken = now;
      speak(at);
    }
    if (!at.resting) frame.current = requestAnimationFrame(perform);
  };
  frame.current = requestAnimationFrame(perform);
  return () => cancelAnimationFrame(frame.current);
}
