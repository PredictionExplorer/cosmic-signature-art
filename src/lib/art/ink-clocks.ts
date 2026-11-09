import { z } from 'zod';
import data from './ink-clocks.json' with { type: 'json' };
import { workOrbit } from './orbit-records';
import type { InkClock } from '@/lib/physics/film-score';

/**
 * Each work's complete Ink film on its own clock (scripts/build-ink-clocks.mjs,
 * third-physics-phase-e.md §6). The Ink film shows the Light film's checkpoints frame for frame
 * and lays its first ink at `firstInked`, bare paper before it (src/lib/physics/ink-film.ts).
 * Each entry was checked against the work's published Ink certificate and the published film,
 * and names, by hash, every film found to keep the clock: the published film and each derivative
 * the plate plays in its place. The score is drawn on an Ink film only when it is one of those.
 *
 * An entry binds to its work only while the orbit record's seed and trait file hash agree; a
 * stale one is dropped, and the Ink film keeps its plain time line. Server side.
 */
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const decimal = z.string().regex(/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/);
const count = z.number().int().nonnegative();
const entrySchema = z.object({
  id: count,
  seed: z.string().regex(/^0x[a-f0-9]{64}$/),
  traitsSha256: hash,
  certificate: z.object({ sha256: hash, algorithm: z.string().regex(/^ember-v\d+$/) }),
  steps: count,
  frames: count,
  scheduleSha256: hash,
  duration: decimal,
  preRoll: decimal,
  valveLead: decimal,
  firstInked: count,
  film: z.object({ sha256: hash, bytes: count }),
  derivatives: z.array(
    z.object({
      kind: z.enum(['settling', 'opening', 'local']),
      src: z.string().regex(/^\/art\/[a-z0-9/._-]+\.mp4$/),
      sha256: hash,
      start: count,
      every: z.number().int().positive(),
      frames: count,
    }),
  ),
  measured: z.object({
    firstInk: count,
    bodies: count,
    hollows: count,
    offset: z.number().finite(),
    distance: z.array(z.number().finite()).length(3),
  }),
});
export type InkClockEntry = z.infer<typeof entrySchema>;
const registrySchema = z.object({
  schemaVersion: z.literal(1),
  derivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  parameters: z.object({}).passthrough(),
  clocks: z.array(entrySchema),
});

/** The committed clocks must parse; a malformed file fails the build rather than the page. */
export function loadInkClocks(raw: unknown): Map<number, InkClockEntry> {
  const parsed = registrySchema.safeParse(raw);
  if (!parsed.success)
    throw new Error('src/lib/art/ink-clocks.json is malformed; run `npm run art:ink`');
  return new Map(parsed.data.clocks.map((entry) => [entry.id, entry]));
}

/** An entry bound to its work's orbit record, as the viewer reads it; nothing when they differ. */
export function bindInkClock(entry: InkClockEntry | undefined, id: number): InkClock | undefined {
  const orbit = workOrbit(id);
  if (!entry || !orbit) return undefined;
  if (
    entry.seed !== orbit.generation.seed ||
    entry.traitsSha256 !== orbit.traitsSha256 ||
    entry.steps !== orbit.generation.steps ||
    entry.firstInked >= entry.frames
  )
    return undefined;
  return {
    firstInked: entry.firstInked,
    films: [entry.film.sha256, ...entry.derivatives.map((derivative) => derivative.sha256)],
  };
}

const clocks = loadInkClocks(data);

/** A work's Ink film's clock, where the venue checked it against the film. */
export function inkClock(id: number): InkClock | undefined {
  return bindInkClock(clocks.get(id), id);
}
