import {
  integrator,
  seedBytes,
  seedStream,
  streamAfterSearch,
  type OrbitGeneration,
} from './orbit.ts';
import {
  driftOrientation,
  DriftPath,
  orbitalAxes,
  randomDriftConfig,
  type Drift,
  type DriftConfig,
} from './drift.ts';
import {
  VIEW_SAMPLES_PER_BODY,
  familyOf,
  sameStack,
  scoreView,
  stackLabel,
  type Family,
  type LayerStack,
  type Vocabulary,
} from './view-score.ts';
import {
  PROJECTIONS,
  project,
  rotateBody,
  shoemakeRotation,
  type FrameBox,
  type PlateFrame,
  type Projection,
  type WindowStart,
} from './framing.ts';

/*
  A work's frame, re-derived from its seed (framing.ts says what a frame is). The profile's own
  choices come first, from the main stream's structure roll and the `cosmic-structure/v2` fork
  (visual_profile.rs): the layer stack with its exact alphas, the symmetry and the projection,
  each checked against the trait file's labels. Then the main stream is read on past the Borda
  search to the drift, whose published size, sweep and eccentricity check the stream's position
  to the last bit; then the window is replayed to choose the view, find the drift's ellipse and
  fit the box, as the generator did. About a second in Node, most of it the stream's two million
  draws before the drift; the browser builds nothing from here, it reads the frame's registry.
*/

// ───────────────────────── The profile's choices (visual_profile.rs) ─────────────────────────

const UNDERLAY_PROBABILITY = 0.58;
const ACCENT_PROBABILITY = 0.1;
const WILDCARD_PROBABILITY = 0.07;
const MIRROR_PROBABILITY = 0.03;
const ROTATIONAL_PROBABILITY = 0.07;
const DIHEDRAL_PROBABILITY = 0.05;
const PHASE_PROJECTION_PROBABILITY = 0.18;
/** LAYER_VOCAB_TABLE: the weighted vocabularies a secondary layer is picked from. */
const LAYER_VOCABULARIES: readonly (readonly [Vocabulary, number])[] = [
  ['nebula_veil', 0.18],
  ['triangle_web', 0.08],
  ['orbit_ribbons', 0.16],
  ['time_chords', 0.18],
  ['spokes', 0.05],
  ['stipple_constellation', 0.08],
  ['harmonic_weave', 0.22],
  ['tangent_caustics', 0.05],
];

/** resolve_structure_mode: the preferred primary, from the main stream's seventh draw. */
export function preferredStructure(seed: string): { primary: Vocabulary; droppedEdge?: number } {
  const main = seedStream(seedBytes(seed));
  for (let i = 0; i < 6; i++) main.nextF64();
  const roll = main.nextF64();
  if (roll < 0.07) return { primary: 'triangle_web' };
  if (roll < 0.35) return { primary: 'orbit_ribbons' };
  if (roll < 0.38)
    return { primary: 'duet', droppedEdge: Math.min(Math.floor(main.nextF64() * 3), 2) };
  if (roll < 0.41) return { primary: 'spokes' };
  if (roll < 0.68) return { primary: 'time_chords' };
  if (roll < 0.74) return { primary: 'nebula_veil' };
  if (roll < 0.87) return { primary: 'harmonic_weave' };
  if (roll < 0.94) return { primary: 'stipple_constellation' };
  return { primary: 'tangent_caustics' };
}

/** The first eleven rolls of resolve_extended_rolls, from the `cosmic-structure/v2` fork. */
function structureRolls(seed: string) {
  const fork = seedStream(seedBytes(seed)).fork('cosmic-structure/v2');
  const roll = () => fork.nextF64();
  return {
    wildcardGate: roll(),
    underlayGate: roll(),
    underlayPick: roll(),
    underlayAlpha: roll(),
    accentGate: roll(),
    accentPick: roll(),
    accentAlpha: roll(),
    symmetryRoll: roll(),
    symmetryK: roll(),
    projectionRoll: roll(),
    projectionVariant: roll(),
  };
}

const logLerp = (min: number, max: number, t: number) =>
  Math.exp(Math.log(min) + (Math.log(max) - Math.log(min)) * t);

/** pick_layer_vocabulary: a weighted pick among the vocabularies of other families. */
function pickLayerVocabulary(roll: number, excluded: readonly Family[]): Vocabulary | null {
  const candidates = LAYER_VOCABULARIES.filter(
    ([vocabulary]) => !excluded.includes(familyOf(vocabulary)),
  );
  let total = 0;
  for (const [, weight] of candidates) total += weight;
  if (total <= 0) return null;
  let cursor = Math.min(Math.max(roll, 0), 1) * total;
  for (const [vocabulary, weight] of candidates) {
    cursor -= weight;
    if (cursor <= 0) return vocabulary;
  }
  return candidates.at(-1)?.[0] ?? null;
}

/** The seed's own choices: its preferred stack, whether it is a wildcard, its symmetry, its projection. */
export function profileChoices(seed: string) {
  const structure = preferredStructure(seed);
  const rolls = structureRolls(seed);
  const wildcard = rolls.wildcardGate < WILDCARD_PROBABILITY;
  // resolve_stack
  const stack: LayerStack = { ...structure };
  if (rolls.underlayGate < UNDERLAY_PROBABILITY) {
    const vocabulary = pickLayerVocabulary(rolls.underlayPick, [familyOf(structure.primary)]);
    if (vocabulary)
      stack.underlay = {
        vocabulary,
        alpha: logLerp(0.12, wildcard ? 0.7 : 0.54, rolls.underlayAlpha),
      };
  }
  if (rolls.accentGate < ACCENT_PROBABILITY) {
    const excluded = [familyOf(structure.primary)];
    if (stack.underlay) excluded.push(familyOf(stack.underlay.vocabulary));
    const vocabulary = pickLayerVocabulary(rolls.accentPick, excluded);
    if (vocabulary) stack.accent = { vocabulary, alpha: logLerp(0.05, 0.18, rolls.accentAlpha) };
  }
  // resolve_symmetry
  const none = 1 - MIRROR_PROBABILITY - ROTATIONAL_PROBABILITY - DIHEDRAL_PROBABILITY;
  let symmetry: string;
  if (rolls.symmetryRoll < none) symmetry = 'none';
  else if (rolls.symmetryRoll < none + MIRROR_PROBABILITY) symmetry = 'mirror_x';
  else if (rolls.symmetryRoll < none + MIRROR_PROBABILITY + ROTATIONAL_PROBABILITY)
    symmetry = `rot${2 + Math.min(Math.floor(rolls.symmetryK * 5), 4)}`;
  else symmetry = `dih${[3, 4][Math.floor(rolls.symmetryK * 3)] ?? 6}`;
  // resolve_projection
  let projection: Projection = 'position';
  if (rolls.projectionRoll < PHASE_PROJECTION_PROBABILITY)
    projection =
      rolls.projectionVariant < 0.25
        ? 'phase_portrait'
        : rolls.projectionVariant < 0.75
          ? 'cross_braid'
          : 'hodograph';
  return { stack, wildcard, symmetry, projection };
}

/** adaptive_structure_stacks: the seed's own stack and the curated fallbacks, without repeats. */
export function adaptiveStacks(preferred: LayerStack): LayerStack[] {
  const fallbacks: LayerStack[] = [
    { primary: preferred.primary, droppedEdge: preferred.droppedEdge },
    { primary: 'orbit_ribbons', underlay: { vocabulary: 'harmonic_weave', alpha: 0.29 } },
    { primary: 'time_chords', underlay: { vocabulary: 'harmonic_weave', alpha: 0.24 } },
    { primary: 'orbit_ribbons' },
    { primary: 'time_chords' },
  ];
  const stacks = [preferred];
  for (const fallback of fallbacks)
    if (!stacks.some((stack) => sameStack(stack, fallback))) stacks.push(fallback);
  return stacks;
}

// ───────────────────────── The window, projected (app.rs) ─────────────────────────

/**
 * Every step of a recorded window in its projection, in order: `visit` sees x, y, z of each body
 * (nine numbers, reused between calls) and the step. A phase-space projection's velocity is the
 * forward difference to the next step, and the last step keeps the one before it.
 */
export function eachProjectedStep(
  start: WindowStart,
  projection: Projection,
  velocityScale: number,
  visit: (point: Float64Array, step: number) => void,
) {
  const P = Float64Array.from(start.positions);
  const V = Float64Array.from(start.velocities);
  const advance = integrator(start.masses, P, V, start.dt);
  const point = new Float64Array(9);
  const current = new Float64Array(9);
  const velocity = new Float64Array(9);
  for (let s = 0; s < start.steps; s++) {
    current.set(P);
    if (s + 1 < start.steps) {
      advance();
      if (projection !== 'position')
        for (let i = 0; i < 9; i++) velocity[i] = (P[i] - current[i]) / start.dt;
    }
    project(projection, current, velocity, velocityScale, point);
    visit(point, s);
  }
}

/** apply_projection's velocity scale: the positions' x–y extent over the velocities'. */
export function velocityScaleOf(start: WindowStart): number {
  const range = () => ({ min: Infinity, max: -Infinity });
  const position = [range(), range()];
  const speed = [range(), range()];
  const widen = (into: { min: number; max: number }, value: number) => {
    if (!Number.isFinite(value)) return;
    if (value < into.min) into.min = value;
    if (value > into.max) into.max = value;
  };
  const P = Float64Array.from(start.positions);
  const V = Float64Array.from(start.velocities);
  const advance = integrator(start.masses, P, V, start.dt);
  const previous = new Float64Array(9);
  for (let s = 0; s < start.steps; s++) {
    for (let b = 0; b < 3; b++) {
      widen(position[0], P[b * 3]);
      widen(position[1], P[b * 3 + 1]);
    }
    // The last step's velocity repeats the one before it, so it widens nothing.
    if (s > 0)
      for (let b = 0; b < 3; b++) {
        widen(speed[0], (P[b * 3] - previous[b * 3]) / start.dt);
        widen(speed[1], (P[b * 3 + 1] - previous[b * 3 + 1]) / start.dt);
      }
    previous.set(P);
    if (s + 1 < start.steps) advance();
  }
  const extent = (of: { min: number; max: number }) => Math.max(of.max - of.min, 1e-12);
  const positions = Math.max(extent(position[0]), extent(position[1]));
  const velocities = Math.max(extent(speed[0]), extent(speed[1]));
  return velocities > 1e-12 ? positions / velocities : 1;
}

// ───────────────────────── The view (app.rs) ─────────────────────────

/** The generator weighs this many seeded viewing angles. */
export const VIEW_CANDIDATES = 4;

/** The four Shoemake triples of the seed's `cosmic-view/v1` fork, in the order they are drawn. */
export function viewTriples(seed: string): [number, number, number][] {
  const fork = seedStream(seedBytes(seed)).fork('cosmic-view/v1');
  return Array.from({ length: VIEW_CANDIDATES }, () => [
    fork.nextF64(),
    fork.nextF64(),
    fork.nextF64(),
  ]);
}

/**
 * apply_view_orientation's choice: each triple's rotation of a strided sample of the projected
 * window (`sample`, x, y, z per body per sample) proxy-rendered and scored; the first best wins.
 */
export function chooseView(
  triples: readonly (readonly [number, number, number])[],
  sample: readonly Float64Array[],
  stack: LayerStack,
): { candidate: number; scores: number[] } {
  const scores = triples.map((triple) => {
    const m = shoemakeRotation(triple);
    const bodies = sample.map((points) => {
      const count = points.length / 3;
      const xy = new Float64Array(count * 2);
      for (let i = 0; i < count; i++) {
        const x = points[i * 3];
        const y = points[i * 3 + 1];
        const z = points[i * 3 + 2];
        xy[i * 2] = m[0] * x + m[1] * y + m[2] * z;
        xy[i * 2 + 1] = m[3] * x + m[4] * y + m[5] * z;
      }
      return xy;
    });
    return scoreView(bodies, stack).total;
  });
  let candidate = 0;
  for (let k = 1; k < scores.length; k++) if (scores[k] > scores[candidate]) candidate = k;
  return { candidate, scores };
}

// ───────────────────────── The fit (render/context.rs, utils.rs) ─────────────────────────

/** bounding_box, BoundingBox::from_positions and apply_aspect_correction, from the extremes. */
export function fitBox(
  extremes: { minX: number; maxX: number; minY: number; maxY: number },
  width: number,
  height: number,
): FrameBox {
  let { minX, maxX, minY, maxY } = extremes;
  if (Math.abs(maxX - minX) < 1e-12) {
    minX -= 0.5;
    maxX += 0.5;
  }
  if (Math.abs(maxY - minY) < 1e-12) {
    minY -= 0.5;
    maxY += 0.5;
  }
  const wx = maxX - minX;
  const wy = maxY - minY;
  minX -= 0.05 * wx;
  maxX += 0.05 * wx;
  minY -= 0.05 * wy;
  maxY += 0.05 * wy;
  let boxWidth = Math.max(maxX - minX, 1e-12);
  let boxHeight = Math.max(maxY - minY, 1e-12);
  if (height !== 0 && boxHeight >= 1e-12) {
    const target = width / height;
    const aspect = boxWidth / boxHeight;
    if (aspect < target) {
      const wider = boxHeight * target;
      const pad = (wider - boxWidth) * 0.5;
      minX -= pad;
      maxX += pad;
      boxWidth = wider;
    } else if (aspect > target) {
      const taller = boxWidth / target;
      const pad = (taller - boxHeight) * 0.5;
      minY -= pad;
      maxY += pad;
      boxHeight = taller;
    }
  }
  return { minX, maxX, minY, maxY, width: boxWidth, height: boxHeight };
}

/** The drift's ellipse and the box, for one view of a projected window: two more passes. */
function fitView(
  start: WindowStart,
  projection: Projection,
  velocityScale: number,
  view: readonly [number, number, number],
  config: DriftConfig,
  orientation: Drift['orientation'],
  width: number,
  height: number,
): { drift: Drift; box: FrameBox } {
  const rotation = shoemakeRotation(view);
  const viewed = new Float64Array(9);
  // orbital_axes: the viewed orbit's extent on every axis.
  const low = [Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE];
  const high = [-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE];
  eachProjectedStep(start, projection, velocityScale, (point) => {
    for (let b = 0; b < 3; b++) {
      rotateBody(rotation, point, b, viewed);
      for (let k = 0; k < 3; k++) {
        const value = viewed[b * 3 + k];
        if (value < low[k]) low[k] = value;
        if (value > high[k]) high[k] = value;
      }
    }
  });
  const axes = orbitalAxes([high[0] - low[0], high[1] - low[1], high[2] - low[2]], config);
  const drift: Drift = { config, orientation, ...axes };
  // The fit: every drifted step of every body.
  const path = new DriftPath(drift, start.steps, start.dt);
  const offset = new Float64Array(3);
  const extremes = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  eachProjectedStep(start, projection, velocityScale, (point, step) => {
    path.offset(step, offset);
    for (let b = 0; b < 3; b++) {
      rotateBody(rotation, point, b, viewed);
      const x = viewed[b * 3] + offset[0];
      const y = viewed[b * 3 + 1] + offset[1];
      if (x < extremes.minX) extremes.minX = x;
      if (x > extremes.maxX) extremes.maxX = x;
      if (y < extremes.minY) extremes.minY = y;
      if (y > extremes.maxY) extremes.maxY = y;
    }
  });
  return { drift, box: fitBox(extremes, width, height) };
}

// ───────────────────────── A frame, derived ─────────────────────────

/** What a trait file states about how its work was framed. */
export interface FramingTraits {
  projection: string;
  symmetry: string;
  /** The chosen stack and the seed's own, as labels with their alphas to two places. */
  stack: string;
  preferredStack: string;
  wildcard: boolean;
  drift: { enabled: boolean; mode: string } & DriftConfig;
  width: number;
  height: number;
}

/** One derived value beside the trait file's. */
export interface FrameCheck {
  key: string;
  derived: string;
  published: string;
  exact: boolean;
}

export interface DerivedFrame {
  frame: PlateFrame;
  stack: LayerStack;
  view: { candidate: number; triples: [number, number, number][]; scores: number[] };
  checks: FrameCheck[];
  /** With `everyView`, the window framed from each of the four candidates, in their order. */
  views?: PlateFrame[];
}

const check = (key: string, derived: unknown, published: unknown): FrameCheck => ({
  key,
  derived: String(derived),
  published: String(published),
  exact: Object.is(derived, published),
});

/**
 * A work's frame re-derived from its seed and its recorded window's first state, every choice
 * checked against the trait file; a choice that differs refuses the frame. With `everyView` the
 * window is framed from all four candidates too, so a build can show how far the film's own
 * frame stands from the views the generator passed over.
 */
export function deriveFrame(
  generation: Pick<OrbitGeneration, 'seed' | 'candidatesPerAttempt' | 'weightsRandomized'>,
  start: WindowStart,
  traits: FramingTraits,
  { everyView = false }: { everyView?: boolean } = {},
): DerivedFrame {
  const choices = profileChoices(generation.seed);
  const projection = PROJECTIONS.find((name) => name === traits.projection);
  // The stack the aesthetic selection chose, by its label among the seed's candidates.
  const stacks = adaptiveStacks(choices.stack).filter(
    (stack) => stackLabel(stack) === traits.stack,
  );
  const checks = [
    check('preferredStack', stackLabel(choices.stack), traits.preferredStack),
    check('stack', stacks.length ? traits.stack : null, traits.stack),
    check('wildcard', choices.wildcard, traits.wildcard),
    check('symmetry', choices.symmetry, traits.symmetry),
    check('projection', choices.projection, projection ?? null),
    // Only the elliptical drift is ported, the one every collection work was drawn with.
    check('drift', traits.drift.enabled ? traits.drift.mode : 'none', 'elliptical'),
  ];
  const main = streamAfterSearch(generation);
  const config = randomDriftConfig(main);
  checks.push(
    check('driftScale', config.scale, traits.drift.scale),
    check('driftArcFraction', config.arcFraction, traits.drift.arcFraction),
    check('driftEccentricity', config.eccentricity, traits.drift.eccentricity),
  );
  const failed = checks.filter((row) => !row.exact);
  if (failed.length || !projection)
    throw new Error(`The frame is not derived: ${failed.map((row) => row.key).join(', ')} differ`);
  const orientation = driftOrientation(main);
  const velocityScale = projection === 'position' ? 1 : velocityScaleOf(start);

  // apply_view_orientation scores a strided copy of the projected window.
  const stride = Math.max(Math.floor(start.steps / VIEW_SAMPLES_PER_BODY), 1);
  const count = Math.ceil(start.steps / stride);
  const sample = [0, 1, 2].map(() => new Float64Array(count * 3));
  eachProjectedStep(start, projection, velocityScale, (point, step) => {
    if (step % stride !== 0) return;
    for (let b = 0; b < 3; b++)
      sample[b].set(point.subarray(b * 3, b * 3 + 3), (step / stride) * 3);
  });
  const triples = viewTriples(generation.seed);
  // Every stack that carries the published label must choose the same view.
  const chosen = stacks.map((stack) => chooseView(triples, sample, stack));
  if (chosen.some((choice) => choice.candidate !== chosen[0].candidate))
    throw new Error('The stacks that carry the published label choose different views');
  const { candidate, scores } = chosen[0];
  const frameFrom = (view: readonly [number, number, number]): PlateFrame => ({
    width: traits.width,
    height: traits.height,
    projection,
    velocityScale,
    view,
    ...fitView(
      start,
      projection,
      velocityScale,
      view,
      config,
      orientation,
      traits.width,
      traits.height,
    ),
    symmetry: traits.symmetry,
  });
  const views = everyView ? triples.map(frameFrom) : undefined;
  return {
    frame: views?.[candidate] ?? frameFrom(triples[candidate]),
    stack: stacks[0],
    view: { candidate, triples, scores },
    checks,
    ...(views && { views }),
  };
}
