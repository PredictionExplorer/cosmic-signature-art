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
   * the Ink edition gave it, with its centre marked. `strength` draws a body fainter (0 to 1),
   * or not at all at 0: copies of one body that stand on one another are drawn once.
   */
  lights(at: (body: number) => [number, number], strength?: (body: number) => number): void;
  /**
   * Each body's number beside it, on `names` (a canvas of the same size, laid over the marks
   * and not blended with the still, so a number reads on any ground): 1, 2 and 3, as the record
   * numbers them. Three numbers for three bodies, whatever the symmetry: where the picture
   * draws a body more than once, its number stands by the first copy, the orbit the generator
   * computed and the one the Ink edition draws. A number is set off from its body away from
   * the middle of the three, and turned about the body until it stands whole on the picture
   * and clear of every body drawn and every other number. The bodies `hinted` are ringed, in
   * every copy. Returns what a pointer may press: every copy of each body, as far as it is
   * drawn or a finger needs, and each number, which answers for its body.
   */
  numbers(
    names: CanvasRenderingContext2D,
    at: (body: number) => [number, number],
    look: { font: string; ground: string; hinted: readonly number[] },
  ): Target[];
  /** The closest approach, ringed where it happened in each copy drawn, and the bodies. */
  bodies(sample: number, shown: boolean): void;
}

/** A body's number beside it while a visitor chooses among the three, in CSS pixels. */
const NUMBER_SIZE = 13;

/** Something a pointer may press for a body, in CSS pixels of the stage: its place and its reach. */
export interface Target {
  x: number;
  y: number;
  body: number;
  reach: number;
}
/** A pointer presses a body within half a 44 px target of its centre, or as far as it is drawn. */
const PRESS_REACH = 22;
/**
 * A finger is taken at its word where the body it is nearest is nearer by this much than any
 * other under it, in CSS pixels: about twice as far as a careful tap lands from its aim.
 */
const FINGER_MARGIN = 12;

/**
 * What a press on the picture finds among `targets`, at (x, y) in CSS pixels of the stage: the
 * body whose light or number it is nearest, within that target's own reach.
 *
 * A finger covers more than it points at. Where another body stands under it too (within a
 * finger's reach of the press) and is not clearly the farther of the two, the press is not
 * taken: the bodies it cannot tell apart are returned instead, to be shown as such, and the
 * words answer. (№ 025's bodies 1 and 3 end the film 8 px apart on a phone.) A mouse and a pen
 * point finely, and are taken at their word.
 */
export function pressedBody(
  targets: readonly Target[],
  x: number,
  y: number,
  finger: boolean,
): { body: number } | { unsure: number[] } | null {
  const far = (target: Target) => Math.hypot(x - target.x, y - target.y);
  let nearest: Target | null = null;
  for (const target of targets)
    if (far(target) <= target.reach && (!nearest || far(target) < far(nearest))) nearest = target;
  if (!nearest) return null;
  const { body } = nearest;
  if (!finger) return { body };
  const near = far(nearest);
  const doubted = targets
    .filter(
      (other) =>
        other.body !== body && far(other) <= PRESS_REACH && far(other) - near < FINGER_MARGIN,
    )
    .map((other) => other.body);
  return doubted.length ? { unsure: [...new Set([body, ...doubted])].sort() } : { body };
}
/** The turns tried for a number about its body, nearest its first place first, in degrees. */
const TURNS = [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180];

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

  const numbers: Painter['numbers'] = (names, at, { font, ground, hinted }) => {
    const ink = picture.material === 'ink';
    const tone = ink ? MATERIALS.ink.mark : MATERIALS.light.mark;
    const size = NUMBER_SIZE * ratio;
    names.clearRect(0, 0, width, height);
    names.font = `${size}px ${font}`;
    names.textAlign = 'center';
    names.textBaseline = 'middle';
    names.lineJoin = 'round';
    names.lineWidth = ratio;
    const centres = Array.from({ length: picture.drawn }, (_, drawn) => at(drawn));
    /** How far a body is drawn from its centre: its outline on paper, the heart of its light. */
    const drawnTo = (drawn: number) => {
      const reach = picture.reach(masses[picture.body(drawn)]);
      return ink ? reach : reach * 0.6;
    };
    const targets: Target[] = [];
    // Every copy of a body answers a press for it, and is ringed when the body is pointed at.
    centres.forEach(([cx, cy], drawn) => {
      const body = picture.body(drawn);
      if (hinted.includes(body)) {
        const reach = picture.reach(masses[body]);
        names.strokeStyle = tone;
        names.beginPath();
        names.arc(cx, cy, ink ? reach + 4 * ratio : reach * 0.9, 0, Math.PI * 2);
        names.stroke();
      }
      targets.push({
        x: cx / ratio,
        y: cy / ratio,
        body,
        reach: Math.max(PRESS_REACH, drawnTo(drawn) / ratio),
      });
    });
    // The numbers: beside the first copy of each body, away from the middle of those three.
    const mx = (centres[0][0] + centres[1][0] + centres[2][0]) / 3;
    const my = (centres[0][1] + centres[1][1] + centres[2][1]) / 3;
    const whole = (nx: number, ny: number) =>
      nx >= size * 0.6 && nx <= width - size * 0.6 && ny >= size * 0.6 && ny <= height - size * 0.6;
    const set: [number, number][] = [];
    for (let body = 0; body < 3; body++) {
      const [cx, cy] = centres[body];
      // Straight up where a body stands on the middle of the three.
      const away =
        Math.hypot(cx - mx, cy - my) > 1e-6 ? Math.atan2(cy - my, cx - mx) : -Math.PI / 2;
      const off = drawnTo(body) + size * 0.75;
      // Clear of every other light and number, and no nearer any other body than its own: on
      // a phone a number is the only key between a light and the word that answers for it.
      const clear = (nx: number, ny: number) =>
        centres.every(
          ([ox, oy], other) =>
            other === body ||
            Math.hypot(nx - ox, ny - oy) >= Math.max(off, drawnTo(other) + size * 0.5),
        ) && set.every(([sx, sy]) => Math.hypot(nx - sx, ny - sy) >= size);
      let place: [number, number] | null = null;
      for (const turn of TURNS) {
        const angle = away + (turn * Math.PI) / 180;
        const nx = cx + Math.cos(angle) * off;
        const ny = cy + Math.sin(angle) * off;
        if (whole(nx, ny) && clear(nx, ny)) {
          place = [nx, ny];
          break;
        }
      }
      // No turn is whole and clear (a crowd of copies): the first place, kept on the picture.
      place ??= [
        Math.min(width - size * 0.6, Math.max(size * 0.6, cx + Math.cos(away) * off)),
        Math.min(height - size * 0.6, Math.max(size * 0.6, cy + Math.sin(away) * off)),
      ];
      set.push(place);
      const text = String(body + 1);
      // The figure outlined in the ground's own tone, with a soft edge, so that it reads on
      // whatever the still shows there (a bright weave as well as bare night); then the figure.
      names.shadowColor = ground;
      names.shadowBlur = 4 * ratio;
      names.strokeStyle = ground;
      names.lineWidth = 3 * ratio;
      names.strokeText(text, place[0], place[1]);
      names.shadowBlur = 0;
      names.shadowColor = 'transparent';
      names.fillStyle = tone;
      names.fillText(text, place[0], place[1]);
      targets.push({ x: place[0] / ratio, y: place[1] / ratio, body, reach: NUMBER_SIZE });
    }
    return targets;
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

  return { strokes, lights, numbers, bodies };
}
