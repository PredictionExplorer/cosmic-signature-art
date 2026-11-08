import { lensFor, type Rect, type Size } from '@/lib/first-light/camera';
import { sculptureRadius, type PlateSpace } from '@/lib/first-light/samples';
import type { SamplesReply, SamplesRequest } from '@/lib/first-light/samples.worker';
import { momentAt, slowedAround, type Choreography, type Moment } from '@/lib/first-light/timeline';
import { lightFilmDuration, stepsDrawnAt } from '@/lib/physics/light-film';
import type { PlateFrame, WindowStart } from '@/lib/physics/framing';
import { rungFor, type StillRung } from '@/lib/art/types';
import { MOTION_KEY } from '@/lib/storage-keys';
import type { Engine } from './first-light-engine';
import { Pace } from '@/lib/first-light/quality';

/*
  First Light's show, wherever it is staged (docs/first-light.md §4): on its own page, over a
  stage of its own, or on the home, over the home's own plate. The pieces are the same: the
  window sampled off the main thread, the still's colours, the engine, and a clock that runs the
  timeline's beats until the light has given the still back.
*/

/** What a show needs of a work: its window, its frame, its closest approach and its still. */
export interface ShowWork {
  start: WindowStart;
  frame: PlateFrame;
  /** The step of the window's closest approach, where the bodies flare. */
  closestStep: number;
  /** The Light still's ladder, ascending by width. */
  rungs: readonly StillRung[];
}

/** Every hundredth step: as the orbit section and the Overture draw a window. */
export const STRIDE = 100;

/**
 * Whether motion is welcome, read as the motion provider reads it: the session's own choice,
 * else the system's preference. The provider's hook renders the server's quiet values until it
 * hydrates, so the first effect reads the visitor's directly.
 */
export function motionWelcome(): boolean {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let saved: string | null = null;
  try {
    saved = sessionStorage.getItem(MOTION_KEY);
  } catch {
    /* Storage is optional. */
  }
  const paused = saved === 'paused' ? true : saved === 'playing' ? false : reduced;
  // A visitor saving data is not sent a performance unasked.
  const saving = (navigator as { connection?: { saveData?: boolean } }).connection?.saveData;
  return !paused && !saving;
}

function decoded(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = 'async';
  image.src = src;
  return image.decode().then(() => image);
}

function sampled(start: WindowStart, frame: PlateFrame): Promise<PlateSpace> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../lib/first-light/samples.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = ({ data }: MessageEvent<SamplesReply>) => {
      worker.terminate();
      if (data.type === 'done') resolve(data.space);
      else reject(new Error(data.message));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'The orbit could not be sampled'));
    };
    const request: SamplesRequest = { start, frame, stride: STRIDE };
    worker.postMessage(request);
  });
}

/** The window, sampled, and the still's colours, set before the engine: the show is ready. */
export async function setTheStage(engine: Engine, work: ShowWork): Promise<PlateSpace> {
  const colours = rungFor([...work.rungs], 640);
  if (!colours) throw new Error('A still is needed for its colours');
  const [space, still] = await Promise.all([sampled(work.start, work.frame), decoded(colours.src)]);
  engine.setScene(space, still);
  return space;
}

/**
 * The camera's moves for this stage. A phone's portrait stage brings the event nearer, so that
 * it fills the screen the plate only crosses.
 */
export function choreography(work: ShowWork, stage: Size, still: Rect): Choreography {
  const fill = Math.min(1.6, Math.max(1, (0.92 * stage.height) / still.height));
  const steps = work.start.steps;
  const duration = lightFilmDuration(steps);
  const peak = work.closestStep / (steps - 1);
  // Time slows as the bodies pass their closest approach; the film's own clock does the rest.
  const slowed = slowedAround(peak);
  return {
    open: { yaw: 0.62, pitch: -0.26, lens: 0.42, zoom: fill, drift: 0, focus: 1 },
    travel: 0.95,
    clock: (share) => stepsDrawnAt(slowed(share) * duration, steps) / (steps - 1),
    peak,
  };
}

export interface Performance {
  canvas: HTMLCanvasElement;
  /** The stage's size in CSS pixels: the canvas's. */
  stage: () => Size;
  /** Where the still lies on the stage; contained and centred when the page does not say. */
  still?: (stage: Size) => Rect;
  /** Each moment, as it is drawn. */
  onMoment?: (moment: Moment) => void;
  /** The light has given the still back, or can no longer draw: the show is over. */
  onDone: () => void;
}

/** Performs a ready show; the function it returns stops it where it stands. */
export function perform(
  engine: Engine,
  space: PlateSpace,
  work: ShowWork,
  options: Performance,
): () => void {
  const plate = { width: space.width, height: space.height };
  const radius = sculptureRadius(space);
  const contained = (stage: Size): Rect => {
    const scale = Math.min(stage.width / plate.width, stage.height / plate.height);
    const width = plate.width * scale;
    const height = plate.height * scale;
    return { x: (stage.width - width) / 2, y: (stage.height - height) / 2, width, height };
  };
  const stillOn = options.still ?? contained;
  let stage = options.stage();
  let moves = choreography(work, stage, stillOn(stage));
  // The drawing buffer's density: the screen's own, at most twice the CSS pixels, lowered once or
  // twice on a device that cannot keep the pace (quality.ts).
  let ratio = Math.min(2, window.devicePixelRatio || 1);
  const pace = new Pace();
  engine.resize(stage.width, stage.height, ratio);
  let frame = 0;
  let stopped = false;
  let previous = 0;
  const begun = performance.now();
  const step = (now: number) => {
    if (stopped) return;
    if (engine.lost) {
      stopped = true;
      options.onDone();
      return;
    }
    if (previous) {
      const lowered = pace.next(now - previous, ratio);
      if (lowered !== ratio) {
        ratio = lowered;
        engine.resize(stage.width, stage.height, ratio);
      }
    }
    previous = now;
    const latest = options.stage();
    if (latest.width !== stage.width || latest.height !== stage.height) {
      stage = latest;
      moves = choreography(work, stage, stillOn(stage));
      engine.resize(stage.width, stage.height, ratio);
    }
    const moment = momentAt(now - begun, moves);
    engine.draw({
      lens: lensFor(moment.shot, stage, plate, radius, 0.35, space.centre, stillOn(stage)),
      drift: moment.shot.drift,
      drawn: moment.drawn,
      heads: moment.heads,
      flare: moment.flare,
    });
    options.canvas.style.opacity = String(1 - moment.still);
    options.onMoment?.(moment);
    if (moment.beat === 'done') {
      stopped = true;
      options.onDone();
      return;
    }
    frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
  };
}
