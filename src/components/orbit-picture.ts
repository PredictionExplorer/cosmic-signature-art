import { awayAt, outsideFrame, type Outside } from '@/lib/physics/absences';
import { BODY_REACH_SHARE, bodyReach } from '@/lib/physics/body-light';
import type { FramedSamples } from '@/lib/physics/framing';
import { keptAt, keptPlacement } from '@/lib/physics/kept';
import type { Plane } from '@/lib/physics/plane';

/*
  Where the orbit section draws its three bodies, and in what material (orbit-score.tsx).

  On the plate (third-physics-phase-d.md §7): over the still of the expression on view, where the
  films put the bodies, by the work's frame (framing.ts). Light draws every symmetry copy, since
  its film drew every stroke in each; Ink only the primary copy, the one the Ink edition stirs
  with. Without a frame, Phase A's drawing: the orbit seen square-on to the plane of its greatest
  extent, fitted to the canvas, on night.
*/

/** The plate's material: light added on night, or ink laid on paper. */
export type Material = 'light' | 'ink';

/**
 * The Ink edition's body: an ellipse of the area of a disc whose radius is this share of the
 * sheet's height (scripts/lib/ink-hollows.mjs). A drawn body is outlined at that size, so at the
 * window's end it rings the hollow it left in the ink.
 */
export const INK_BODY_RADIUS = 0.025;
/** Phase A's margin about the plane's drawing, in CSS pixels. */
const PLANE_MARGIN = 24;

/** The bodies' places, sample by sample, in canvas pixels. */
export interface Picture {
  kind: 'plate' | 'plane';
  material: Material;
  /** Bodies drawn at each sample: three for each copy drawn, body by body. */
  drawn: number;
  /** The sample the window is drawn to whole: on the plate, the still's own step. */
  last: number;
  /** The body of the orbit a drawn body is. */
  body(drawn: number): number;
  x(sample: number, drawn: number): number;
  y(sample: number, drawn: number): number;
  /** A drawn body's place at `index` of a continuation's path (`width` numbers a sample). */
  continued(path: Float32Array, width: number, index: number, drawn: number): [number, number];
  /**
   * How far outside the picture a drawn body's centre stands there, in widths of the picture
   * (0 on it): the plate's own frame, whatever size it is drawn at, or the plane's canvas.
   */
  outside(path: Float32Array, width: number, index: number, drawn: number): number;
  /** How far a body's light reaches (Light), or the radius of its outline (Ink). */
  reach(mass: number): number;
  /**
   * Past the window the picture stays with one body (keptPicture, below): which, how far towards
   * the picture's middle it was brought, and where a drawn body stood in the work's own frame as
   * the film ended, which is where it is brought from.
   */
  kept?: {
    body: number;
    towards: number;
    from(path: Float32Array, width: number, drawn: number): [number, number];
    /**
     * How far outside this picture the film itself showed each body stand at most, in widths of
     * the picture: the recorded window read through the picture, as the path past it is. An
     * absence that takes a body no farther is the orbit doing what it had been doing
     * (absences.ts, `seen`). Read once, when first asked for.
     */
    readonly filmed: readonly number[];
  };
}

/** Phase A's drawing: the plane of greatest extent, fitted inside a margin and centred. */
export function planePicture(
  plane: Plane,
  count: number,
  width: number,
  height: number,
  ratio: number,
): Picture {
  const { u, v, bounds } = plane;
  const margin = PLANE_MARGIN * ratio;
  const scale = Math.min(
    (width - 2 * margin) / (bounds.u1 - bounds.u0 || 1),
    (height - 2 * margin) / (bounds.v1 - bounds.v0 || 1),
  );
  const ox = (width - (bounds.u1 - bounds.u0) * scale) / 2 - bounds.u0 * scale;
  const oy = (height - (bounds.v1 - bounds.v0) * scale) / 2 - bounds.v0 * scale;
  return {
    kind: 'plane',
    material: 'light',
    drawn: 3,
    last: count - 1,
    body: (drawn) => drawn,
    x: (sample, body) => ox + u[sample * 3 + body] * scale,
    y: (sample, body) => oy + v[sample * 3 + body] * scale,
    continued: (path, size, index, body) => [
      ox + path[index * size + body * 2] * scale,
      oy + path[index * size + body * 2 + 1] * scale,
    ],
    outside: (path, size, index, body) =>
      outsideFrame(
        ox + path[index * size + body * 2] * scale,
        oy + path[index * size + body * 2 + 1] * scale,
        width,
        height,
      ),
    reach: (mass) => bodyReach(mass) * ratio,
  };
}

/** The plate's drawing: each body where the films put it, the frame's pixels scaled to the canvas. */
export function platePicture(
  framed: FramedSamples,
  frame: { width: number; height: number },
  material: Material,
  width: number,
  height: number,
  ratio: number,
): Picture {
  const sx = width / frame.width;
  const sy = height / frame.height;
  const size = framed.copies * 6;
  const { pixels } = framed;
  return {
    kind: 'plate',
    material,
    drawn: material === 'ink' ? 3 : framed.copies * 3,
    last: framed.count,
    body: (drawn) => drawn % 3,
    x: (sample, drawn) => pixels[sample * size + drawn * 2] * sx,
    y: (sample, drawn) => pixels[sample * size + drawn * 2 + 1] * sy,
    continued: (path, pathSize, index, drawn) => [
      path[index * pathSize + drawn * 2] * sx,
      path[index * pathSize + drawn * 2 + 1] * sy,
    ],
    outside: (path, pathSize, index, drawn) =>
      outsideFrame(
        path[index * pathSize + drawn * 2],
        path[index * pathSize + drawn * 2 + 1],
        frame.width,
        frame.height,
      ),
    reach: (mass) =>
      material === 'ink'
        ? INK_BODY_RADIUS * height
        : Math.min(bodyReach(mass) * ratio, BODY_REACH_SHARE * height),
  };
}

/**
 * The plate's picture past the window, staying with one body (src/lib/physics/kept.ts): the same
 * frame at the same size, moved along with one `body`, which holds still in it. `path` is the orbit
 * past the window as the frame places it; the body is placed from its first sample, where the
 * film ended. `window` is the recorded window as the frame places it, which this picture reads
 * for what the film showed. The window's own strokes keep the work's places (`x` and `y`): they
 * are drawn in this picture only while the bodies are brought to it, and go with the still.
 */
export function keptPicture(
  picture: Picture,
  frame: { width: number; height: number },
  window: Pick<FramedSamples, 'pixels' | 'count' | 'copies'>,
  path: Float32Array,
  body: number,
  width: number,
  height: number,
): Picture {
  const sx = width / frame.width;
  const sy = height / frame.height;
  const copies = picture.drawn / 3;
  const kept = keptPlacement(path, copies, body, frame.width, frame.height);
  const outside = (pixels: ArrayLike<number>, size: number, index: number, drawn: number) => {
    const [x, y] = keptAt(kept, pixels, size, index, drawn);
    return outsideFrame(x, y, frame.width, frame.height);
  };
  let filmed: number[] | null = null;
  /** The window, sample by sample: the farthest each body stood outside this picture. */
  const showedByFilm = () => {
    const during: Outside = (sample, drawn) =>
      outside(window.pixels, window.copies * 6, sample, drawn);
    const farthest = [0, 0, 0];
    for (let sample = 0; sample <= window.count; sample++)
      for (let of = 0; of < 3; of++)
        farthest[of] = Math.max(farthest[of], awayAt(during, sample, of, copies));
    return farthest;
  };
  return {
    ...picture,
    continued: (pixels, size, index, drawn) => {
      const [x, y] = keptAt(kept, pixels, size, index, drawn);
      return [x * sx, y * sy];
    },
    outside,
    kept: {
      body,
      towards: kept.towards,
      from: (pixels, size, drawn) => picture.continued(pixels, size, 0, drawn),
      get filmed() {
        return (filmed ??= showedByFilm());
      },
    },
  };
}

/** How each material is drawn: light adds on night; on paper, graphite and sumi darken. */
export const MATERIALS = {
  light: {
    blend: 'lighter',
    trail: (hue: number, alpha: number) => `oklch(0.84 0.075 ${hue} / ${alpha})`,
    continued: (hue: number, alpha: number) => `oklch(0.86 0.02 ${hue} / ${alpha})`,
    mark: 'rgb(241 235 223 / 0.7)',
    /** The window behind After the frame. */
    dimmed: 0.07,
  },
  ink: {
    blend: 'multiply',
    trail: (hue: number, alpha: number) => `oklch(0.32 0.02 ${hue} / ${alpha * 0.7})`,
    continued: (hue: number, alpha: number) => `oklch(0.45 0.01 ${hue} / ${alpha})`,
    mark: 'oklch(0.22 0.02 60 / 0.7)',
    dimmed: 0.05,
    /** A body's outline and its centre, in sumi. */
    body: (hue: number) => `oklch(0.22 0.02 ${hue} / 0.85)`,
  },
} as const;
