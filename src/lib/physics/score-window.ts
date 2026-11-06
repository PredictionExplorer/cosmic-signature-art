import { measureWindow, type OrbitWindow } from './orbit';
import { SCORE_SAMPLES, type FilmScore } from './film-score';

/**
 * A Light film's score measured (film-score.ts): the recorded window run again from its
 * verified first state, as the generator measures it, and sampled about two thousand times for
 * the transport. Run in the score's worker; the page only reads the result.
 */
export function scoreWindow(window: OrbitWindow): FilmScore {
  const stride = Math.max(1, Math.round(window.steps / SCORE_SAMPLES));
  const measured = measureWindow(window.masses, window.dt, window.steps, window, { stride });
  return {
    steps: window.steps,
    stride,
    count: measured.samples.count,
    separations: measured.samples.separations,
    closestApproach: measured.closestApproach,
    syzygies: measured.syzygies,
    crossings: measured.braid.events.map((event) => event.step),
  };
}
