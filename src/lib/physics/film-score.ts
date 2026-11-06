import type { ClosestApproach, OrbitWindow } from './orbit';
import { lightFilmDuration, lightFilmSeconds, stepsDrawnAt } from './light-film';

/*
  The score (third-physics.md §5.5): a Light film's transport made of its own orbit. The recorded
  window is measured again from its verified first state (src/lib/art/orbit-windows.ts), and the
  film's clock (light-film.ts) says which step each moment of the film has drawn, so the line
  under the film can carry the bodies' separations and their events, and the strip can read the
  physics of the moment on screen. The Ink films keep their own timing, so they keep their line.

  This module is what the page reads a score with, and stays light: the measuring itself, which
  needs the generator's port (orbit.ts), is score-window.ts, and runs in the score's worker.
*/

/**
 * What a page hands a work's viewer for its Light film's score: the verified window to measure,
 * the bodies' hues to draw it in (degrees of OKLCH hue), and the record's closest approach, so
 * the film can be opened there before the score is measured.
 */
export interface FilmOrbit {
  id: number;
  window: OrbitWindow;
  bodyHues: readonly [number, number, number];
  closestApproach: { distance: number; pair: readonly [number, number]; step: number };
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

/** Where a step falls along the Light film, from 0 at its first frame to 1 at its end. */
export function filmShare(score: Pick<FilmScore, 'steps'>, step: number): number {
  return lightFilmSeconds(step, score.steps) / lightFilmDuration(score.steps);
}

/** The moment of the Light film at which the closest approach is drawn, in seconds. */
export function closestApproachSeconds(score: {
  steps: number;
  closestApproach: { step: number };
}) {
  return lightFilmSeconds(score.closestApproach.step, score.steps);
}

/** The two bodies nearest each other at `seconds` into the Light film, and how far apart. */
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
