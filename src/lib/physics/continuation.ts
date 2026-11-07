import { CHECK_INTERVAL, HYSTERESIS, integrator, type DerivedFate } from './orbit';
import type { HeldPlacement } from './framing';

/** A direction or a point in the simulation's space. */
type Triple = readonly [number, number, number];

/**
 * After the frame's physics (third-physics.md §5.6): the orbit carried on past its recorded
 * window from a state the fate run kept, step by step with the generator's own integrator, and
 * sampled every `stride` steps where the window is drawn: on its plate, where the films put the
 * bodies (framing.ts), or else in its own plane. Started from the window's end it passes through
 * every state the fate run passed through, bit for bit, so an ejection happens here at the step
 * the generator dated. It knows nothing of canvases or of the page's clock: the orbit section
 * paces it and draws it.
 */
export class Continuation {
  /** Steps since the window's first step, as the record counts them. */
  taken: number;
  /** The step the path begins at. */
  readonly from: number;
  /** The step the performance rests at; the page may bring it forward (restHere). */
  end: number;
  readonly stride: number;
  /**
   * Every `stride`-th step where the window is drawn, `width` numbers a sample: in its plane, u
   * then v for each of the three bodies; on its plate, x then y for each body of every copy.
   */
  readonly path: Float32Array;
  readonly width: number;
  samples = 0;
  private readonly positions: Float64Array;
  private readonly velocities: Float64Array;
  private readonly step: () => void;
  private readonly plane: { mean: Triple; axes: readonly [Triple, Triple] } | null;
  private readonly plate: HeldPlacement | null;
  private readonly placed: Float64Array;
  /** Seconds performed at the film's pace, and when the trails last faded. */
  private seconds = 0;
  private faded = 0;

  constructor({
    masses,
    dt,
    origin,
    end,
    stride,
    plane,
    plate,
  }: {
    masses: readonly number[];
    dt: number;
    /** The bodies after `taken` steps of the window, copied, never moved. */
    origin: { taken: number; positions: ArrayLike<number>; velocities: ArrayLike<number> };
    end: number;
    stride: number;
    /** The window's drawing plane: its centre and two axes (plane.ts)… */
    plane?: { mean: Triple; axes: readonly [Triple, Triple] };
    /** …or its plate, with the camera held where the film's frame ended (framing.ts). */
    plate?: HeldPlacement;
  }) {
    if (!plane === !plate) throw new Error('A continuation is drawn in a plane or on a plate');
    this.taken = origin.taken;
    this.from = origin.taken;
    this.end = Math.max(origin.taken, end);
    this.stride = stride;
    this.positions = Float64Array.from(origin.positions);
    this.velocities = Float64Array.from(origin.velocities);
    this.step = integrator(masses, this.positions, this.velocities, dt);
    this.plane = plane ?? null;
    this.plate = plate ?? null;
    this.width = plate ? plate.copies.length * 6 : 6;
    this.placed = new Float64Array(this.width);
    this.path = new Float32Array((Math.floor((this.end - this.from) / stride) + 1) * this.width);
    this.sample();
  }

  /** The bodies as they stand now, unmoved by the reader. */
  get state(): { positions: Float64Array; velocities: Float64Array } {
    return { positions: this.positions.slice(), velocities: this.velocities.slice() };
  }

  /** Whether the performance has come to rest. */
  get resting() {
    return this.taken >= this.end;
  }

  /** Brings the rest to the step the performance stands at: nothing past it will be taken. */
  restHere() {
    this.end = this.taken;
  }

  /** Takes steps until `target` (never past the end), sampling the path as it goes. */
  advanceTo(target: number) {
    const until = Math.min(target, this.end);
    while (this.taken < until) {
      this.step();
      this.taken += 1;
      if ((this.taken - this.from) % this.stride === 0) this.sample();
    }
  }

  /**
   * Carries the performance on by `elapsed` seconds at `pace` steps a second, and says whether
   * the trails are due to fade, every `fadeEvery` seconds performed. A performance drawn on at
   * once in the meantime picks up from where its steps stand, never waiting for its clock.
   */
  perform(elapsed: number, pace: number, fadeEvery: number): boolean {
    this.seconds = Math.max(this.seconds, (this.taken - this.from) / pace) + elapsed;
    this.advanceTo(this.from + Math.round(this.seconds * pace));
    if (this.seconds - this.faded < fadeEvery) return false;
    this.faded = this.seconds;
    return true;
  }

  private sample() {
    const offset = this.samples * this.width;
    if (this.plate)
      this.path.set(this.plate.place(this.positions, this.velocities, this.placed), offset);
    else if (this.plane) {
      const { mean, axes } = this.plane;
      const [e1, e2] = axes;
      for (let body = 0; body < 3; body++) {
        const dx = this.positions[body * 3] - mean[0];
        const dy = this.positions[body * 3 + 1] - mean[1];
        const dz = this.positions[body * 3 + 2] - mean[2];
        this.path[offset + body * 2] = dx * e1[0] + dy * e1[1] + dz * e1[2];
        this.path[offset + body * 2 + 1] = dx * e2[0] + dy * e2[1] + dz * e2[2];
      }
    }
    this.samples += 1;
  }
}

/**
 * Where After the frame rests: `after` steps past the step at which the generator's fifth
 * answer in a row confirmed an escape, or the record's horizon for an eternal dance.
 */
export function restingStep(
  fate: Pick<DerivedFate, 'outcome' | 'ejectionStep' | 'horizonSteps'>,
  after: number,
): number {
  if (fate.outcome !== 'ejection' || fate.ejectionStep === null) return fate.horizonSteps;
  const confirmed = fate.ejectionStep + 1 + (HYSTERESIS - 1) * CHECK_INTERVAL;
  return Math.min(fate.horizonSteps, confirmed + after);
}
