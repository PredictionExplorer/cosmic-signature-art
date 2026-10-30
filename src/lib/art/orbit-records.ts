import { z } from 'zod';
import data from './orbit-records.json' with { type: 'json' };
import type { OrbitGeneration, PublishedPhysics } from '@/lib/physics/orbit';

/**
 * The orbit beneath every work, as its published trait file states it
 * (scripts/build-orbit-records.mjs): the inputs that chose it and the measurements made of it.
 * The build writes a record only after src/lib/physics/orbit.ts has re-derived the orbit from
 * the seed and matched every measurement exactly; the page hands one work's record to the
 * browser, which derives it again and shows the comparison. Server side: about 100 KB.
 *
 * Measured doubles travel as their exact decimal strings and become numbers here, by Number(),
 * which ECMAScript defines as correctly rounded; the bundler's JSON loader does not round-trip
 * every double (124.96327743951707 compiled to …709).
 */
const finite = z.number().finite();
const count = z.number().int().nonnegative();
const decimal = z
  .string()
  .regex(/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/)
  .transform(Number)
  .pipe(finite);
const recordSchema = z.object({
  id: count,
  seed: z.string().regex(/^0x[a-f0-9]{64}$/),
  traitsSha256: z.string().regex(/^[a-f0-9]{64}$/),
  pipelineVersion: z.string().max(40),
  generation: z.object({
    candidatesPerAttempt: z.number().int().positive(),
    selectedIndex: count,
    retryCount: count.max(16),
    weightsRandomized: z.boolean(),
    integrator: z.literal('yoshida4'),
    dt: decimal.pipe(finite.positive()),
    steps: z.number().int().positive(),
    warmupSteps: count,
  }),
  physics: z.object({
    masses: z.tuple([
      decimal.pipe(finite.positive()),
      decimal.pipe(finite.positive()),
      decimal.pipe(finite.positive()),
    ]),
    totalEnergy: decimal,
    angularMomentum: decimal,
    closestApproach: z.object({
      distance: decimal.pipe(finite.positive()),
      pair: z.tuple([count.max(2), count.max(2)]),
      step: count,
    }),
    syzygyCount: count,
    braid: z.object({
      word: z.string().regex(/^(?:s[12]'?(?: s[12]'?)*)?$/),
      crossings: count,
      truncated: z.boolean(),
    }),
  }),
  fate: z.object({
    outcome: z.enum(['eternal_dance', 'ejection']),
    escaper: count.max(2).nullable(),
    ejectionStep: count.nullable(),
    horizonSteps: count,
  }),
  bodyHues: z.tuple([finite.min(0).lt(360), finite.min(0).lt(360), finite.min(0).lt(360)]),
});
const registrySchema = z.object({
  schemaVersion: z.literal(1),
  readOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  records: z.array(recordSchema),
});

export type OrbitRecord = z.infer<typeof recordSchema>;

/** Everything the orbit section needs about one work, and nothing about the others. */
export interface WorkOrbit {
  id: number;
  generation: OrbitGeneration;
  published: PublishedPhysics;
  fate: OrbitRecord['fate'];
  bodyHues: [number, number, number];
}

/** The committed registry must parse; a malformed one fails the build rather than the page. */
export function loadOrbitRecords(raw: unknown): Map<number, OrbitRecord> {
  const parsed = registrySchema.safeParse(raw);
  if (!parsed.success)
    throw new Error('src/lib/art/orbit-records.json is malformed; run `npm run art:orbits`');
  return new Map(parsed.data.records.map((record) => [record.id, record]));
}

const records = loadOrbitRecords(data);

export function workOrbit(id: number): WorkOrbit | undefined {
  const record = records.get(id);
  if (!record) return undefined;
  return {
    id: record.id,
    generation: {
      seed: record.seed,
      candidatesPerAttempt: record.generation.candidatesPerAttempt,
      selectedIndex: record.generation.selectedIndex,
      retryCount: record.generation.retryCount,
      weightsRandomized: record.generation.weightsRandomized,
      dt: record.generation.dt,
      steps: record.generation.steps,
      warmupSteps: record.generation.warmupSteps,
      masses: record.physics.masses,
    },
    published: record.physics,
    fate: record.fate,
    bodyHues: record.bodyHues,
  };
}
