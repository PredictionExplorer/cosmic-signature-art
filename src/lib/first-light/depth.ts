import { lensFor, smooth, type Rect, type Shot, type Size } from './camera';
import { openingOf, PITCH_LIMIT, type Turn } from './hand';
import type { PlateSpace } from './samples';

/*
  The orbit in depth, as the home's exhibit shows it (src/components/orbit-depth.tsx).

  The picture is the generator's one view of a motion in depth: flat, from where its camera
  stood, as its camera was carried. The exhibit opens that picture into the depth it set aside
  and lets a hand turn it. What is turned is the picture's own figure: every body's path as the
  camera's drift carried it across the sheet, so that from the picture's view the drawing lies on
  the still, line for line, and from any other it is the same lines seen from the side.

  This module is pure: where the exhibit's own performance stands at a moment, and the camera
  for a turn.
*/

/** The view the exhibit opens onto: First Light's (first-light-show.ts), a quarter turn short of side on. */
export const OPEN_TURN: Turn = { yaw: 0.62, pitch: -0.26 };
/** The opening into depth, and the way back to the picture's view when it is asked for. */
export const OPEN_MS = 1700;
/** One step of a button: a twelfth of a turn, led and not jumped. */
export const STEP_MS = 360;
/** How far round the camera travels while the window plays, until a hand takes it: First Light's travel. */
export const TRAVEL = 0.95;

/** The beats of the exhibit's own performance, in milliseconds. */
export const DEPTH_BEATS = {
  /** The whole picture stands in depth, as it opens. */
  hold: OPEN_MS,
  /** The light runs back along its paths into the three bodies. */
  rewind: 1500,
} as const;
const REWOUND = DEPTH_BEATS.hold + DEPTH_BEATS.rewind;

/** What the exhibit draws at one moment of its performance. */
export interface DepthMoment {
  beat: 'hold' | 'rewind' | 'window' | 'rest';
  /** The step of the recorded window the drawing has reached. */
  step: number;
  /** How brightly the bodies burn at the heads of their paths, 0 to 1. */
  heads: number;
  /** The share of the window's own film that has played, 0 to 1: the camera travels by it. */
  played: number;
}

/**
 * The performance's whole length for a window whose film runs `seconds`: it holds, runs the
 * light back, and then plays the window through at the film's own pace.
 */
export function depthDuration(seconds: number): number {
  return REWOUND + seconds * 1000;
}

/**
 * The exhibit's performance at `ms`: the picture whole, then the light run back into three
 * bodies, then the recorded window again at the pace of its Light film (`drawnAt` is the film's
 * clock: the last step drawn so many seconds in), and at rest the window whole.
 */
export function depthMoment(
  ms: number,
  steps: number,
  seconds: number,
  drawnAt: (seconds: number) => number,
): DepthMoment {
  const last = steps - 1;
  if (ms < DEPTH_BEATS.hold) return { beat: 'hold', step: last, heads: 0, played: 0 };
  if (ms < REWOUND) {
    const share = (ms - DEPTH_BEATS.hold) / DEPTH_BEATS.rewind;
    return {
      beat: 'rewind',
      step: last * (1 - smooth(share)),
      heads: smooth(Math.min(1, share * 2)),
      played: 0,
    };
  }
  const into = (ms - REWOUND) / 1000;
  if (into >= seconds) return { beat: 'rest', step: last, heads: 1, played: 1 };
  return { beat: 'window', step: drawnAt(into), heads: 1, played: into / seconds };
}

/** How far the camera has travelled once `played` of the window's film has: never still, never hurried. */
export function travelAt(played: number): number {
  const share = Math.min(1, Math.max(0, played));
  return (TRAVEL * (1 - Math.cos(Math.PI * share))) / 2;
}

/** The lens once the depth is open: the tangent of half the field of view. */
const DEPTH_LENS = 0.42;

/**
 * The camera for a turn. Small turns keep the generator's flat lens, so the first moment of a
 * turn is the still turning. Past twenty degrees the lens has opened into depth and the camera
 * turns about the figure's own middle. The camera's drift is kept throughout: the figure turned
 * is the picture's. `fill` is the figure's scale once the depth is open, as a multiple of the
 * still's: nearer on a stage taller than the picture, as a phone's is, and farther where the
 * figure turned would not stand whole on the stage (`holdOnStage`).
 */
export function shotInDepth(turn: Turn, fill = 1): Shot {
  const open = openingOf(turn);
  return {
    yaw: turn.yaw,
    pitch: turn.pitch,
    lens: DEPTH_LENS * open,
    zoom: 1 + (fill - 1) * open,
    drift: 1,
    focus: open,
  };
}

/**
 * The figure with its drift: the middle of the box that holds every sample of all three bodies
 * as the camera carried them, and the radius of the sphere about the plate's centre that holds
 * them. The camera turns about the first and keeps its distance by the second.
 */
export function driftedBounds(space: Pick<PlateSpace, 'points' | 'drift' | 'count'>): {
  centre: [number, number, number];
  radius: number;
} {
  const { points, drift, count } = space;
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  let radius = 0;
  for (let sample = 0; sample < count; sample++) {
    for (let body = 0; body < 3; body++) {
      const at = (sample * 3 + body) * 3;
      const x = points[at] + drift[sample * 3];
      const y = points[at + 1] + drift[sample * 3 + 1];
      const z = points[at + 2] + drift[sample * 3 + 2];
      low[0] = Math.min(low[0], x);
      low[1] = Math.min(low[1], y);
      low[2] = Math.min(low[2], z);
      high[0] = Math.max(high[0], x);
      high[1] = Math.max(high[1], y);
      high[2] = Math.max(high[2], z);
      radius = Math.max(radius, Math.hypot(x, y, z));
    }
  }
  return {
    centre: [(low[0] + high[0]) / 2, (low[1] + high[1]) / 2, (low[2] + high[2]) / 2],
    radius,
  };
}

/** How near a stage taller than the picture brings the figure: First Light's fill. */
export function fillFor(stageHeight: number, stillHeight: number): number {
  return Math.min(1.6, Math.max(1, (0.92 * stageHeight) / Math.max(1, stillHeight)));
}

/** The tilts the figure is measured at, from level to the hand's limit, each both ways. */
const TILTS = 7;
/** The turns round it is measured at, at each tilt: every seven and a half degrees. */
const ROUNDS = 48;
/** How much of the stage the figure may take, from its middle to an edge: the rest is its glow's. */
const HELD = 0.88;
/** About this many of the figure's points are looked through for the ones that reach farthest. */
const LOOKED = 3000;
/** The directions the figure's farthest points are sought in, spread evenly over a sphere. */
const DIRECTIONS = 162;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * How near the figure may stand, at each tilt, and still be whole on the stage whichever way
 * it is turned round: the scale `shotInDepth` takes as its `fill`. Turned, a figure reaches
 * where the flat picture never did (what lay across it now lies toward the eye, and swells),
 * and a stage has edges: the camera steps back as far as it must and no farther, and never
 * comes nearer than `most`. The scale depends on the tilt alone, so the figure keeps its size
 * as it is turned round, and gives way only as it is tipped up or down.
 *
 * Only the points that reach farthest in some direction can touch an edge, from any side, so
 * those are found first and they alone are measured, in every symmetry copy, as the engine
 * draws it. `still` is where the picture lies on the stage.
 */
export function holdOnStage(
  space: Pick<PlateSpace, 'points' | 'drift' | 'count' | 'width' | 'height' | 'copies'>,
  bounds: { centre: readonly [number, number, number]; radius: number },
  stage: Size,
  still: Rect,
  most = 1,
): (pitch: number) => number {
  const plate = { width: space.width, height: space.height };
  // The figure's points as the camera carried them; its paths are smooth between these.
  const stride = Math.max(1, Math.ceil((space.count * 3) / LOOKED));
  const drifted: number[] = [];
  for (let sample = 0; sample < space.count; sample += stride) {
    for (let body = 0; body < 3; body++) {
      const at = (sample * 3 + body) * 3;
      drifted.push(
        space.points[at] + space.drift[sample * 3],
        space.points[at + 1] + space.drift[sample * 3 + 1],
        space.points[at + 2] + space.drift[sample * 3 + 2],
      );
    }
  }
  // The one that reaches farthest each way: the corners of the figure, seen from anywhere.
  const corners = new Set<number>();
  for (let index = 0; index < DIRECTIONS; index++) {
    const zed = 1 - (2 * (index + 0.5)) / DIRECTIONS;
    const ring = Math.sqrt(1 - zed * zed);
    const [dx, dy] = [ring * Math.cos(index * GOLDEN_ANGLE), ring * Math.sin(index * GOLDEN_ANGLE)];
    let farthest = -Infinity;
    let corner = 0;
    for (let at = 0; at < drifted.length; at += 3) {
      const reach = drifted[at] * dx + drifted[at + 1] * dy + drifted[at + 2] * zed;
      if (reach > farthest) [farthest, corner] = [reach, at];
    }
    if (drifted.length) corners.add(corner);
  }
  // Each corner in each symmetry copy, placed as the engine places it.
  const placed: number[] = [];
  for (const at of corners) {
    const [x, y, z] = [drifted[at], drifted[at + 1], drifted[at + 2]];
    for (const copy of space.copies) {
      const m = copy.mirror ? -1 : 1;
      placed.push(
        (m * copy.cos * x - copy.sin * y) * copy.scale,
        (m * copy.sin * x + copy.cos * y) * copy.scale,
        z * copy.scale,
      );
    }
  }
  /** The farthest any point stands from the stage's middle, 1 being its edge, at one scale. */
  const farthest = (zoom: number, pitch: number) => {
    let far = 0;
    for (let round = 0; round < ROUNDS; round++) {
      const shot: Shot = {
        yaw: (round / ROUNDS) * 2 * Math.PI,
        pitch,
        lens: DEPTH_LENS,
        zoom,
        drift: 1,
        focus: 1,
      };
      const lens = lensFor(shot, stage, plate, bounds.radius, 0.35, bounds.centre, still);
      const r = lens.rotation;
      for (let at = 0; at < placed.length; at += 3) {
        const x = placed[at] - lens.focus[0];
        const y = placed[at + 1] - lens.focus[1];
        const z = placed[at + 2] - lens.focus[2];
        const w = 1 - (r[6] * x + r[7] * y + r[8] * z) * lens.inverseDistance;
        const across = Math.abs(((r[0] * x + r[1] * y + r[2] * z) * lens.invHalf[0]) / w);
        const up = Math.abs(((r[3] * x + r[4] * y + r[5] * z) * lens.invHalf[1]) / w);
        if (across > far) far = across;
        if (up > far) far = up;
      }
    }
    return far;
  };
  const fits = Array.from({ length: TILTS }, (_, index) => {
    const tilt = (index / (TILTS - 1)) * PITCH_LIMIT;
    const far = (zoom: number) => Math.max(farthest(zoom, tilt), index ? farthest(zoom, -tilt) : 0);
    const nearest = far(most);
    if (!(nearest > HELD)) return most;
    // Farther off the figure is smaller and swells less with nearness, so the scale that would
    // hold it if it swelled as much is safe. The nearest that holds it lies between that and
    // `most`, and is found by halving: what it reaches grows with the scale all the way.
    let safe = (most * HELD) / nearest;
    let over = most;
    for (let pass = 0; pass < 6; pass++) {
      const between = (safe + over) / 2;
      if (far(between) > HELD) over = between;
      else safe = between;
    }
    return safe;
  });
  return (pitch) => {
    const at = Math.min(1, Math.abs(pitch) / PITCH_LIMIT) * (TILTS - 1);
    const low = Math.floor(at);
    const high = Math.min(TILTS - 1, low + 1);
    return fits[low] + (fits[high] - fits[low]) * (at - low);
  };
}
