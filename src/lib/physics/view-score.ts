/*
  The generator's eye (CS-Image-Generation src/render/aesthetic_score.rs, generator 1.x): a cheap
  proxy render that splats sampled orbit geometry onto a small ink grid in the work's own layer
  stack, then scores the picture on coverage, balance, contrast, the bodies' shares, crisp line
  energy, interior dark space and fullness, less penalties for grey mush and flat veils. The
  generator photographs every orbit from the best-scoring of four seeded viewing angles
  (frame-derivation.ts), so the plate's frame cannot be re-derived without its scores; they are
  ported line for line, in the generator's order of operations.

  The scores use Math.log, which ECMAScript does not specify to the last bit; a view is chosen
  by comparing four scores, and the frame's registry keeps all four, so how far apart they stand
  is on record.
*/

/** The stroke vocabularies of visual_profile.rs, by the labels the trait files carry. */
export type Vocabulary =
  | 'triangle_web'
  | 'orbit_ribbons'
  | 'duet'
  | 'spokes'
  | 'time_chords'
  | 'nebula_veil'
  | 'harmonic_weave'
  | 'stipple_constellation'
  | 'tangent_caustics';

export const VOCABULARIES: readonly Vocabulary[] = [
  'triangle_web',
  'orbit_ribbons',
  'duet',
  'spokes',
  'time_chords',
  'nebula_veil',
  'harmonic_weave',
  'stipple_constellation',
  'tangent_caustics',
];

export type Family =
  'edges' | 'trails' | 'radial' | 'chords' | 'veil' | 'weave' | 'dots' | 'tangent';

/** StructureMode::family. */
export function familyOf(vocabulary: Vocabulary): Family {
  switch (vocabulary) {
    case 'triangle_web':
    case 'duet':
      return 'edges';
    case 'orbit_ribbons':
      return 'trails';
    case 'spokes':
      return 'radial';
    case 'time_chords':
      return 'chords';
    case 'nebula_veil':
      return 'veil';
    case 'harmonic_weave':
      return 'weave';
    case 'stipple_constellation':
      return 'dots';
    case 'tangent_caustics':
      return 'tangent';
  }
}

/** A secondary layer: a vocabulary at a continuous alpha. */
export interface StackLayer {
  vocabulary: Vocabulary;
  alpha: number;
}

/** LayerStack: a primary vocabulary at full strength, an optional underlay and accent. */
export interface LayerStack {
  primary: Vocabulary;
  /** The Duet's missing edge (0–2); only a Duet primary has one. */
  droppedEdge?: number;
  underlay?: StackLayer;
  accent?: StackLayer;
}

/** LayerStack::layers: in drawing order, the primary at alpha 1. */
export function stackLayers(stack: LayerStack): StackLayer[] {
  const layers: StackLayer[] = [{ vocabulary: stack.primary, alpha: 1 }];
  if (stack.underlay) layers.push(stack.underlay);
  if (stack.accent) layers.push(stack.accent);
  return layers;
}

/** LayerStack::label, as the trait file's stack_label: alphas to two places. */
export function stackLabel(stack: LayerStack): string {
  let label = stack.primary;
  for (const layer of [stack.underlay, stack.accent])
    if (layer) label += `+${layer.vocabulary}@${layer.alpha.toFixed(2)}`;
  return label;
}

/** Exact equality, as #[derive(PartialEq)] compares stacks. */
export function sameStack(a: LayerStack, b: LayerStack): boolean {
  const layer = (x?: StackLayer, y?: StackLayer) =>
    x === undefined || y === undefined
      ? x === y
      : x.vocabulary === y.vocabulary && x.alpha === y.alpha;
  return (
    a.primary === b.primary &&
    (a.droppedEdge ?? null) === (b.droppedEdge ?? null) &&
    layer(a.underlay, b.underlay) &&
    layer(a.accent, b.accent)
  );
}

const contains = (stack: LayerStack, family: Family) =>
  stackLayers(stack).some((layer) => familyOf(layer.vocabulary) === family);

/** Grid edge and sample budget per body when the generator ranks viewing angles. */
export const VIEW_GRID_SIZE = 96;
export const VIEW_SAMPLES_PER_BODY = 6_000;

const COVERAGE_BAND_LOW = 0.1;
const COVERAGE_BAND_HIGH = 0.36;
const COVERAGE_FLOOR = 0.01;
const COVERAGE_CEIL = 0.85;
const BALANCE_CELLS = 4;
const BODY_PRESENCE_FLOOR = 0.06;
const MUSH_TOLERANCE = 0.35;
const VEIL_GRADIENT_THRESHOLD = 0.05;
const CRISP_GRADIENT_THRESHOLD = 0.18;
const VEIL_TOLERANCE = 0.12;
const NEGATIVE_SPACE_CELLS = 8;
const PROXY_CHORD_LAG_FRACTION = 0.012;
const FULLNESS_DENSITY_FACTOR = 2.5;
const FULLNESS_SATURATION = 0.18;

/** AestheticScore: the total and the parts it is made of. */
export interface ViewScore {
  total: number;
  coverage: number;
  coverageScore: number;
  balance: number;
  contrast: number;
  bodyMix: number;
  mushFraction: number;
  veilFraction: number;
  crispness: number;
  negativeSpace: number;
  fullness: number;
}

const zero = (): ViewScore => ({
  total: 0,
  coverage: 0,
  coverageScore: 0,
  balance: 0,
  contrast: 0,
  bodyMix: 0,
  mushFraction: 0,
  veilFraction: 0,
  crispness: 0,
  negativeSpace: 0,
  fullness: 0,
});

interface ScoreProfile {
  coverage: number;
  balance: number;
  contrast: number;
  bodyMix: number;
  crisp: number;
  negative: number;
  fullness: number;
  lushness: number;
  veilTolerance: number;
  veilPenaltyScale: number;
}

/** ScoreProfile::for_stack: veils and lush weaves are scored by their own weights. */
function profileFor(stack: LayerStack): ScoreProfile {
  const lushWeave =
    contains(stack, 'weave') && (contains(stack, 'trails') || contains(stack, 'chords'));
  if (contains(stack, 'veil'))
    return {
      coverage: 0.26,
      balance: 0.2,
      contrast: 0.14,
      bodyMix: 0.1,
      crisp: 0.18,
      negative: 0.08,
      fullness: 0.06,
      lushness: 0.08,
      veilTolerance: 0.22,
      veilPenaltyScale: 0.3,
    };
  if (lushWeave)
    return {
      coverage: 0.22,
      balance: 0.15,
      contrast: 0.12,
      bodyMix: 0.09,
      crisp: 0.1,
      negative: 0.13,
      fullness: 0.17,
      lushness: 0.22,
      veilTolerance: 0.44,
      veilPenaltyScale: 0.12,
    };
  return {
    coverage: 0.28,
    balance: 0.18,
    contrast: 0.1,
    bodyMix: 0.1,
    crisp: 0.22,
    negative: 0.1,
    fullness: 0.12,
    lushness: 0.06,
    veilTolerance: VEIL_TOLERANCE,
    veilPenaltyScale: 0.4,
  };
}

function smoothstep(t: number) {
  const x = Math.min(Math.max(t, 0), 1);
  return x * x * (3 - 2 * x);
}

function coverageBandScore(coverage: number) {
  if (coverage <= COVERAGE_FLOOR || coverage >= COVERAGE_CEIL) return 0;
  if (coverage < COVERAGE_BAND_LOW)
    return smoothstep((coverage - COVERAGE_FLOOR) / (COVERAGE_BAND_LOW - COVERAGE_FLOOR));
  if (coverage > COVERAGE_BAND_HIGH)
    return smoothstep((COVERAGE_CEIL - coverage) / (COVERAGE_CEIL - COVERAGE_BAND_HIGH));
  return 1;
}

function lushCoverageScore(coverage: number) {
  const low = 0.12;
  const idealLow = 0.24;
  const idealHigh = 0.46;
  const high = 0.66;
  if (coverage <= low || coverage >= high) return 0;
  if (coverage < idealLow) return smoothstep((coverage - low) / (idealLow - low));
  if (coverage > idealHigh) return smoothstep((high - coverage) / (high - idealHigh));
  return 1;
}

function negativeSpaceScore(density: Float64Array, size: number) {
  let minX = size;
  let minY = size;
  let maxX = 0;
  let maxY = 0;
  let found = false;
  for (let idx = 0; idx < density.length; idx++) {
    if (density[idx] <= 0) continue;
    found = true;
    const x = idx % size;
    const y = Math.floor(idx / size);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!found || maxX <= minX + 2 || maxY <= minY + 2) return 0;
  const cells = NEGATIVE_SPACE_CELLS;
  const occupied = new Uint8Array(cells * cells);
  for (let idx = 0; idx < density.length; idx++) {
    if (density[idx] <= 0) continue;
    const x = idx % size;
    const y = Math.floor(idx / size);
    if (x < minX || x > maxX || y < minY || y > maxY) continue;
    const nx = (x - minX) / Math.max(maxX - minX, 1);
    const ny = (y - minY) / Math.max(maxY - minY, 1);
    const cellX = Math.min(Math.floor(nx * cells), cells - 1);
    const cellY = Math.min(Math.floor(ny * cells), cells - 1);
    occupied[cellY * cells + cellX] = 1;
  }
  let interior = 0;
  let dark = 0;
  for (let y = 1; y < cells - 1; y++)
    for (let x = 1; x < cells - 1; x++) {
      interior += 1;
      if (!occupied[y * cells + x]) dark += 1;
    }
  if (interior === 0) return 0;
  const darkRatio = dark / interior;
  const enoughVoid = smoothstep(darkRatio / 0.22);
  const notEmptyFrame = smoothstep((0.7 - darkRatio) / 0.35);
  const centre = (cells / 2) * cells + cells / 2;
  const centreVoidBonus = occupied[centre] ? 0 : 0.65;
  return Math.min(Math.max(Math.max(enoughVoid * notEmptyFrame, centreVoidBonus), 0), 1);
}

function localGradient(density: Float64Array, size: number, idx: number) {
  const x = idx % size;
  const y = Math.floor(idx / size);
  const centre = density[idx];
  let gradient = 0;
  if (x > 0) gradient = Math.max(gradient, Math.abs(centre - density[idx - 1]));
  if (x + 1 < size) gradient = Math.max(gradient, Math.abs(centre - density[idx + 1]));
  if (y > 0) gradient = Math.max(gradient, Math.abs(centre - density[idx - size]));
  if (y + 1 < size) gradient = Math.max(gradient, Math.abs(centre - density[idx + size]));
  return gradient;
}

/** InkGrid: per-pixel ink, one channel per body. */
class InkGrid {
  readonly size: number;
  readonly ink: Float64Array;

  constructor(size: number) {
    this.size = size;
    this.ink = new Float64Array(size * size * 3);
  }

  deposit(x: number, y: number, body: number, amount: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= this.size || yi >= this.size) return;
    this.ink[(yi * this.size + xi) * 3 + body] += amount;
  }

  /** A line segment splatted by a fixed-step walk. */
  segment(x0: number, y0: number, x1: number, y1: number, body: number, amount: number) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (!Number.isFinite(length)) return;
    const steps = Math.min(Math.max(Math.ceil(length), 1), this.size * 2);
    const inv = 1 / steps;
    for (let i = 0; i <= steps; i++) {
      const t = i * inv;
      this.deposit(x0 + dx * t, y0 + dy * t, body, amount);
    }
  }
}

/**
 * project_to_grid: each body's points (x, y pairs) taken at the grid's sample stride and fitted
 * into the grid with a 4 % margin, or nothing for degenerate geometry.
 */
function projectToGrid(
  bodies: readonly Float64Array[],
  gridSize: number,
  samplesPerBody: number,
): Float64Array[] | null {
  const steps = bodies[0]?.length / 2;
  if (bodies.length < 3 || !(steps >= 2)) return null;
  const stride = Math.max(Math.floor(steps / Math.max(samplesPerBody, 1)), 1);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const body of bodies)
    for (let i = 0; i < body.length / 2; i += stride) {
      const x = body[i * 2];
      const y = body[i * 2 + 1];
      if (Number.isFinite(x) && Number.isFinite(y)) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  const spanX = Math.max(maxX - minX, 1e-12);
  const spanY = Math.max(maxY - minY, 1e-12);
  const margin = 0.04;
  const scale = gridSize * (1 - 2 * margin);
  const offset = gridSize * margin;
  return bodies.map((body) => {
    const count = Math.ceil(body.length / 2 / stride);
    const points = new Float64Array(count * 2);
    for (let i = 0, k = 0; i < body.length / 2; i += stride, k++) {
      points[k * 2] = offset + ((body[i * 2] - minX) / spanX) * scale;
      points[k * 2 + 1] = offset + ((body[i * 2 + 1] - minY) / spanY) * scale;
    }
    return points;
  });
}

/** rasterize: the sampled geometry splatted in each layer's vocabulary, at its alpha. */
function rasterize(points: readonly Float64Array[], stack: LayerStack, gridSize: number) {
  const grid = new InkGrid(gridSize);
  const samples = points[0].length / 2;
  if (samples < 2) return grid;
  const lag = Math.min(Math.max(Math.round(samples * PROXY_CHORD_LAG_FRACTION), 1), samples - 1);
  const x = (body: number, step: number) => points[body][step * 2];
  const y = (body: number, step: number) => points[body][step * 2 + 1];

  const edges = (skip: number | null, amount: number) => {
    for (let step = 0; step < samples; step++)
      for (let edge = 0; edge < 3; edge++) {
        if (skip === edge) continue;
        const from = edge;
        const to = (edge + 1) % 3;
        grid.segment(x(from, step), y(from, step), x(to, step), y(to, step), edge, amount);
      }
  };
  const ribbons = (amount: number) => {
    for (let body = 0; body < 3; body++)
      for (let step = 0; step < samples - 1; step++)
        grid.segment(
          x(body, step),
          y(body, step),
          x(body, step + 1),
          y(body, step + 1),
          body,
          amount,
        );
  };
  const chords = (amount: number) => {
    for (let body = 0; body < 3; body++)
      for (let step = 0; step < samples - lag; step++)
        grid.segment(
          x(body, step),
          y(body, step),
          x(body, step + lag),
          y(body, step + lag),
          body,
          amount,
        );
  };
  const spokes = (amount: number) => {
    for (let step = 0; step < samples; step++) {
      const cx = (x(0, step) + x(1, step) + x(2, step)) / 3;
      const cy = (y(0, step) + y(1, step) + y(2, step)) / 3;
      for (let body = 0; body < 3; body++)
        grid.segment(x(body, step), y(body, step), cx, cy, body, amount);
    }
  };
  // Three interior fill lines approximating the swept gauze.
  const veil = (amount: number) => {
    const lines = 3;
    const lineAmount = amount / lines;
    for (let step = 0; step < samples; step++) {
      const pivot = step % 3;
      const b = (pivot + 1) % 3;
      const c = (pivot + 2) % 3;
      const ax = x(pivot, step);
      const ay = y(pivot, step);
      for (let k = 1; k <= lines; k++) {
        const t = k / (lines + 1);
        const x0 = ax + (x(b, step) - ax) * t;
        const y0 = ay + (y(b, step) - ay) * t;
        const x1 = ax + (x(c, step) - ax) * t;
        const y1 = ay + (y(c, step) - ay) * t;
        grid.segment(x0, y0, x1, y1, pivot, lineAmount);
      }
    }
  };
  // Bowed Bézier chords between the bodies, tessellated coarsely.
  const weave = (amount: number) => {
    const segments = 4;
    const bow = 0.5;
    const segmentAmount = (amount / segments) * 2;
    for (let step = 0; step < samples; step += 2) {
      const cx = (x(0, step) + x(1, step) + x(2, step)) / 3;
      const cy = (y(0, step) + y(1, step) + y(2, step)) / 3;
      for (const [i, j, third] of [
        [0, 1, 2],
        [1, 2, 0],
        [2, 0, 1],
      ]) {
        const controlX = cx + (cx - x(third, step)) * bow;
        const controlY = cy + (cy - y(third, step)) * bow;
        let prevX = x(i, step);
        let prevY = y(i, step);
        for (let s = 1; s <= segments; s++) {
          const t = s / segments;
          const u = 1 - t;
          const px = u * u * x(i, step) + 2 * u * t * controlX + t * t * x(j, step);
          const py = u * u * y(i, step) + 2 * u * t * controlY + t * t * y(j, step);
          grid.segment(prevX, prevY, px, py, i, segmentAmount);
          prevX = px;
          prevY = py;
        }
      }
    }
  };
  // Time-pitched dots: slow passages cluster.
  const stipple = (amount: number) => {
    const pitch = Math.max(Math.floor(samples / 400), 1);
    const dotAmount = amount * pitch * 0.6;
    for (let body = 0; body < 3; body++)
      for (let step = 0; step < samples; step += pitch)
        grid.deposit(x(body, step), y(body, step), body, dotAmount);
  };
  // Velocity-aligned segments centred on each body.
  const tangent = (amount: number) => {
    const half = Math.max(gridSize * 0.025, 1);
    for (let body = 0; body < 3; body++)
      for (let step = 0; step < samples - 1; step++) {
        const x0 = x(body, step);
        const y0 = y(body, step);
        const dx = x(body, step + 1) - x0;
        const dy = y(body, step + 1) - y0;
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length < 1e-9 || !Number.isFinite(length)) continue;
        const ux = (dx / length) * half;
        const uy = (dy / length) * half;
        grid.segment(x0 - ux, y0 - uy, x0 + ux, y0 + uy, body, amount);
      }
  };

  for (const layer of stackLayers(stack)) {
    const amount = layer.alpha;
    switch (layer.vocabulary) {
      case 'triangle_web':
        edges(null, amount);
        break;
      case 'duet':
        edges(Math.min(stack.droppedEdge ?? 0, 2), amount);
        break;
      case 'orbit_ribbons':
        ribbons(amount);
        break;
      case 'spokes':
        spokes(amount);
        break;
      case 'time_chords':
        ribbons(amount * 0.3);
        chords(amount);
        break;
      case 'nebula_veil':
        veil(amount);
        break;
      case 'harmonic_weave':
        weave(amount);
        break;
      case 'stipple_constellation':
        stipple(amount);
        break;
      case 'tangent_caustics':
        tangent(amount);
        break;
    }
  }
  return grid;
}

/** score_grid: the metrics of an inked grid, and their weighted total. */
function scoreGrid(grid: InkGrid, profile: ScoreProfile): ViewScore {
  const { size, ink } = grid;
  const pixels = size * size;
  if (pixels === 0) return zero();
  const totalInk = [0, 0, 0];
  let inked = 0;
  const density = new Float64Array(pixels);
  const densities: number[] = [];
  const occupancy = new Float64Array(BALANCE_CELLS * BALANCE_CELLS);
  const cellSpan = Math.max(size / BALANCE_CELLS, 1);
  for (let idx = 0; idx < pixels; idx++) {
    const value = ink[idx * 3] + ink[idx * 3 + 1] + ink[idx * 3 + 2];
    density[idx] = value;
    if (value <= 0) continue;
    inked += 1;
    densities.push(value);
    for (let body = 0; body < 3; body++) totalInk[body] += ink[idx * 3 + body];
    const cellX = Math.min(Math.floor((idx % size) / cellSpan), BALANCE_CELLS - 1);
    const cellY = Math.min(Math.floor(Math.floor(idx / size) / cellSpan), BALANCE_CELLS - 1);
    occupancy[cellY * BALANCE_CELLS + cellX] += value;
  }
  if (inked === 0) return zero();

  const coverage = inked / pixels;
  const coverageScore = coverageBandScore(coverage);

  // Spatial balance: the normalised entropy of the ink across a 4 × 4 grid of cells.
  let occupancySum = 0;
  for (const value of occupancy) occupancySum += value;
  let balance = 0;
  if (occupancySum > 0) {
    let entropy = 0;
    for (const value of occupancy) {
      if (!(value > 0)) continue;
      const p = value / occupancySum;
      entropy += -p * Math.log(p);
    }
    balance = entropy / Math.log(occupancy.length);
  }

  // Structural contrast: the spread of the log-density distribution.
  densities.sort((a, b) => a - b);
  const percentile = (q: number) =>
    densities[Math.min(Math.round(q * (densities.length - 1)), densities.length - 1)];
  const p50 = Math.max(percentile(0.5), 1e-12);
  const p95 = Math.max(percentile(0.95), 1e-12);
  const contrast = smoothstep(Math.log(p95 / p50) / 2.3);
  const densityScale = Math.max(Math.max(p95, p50), 1e-12);

  // Full-bodied strokes: lit pixels well above the median come from repeated passes.
  const fullnessThreshold = p50 * FULLNESS_DENSITY_FACTOR;
  let thin = 0;
  while (thin < densities.length && densities[thin] < fullnessThreshold) thin++;
  const fullness = smoothstep((densities.length - thin) / densities.length / FULLNESS_SATURATION);

  // Every body should own a visible share of the ink.
  const inkSum = totalInk[0] + totalInk[1] + totalInk[2];
  let minShare = Infinity;
  for (const value of totalInk) minShare = Math.min(minShare, value / Math.max(inkSum, 1e-12));
  const bodyMix = Math.min(smoothstep(minShare / Math.max(BODY_PRESENCE_FLOOR, 1e-12)), 1);

  // Grey mush: bright pixels where all three bodies pile up at similar weights.
  const brightThreshold = percentile(0.6);
  let bright = 0;
  let mush = 0;
  for (let idx = 0; idx < pixels; idx++) {
    const value = ink[idx * 3] + ink[idx * 3 + 1] + ink[idx * 3 + 2];
    if (value <= 0 || value < brightThreshold) continue;
    bright += 1;
    const least = Math.min(Math.min(ink[idx * 3], ink[idx * 3 + 1]), ink[idx * 3 + 2]);
    if (least / value > 0.25) mush += 1;
  }
  const mushFraction = bright > 0 ? mush / bright : 0;
  const mushPenalty = (Math.max(mushFraction - MUSH_TOLERANCE, 0) / (1 - MUSH_TOLERANCE)) * 0.3;

  let lit = 0;
  let veiled = 0;
  let crisp = 0;
  for (let idx = 0; idx < pixels; idx++) {
    if (density[idx] <= 0) continue;
    lit += 1;
    const gradient = localGradient(density, size, idx) / densityScale;
    if (gradient < VEIL_GRADIENT_THRESHOLD) veiled += 1;
    if (gradient > CRISP_GRADIENT_THRESHOLD) crisp += 1;
  }
  const veilFraction = lit > 0 ? veiled / lit : 0;
  const crispness = lit > 0 ? crisp / lit : 0;
  const negativeSpace = negativeSpaceScore(density, size);
  const lushness = Math.min(
    Math.max(
      0.3 * lushCoverageScore(coverage) +
        0.26 * fullness +
        0.2 * negativeSpace +
        0.14 * contrast +
        0.1 * smoothstep(crispness / 0.45),
      0,
    ),
    1,
  );
  const veilPenalty =
    (Math.max(veilFraction - profile.veilTolerance, 0) / (1 - profile.veilTolerance)) *
    profile.veilPenaltyScale;
  const weighted =
    profile.coverage * coverageScore +
    profile.balance * balance +
    profile.contrast * contrast +
    profile.bodyMix * bodyMix +
    profile.crisp * crispness +
    profile.negative * negativeSpace +
    profile.fullness * fullness +
    profile.lushness * lushness;
  const total = Math.min(Math.max(weighted - mushPenalty - veilPenalty, 0), 1);
  return {
    total,
    coverage,
    coverageScore,
    balance,
    contrast,
    bodyMix,
    mushFraction,
    veilFraction,
    crispness,
    negativeSpace,
    fullness,
  };
}

/**
 * score_trajectory: the bodies' points (x, y pairs, one array a body) proxy-rendered in the
 * stack and scored; a zero score for degenerate geometry. The defaults are the view selection's.
 */
export function scoreView(
  bodies: readonly Float64Array[],
  stack: LayerStack,
  { gridSize = VIEW_GRID_SIZE, samplesPerBody = VIEW_SAMPLES_PER_BODY } = {},
): ViewScore {
  const points = projectToGrid(bodies, gridSize, samplesPerBody);
  if (!points) return zero();
  return scoreGrid(rasterize(points, stack, gridSize), profileFor(stack));
}
