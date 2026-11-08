import { integrator } from '@/lib/physics/orbit';
import { DriftPath } from '@/lib/physics/drift';
import {
  project,
  rotateBody,
  shoemakeRotation,
  symmetryCopies,
  type PlateFrame,
  type SymmetryCopy,
  type WindowStart,
} from '@/lib/physics/framing';

/*
  First Light's orbit (docs/first-light.md §4): a recorded window, sampled in the generator's own
  view space before the generator drew it flat.

  framing.ts carries each step onto the plate in the generator's order: projected, turned by the
  chosen view, carried by the camera's drift, then fitted to the frame. Every frame's box has the
  plate's aspect, so the fit is one scale for x and y. The turned space, times that scale, is
  therefore the plate in three dimensions:
  - x runs across and y runs down, in plate pixels;
  - z is the depth the generator's flat drawing set aside, in the same pixels.

  The drift is kept apart. The camera can then leave it out while it travels and restore it as it
  lands, where x and y plus the drift are the plate's own pixels.
*/

/** A window in plate space, sample by sample. */
export interface PlateSpace {
  /** Steps between samples. */
  stride: number;
  /** Samples: steps 0, stride, 2 × stride, …, then the window's last step, where its still ends. */
  count: number;
  /** The step each sample stands at. */
  steps: Float64Array;
  /** The plate in pixels, and plate pixels per unit of the view space. */
  width: number;
  height: number;
  scale: number;
  /**
   * Each sample's three bodies about the plate's centre, x across, y down, z away from the eye:
   * `points[(sample × 3 + body) × 3]`, then y and z.
   */
  points: Float32Array;
  /** The camera's drift at each sample, in plate pixels: `drift[sample × 3]`, then y and z. */
  drift: Float32Array;
  /** The depth the points were centred on, already taken from every z. */
  depthCentre: number;
  /** The middle of the event without its drift: the box of every point, x, y and z. */
  centre: [number, number, number];
  /** The symmetry copies the generator draws every stroke in, identity first. */
  copies: SymmetryCopy[];
}

/** How many samples a window of `steps` gives at `stride`, its last step included. */
export function sampleCount(steps: number, stride: number): number {
  const last = steps - 1;
  return Math.floor(last / stride) + 1 + (last % stride === 0 ? 0 : 1);
}

/**
 * The window replayed from its first state, as FramedWindow replays it (framing.ts), sampled
 * every `stride` steps and at its last. A phase-space projection takes its velocity from the
 * difference to the next step, and at the last step from the one before, exactly as the plate's
 * own placement does.
 */
export function plateSpace(start: WindowStart, frame: PlateFrame, stride: number): PlateSpace {
  if (!(stride >= 1) || !Number.isInteger(stride)) throw new Error(`A stride of ${stride}`);
  if (start.steps < 2) throw new Error('A window needs two steps');
  const scale = frame.width / frame.box.width;
  const cx = frame.width * 0.5;
  const cy = frame.height * 0.5;
  const rotation = shoemakeRotation(frame.view);
  const path = new DriftPath(frame.drift, start.steps, start.dt);
  const last = start.steps - 1;
  const count = sampleCount(start.steps, stride);
  const steps = new Float64Array(count);
  const points = new Float32Array(count * 9);
  const drift = new Float32Array(count * 3);

  const P = Float64Array.from(start.positions);
  const V = Float64Array.from(start.velocities);
  const previous = Float64Array.from(start.positions);
  const advance = integrator(start.masses, P, V, start.dt);
  const peekP = new Float64Array(9);
  const peekV = new Float64Array(9);
  const peek = integrator(start.masses, peekP, peekV, start.dt);
  const point = new Float64Array(9);
  const velocity = new Float64Array(9);
  const viewed = new Float64Array(9);
  const offset = new Float64Array(3);

  let sample = 0;
  const record = (step: number) => {
    if (frame.projection === 'position') point.set(P);
    else {
      const final = step + 1 >= start.steps;
      if (!final) {
        peekP.set(P);
        peekV.set(V);
        peek();
      }
      const from = final ? previous : P;
      const to = final ? P : peekP;
      for (let i = 0; i < 9; i++) velocity[i] = (to[i] - from[i]) / start.dt;
      project(frame.projection, P, velocity, frame.velocityScale, point);
    }
    path.offset(step, offset);
    for (let b = 0; b < 3; b++) {
      rotateBody(rotation, point, b, viewed);
      const o = (sample * 3 + b) * 3;
      points[o] = (viewed[b * 3] - frame.box.minX) * scale - cx;
      points[o + 1] = (viewed[b * 3 + 1] - frame.box.minY) * scale - cy;
      points[o + 2] = viewed[b * 3 + 2] * scale;
    }
    drift[sample * 3] = offset[0] * scale;
    drift[sample * 3 + 1] = offset[1] * scale;
    drift[sample * 3 + 2] = offset[2] * scale;
    steps[sample] = step;
    sample += 1;
  };

  for (let step = 0; step <= last; step++) {
    if (step % stride === 0 || step === last) record(step);
    if (step < last) {
      previous.set(P);
      advance();
    }
  }

  // Depth has no box of its own: the sculpture turns about the middle of its own depth.
  let near = Infinity;
  let far = -Infinity;
  for (let i = 2; i < points.length; i += 3) {
    near = Math.min(near, points[i]);
    far = Math.max(far, points[i]);
  }
  const depthCentre = (near + far) / 2;
  for (let i = 2; i < points.length; i += 3) points[i] -= depthCentre;
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < points.length; i++) {
    low[i % 3] = Math.min(low[i % 3], points[i]);
    high[i % 3] = Math.max(high[i % 3], points[i]);
  }

  return {
    stride,
    count,
    steps,
    width: frame.width,
    height: frame.height,
    scale,
    points,
    drift,
    depthCentre,
    centre: [(low[0] + high[0]) / 2, (low[1] + high[1]) / 2, (low[2] + high[2]) / 2],
    copies: symmetryCopies(frame.symmetry, frame.width, frame.height),
  };
}

/** The radius, in plate pixels, of the smallest sphere about the plate's centre holding every sample. */
export function sculptureRadius(space: Pick<PlateSpace, 'points'>): number {
  let widest = 0;
  const { points } = space;
  for (let i = 0; i < points.length; i += 3) {
    widest = Math.max(widest, Math.hypot(points[i], points[i + 1], points[i + 2]));
  }
  return widest;
}

/** The sample nearest a step of the window: where its closest approach falls, for one. */
export function sampleAt(space: Pick<PlateSpace, 'steps' | 'count'>, step: number): number {
  let low = 0;
  let high = space.count - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (space.steps[middle] < step) low = middle + 1;
    else high = middle;
  }
  if (low > 0 && step - space.steps[low - 1] < space.steps[low] - step) return low - 1;
  return low;
}
