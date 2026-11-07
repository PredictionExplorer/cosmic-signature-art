import type { SeedStream } from './orbit';

/*
  The camera's drift, as the generator moves it (CS-Image-Generation src/drift.rs and
  src/drift_config.rs, generator 1.x). After the view is chosen, every recorded step of the orbit
  is carried along one arc of a Kepler ellipse: the same offset for all three bodies, so the
  film's camera sweeps across the exposure while the bodies draw. The ellipse's size, sweep and
  eccentricity are the main stream's next three draws after the Borda search, and the trait file
  publishes them, so they check the stream's position; its orientation and starting phase are
  the four draws after those, and are not published.

  Every collection work drifts elliptically. The Brownian and linear modes of drift.rs are not
  ported: no work uses them, and a work that did would be refused by the frame's build.

  Only + − × ÷ and √ are exact in ECMAScript; the drift's sines, cosines and Kepler solve may
  differ in the last bit from the generator's libm, and from one machine's V8 to another's: a
  few ulps, far below a billionth of a pixel on the plate. The draws themselves are exact on
  every machine, and so is everything published.
*/

/** The largest sweep a drift may take, in turns (drift.rs MAX_ARC_FRACTION). */
export const MAX_ARC_FRACTION = 1.5;
const TWO_PI = 2 * Math.PI;

// drift_config.rs: the curated ranges of a drawn drift.
const SCALE_MIN = 0.85;
const SCALE_RANGE = 0.45;
/** The cap on scale × arc: past it every stroke is drift-stretched into a thin scribble. */
const SWEEP_MAX = 1.3;
const ARC_FRACTION_RANGE = 1.35;
const ECCENTRICITY_MIN = 0.4;
const ECCENTRICITY_RANGE = 0.1;

/** A drift's size, sweep (in turns) and eccentricity: what nft_traits.json publishes. */
export interface DriftConfig {
  scale: number;
  arcFraction: number;
  eccentricity: number;
}

/** ResolvedDriftConfig::generate_random: three draws, the sweep capped by the scale. */
export function randomDriftConfig(stream: SeedStream): DriftConfig {
  const scale = SCALE_MIN + stream.nextF64() * SCALE_RANGE;
  let arcFraction = stream.nextF64() * ARC_FRACTION_RANGE;
  if (scale * arcFraction > SWEEP_MAX) arcFraction = SWEEP_MAX / scale;
  const eccentricity = ECCENTRICITY_MIN + stream.nextF64() * ECCENTRICITY_RANGE;
  return { scale, arcFraction, eccentricity };
}

/** DriftParameters::new: each value clamped to the range the drift accepts. */
export function driftParameters({ scale, arcFraction, eccentricity }: DriftConfig): DriftConfig {
  return {
    scale: Math.max(scale, 0),
    arcFraction: Math.min(Math.max(arcFraction, 0), MAX_ARC_FRACTION),
    eccentricity: Math.min(Math.max(eccentricity, 0), 0.95),
  };
}

/** Where the drift's ellipse lies and where on it the camera starts. */
export interface DriftOrientation {
  inclination: number;
  ascendingNode: number;
  argumentOfPeriapsis: number;
  /** The mean anomaly at the window's first step, in (−π, π]. */
  initialMeanAnomaly: number;
}

/** EllipticalDrift::new: four draws, in the generator's order. */
export function driftOrientation(stream: SeedStream): DriftOrientation {
  const inclination = stream.nextF64() * Math.PI;
  const ascendingNode = stream.nextF64() * TWO_PI;
  const argumentOfPeriapsis = stream.nextF64() * TWO_PI;
  const initialMeanAnomaly = stream.nextF64() * TWO_PI - Math.PI;
  return { inclination, ascendingNode, argumentOfPeriapsis, initialMeanAnomaly };
}

/** build_rotation_matrix: the ellipse's plane to the scene, row by row. */
export function orientationMatrix({
  ascendingNode,
  inclination,
  argumentOfPeriapsis,
}: DriftOrientation): number[] {
  const sinO = Math.sin(ascendingNode);
  const cosO = Math.cos(ascendingNode);
  const sinI = Math.sin(inclination);
  const cosI = Math.cos(inclination);
  const sinW = Math.sin(argumentOfPeriapsis);
  const cosW = Math.cos(argumentOfPeriapsis);
  return [
    cosO * cosW - sinO * sinW * cosI,
    -cosO * sinW - sinO * cosW * cosI,
    sinO * sinI,
    sinO * cosW + cosO * sinW * cosI,
    -sinO * sinW + cosO * cosW * cosI,
    -cosO * sinI,
    sinW * sinI,
    cosW * sinI,
    cosI,
  ];
}

/** normalize_angle: an angle brought into [−π, π] by the remainder of 2π. */
export function normalizeAngle(angle: number): number {
  let a = angle % TWO_PI;
  if (a > Math.PI) a -= TWO_PI;
  else if (a < -Math.PI) a += TWO_PI;
  return a;
}

/** solve_kepler: E − e·sin E = M by at most eight Newton steps. */
export function solveKepler(meanAnomaly: number, eccentricity: number): number {
  if (Math.abs(eccentricity) <= Number.EPSILON) return meanAnomaly;
  let anomaly = meanAnomaly;
  for (let i = 0; i < 8; i++) {
    const f = anomaly - eccentricity * Math.sin(anomaly) - meanAnomaly;
    const slope = 1 - eccentricity * Math.cos(anomaly);
    if (Math.abs(slope) <= Number.EPSILON) break;
    const delta = f / slope;
    anomaly -= delta;
    if (Math.abs(delta) < 1e-12) break;
  }
  return anomaly;
}

/**
 * orbital_axes: the ellipse's semi-axes from the widest span of the viewed orbit (`spans`, its
 * x, y and z extents over every step of every body), scaled by the drift's clamped scale.
 */
export function orbitalAxes(
  spans: readonly [number, number, number],
  config: DriftConfig,
): { semiMajor: number; semiMinor: number } {
  const { scale, eccentricity } = driftParameters(config);
  const reference = Math.max(Math.abs(spans[0]), Math.abs(spans[1]), Math.abs(spans[2]), 1e-6);
  const semiMajor = 0.5 * reference * Math.max(scale, 1e-6);
  const semiMinor = semiMajor * Math.sqrt(1 - eccentricity * eccentricity);
  return { semiMajor, semiMinor: Math.max(semiMinor, 1e-6) };
}

/** Everything a drift needs to place the camera at any step of a window. */
export interface Drift {
  config: DriftConfig;
  orientation: DriftOrientation;
  semiMajor: number;
  semiMinor: number;
}

/**
 * EllipticalDrift::apply, one step at a time: the camera's offset at `step` of a window of
 * `steps`, written into `out` (x, y, z). A drift with no sweep, no scale or no size stays put,
 * as the generator then leaves the positions as they are.
 */
export class DriftPath {
  private readonly rotation: number[];
  private readonly motion: number;
  private readonly still: boolean;
  private readonly eccentricity: number;
  private readonly initialMeanAnomaly: number;
  private readonly semiMajor: number;
  private readonly semiMinor: number;
  private readonly dt: number;

  // Node strips this file's types without transforming it, so no parameter properties here.
  constructor(drift: Drift, steps: number, dt: number) {
    const params = driftParameters(drift.config);
    const sweep = params.arcFraction * TWO_PI;
    this.still =
      steps < 2 ||
      Math.abs(sweep) <= Number.EPSILON ||
      params.scale <= 0 ||
      drift.semiMajor <= Number.EPSILON ||
      drift.semiMinor <= Number.EPSILON;
    const duration = dt * Math.max(steps - 1, dt);
    this.motion = duration > 0 ? sweep / duration : 0;
    this.rotation = orientationMatrix(drift.orientation);
    this.eccentricity = params.eccentricity;
    this.initialMeanAnomaly = drift.orientation.initialMeanAnomaly;
    this.semiMajor = drift.semiMajor;
    this.semiMinor = drift.semiMinor;
    this.dt = dt;
  }

  offset(step: number, out: Float64Array | number[]) {
    if (this.still) {
      out[0] = 0;
      out[1] = 0;
      out[2] = 0;
      return out;
    }
    const time = step * this.dt;
    const meanAnomaly = normalizeAngle(this.initialMeanAnomaly + this.motion * time);
    const anomaly = solveKepler(meanAnomaly, this.eccentricity);
    const x = this.semiMajor * (Math.cos(anomaly) - this.eccentricity);
    const y = this.semiMinor * Math.sin(anomaly);
    // The ellipse lies in its own plane (z = 0); nalgebra sums each row's products in order.
    const r = this.rotation;
    out[0] = r[0] * x + r[1] * y + r[2] * 0;
    out[1] = r[3] * x + r[4] * y + r[5] * 0;
    out[2] = r[6] * x + r[7] * y + r[8] * 0;
    return out;
  }
}
