import type { Painter } from './orbit-painter';
import { MATERIALS, type Picture } from './orbit-picture';

/*
  The picture a visitor chooses in (docs/after-the-frame.md §8.4): the recorded window drawn
  whole over its still, the three bodies where the film left them, and beside each its number:
  1, 2 and 3, as the record numbers them.

  Three numbers for three bodies, whatever the symmetry. Where the picture draws a body more
  than once, its number stands by the first copy: the orbit the generator computed, and the one
  the Ink edition draws. Every copy answers a press for its body, and is ringed when the body is
  pointed at.

  The numbers lie on a canvas of their own, over the bodies and not blended with the still, so
  that a number reads on any ground. Where they stand and what a pointer may press are worked
  out once, without a canvas (`numberPlaces`, `pressTargets`); the numbers' layer alone is drawn
  again as the visitor points (orbit-choosing.ts).
*/

/** A body's number beside it, in CSS pixels. */
const NUMBER_SIZE = 13;
/** A pointer presses a body within half a 44 px target of its centre, or as far as it is drawn. */
const PRESS_REACH = 22;
/**
 * A finger is taken at its word where the body it is nearest is nearer by this much than any
 * other under it, in CSS pixels: about twice as far as a careful tap lands from its aim.
 */
const FINGER_MARGIN = 12;
/** The turns tried for a number about its body, nearest its first place first, in degrees. */
const TURNS = [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180];

type Point = readonly [number, number];

/** Something a pointer may press for a body, in CSS pixels of the stage: its place and its reach. */
export interface Target {
  x: number;
  y: number;
  body: number;
  reach: number;
}

/**
 * Where the three numbers stand, in the canvas's pixels. Each is set off from the first copy of
 * its body, away from the middle of the three, and turned about the body until it stands whole
 * on the picture, clear of every body drawn and of the numbers already set, and no nearer any
 * other body than its own: on a phone a number is the only key between a light and the word
 * that answers for it. Where no turn will do (a crowd of copies), the first place, kept on the
 * picture.
 *
 * `centres` are the drawn bodies, the first copy's three first; `reaches`, how far each is
 * drawn from its centre; `size`, the numeral's, in the canvas's pixels.
 */
export function numberPlaces(
  centres: readonly Point[],
  reaches: readonly number[],
  size: number,
  width: number,
  height: number,
): [number, number][] {
  const mx = (centres[0][0] + centres[1][0] + centres[2][0]) / 3;
  const my = (centres[0][1] + centres[1][1] + centres[2][1]) / 3;
  const edge = size * 0.6;
  const whole = (nx: number, ny: number) =>
    nx >= edge && nx <= width - edge && ny >= edge && ny <= height - edge;
  const set: [number, number][] = [];
  for (let body = 0; body < 3; body++) {
    const [cx, cy] = centres[body];
    // Straight up where a body stands on the middle of the three.
    const away = Math.hypot(cx - mx, cy - my) > 1e-6 ? Math.atan2(cy - my, cx - mx) : -Math.PI / 2;
    const off = reaches[body] + size * 0.75;
    const clear = (nx: number, ny: number) =>
      centres.every(
        ([ox, oy], other) =>
          other === body ||
          Math.hypot(nx - ox, ny - oy) >= Math.max(off, reaches[other] + size * 0.5),
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
    place ??= [
      Math.min(width - edge, Math.max(edge, cx + Math.cos(away) * off)),
      Math.min(height - edge, Math.max(edge, cy + Math.sin(away) * off)),
    ];
    set.push(place);
  }
  return set;
}

/**
 * What a pointer may press: every copy of each body, as far as it is drawn or a finger needs,
 * and then each number, which answers for its body. From the canvas's pixels to CSS pixels of
 * the stage, `ratio` to one.
 */
export function pressTargets(
  centres: readonly Point[],
  reaches: readonly number[],
  places: readonly Point[],
  body: (drawn: number) => number,
  ratio: number,
): Target[] {
  return [
    ...centres.map(([x, y], drawn) => ({
      x: x / ratio,
      y: y / ratio,
      body: body(drawn),
      reach: Math.max(PRESS_REACH, reaches[drawn] / ratio),
    })),
    ...places.map(([x, y], number) => ({
      x: x / ratio,
      y: y / ratio,
      body: number,
      reach: NUMBER_SIZE,
    })),
  ];
}

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

/** The choosing, as the section has set it out. */
export interface ChoiceStage {
  picture: Picture;
  painter: Pick<Painter, 'strokes' | 'lights'>;
  /** The bodies' canvas, and the one their numbers are drawn on. */
  mark: CanvasRenderingContext2D;
  names: CanvasRenderingContext2D;
  /** The canvases' size in device pixels, and device pixels to a CSS pixel. */
  width: number;
  height: number;
  ratio: number;
  masses: readonly number[];
  /** The face the numbers are set in, and the ground they must read on. */
  font: string;
  ground: string;
}

/** The picture a visitor chooses in, once drawn. */
export interface Choice {
  /** The numbers' layer drawn again, alone, with these bodies ringed in every copy. */
  ring(bodies: readonly number[]): void;
  /** What a press at (x, y) finds, in CSS pixels of the stage (`pressedBody`). */
  pressed(x: number, y: number, finger: boolean): ReturnType<typeof pressedBody>;
}

/**
 * Draws the picture a visitor chooses in: the recorded window whole over its still, and the
 * three bodies where the film left them. The numbers are drawn when it is first told whom to
 * ring (`ring`), and again, alone, whenever that changes.
 */
export function drawChoice(stage: ChoiceStage): Choice {
  const { picture, painter, mark, names, width, height, ratio, masses, font, ground } = stage;
  const ink = picture.material === 'ink';
  const tone = ink ? MATERIALS.ink.mark : MATERIALS.light.mark;
  const size = NUMBER_SIZE * ratio;
  const at = (drawn: number): [number, number] => [
    picture.x(picture.last, drawn),
    picture.y(picture.last, drawn),
  ];
  if (picture.last > 0) painter.strokes(0, picture.last);
  mark.clearRect(0, 0, width, height);
  painter.lights(at);

  const centres = Array.from({ length: picture.drawn }, (_, drawn) => at(drawn));
  /** How far a body's light reaches, or the radius of its outline on paper… */
  const reach = (drawn: number) => picture.reach(masses[picture.body(drawn)]);
  /** …and how far it is drawn from its centre: its outline, or the heart of its light. */
  const reaches = centres.map((_, drawn) => (ink ? reach(drawn) : reach(drawn) * 0.6));
  const places = numberPlaces(centres, reaches, size, width, height);
  const targets = pressTargets(centres, reaches, places, picture.body, ratio);

  const ring = (bodies: readonly number[]) => {
    names.clearRect(0, 0, width, height);
    names.font = `${size}px ${font}`;
    names.textAlign = 'center';
    names.textBaseline = 'middle';
    names.lineJoin = 'round';
    names.lineWidth = ratio;
    centres.forEach(([cx, cy], drawn) => {
      if (!bodies.includes(picture.body(drawn))) return;
      names.strokeStyle = tone;
      names.beginPath();
      names.arc(cx, cy, ink ? reach(drawn) + 4 * ratio : reach(drawn) * 0.9, 0, Math.PI * 2);
      names.stroke();
    });
    places.forEach(([nx, ny], body) => {
      const text = String(body + 1);
      // The figure outlined in the ground's own tone, with a soft edge, so that it reads on
      // whatever the still shows there (a bright weave as well as bare night); then the figure.
      names.shadowColor = ground;
      names.shadowBlur = 4 * ratio;
      names.strokeStyle = ground;
      names.lineWidth = 3 * ratio;
      names.strokeText(text, nx, ny);
      names.shadowBlur = 0;
      names.shadowColor = 'transparent';
      names.fillStyle = tone;
      names.fillText(text, nx, ny);
    });
  };
  return { ring, pressed: (x, y, finger) => pressedBody(targets, x, y, finger) };
}
