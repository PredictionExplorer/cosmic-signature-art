/**
 * The Light film's clock (CS-Image-Generation render/mod.rs): the film aims at 1,800 frames at
 * 60 fps, so each frame adds ⌊steps / 1800⌋ steps of the recorded window to the exposure, and a
 * last frame closes on the final step. For a million steps that is 1,802 frames, 30.03 s, and
 * frame k shows every step through 555 × (k + 1). The Ink films keep their own timing.
 */
export const LIGHT_FILM = { targetFrames: 1800, fps: 60 } as const;

function frames(steps: number) {
  const interval = Math.max(1, Math.floor(steps / LIGHT_FILM.targetFrames));
  const multiples = Math.floor((steps - 1) / interval);
  const count = multiples * interval === steps - 1 ? multiples : multiples + 1;
  return { interval, count };
}

/** Frames in the Light film of a recorded window of `steps`. */
export function lightFilmFrames(steps: number): number {
  return frames(steps).count;
}

/** The Light film's length in seconds. */
export function lightFilmDuration(steps: number): number {
  return lightFilmFrames(steps) / LIGHT_FILM.fps;
}

/** The frame of the Light film that first draws `step` of the recorded window. */
export function lightFilmFrame(step: number, steps: number): number {
  const { interval, count } = frames(steps);
  return step <= interval ? 0 : Math.min(Math.ceil(step / interval) - 1, count - 1);
}

/** Seconds into the Light film at which `step` of the recorded window is first drawn. */
export function lightFilmSeconds(step: number, steps: number): number {
  return lightFilmFrame(step, steps) / LIGHT_FILM.fps;
}

/** The last step the Light film has drawn `seconds` in. */
export function stepsDrawnAt(seconds: number, steps: number): number {
  const { interval, count } = frames(steps);
  // A frame's own start time (k / 60) multiplied back can land a hair under k.
  const frame = Math.min(count - 1, Math.max(0, Math.floor(seconds * LIGHT_FILM.fps + 1e-9)));
  return frame === count - 1 ? steps - 1 : Math.min(steps - 1, interval * (frame + 1));
}
