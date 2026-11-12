import { Fragment, type ReactNode } from 'react';
import type { OrbitPlate } from '@/lib/art/orbit-plate';
import type { Messages } from '@/lib/i18n/en';
import { fill, fillParts } from '@/lib/i18n/format';
import { Continuation } from '@/lib/physics/continuation';
import { HeldPlacement } from '@/lib/physics/framing';
import type { DerivedFate, Rederivation } from '@/lib/physics/orbit';
import { gapAt, twinPace, type TwinRun } from '@/lib/physics/twin';
import type { Strip } from './orbit-layers';
import { MATERIALS, type Picture } from './orbit-picture';
import { FADE_EVERY_SECONDS, type Continued, type Painter } from './orbit-painter';
import { LONGEST_FRAME_SECONDS, SAID_EVERY_MS } from './orbit-rhythm';
import styles from './orbit-score.module.css';

/*
  One part in a trillion, performed (docs/first-light.md §15).

  The recorded window stays, dimmed, as After the frame leaves it. Past the frame, the work and
  its twin are carried on together:
  - the work in its own hues, drained of colour;
  - the twin in vermilion, the red of a seal.

  Where they coincide the two read as one line. Then the twin parts and dances its own dance.
  The bodies of the twin are ringed in its red. On the strip beneath, in the score's place, the
  gap's growth is drawn on a log scale, where doubling at a steady rate reads as a straight line.
  The line says the same in words: how far apart the two stand, then where they parted
  (`twinLine`).
*/

/** The twin: followed in its worker, ready to perform, or not to be had. */
export type Twin =
  { phase: 'following' } | { phase: 'ready'; run: TwinRun; repeat: number } | { phase: 'failed' };

/** The twin's tone, in light on night and in ink on paper. */
export const TWIN_TONE = {
  light: (alpha: number) => `oklch(0.74 0.14 35 / ${alpha})`,
  ink: (alpha: number) => `oklch(0.52 0.15 32 / ${alpha})`,
} as const;

/** The trails past the frame are remembered for about thirty seconds of the performance. */
const MEMORY_SECONDS = 30;
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
  /**
   * The film's pace, in steps a second, and the steps between the window's samples. The pair
   * keeps the film's pace, or a faster one where the twin parts late (`twinPace`), and is
   * sampled as much more sparsely.
   */
  pace: number;
  stride: number;
  /** Drawn at once rather than performed. */
  still: boolean;
  inView: boolean;
  /** The bodies' canvas, its size in device pixels, and device pixels to a CSS pixel. */
  mark: CanvasRenderingContext2D;
  width: number;
  height: number;
  ratio: number;
  painter: Painter;
  /** The strip beneath the picture, where the gap's growth is drawn. */
  strip: Strip;
  live: { current: TwinPair | null };
  frame: { current: number };
  /** Says where the pair has reached. */
  speak: (taken: number) => void;
  onRested: () => void;
}

/**
 * The gap's growth on the strip beneath the picture, drawn to a step: on a log scale from a
 * trillionth up, where steady doubling is a straight line. A rule stands where the frame ends
 * (the recorded window lies to its left), and a dot where the twin parted.
 */
export function twinGrowth(strip: Strip, run: TwinRun, steps: number): (taken: number) => void {
  const { context, width, height, lane, ratio } = strip;
  const span = Math.max(run.until, steps);
  const highest = run.gaps.reduce((most, gap) => Math.max(most, gap), 1e-12);
  const top = Math.max(0, Math.ceil(Math.log10(highest)));
  const bottom = -12;
  const x = (step: number) => (step / span) * width;
  const y = (gap: number) =>
    lane -
    2 * ratio -
    ((Math.log10(Math.max(gap, 1e-13)) - bottom) / (top - bottom)) * (lane - 4 * ratio);
  return (taken) => {
    context.clearRect(0, 0, width, height);
    context.fillStyle = 'rgb(241 235 223 / 0.35)';
    context.fillRect(Math.round(x(steps)), 0, ratio, lane);
    context.strokeStyle = TWIN_TONE.light(0.95);
    context.lineWidth = 1.5 * ratio;
    context.beginPath();
    for (let i = 0; i < run.gaps.length && i * run.every <= taken; i++) {
      if (i === 0) context.moveTo(x(0), y(run.gaps[0]));
      else context.lineTo(x(i * run.every), y(run.gaps[i]));
    }
    context.stroke();
    if (run.parted !== null && taken >= run.parted) {
      context.fillStyle = TWIN_TONE.light(1);
      context.beginPath();
      context.arc(x(run.parted), y(gapAt(run, run.parted)), 3 * ratio, 0, Math.PI * 2);
      context.fill();
    }
  };
}

/** Performs the work and its twin past the frame, or draws them at once; returns what stops it. */
export function performTwin(stage: TwinStage): (() => void) | void {
  const { run, fate, picture, plate, result, steps, still, painter, live, frame } = stage;
  const { mark, width, height, ratio } = stage;
  const paint = MATERIALS[picture.material];
  const tone = TWIN_TONE[picture.material];
  const pace = twinPace(run, steps, stage.pace);
  const stride = stage.stride * Math.max(1, Math.round(pace / stage.pace));
  const growth = twinGrowth(stage.strip, run, steps);
  const begin = (origin: { positions: ArrayLike<number>; velocities: ArrayLike<number> }) =>
    new Continuation({
      masses: result.masses,
      dt: stage.dt,
      origin: { taken: steps, ...origin },
      end: run.until,
      stride,
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
  /** The work in its own hues, drained of colour; the twin in its red. */
  const workTrail: Continued = { place: (index, body) => place(work, index, body) };
  const twinTrail: Continued = { place: (index, body) => place(twin, index, body), tone };
  /** The trails are remembered for this many samples of either path. */
  const memory = Math.max(4, Math.round((MEMORY_SECONDS * pace) / stride));
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
  // Shown whole (at first, on a resize or a return, or drawn at once): the paths so far.
  const show = () => {
    painter.retraced(memory, [workTrail, work.samples - 1], [twinTrail, twin.samples - 1]);
    bodies();
    growth(work.taken);
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
    if (fading) painter.fade(MEMORY_SECONDS);
    painter.continued(workTrail, workBefore, work.samples - 1);
    painter.continued(twinTrail, twinBefore, twin.samples - 1);
    bodies();
    growth(work.taken);
    if (now - spoken > SAID_EVERY_MS || work.resting) {
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

/**
 * The twin's line: that it is being followed, how far apart the two stand, or where they
 * parted and how fast the gap had grown.
 */
export function twinLine(
  twin: Twin,
  said: { taken: number; rested: boolean },
  film: { steps: number; pace: number },
  words: { t: Messages; number: Intl.NumberFormat; locale: string },
): ReactNode {
  const { t, number, locale } = words;
  if (twin.phase === 'following') return fill(t.twinWorking, { body: 1 });
  if (twin.phase === 'failed') return t.twinUnavailable;
  const { run } = twin;
  const { taken } = said;
  const parts = (template: string, values: Record<string, ReactNode | string | number>) =>
    fillParts<ReactNode>(template, values).map((part, i) => <Fragment key={i}>{part}</Fragment>);
  if (run.parted !== null && taken >= run.parted)
    return fill(t.twinParted, {
      step: number.format(run.parted),
      doubling: run.doubling ? number.format(Math.round(run.doubling / 100) * 100) : '—',
    });
  const gap = <Scientific value={gapAt(run, taken)} locale={locale} />;
  if (said.rested) return parts(t.twinOneLine, { step: number.format(taken), gap });
  const times = Math.round(twinPace(run, film.steps, film.pace) / film.pace);
  return parts(t.twinApart, {
    gap,
    step: number.format(taken),
    pace: times <= 1 ? t.twinAtFilmPace : fill(t.twinFaster, { times }),
  });
}

/** The superscript digits of an exponent, with a true minus sign. */
function exponentText(exponent: number): string {
  return `${exponent < 0 ? '−' : ''}${Math.abs(exponent)}`;
}

/**
 * A length in the orbit's units as a mantissa times a power of ten: the mantissa to two figures
 * in the reader's own digits, and the power raised, but never below the 12 px floor.
 */
function Scientific({ value, locale }: { value: number; locale: string }) {
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
