import { integrator, type OrbitWindow } from './orbit.ts';
import { DriftPath, type Drift } from './drift.ts';
import { lightFilmFrame, lightFilmFrames } from './light-film.ts';

/*
  The plate's frame: the generator's path from the orbit's simulation coordinates to the pixels
  of the Light film and its still (CS-Image-Generation, generator 1.x), so that a page can draw
  the bodies where the film drew them. In the generator's order:

  1. The projection (app.rs apply_projection). Most works draw positions; a few draw phase space,
     velocities by forward difference scaled to the positions' extent.
  2. The view (app.rs apply_view_orientation): a Shoemake rotation, the best-scoring of four
     drawn from the seed (frame-derivation.ts).
  3. The camera's drift (drift.ts).
  4. The fit (render/context.rs): the box of every drifted step, mapped onto the frame with x
     across and y down, in the renderer's single precision.
  5. The symmetry (render/batch_drawing.rs): kaleidoscopic works draw every stroke again about
     the frame's centre, mirrored or turned, turns shrunk to keep the frame's diagonal inside.

  A frame is derived once, offline, from the seed and checked against the Light film's own
  frame differences (scripts/build-orbit-frames.mjs); this module is what draws with it. Its
  sines and cosines may differ in the last bit from the generator's libm, and from one machine's
  V8 to another's (arm64 fuses multiplies and adds, x86-64 does not): a few ulps, far below a
  billionth of a pixel on the plate.
*/

/** apply_projection's spaces, by the labels the trait files carry. */
export const PROJECTIONS = ['position', 'phase_portrait', 'cross_braid', 'hodograph'] as const;
export type Projection = (typeof PROJECTIONS)[number];

/** The fit: the film's frame in simulation coordinates (render/context.rs BoundingBox). */
export interface FrameBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

/** Everything that carries a work's recorded window onto its Light film's pixels. */
export interface PlateFrame {
  /** The film's frame in pixels: the published plate, 3,456 × 2,234. */
  width: number;
  height: number;
  projection: Projection;
  /** The velocities' scale in a phase-space projection; 1 in position space. */
  velocityScale: number;
  /** The chosen view's Shoemake triple. */
  view: readonly [number, number, number];
  drift: Drift;
  box: FrameBox;
  /** The trait file's symmetry: none, mirror_x, rot<k> or dih<k>. */
  symmetry: string;
}

/** A recorded window's first state and how it steps: all a frame needs of the orbit. */
export type WindowStart = Pick<OrbitWindow, 'masses' | 'dt' | 'steps'> & {
  positions: ArrayLike<number>;
  velocities: ArrayLike<number>;
};

/** One step's projection of raw positions `at`, with their velocities, into `out`. */
export function project(
  projection: Projection,
  at: ArrayLike<number>,
  velocity: ArrayLike<number>,
  scale: number,
  out: Float64Array,
) {
  for (let b = 0; b < 3; b++) {
    const o = b * 3;
    if (projection === 'position') {
      out[o] = at[o];
      out[o + 1] = at[o + 1];
      out[o + 2] = at[o + 2];
    } else if (projection === 'phase_portrait') {
      out[o] = at[o];
      out[o + 1] = velocity[o] * scale;
      out[o + 2] = at[o + 1];
    } else if (projection === 'cross_braid') {
      out[o] = at[o];
      out[o + 1] = at[((b + 1) % 3) * 3 + 1];
      out[o + 2] = at[o + 2];
    } else {
      out[o] = velocity[o] * scale;
      out[o + 1] = velocity[o + 1] * scale;
      out[o + 2] = at[o + 2];
    }
  }
}

const TWO_PI = 2 * Math.PI;

/** shoemake_rotation and quaternion_to_matrix: a rotation from three uniforms, row-major. */
export function shoemakeRotation([u1, u2, u3]: readonly [number, number, number]): number[] {
  const x = Math.sqrt(1 - u1) * Math.sin(TWO_PI * u2);
  const y = Math.sqrt(1 - u1) * Math.cos(TWO_PI * u2);
  const z = Math.sqrt(u1) * Math.sin(TWO_PI * u3);
  const w = Math.sqrt(u1) * Math.cos(TWO_PI * u3);
  const [xx, yy, zz] = [x * x, y * y, z * z];
  const [xy, xz, yz] = [x * y, x * z, y * z];
  const [wx, wy, wz] = [w * x, w * y, w * z];
  return [
    1 - 2 * (yy + zz),
    2 * (xy - wz),
    2 * (xz + wy),
    2 * (xy + wz),
    1 - 2 * (xx + zz),
    2 * (yz - wx),
    2 * (xz - wy),
    2 * (yz + wx),
    1 - 2 * (xx + yy),
  ];
}

/** A row-major rotation of body `b` of `from` into `out`, summing each row in nalgebra's order. */
export function rotateBody(
  m: readonly number[],
  from: ArrayLike<number>,
  b: number,
  out: Float64Array,
) {
  const x = from[b * 3];
  const y = from[b * 3 + 1];
  const z = from[b * 3 + 2];
  out[b * 3] = m[0] * x + m[1] * y + m[2] * z;
  out[b * 3 + 1] = m[3] * x + m[4] * y + m[5] * z;
  out[b * 3 + 2] = m[6] * x + m[7] * y + m[8] * z;
}

/** One rigid copy about the frame's centre, in the renderer's single precision. */
export interface SymmetryCopy {
  cos: number;
  sin: number;
  scale: number;
  mirror: boolean;
}

/** symmetry_transforms: every copy a kaleidoscopic work draws each stroke in, identity first. */
export function symmetryCopies(symmetry: string, width: number, height: number): SymmetryCopy[] {
  const f = Math.fround;
  const identity = { cos: 1, sin: 0, scale: 1, mirror: false };
  if (symmetry === 'none') return [identity];
  if (symmetry === 'mirror_x') return [identity, { ...identity, mirror: true }];
  const match = /^(rot|dih)(\d+)$/.exec(symmetry);
  if (!match) throw new Error(`Unknown symmetry ${symmetry}`);
  const k = Math.max(Number(match[2]), 1);
  // rotational_fit_scale: the frame's diagonal must fit inside its short edge.
  const w = f(width);
  const h = f(height);
  const diagonal = f(Math.sqrt(f(f(w * w) + f(h * h))));
  const scale = diagonal <= 0 ? 1 : Math.min(f(Math.min(w, h) / diagonal), 1);
  const turns = (mirror: boolean) =>
    Array.from({ length: k }, (_, i) => {
      const theta = (TWO_PI * i) / k;
      return { cos: f(Math.cos(theta)), sin: f(Math.sin(theta)), scale, mirror };
    });
  return match[1] === 'rot' ? turns(false) : [...turns(false), ...turns(true)];
}

/**
 * A recorded window replayed step by step and placed on its plate: at each sampled step, the
 * bodies' pixels in the film's frame (x across, y down, 0 to width and height) for every
 * symmetry copy, as `pixels[(copy × 3 + body) × 2]` and the y after it. The replay is the
 * window's own (orbit.ts), so it passes through the recorded steps bit for bit.
 */
export class FramedWindow {
  readonly frame: PlateFrame;
  readonly steps: number;
  readonly copies: SymmetryCopy[];
  /** Steps taken since the window's first: the bodies stand at this step. */
  step = 0;
  /** The pixels of the step last placed. */
  readonly pixels: Float64Array;
  private readonly start: WindowStart;
  private readonly P = new Float64Array(9);
  private readonly V = new Float64Array(9);
  private readonly previous = new Float64Array(9);
  private readonly peekP = new Float64Array(9);
  private readonly peekV = new Float64Array(9);
  private readonly point = new Float64Array(9);
  private readonly velocity = new Float64Array(9);
  private readonly viewed = new Float64Array(9);
  private readonly offset = new Float64Array(3);
  private readonly rotation: number[];
  private readonly path: DriftPath;
  private advance: () => void = () => {};
  private peek: () => void = () => {};

  // Node strips this file's types without transforming it, so no parameter properties here.
  constructor(start: WindowStart, frame: PlateFrame) {
    this.start = start;
    this.frame = frame;
    this.steps = start.steps;
    this.copies = symmetryCopies(frame.symmetry, frame.width, frame.height);
    this.pixels = new Float64Array(this.copies.length * 6);
    this.rotation = shoemakeRotation(frame.view);
    this.path = new DriftPath(frame.drift, start.steps, start.dt);
    this.restart();
  }

  get done() {
    return this.step >= this.steps;
  }

  /** The bodies where they stand now, in the orbit's own units: read them, never move them. */
  get positions(): Readonly<Float64Array> {
    return this.P;
  }

  /** The bodies' velocities now: read them, never move them. */
  get velocities(): Readonly<Float64Array> {
    return this.V;
  }

  /** Back to the window's first step, exactly. */
  restart() {
    this.P.set(this.start.positions);
    this.V.set(this.start.velocities);
    this.previous.set(this.start.positions);
    this.step = 0;
    this.advance = integrator(this.start.masses, this.P, this.V, this.start.dt);
    this.peek = integrator(this.start.masses, this.peekP, this.peekV, this.start.dt);
    this.place();
  }

  /**
   * Step up to `target` (never past the window). At every step that is a multiple of `stride`,
   * before the step is taken, `sample` sees the step and the bodies' pixels.
   */
  run(target: number, stride: number, sample?: (step: number, pixels: Float64Array) => void) {
    const end = Math.min(target, this.steps);
    while (this.step < end) {
      if (sample && this.step % stride === 0) sample(this.step, this.place());
      this.previous.set(this.P);
      this.advance();
      this.step += 1;
    }
  }

  /** The bodies' pixels where they stand now, into `pixels`. */
  place(): Float64Array {
    const { frame } = this;
    if (frame.projection === 'position') this.point.set(this.P);
    else {
      // The difference to the next step, taken on a copy of the bodies so the window is not
      // moved; the last step has no next and keeps the difference from the one before.
      const last = this.step + 1 >= this.steps;
      const from = last ? this.previous : this.P;
      if (!last) {
        this.peekP.set(this.P);
        this.peekV.set(this.V);
        this.peek();
      }
      const to = last ? this.P : this.peekP;
      for (let i = 0; i < 9; i++) this.velocity[i] = (to[i] - from[i]) / this.start.dt;
      project(frame.projection, this.P, this.velocity, frame.velocityScale, this.point);
    }
    this.path.offset(this.step, this.offset);
    return placeOnPlate(
      frame,
      this.rotation,
      this.copies,
      this.point,
      this.offset,
      this.viewed,
      this.pixels,
    );
  }
}

/**
 * Projected bodies (`point`: x, y, z for each, in the projection's space) placed on the plate:
 * seen from the frame's view (`rotation`), carried by the camera's `offset`, fitted to the frame
 * in the renderer's single precision, and drawn again in every symmetry copy, into `pixels` as
 * `pixels[(copy × 3 + body) × 2]` and the y after it. `viewed` is scratch for nine numbers.
 */
export function placeOnPlate(
  frame: PlateFrame,
  rotation: readonly number[],
  copies: readonly SymmetryCopy[],
  point: ArrayLike<number>,
  offset: ArrayLike<number>,
  viewed: Float64Array,
  pixels: Float64Array,
): Float64Array {
  const f = Math.fround;
  const cx = f(frame.width * 0.5);
  const cy = f(frame.height * 0.5);
  const plain = frame.symmetry === 'none';
  for (let b = 0; b < 3; b++) {
    rotateBody(rotation, point, b, viewed);
    const x = viewed[b * 3] + offset[0];
    const y = viewed[b * 3 + 1] + offset[1];
    // RenderContext::to_pixel, in single precision as the renderer keeps it.
    const px = f(((x - frame.box.minX) / frame.box.width) * frame.width);
    const py = f(((y - frame.box.minY) / frame.box.height) * frame.height);
    if (plain) {
      // A work without symmetry draws each stroke once, untransformed.
      pixels[b * 2] = px;
      pixels[b * 2 + 1] = py;
      continue;
    }
    copies.forEach((copy, c) => {
      let dx = f(px - cx);
      const dy = f(py - cy);
      if (copy.mirror) dx = -dx;
      const rx = f(f(f(dx * copy.cos) - f(dy * copy.sin)) * copy.scale);
      const ry = f(f(f(dx * copy.sin) + f(dy * copy.cos)) * copy.scale);
      pixels[(c * 3 + b) * 2] = f(cx + rx);
      pixels[(c * 3 + b) * 2 + 1] = f(cy + ry);
    });
  }
  return pixels;
}

/**
 * Bodies carried on past their recorded window (After the frame), placed on its plate as the
 * window's were: the same projection, view, fit and symmetry, with the camera held where the
 * film's frame ended, at the window's last step. The generator never drifted its camera past
 * the window, so the plate does not either. `place` takes any state the orbit passes through.
 */
export class HeldPlacement {
  readonly frame: PlateFrame;
  readonly copies: SymmetryCopy[];
  private readonly dt: number;
  private readonly rotation: number[];
  private readonly offset = new Float64Array(3);
  private readonly point = new Float64Array(9);
  private readonly velocity = new Float64Array(9);
  private readonly viewed = new Float64Array(9);
  private readonly peekP = new Float64Array(9);
  private readonly peekV = new Float64Array(9);
  private readonly peek: () => void;

  // Node strips this file's types without transforming it, so no parameter properties here.
  constructor(frame: PlateFrame, start: Pick<WindowStart, 'masses' | 'dt' | 'steps'>) {
    this.frame = frame;
    this.dt = start.dt;
    this.copies = symmetryCopies(frame.symmetry, frame.width, frame.height);
    this.rotation = shoemakeRotation(frame.view);
    new DriftPath(frame.drift, start.steps, start.dt).offset(start.steps - 1, this.offset);
    this.peek = integrator(start.masses, this.peekP, this.peekV, start.dt);
  }

  /** The bodies at `positions`, moving at `velocities`, on the plate: into `pixels`. */
  place(
    positions: ArrayLike<number>,
    velocities: ArrayLike<number>,
    pixels: Float64Array = new Float64Array(this.copies.length * 6),
  ): Float64Array {
    const { frame } = this;
    if (frame.projection === 'position') this.point.set(positions);
    else {
      // The difference to the next step, taken on a copy, as the window's own placement takes it.
      this.peekP.set(positions);
      this.peekV.set(velocities);
      this.peek();
      for (let i = 0; i < 9; i++) this.velocity[i] = (this.peekP[i] - positions[i]) / this.dt;
      project(frame.projection, positions, this.velocity, frame.velocityScale, this.point);
    }
    return placeOnPlate(
      frame,
      this.rotation,
      this.copies,
      this.point,
      this.offset,
      this.viewed,
      pixels,
    );
  }
}

/**
 * A recorded window placed on its plate at every `stride`-th step, as a page draws it: each
 * sample's pixels, every copy's three bodies (FramedWindow's order), and then one more, the
 * bodies at the window's last step, where its still shows them. Replayed from the window's
 * first state, so it passes through the recorded steps bit for bit; in single precision, as
 * the renderer placed them.
 */
export interface FramedSamples {
  stride: number;
  /** The samples, the last step's not counted: steps 0, stride, 2 × stride, … */
  count: number;
  /** Symmetry copies drawn at each sample: three bodies each. */
  copies: number;
  /** `(count + 1) × copies × 6` numbers: x, y of each copy's three bodies, sample by sample. */
  pixels: Float32Array;
}

export function framedSamples(
  start: WindowStart,
  frame: PlateFrame,
  stride: number,
): FramedSamples {
  const framed = new FramedWindow(start, frame);
  const copies = framed.copies.length;
  const width = copies * 6;
  const count = Math.ceil(start.steps / stride);
  const pixels = new Float32Array((count + 1) * width);
  framed.run(start.steps - 1, stride, (step, placed) =>
    pixels.set(placed, (step / stride) * width),
  );
  const last = framed.place();
  // A window whose last step falls on the stride samples it there too.
  if ((start.steps - 1) % stride === 0) pixels.set(last, (count - 1) * width);
  pixels.set(last, count * width);
  return { stride, count, copies, pixels };
}

// ───────────────────────── The film's record, and the agreement ─────────────────────────

/**
 * Where and when the Light film gained light (scripts/build-orbit-frames.mjs): for each cell of
 * a reduced grid, a bit for each of `slices` equal parts of the film in which some frame lit it
 * by at least the record's threshold over the frame before.
 */
export interface LightTrace {
  width: number;
  height: number;
  slices: number;
  /** Frames of the film; a step's frame is light-film.ts's. */
  frames: number;
  bits: Uint16Array;
}

/** A trace from its image's pixels: the low byte in red, the high in green. */
export function traceFromPixels(
  data: ArrayLike<number>,
  shape: { width: number; height: number; channels: number; slices: number; frames: number },
): LightTrace {
  const { width, height, channels, slices, frames } = shape;
  const bits = new Uint16Array(width * height);
  for (let p = 0; p < bits.length; p++)
    bits[p] = data[p * channels] | (data[p * channels + 1] << 8);
  return { width, height, slices, frames, bits };
}

/** The part of the film a frame falls in. */
export const sliceOf = (frame: number, frames: number, slices: number) =>
  Math.min(slices - 1, Math.floor((frame * slices) / frames));

/**
 * The share of a window's sampled bodies, in every symmetry copy, that stand where the film
 * gained light in the same part of the film: about 1 for a frame that is the film's, far less
 * for any other. Every `stride`-th step is sampled.
 */
export function traceAgreement(
  trace: LightTrace,
  start: WindowStart,
  frame: PlateFrame,
  { stride = 97 }: { stride?: number } = {},
): number {
  if (trace.frames !== lightFilmFrames(start.steps))
    throw new Error('The trace is of another film than this window’s');
  const framed = new FramedWindow(start, frame);
  let hits = 0;
  let total = 0;
  framed.run(start.steps, stride, (step, pixels) => {
    const bit = 1 << sliceOf(lightFilmFrame(step, start.steps), trace.frames, trace.slices);
    for (let i = 0; i < pixels.length; i += 2) {
      total += 1;
      const x = Math.floor((pixels[i] / frame.width) * trace.width);
      const y = Math.floor((pixels[i + 1] / frame.height) * trace.height);
      if (x < 0 || y < 0 || x >= trace.width || y >= trace.height) continue;
      if (trace.bits[y * trace.width + x] & bit) hits += 1;
    }
  });
  return total ? hits / total : 0;
}
