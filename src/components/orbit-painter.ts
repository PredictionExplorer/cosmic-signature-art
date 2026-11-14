import { bodyGlow } from '@/lib/physics/body-light';
import { lightFilmFrame } from '@/lib/physics/light-film';
import { MATERIALS, type Picture } from './orbit-picture';

/**
 * A path past the recorded window, as the painter traces it: the work's own, carried on (After
 * the frame), or its twin's beside it (one part in a trillion).
 */
export interface Continued {
  /** Where sample `index` of the path puts a drawn body, in the canvas's pixels. */
  place(index: number, drawn: number): [number, number];
  /** Its colour at an opacity: each body's hue drained of colour, unless given (the twin's red). */
  tone?: (alpha: number) => string;
  /** A drawn body that leaves no trail: the one a picture stays with does not move in it. */
  still?: (drawn: number) => boolean;
}

/** A trail past the window: the bodies' hues drained of colour, at this opacity when new. */
const CONTINUED_ALPHA = 0.3;
/**
 * A trail past the window fades to a twentieth over as long as it is remembered, a step every
 * half second performed: a slower fade is lost to an 8-bit canvas.
 */
export const FADE_EVERY_SECONDS = 0.5;
const FADED = 0.05;

/**
 * The orbit section's drawing in two dimensions (orbit-score.tsx): trails that accumulate on one
 * canvas, the trails past the window on a second, and the bodies with the closest approach's
 * ring on a canvas above. Light adds and ink darkens alike, so the trails may be stroked body by
 * body, in any order.
 */
export interface Painter {
  /**
   * The trails from sample `from` to sample `to`: one path a body for each frame of the Light
   * film, as the film adds each frame's marks. The orbit drawn whole and the orbit performed
   * therefore end on the same picture, at any display's pace.
   */
  strokes(from: number, to: number, alpha?: number): void;
  /**
   * The bodies wherever `at` places them: lights on night; on paper, each outlined at the size
   * the Ink edition gave it, with its centre marked. `strength` draws a body fainter (0 to 1),
   * or not at all at 0: copies of one body that stand on one another are drawn once.
   */
  lights(at: (body: number) => [number, number], strength?: (body: number) => number): void;
  /** The closest approach, ringed where it happened in each copy drawn, and the bodies. */
  bodies(sample: number, shown: boolean): void;
  /** A path past the window from its sample `first` to `last`, added to the trails past it. */
  continued(path: Continued, first: number, last: number): void;
  /**
   * The trails past the window wiped and drawn whole (a resize, a return, a step): of each path,
   * the last `memory` samples up to its own last, in quarters, each as faded as a performance
   * would have left it.
   */
  retraced(memory: number, ...paths: readonly (readonly [Continued, number])[]): void;
  /** One step of the fade that takes a trail to a twentieth over `seconds` performed. */
  fade(seconds: number): void;
}

export interface PainterOptions {
  /** The window's trails, the trails past it, and the bodies: a canvas each. */
  trail: CanvasRenderingContext2D;
  continued: CanvasRenderingContext2D;
  mark: CanvasRenderingContext2D;
  picture: Picture;
  /** The canvases' size in device pixels, and device pixels to a CSS pixel. */
  width: number;
  height: number;
  ratio: number;
  hues: readonly number[];
  masses: readonly number[];
  closestApproach: { step: number; pair: readonly number[] };
  /** The window's steps, and the steps between samples. */
  steps: number;
  stride: number;
}

export function orbitPainter({
  trail,
  continued: past,
  mark,
  picture,
  width,
  height,
  ratio,
  hues,
  masses,
  closestApproach,
  steps,
  stride,
}: PainterOptions): Painter {
  const paint = MATERIALS[picture.material];
  const { x, y } = picture;
  /** On the plate the bodies stand where the work left them once the window is drawn. */
  const rests = picture.kind === 'plate';
  const closestSample = Math.floor(closestApproach.step / stride);
  const copies = picture.drawn / 3;
  /** A trail's width: a hair finer in graphite than in light. */
  const hair = picture.material === 'ink' ? 0.75 * ratio : ratio;

  const strokes = (from: number, to: number, alpha = 0.2) => {
    const spans: [number, number][] = [];
    const filmFrameOf = (sample: number) =>
      lightFilmFrame(Math.min(steps - 1, sample * stride), steps);
    for (let start = from; start < to;) {
      const filmFrame = filmFrameOf(start + 1);
      let end = start + 1;
      while (end < to && filmFrameOf(end + 1) === filmFrame) end += 1;
      spans.push([start, end]);
      start = end;
    }
    trail.globalCompositeOperation = paint.blend;
    trail.lineWidth = hair;
    trail.lineJoin = 'round';
    for (let body = 0; body < picture.drawn; body++) {
      trail.strokeStyle = paint.trail(hues[picture.body(body)], alpha);
      for (const [first, last] of spans) {
        trail.beginPath();
        trail.moveTo(x(first, body), y(first, body));
        for (let sample = first + 1; sample <= last; sample++)
          trail.lineTo(x(sample, body), y(sample, body));
        trail.stroke();
      }
    }
  };

  const lights = (
    at: (body: number) => [number, number],
    strength: (body: number) => number = () => 1,
  ) => {
    for (let body = 0; body < picture.drawn; body++) {
      const alpha = strength(body);
      if (alpha <= 0) continue;
      mark.globalAlpha = alpha;
      const [cx, cy] = at(body);
      const hue = hues[picture.body(body)];
      const reach = picture.reach(masses[picture.body(body)]);
      if (picture.material === 'ink') {
        mark.strokeStyle = MATERIALS.ink.body(hue);
        mark.fillStyle = MATERIALS.ink.body(hue);
        mark.lineWidth = ratio;
        mark.beginPath();
        mark.arc(cx, cy, reach, 0, Math.PI * 2);
        mark.stroke();
        mark.beginPath();
        mark.arc(cx, cy, 1.5 * ratio, 0, Math.PI * 2);
        mark.fill();
        continue;
      }
      const glow = mark.createRadialGradient(cx, cy, 0, cx, cy, reach);
      for (const [offset, colour] of bodyGlow(hue)) glow.addColorStop(offset, colour);
      mark.fillStyle = glow;
      mark.beginPath();
      mark.arc(cx, cy, reach, 0, Math.PI * 2);
      mark.fill();
    }
    mark.globalAlpha = 1;
  };

  const bodies = (sample: number, shown: boolean) => {
    mark.clearRect(0, 0, width, height);
    if (sample >= closestSample) {
      const [a, b] = closestApproach.pair;
      const ring = rests ? Math.min(14 * ratio, 0.04 * height) : 14 * ratio;
      mark.strokeStyle = paint.mark;
      mark.lineWidth = ratio;
      for (let copy = 0; copy < copies; copy++) {
        mark.beginPath();
        mark.arc(
          (x(closestSample, copy * 3 + a) + x(closestSample, copy * 3 + b)) / 2,
          (y(closestSample, copy * 3 + a) + y(closestSample, copy * 3 + b)) / 2,
          ring,
          0,
          Math.PI * 2,
        );
        mark.stroke();
      }
    }
    if (shown) lights((body) => [x(sample, body), y(sample, body)]);
  };

  const continued = (path: Continued, first: number, last: number, alpha = CONTINUED_ALPHA) => {
    if (last <= first) return;
    past.globalCompositeOperation = paint.blend;
    past.lineWidth = hair;
    past.lineJoin = 'round';
    for (let drawn = 0; drawn < picture.drawn; drawn++) {
      if (path.still?.(drawn)) continue;
      past.strokeStyle = path.tone
        ? path.tone(alpha)
        : paint.continued(hues[picture.body(drawn)], alpha);
      past.beginPath();
      past.moveTo(...path.place(first, drawn));
      for (let index = first + 1; index <= last; index++) past.lineTo(...path.place(index, drawn));
      past.stroke();
    }
  };

  const retraced: Painter['retraced'] = (memory, ...paths) => {
    past.clearRect(0, 0, width, height);
    for (const [path, last] of paths)
      for (let quarter = 3; quarter >= 0; quarter--)
        continued(
          path,
          Math.max(0, last - Math.round(((quarter + 1) * memory) / 4)),
          Math.max(0, last - Math.round((quarter * memory) / 4)),
          CONTINUED_ALPHA * FADED ** (quarter / 4),
        );
  };

  const fade = (seconds: number) => {
    past.globalCompositeOperation = 'destination-out';
    past.fillStyle = `rgb(0 0 0 / ${1 - FADED ** (FADE_EVERY_SECONDS / seconds)})`;
    past.fillRect(0, 0, width, height);
  };

  return { strokes, lights, bodies, continued, retraced, fade };
}
