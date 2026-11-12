import type { Messages } from '@/lib/i18n/en';
import { clock, fill } from '@/lib/i18n/format';
import { advance, type Transport } from '@/lib/first-light/transport';
import { pairName } from '@/lib/physics/film-score';
import { LIGHT_FILM, lightFilmFrames, stepsDrawnAt } from '@/lib/physics/light-film';
import type { Rederivation } from '@/lib/physics/orbit';
import type { Strip } from './orbit-layers';
import type { Painter } from './orbit-painter';
import type { Picture } from './orbit-picture';
import { drawScore } from './score-drawing';

/*
  The recorded window, performed (orbit-score.tsx): the million steps the work records, drawn at
  the Light film's pace, with the score beneath.

  The clock is the visitor's (src/lib/first-light/transport.ts): it plays, rests, is scrubbed and
  slows for the closest approach. This module draws the window to wherever the clock stands, moves
  the score's playhead, the slider and the orbit in depth with it, and says where it stands a few
  times a second. What is said in words is the section's.
*/

/** The clock as the words and the slider read it. */
export type Clock = { kind: Transport['kind']; seconds: number };

/** The closest approach is said from its step for this long, in seconds of the Light film. */
const CLOSEST_SAID_SECONDS = 2;
/** The line is said this often at most while the clock runs, in milliseconds. */
const SAID_EVERY_MS = 250;

/** Where the window stands: its step of all its steps, and the film's clock there. */
export function playingLine(
  step: number,
  seconds: number,
  steps: number,
  t: Messages,
  number: Intl.NumberFormat,
): string {
  return fill(t.orbitPlaying, {
    step: number.format(step),
    total: number.format(steps),
    clock: clock(seconds),
  });
}

/**
 * What the line says at a moment of the window: the closest approach while it passes, else the
 * step and the clock. Nothing once the window stands whole with no hand on it: the section then
 * says so in its own words.
 */
export function windowLine(
  { kind, seconds }: Clock,
  window: {
    steps: number;
    /** The Light film's length, in seconds. */
    film: number;
    closest: { step: number; distance: number; pair: readonly [number, number] };
  },
  words: { t: Messages; number: Intl.NumberFormat; oneDecimal: Intl.NumberFormat },
): string | null {
  const { steps, film, closest } = window;
  const { t, number, oneDecimal } = words;
  if (seconds >= film && kind !== 'scrubbing') return null;
  const step = stepsDrawnAt(seconds, steps);
  const sinceClosest = step - closest.step;
  const stepsAFrame = steps / LIGHT_FILM.targetFrames;
  if (sinceClosest >= 0 && sinceClosest < CLOSEST_SAID_SECONDS * LIGHT_FILM.fps * stepsAFrame)
    return fill(t.orbitClosestNow, {
      distance: oneDecimal.format(closest.distance),
      pair: pairName(closest.pair),
    });
  return playingLine(step, seconds, steps, t, number);
}

/**
 * The window's score, drawn once on a canvas of its own: the three pairs' separations on a log
 * scale, with the closest approach, the syzygies and the braid's crossings as ticks beneath.
 * Returns how to show it on the strip with the playhead at a step; null where the browser gives
 * no canvas to keep it on.
 */
export function windowScore(
  strip: Strip,
  trace: Pick<Rederivation, 'samples' | 'closestApproach' | 'syzygies' | 'braid'>,
  steps: number,
  stride: number,
  hues: readonly number[],
): ((step: number) => void) | null {
  const { context, width, height, lane, ratio } = strip;
  const at = (step: number) => (step / (steps - 1)) * width;
  const kept = document.createElement('canvas');
  kept.width = width;
  kept.height = height;
  const base = kept.getContext('2d');
  if (!base) return null;
  drawScore(
    base,
    {
      separations: trace.samples.separations,
      count: trace.samples.count,
      stride,
      closestApproach: trace.closestApproach,
      syzygies: trace.syzygies,
      crossings: trace.braid.events.map((crossing) => crossing.step),
    },
    hues,
    {
      ratio,
      x: at,
      lane: { top: 2 * ratio, height: lane - 4 * ratio },
      base: height,
      ticks: { crossing: 3, syzygy: 7, closest: 11 },
      lineAlpha: 0.55,
      ink: 'rgb(241 235 223)',
      every: 2,
    },
  );
  return (step) => {
    context.clearRect(0, 0, width, height);
    context.drawImage(kept, 0, 0);
    context.fillStyle = 'rgb(241 235 223 / 0.92)';
    context.fillRect(Math.round(at(step)), 0, ratio, lane);
  };
}

/** The window as last laid out, so the clock can move it without laying it out again. */
export interface WindowScene {
  /** Draws the window to a moment of the film. */
  paint(seconds: number): void;
  /** Says where the clock stands. */
  speak(): void;
  /** Runs the clock, while it plays and the section is in view. */
  run(): void;
}

/** Everything the recorded window is drawn with, as the section has set it out. */
export interface WindowStage {
  picture: Picture;
  /** The window's trails and its bodies are the painter's to draw. */
  painter: Pick<Painter, 'strokes' | 'bodies'>;
  /** The trails' canvas, and its size in device pixels. */
  trail: CanvasRenderingContext2D;
  width: number;
  height: number;
  /** The score with its playhead at a step (`windowScore`). */
  score: (step: number) => void;
  /** The window's samples and steps, and the steps between two samples. */
  count: number;
  steps: number;
  stride: number;
  /** The Light film's length, in seconds. */
  film: number;
  inView: boolean;
  /** The clock. The visitor's hand may set it between two frames. */
  transport: { current: Transport };
  /** The section's animation frame, cancelled before each redraw. */
  frame: { current: number };
  /** The slider and the orbit in depth, which follow the drawing. */
  slider: { current: HTMLInputElement | null };
  sculpture: { current: { at(step: number): void } | null };
  /** Says where the clock stands: a few times a second while it runs, and at each act. */
  say: (clock: Clock) => void;
  /** The clock has run to the window's end. */
  onEnd: () => void;
}

/**
 * Draws the window where the clock stands, says so, and runs the clock while it plays and the
 * section is in view. Returns the scene, for the hand that takes the clock.
 */
export function performWindow(stage: WindowStage): WindowScene {
  const { picture, painter, trail, width, height, score, count, steps, stride, film } = stage;
  const { transport, frame, slider, sculpture } = stage;
  /** On the plate the bodies stand where the work left them once the window is drawn. */
  const rests = picture.kind === 'plate';
  const filmFrames = lightFilmFrames(steps);
  /** The last sample drawn. */
  let drawn = 0;

  /**
   * The window drawn to the moment the clock stands at. Forward, the strokes are added; back,
   * the drawing is laid again. A window drawn to its end on the plate goes on to the still's
   * step, and its bodies stand where the work left them; in the plane they leave the drawing,
   * as Phase A had it.
   */
  const paint = (seconds: number) => {
    const step = stepsDrawnAt(seconds, steps);
    const sample = Math.min(count - 1, Math.floor(step / stride));
    if (sample < drawn) {
      trail.clearRect(0, 0, width, height);
      drawn = 0;
    }
    const complete = sample >= count - 1;
    if (complete && drawn === 0) {
      if (picture.last > 0) painter.strokes(0, picture.last);
      painter.bodies(picture.last, rests);
      drawn = picture.last;
      score(Math.min(steps - 1, picture.last * stride));
    } else {
      if (sample > drawn) {
        painter.strokes(drawn, sample);
        drawn = sample;
      }
      if (complete && rests) {
        if (drawn < picture.last) {
          painter.strokes(count - 1, picture.last);
          drawn = picture.last;
        }
        painter.bodies(picture.last, true);
      } else painter.bodies(sample, !complete);
      score(step);
    }
    if (slider.current)
      slider.current.value = String(
        Math.min(filmFrames - 1, Math.floor(seconds * LIGHT_FILM.fps + 1e-9)),
      );
    sculpture.current?.at(step);
  };

  let spoken = -Infinity;
  /** What is happening now: at once when an act asks, else a few times a second. */
  const speak = (now = performance.now(), force = true) => {
    if (!force && now - spoken <= SAID_EVERY_MS) return;
    spoken = now;
    const { kind, seconds } = transport.current;
    stage.say({ kind, seconds });
  };

  const run = () => {
    cancelAnimationFrame(frame.current);
    if (!stage.inView || transport.current.kind !== 'playing') return;
    let last = performance.now();
    const tick = (now: number) => {
      // The film's own clock: a frame that comes late, or a tab that comes back, finds the
      // drawing where the film would be.
      const elapsed = Math.max(0, (now - last) / 1000);
      last = now;
      transport.current = advance(transport.current, elapsed, film);
      paint(transport.current.seconds);
      const ended = transport.current.kind !== 'playing';
      speak(now, ended);
      if (ended) {
        stage.onEnd();
        return;
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };

  paint(transport.current.seconds);
  // The line says where the clock stands from the first drawing, a clock the hand set before it too.
  speak();
  run();
  return { paint, speak: () => speak(), run };
}
