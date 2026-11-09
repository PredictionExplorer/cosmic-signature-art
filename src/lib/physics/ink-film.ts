import { LIGHT_FILM, lightFilmFrames, stepsDrawnAt } from './light-film.ts';

/*
  The Ink film's clock (CS-Image-Generation: app::ember_frame_schedule, docs/ember-design.md §1
  and §8.2). The complete Ink film renders exactly the Light film's checkpoints, one frame each
  at 60 fps, so its frame k shows the bodies at the step through which the Light film's frame k
  has drawn: the map from step to time is the Light film's own (light-film.ts).

  What the Ink film adds is its pre-roll. Its water is stirred from the window's first step, but
  the bodies lay no ink before the fluid time `preRoll` (0.5 in every published certificate), so
  the film opens on bare paper and its first ink comes with the first frame whose step reaches
  that time. Fluid time is the window's own: the duration `T` that makes the bodies' median
  speed one, over which step k of N stands at T·k/(N − 1), the last at T exactly. T depends on
  the orbit and its view, so the pre-roll runs from 41 frames to 416 across the collection.

  Both were read from the generator's code and checked against every published Ink film by
  scripts/build-ink-clocks.mjs, which records each work's first inked frame in ink-clocks.json.
*/

/** The fluid time of `step` of a window of `steps`: (T·k)/(N − 1), and T itself at the end. */
export function inkFluidTime(step: number, steps: number, duration: number): number {
  return step === steps - 1 ? duration : (duration * step) / (steps - 1);
}

/** The step the Ink film's `frame` shows: the step its Light twin's frame has drawn through. */
export function inkFilmStep(frame: number, steps: number): number {
  return stepsDrawnAt(frame / LIGHT_FILM.fps, steps);
}

/** Every step the Ink film shows, frame by frame: the Light film's checkpoints. */
export function inkFilmSchedule(steps: number): number[] {
  return Array.from({ length: lightFilmFrames(steps) }, (_, frame) => inkFilmStep(frame, steps));
}

/**
 * The first frame of the Ink film that carries ink: the first whose step's fluid time reaches
 * the pre-roll (the last frame if none does), as the generator plans it (SlowFilm::plan) and
 * inks it (`t_frame >= t_on` in render_ember).
 */
export function inkFilmFirstInked(steps: number, duration: number, preRoll: number): number {
  const count = lightFilmFrames(steps);
  for (let frame = 0; frame < count; frame++)
    if (inkFluidTime(inkFilmStep(frame, steps), steps, duration) >= preRoll) return frame;
  return count - 1;
}

/** Whether the Ink film shows ink `seconds` in: from its first inked frame on. */
export function inkShownAt(seconds: number, firstInked: number): boolean {
  // A frame's own start time (k / 60) multiplied back can land a hair under k.
  return Math.floor(seconds * LIGHT_FILM.fps + 1e-9) >= firstInked;
}
