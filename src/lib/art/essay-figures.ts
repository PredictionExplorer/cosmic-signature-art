import { z } from 'zod';
import data from './essay-figures.json' with { type: 'json' };
import { workOrbit } from './orbit-records';

/**
 * The essay's figures (the Process page): every number its words state about the venue's own
 * works, re-derived from the committed registries by scripts/build-essay-figures.mjs with the
 * modules the pages themselves run. Nothing here is published by the generator, and nothing is
 * compared with a record: these are the venue's own measures of the published orbits.
 *
 * - **Of the collection:** the clock every record shares, the integrator's weights, how the
 *   energy fared, how the twins fared, what the computation finds past the record's horizon,
 *   and what the Ink certificates agree on.
 * - **Of each work:** its twin one part in a trillion away, each pair of its bodies taken
 *   alone, its bodies on its Ink sheet, and what its Ink certificate says of its making.
 *
 * An entry binds to its orbit record by the seed. Server side: about 200 KB.
 */
const finite = z.number().finite();
const count = z.number().int().nonnegative();
const positive = finite.positive();
const share = finite.min(0).max(1);
const ids = z.array(count);
const body = count.max(2);
const spread = z.object({ least: finite, median: finite, most: finite });
/** A measure taken every `every` steps from a window's first. */
const series = z.object({ every: count.positive(), values: z.array(finite.nonnegative()) });
const fate = z.object({
  outcome: z.enum(['eternal_dance', 'ejection']),
  escaper: body.nullable(),
  ejectionStep: count.nullable(),
  /** The step at which the venue's energy watch found the energy lost, if it did. */
  energyBroken: count.nullable(),
});
const pair = z.object({
  pair: z.tuple([body, body]),
  bound: z.boolean(),
  eccentricity: finite.nonnegative(),
  /** The conic's size, closed or open, in the generator's units. */
  semiLatus: finite.nonnegative(),
  /** Where the pair stands on it: the angle from its nearest approach, positive drawing apart. */
  anomaly: finite.min(-Math.PI).max(Math.PI),
  /** In the generator's units; nothing for a pair that is not bound. */
  semiMajor: positive.nullable(),
  /** In the generator's units of time. */
  period: positive.nullable(),
});
const ink = z.object({
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  algorithm: z.string().regex(/^ember-v\d+$/),
  reynolds: positive,
  bodyRadius: positive,
  maxAspect: finite.min(1),
  preRoll: finite.nonnegative(),
  holdFraction: share,
  fadeFraction: share,
  supersample: count.positive(),
  fluidGrid: z.tuple([count.positive(), count.positive()]),
  inkGrid: z.tuple([count.positive(), count.positive()]),
  fluidSteps: count.positive(),
  threads: count.positive(),
  seconds: positive,
});
const workSchema = z.object({
  id: count,
  seed: z.string().regex(/^0x[a-f0-9]{64}$/),
  twin: z.object({
    /** The first step at which the twin stood three pixels from the work on the plate. */
    parted: count.nullable(),
    /** Steps the gap takes to double, fitted while it grows from 10⁻¹¹ to 10⁻³. */
    doubling: positive,
    until: count,
    gapAtWindowEnd: finite.nonnegative(),
    gaps: series,
    fate,
    sameFate: z.boolean(),
    sameOutcome: z.boolean(),
  }),
  pairs: z.tuple([pair, pair, pair]),
  sheet: z.object({
    /** The bodies from the left of the sheet to the right at the window's first step. */
    startOrder: z.tuple([body, body, body]),
    /** Each change of places: 1 or 2 for the pair, negative for the opposite sense. */
    word: z.array(z.union([z.literal(1), z.literal(-1), z.literal(2), z.literal(-2)])),
    closestInDiameters: finite.nonnegative(),
    overlapShare: share,
    insideShare: share,
    crossings: count,
    stretch: finite.min(1),
  }),
  /** The work's own fate looked for past the record's horizon; only for a work bound there. */
  beyond: fate.nullable(),
  ink,
});
const registrySchema = z.object({
  schemaVersion: z.literal(1),
  clock: z.object({
    dt: positive,
    steps: count.positive(),
    warmupSteps: count,
    horizonSteps: count.positive(),
    candidates: count.positive(),
    retries: count,
    escapeThreshold: finite,
    checkInterval: count.positive(),
    hysteresis: count.positive(),
    gravitationalConstant: positive,
    film: z.object({
      frames: count.positive(),
      framesPerSecond: count.positive(),
      seconds: positive,
      stepsPerFrame: count.positive(),
      stepsPerSecond: count.positive(),
    }),
  }),
  fates: z.object({ ejection: count, boundAtHorizon: count }),
  integrator: z.object({ w1: positive, w0: finite.negative(), sum: positive }),
  beginnings: z.object({
    of: count,
    mass: z.object({ least: positive, most: positive }),
    place: z.object({ least: finite, most: finite }),
    velocity: z.object({ least: finite, most: finite }),
  }),
  energy: z.object({
    heldWithin: positive,
    kept: ids,
    lost: ids,
    lostInsideWindow: ids,
    lostEjections: ids,
    lostDances: ids,
    /** The two works whose energy the essay draws: one held, one lost at a near miss. */
    heldExample: z.object({ id: count, windowChange: finite.nonnegative(), series }),
    lostExample: z.object({
      id: count,
      step: count.positive(),
      change: positive,
      closest: positive,
      pass: z.object({
        step: count,
        distance: positive,
        pair: z.tuple([body, body]),
        travel: positive,
        travelInGaps: positive,
        passes: count,
        /** The step at which the replay stopped and `energyAfter` was read. */
        until: count.positive(),
        energyBefore: finite,
        energyAfter: finite,
      }),
      /** The example is an ejection the record dates: the body and the step. */
      ejected: z.object({ body, step: count.positive() }),
      series,
    }),
  }),
  twins: z.object({
    nudge: positive,
    parted: count,
    partedInsideWindow: count,
    measured: count,
    doublingSteps: spread,
    doublingSeconds: spread,
    differentFate: ids,
    differentOutcome: ids,
    differentBody: ids,
    clean: z.object({ works: count, differ: count, outcome: count }),
  }),
  past: z.object({
    steps: count.positive(),
    bound: count,
    looked: count,
    lostABody: ids,
    stillThree: ids,
    energyBroken: ids,
    clean: z.object({ runs: count, lost: count, still: count, earliest: count }),
  }),
  sheets: z.object({
    overlapAtSomeTime: ids,
    centreInsideAnother: ids,
    overlapShare: spread,
    plaitForcesNothing: ids,
    plaitDoublings: spread,
    crossings: spread,
  }),
  pictures: z.object({ positions: count, otherSpace: count, symmetry: count }),
  plait: z.object({ pigtail: finite.min(1), plain: finite.min(1) }),
  ink: z.object({
    shared: z.object({
      reynolds: positive,
      bodyRadius: positive,
      maxAspect: finite.min(1),
      preRoll: finite.nonnegative(),
      holdFraction: share,
      fadeFraction: share,
      supersample: count.positive(),
    }),
    opens: z.object({ frames: spread, seconds: spread }),
  }),
  traits: z.object({ syzygies: spread, chaos: spread, braidCrossings: spread }),
  works: z.array(workSchema),
});

export type EssayFigures = Omit<z.infer<typeof registrySchema>, 'works'>;
export type EssayWork = z.infer<typeof workSchema>;

/**
 * The committed figures must parse, must be a complete run (the look past the horizon and every
 * Ink certificate: `npm run art:essay -- --beyond --online`) and must count every work once;
 * else the build fails, not the page.
 */
export function loadEssayFigures(raw: unknown): {
  figures: EssayFigures;
  works: Map<number, EssayWork>;
} {
  const parsed = registrySchema.safeParse(raw);
  if (!parsed.success)
    throw new Error(
      'src/lib/art/essay-figures.json is malformed or partial; run `npm run art:essay -- --beyond --online`',
    );
  const { works, ...figures } = parsed.data;
  const byId = new Map(works.map((work) => [work.id, work]));
  if (byId.size !== works.length)
    throw new Error('src/lib/art/essay-figures.json names a work twice; run `npm run art:essay`');
  return { figures, works: byId };
}

const loaded = loadEssayFigures(data);

/** What the essay states of the whole collection. */
export const essayFigures: EssayFigures = loaded.figures;

/** How many works the figures count: every work with an orbit record when they were derived. */
export const essayWorkCount = loaded.works.size;

/** An entry bound to its orbit record by the seed, or nothing when the two no longer agree. */
export function bindEssayWork(entry: EssayWork | undefined, id: number): EssayWork | undefined {
  const orbit = workOrbit(id);
  if (!entry || !orbit || entry.seed !== orbit.generation.seed) return undefined;
  return entry;
}

/** What the essay states of one work; nothing for a work without a record or a measure. */
export function essayWork(id: number): EssayWork | undefined {
  return bindEssayWork(loaded.works.get(id), id);
}
