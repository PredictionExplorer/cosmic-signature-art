/*
  The essay's arithmetic that is not the generator's: what two of the three bodies would do
  alone, the weights of the integrator's three pushes, and how fast a plait of three strands
  must stretch a line. Pure; the worker, the build and their test all read it from here.
*/

/**
 * Two of the three bodies alone, as they stand: the conic the pair would keep to if the third
 * were not there. Newton's two-body solution, from the pair's separation and relative velocity:
 * whether the pair is bound, its eccentricity, its semi-major axis and its period, in the
 * generator's units (a step is `dt` of its time). The semi-latus rectum fixes the conic's size
 * whether it is closed or open, and the true anomaly says where on it the pair stands: the
 * angle from its nearest approach, positive while the two draw apart.
 */
export function pairAlone(G, masses, positions, velocities, a, b) {
  const r = [0, 1, 2].map((k) => positions[b * 3 + k] - positions[a * 3 + k]);
  const v = [0, 1, 2].map((k) => velocities[b * 3 + k] - velocities[a * 3 + k]);
  const mu = G * (masses[a] + masses[b]);
  const distance = Math.hypot(r[0], r[1], r[2]);
  const energy = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) / 2 - mu / distance;
  const h = Math.hypot(
    r[1] * v[2] - r[2] * v[1],
    r[2] * v[0] - r[0] * v[2],
    r[0] * v[1] - r[1] * v[0],
  );
  const eccentricity = Math.sqrt(Math.max(0, 1 + (2 * energy * h * h) / (mu * mu)));
  const semiLatus = (h * h) / mu;
  // A circle has no nearest approach to measure from: the angle is then nothing.
  const cosine =
    eccentricity > 0 ? Math.max(-1, Math.min(1, (semiLatus / distance - 1) / eccentricity)) : 1;
  const outward = r[0] * v[0] + r[1] * v[1] + r[2] * v[2] >= 0;
  const shape = {
    eccentricity,
    semiLatus,
    anomaly: outward ? Math.acos(cosine) : -Math.acos(cosine),
  };
  if (!(energy < 0)) return { bound: false, ...shape, semiMajor: null, period: null };
  const semiMajor = -mu / (2 * energy);
  return {
    bound: true,
    ...shape,
    semiMajor,
    period: 2 * Math.PI * Math.sqrt((semiMajor * semiMajor * semiMajor) / mu),
  };
}

/**
 * Yoshida's fourth-order weights (Physics Letters A 150, 1990): three second-order pushes of
 * lengths w1, w0, w1 times the step, with w1 = 1 / (2 − ∛2) and w0 = −∛2 / (2 − ∛2). They sum
 * to one, and the middle one is negative: it runs backward.
 */
export function yoshidaWeights() {
  const root = Math.cbrt(2);
  return { w1: 1 / (2 - root), w0: -root / (2 - root) };
}

/**
 * How much a plait of three strands must lengthen a line looped round them, each time it
 * repeats: the larger eigenvalue of the product of its crossings' 2 × 2 matrices (the Burau
 * matrices at t = −1, up to sign), as Boyland, Aref and Stremler (J. Fluid Mech. 403, 2000)
 * and Thiffeault and Finn (Phil. Trans. R. Soc. A 364, 2006) compute it. `word` is a list of
 * crossings: 1 or 2 for the pair that changes places, negative for the opposite sense.
 */
export function plaitStretch(word) {
  const crossing = {
    1: [1, 1, 0, 1],
    '-1': [1, -1, 0, 1],
    2: [1, 0, -1, 1],
    '-2': [1, 0, 1, 1],
  };
  let [a, b, c, d] = [1, 0, 0, 1];
  for (const letter of word) {
    const m = crossing[letter];
    if (!m) throw new Error(`No crossing ${letter} in a plait of three`);
    [a, b, c, d] = [
      a * m[0] + b * m[2],
      a * m[1] + b * m[3],
      c * m[0] + d * m[2],
      c * m[1] + d * m[3],
    ];
  }
  const trace = Math.abs(a + d);
  // A determinant of one: the eigenvalues are λ and 1/λ, real only when |trace| > 2.
  return trace > 2 ? (trace + Math.sqrt(trace * trace - 4)) / 2 : 1;
}

/** The middle of a list of numbers, and its ends. */
export function spread(values) {
  const sorted = [...values].sort((x, y) => x - y);
  const n = sorted.length;
  if (!n) return null;
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  return { least: sorted[0], median, most: sorted[n - 1] };
}

/**
 * The three bodies as the Ink sheet has them, watched sample by sample: how near their centres
 * come, in body diameters; how much of the time two of the discs overlap, which a sheet allows
 * because it flattens a motion in depth; and the plait their paths make on the sheet, read as
 * Thiffeault reads the braid of particle paths (Chaos 20, 2010): two bodies change places along
 * x, and the one that passes above (smaller y, the sheet's y running down) decides the sense.
 */
export class SheetWatch {
  /** `diameter`: a body's diameter in the sheet's pixels. */
  constructor(diameter) {
    this.diameter = diameter;
    this.samples = 0;
    this.overlapping = 0;
    this.inside = 0;
    this.closest = Infinity;
    this.word = [];
    this.order = null;
    this.startOrder = null;
  }

  /** The bodies' pixels at one sample: x and y for each of the three. */
  observe(pixels) {
    const x = [pixels[0], pixels[2], pixels[4]];
    const y = [pixels[1], pixels[3], pixels[5]];
    let nearest = Infinity;
    for (let a = 0; a < 3; a++)
      for (let b = a + 1; b < 3; b++)
        nearest = Math.min(nearest, Math.hypot(x[a] - x[b], y[a] - y[b]));
    this.samples += 1;
    if (nearest < this.diameter) this.overlapping += 1;
    if (nearest < this.diameter / 2) this.inside += 1;
    if (nearest < this.closest) this.closest = nearest;
    if (!this.order) {
      this.order = [0, 1, 2].sort((a, b) => x[a] - x[b]);
      this.startOrder = [...this.order];
      return;
    }
    // Adjacent bodies change places until the order along x is this sample's.
    const order = this.order;
    for (let pass = 0; pass < 3; pass++)
      for (let i = 0; i < 2; i++)
        if (x[order[i]] > x[order[i + 1]]) {
          const left = order[i];
          const right = order[i + 1];
          this.word.push(y[left] < y[right] ? i + 1 : -(i + 1));
          order[i] = right;
          order[i + 1] = left;
        }
  }

  get found() {
    return {
      // The bodies from left to right at the first sample, then every change of places.
      startOrder: this.startOrder,
      word: this.word,
      closestInDiameters: this.closest / this.diameter,
      overlapShare: this.overlapping / this.samples,
      insideShare: this.inside / this.samples,
      crossings: this.word.length,
      stretch: plaitStretch(this.word),
    };
  }
}
