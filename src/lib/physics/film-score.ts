import type { ClosestApproach, OrbitWindow } from './orbit';
import {
  lightFilmDuration,
  lightFilmFrame,
  lightFilmFrames,
  lightFilmSeconds,
  stepsDrawnAt,
} from './light-film';
import { inkShownAt } from './ink-film';

/*
  The score (third-physics.md §5.5): a film's transport made of its own orbit. The recorded
  window is measured again from its verified first state (src/lib/art/orbit-windows.ts), and the
  film's clock (light-film.ts) says which step each moment of the film shows, so the line under
  the film can carry the bodies' separations and their events, and the strip can read the
  physics of the moment on screen.

  The complete Ink film keeps the same clock, frame for frame, but opens on bare paper: its
  bodies lay no ink before the pre-roll ends (ink-film.ts). Its score is lit from its first ink,
  and only on a film the venue checked against that clock (src/lib/art/ink-clocks.ts).

  This module is what the page reads a score with, and stays light: the measuring itself, which
  needs the generator's port (orbit.ts), is score-window.ts, and runs in the score's worker.
*/

/**
 * Where a work's Ink film keeps the score's clock, as scripts/build-ink-clocks.mjs checked it
 * against the published film and everything the venue plays in its place.
 */
export interface InkClock {
  /** The Ink film's first frame with ink; before it the film is bare paper. */
  firstInked: number;
  /** The hash of every film checked to keep the clock: the published film and its derivatives. */
  films: readonly string[];
}

/**
 * What a page hands a work's viewer for its films' score: the verified window to measure, the
 * bodies' hues to draw it in (degrees of OKLCH hue), the record's closest approach, so the film
 * can be opened there before the score is measured, and the Ink film's clock where it holds.
 */
export interface FilmOrbit {
  id: number;
  window: OrbitWindow;
  bodyHues: readonly [number, number, number];
  closestApproach: { distance: number; pair: readonly [number, number]; step: number };
  ink?: InkClock;
}

/**
 * How a film carries its work's score: drawn in its expression's material, and lit from the
 * first frame that shows the orbit's mark, which is the Light film's first and the Ink film's
 * first ink.
 */
export interface ScoreClock {
  material: 'light' | 'ink';
  /** The film's first frame with the orbit's mark on it. */
  from: number;
}

const LIGHT_CLOCK: ScoreClock = { material: 'light', from: 0 };

/**
 * The clock a film of an expression keeps, or none. Every Light film is on the Light film's
 * clock; an Ink film is on it only when it is one the venue checked (ink-clocks.json).
 */
export function scoreClock(
  orbit: Pick<FilmOrbit, 'ink'> | undefined,
  expression: string,
  film: { sha256?: string } | undefined,
): ScoreClock | null {
  if (!orbit || !film) return null;
  if (expression === 'light') return LIGHT_CLOCK;
  if (expression !== 'ink' || !orbit.ink || !film.sha256) return null;
  return orbit.ink.films.includes(film.sha256)
    ? { material: 'ink', from: orbit.ink.firstInked }
    : null;
}

/** Whether a film on `clock` shows the orbit's mark `seconds` in. */
export function markedAt(clock: ScoreClock, seconds: number): boolean {
  return inkShownAt(seconds, clock.from);
}

/** Where a film on `clock` first shows the orbit's mark, from 0 at its first frame to 1 at its end. */
export function markedFrom(clock: ScoreClock, score: Pick<FilmScore, 'steps'>): number {
  return clock.from / lightFilmFrames(score.steps);
}

/**
 * Whether a film on `clock` shows the closest approach: the Ink film reaches some before its
 * first ink, on bare paper.
 */
export function showsClosestApproach(
  clock: ScoreClock,
  score: { steps: number; closestApproach: { step: number } },
): boolean {
  return lightFilmFrame(score.closestApproach.step, score.steps) >= clock.from;
}

/** A window's score: its separations sampled across the window, and the steps of its events. */
export interface FilmScore {
  steps: number;
  stride: number;
  count: number;
  /** The three separations at each sample, in SCORE_PAIRS order. */
  separations: Float32Array;
  closestApproach: ClosestApproach;
  syzygies: number[];
  /** The step of each braid crossing. */
  crossings: number[];
}

/** About two thousand samples: more than a screen's width of the window, a few kilobytes. */
export const SCORE_SAMPLES = 2_000;

/**
 * The three pairs in the order a score samples them: orbit.ts's PAIRS, which its tests hold
 * this to. It is spelled out here so a page reading a score never loads the generator's port.
 */
export const SCORE_PAIRS = [
  [0, 1],
  [0, 2],
  [1, 2],
] as const;

/** A pair as the strip and the record name it, counting the bodies from one: 1–3. */
export function pairName(pair: readonly number[]): string {
  return pair.map((body) => body + 1).join('–');
}

/** Where a step falls along the film, from 0 at its first frame to 1 at its end. */
export function filmShare(score: Pick<FilmScore, 'steps'>, step: number): number {
  return lightFilmSeconds(step, score.steps) / lightFilmDuration(score.steps);
}

/** The moment of the film at which the closest approach is shown, in seconds. */
export function closestApproachSeconds(score: {
  steps: number;
  closestApproach: { step: number };
}) {
  return lightFilmSeconds(score.closestApproach.step, score.steps);
}

/** The two bodies nearest each other at `seconds` into the film, and how far apart. */
export function physicsAt(
  score: FilmScore,
  seconds: number,
): { pair: readonly [number, number]; distance: number } {
  const step = stepsDrawnAt(seconds, score.steps);
  const sample = Math.min(score.count - 1, Math.max(0, Math.floor(step / score.stride)));
  let nearest = 0;
  for (let k = 1; k < 3; k++)
    if (score.separations[sample * 3 + k] < score.separations[sample * 3 + nearest]) nearest = k;
  return { pair: SCORE_PAIRS[nearest], distance: score.separations[sample * 3 + nearest] };
}
