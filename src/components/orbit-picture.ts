import type { FramedSamples } from '@/lib/physics/framing';
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
/** On the plate a body's light reaches no further than this share of the plate's height. */
const LIGHT_REACH = 0.035;

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
  /** How far a body's light reaches (Light), or the radius of its outline (Ink). */
  reach(mass: number): number;
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
    reach: (mass) => Math.cbrt(mass) * 0.6 * ratio * 4,
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
    reach: (mass) =>
      material === 'ink'
        ? INK_BODY_RADIUS * height
        : Math.min(Math.cbrt(mass) * 0.6 * ratio * 4, LIGHT_REACH * height),
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
