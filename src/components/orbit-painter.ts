import { bodyGlow } from '@/lib/physics/body-light';
import { lightFilmFrame } from '@/lib/physics/light-film';
import { MATERIALS, type Picture } from './orbit-picture';

/**
 * The orbit section's drawing in two dimensions (orbit-score.tsx): trails that accumulate on one
 * canvas, and the bodies with the closest approach's ring on a canvas above. Light adds and ink
 * darkens alike, so the trails may be stroked body by body, in any order.
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
   * the Ink edition gave it, with its centre marked.
   */
  lights(at: (body: number) => [number, number]): void;
  /** The closest approach, ringed where it happened in each copy drawn, and the bodies. */
  bodies(sample: number, shown: boolean): void;
}

export interface PainterOptions {
  trail: CanvasRenderingContext2D;
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
    trail.lineWidth = picture.material === 'ink' ? 0.75 * ratio : ratio;
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

  const lights = (at: (body: number) => [number, number]) => {
    for (let body = 0; body < picture.drawn; body++) {
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

  return { strokes, lights, bodies };
}
