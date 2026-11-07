import { z } from 'zod';
import data from './orbit-frames.json' with { type: 'json' };
import { workOrbit } from './orbit-records';
import type { ArtInterpretation } from './types';
import { PROJECTIONS, type PlateFrame } from '@/lib/physics/framing';

/**
 * Where each work's recorded window falls on its Light film (scripts/build-orbit-frames.mjs):
 * the view the generator chose, its camera's drift and the fit, re-derived from the seed by
 * src/lib/physics/frame-derivation.ts, checked against every choice the trait file states, and
 * kept only because its bodies stand where the published film gains light, frame by frame, far
 * more often than any other view's. With it the Overture's bodies draw the plate itself.
 *
 * A frame binds to its work only while the orbit record's seed and trait file hash agree and,
 * where the Light interpretation advertises its film, the film's hash too; a stale frame is
 * dropped, never drawn, and the Overture falls back to its score beside the plate. Doubles
 * travel as their exact decimal strings and become numbers here, by Number(). Server side.
 */
const decimal = z
  .string()
  .regex(/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/)
  .transform(Number)
  .pipe(z.number().finite());
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const share = z.number().min(0).max(1);
const entrySchema = z.object({
  id: z.number().int().nonnegative(),
  seed: z.string().regex(/^0x[a-f0-9]{64}$/),
  traitsSha256: hash,
  projection: z.enum(PROJECTIONS),
  symmetry: z.string().regex(/^(?:none|mirror_x|(?:rot|dih)[1-9]\d?)$/),
  stack: z.string().min(1),
  preferredStack: z.string().min(1),
  wildcard: z.boolean(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  view: z.object({
    candidate: z.number().int().min(0).max(3),
    triple: z.tuple([decimal, decimal, decimal]),
    scores: z.array(decimal).length(4),
  }),
  velocityScale: decimal,
  drift: z.object({
    scale: decimal,
    arcFraction: decimal,
    eccentricity: decimal,
    inclination: decimal,
    ascendingNode: decimal,
    argumentOfPeriapsis: decimal,
    initialMeanAnomaly: decimal,
    semiMajor: decimal,
    semiMinor: decimal,
  }),
  box: z.object({
    minX: decimal,
    maxX: decimal,
    minY: decimal,
    maxY: decimal,
    width: decimal,
    height: decimal,
  }),
  film: z.object({
    sha256: hash,
    frames: z.number().int().positive(),
    agreement: share,
    otherViews: share,
  }),
  trace: z.object({
    src: z.string().regex(/^\/art\/traces\/\d+-light-[a-f0-9]{16}\.webp$/),
    sha256: hash,
    bytes: z
      .number()
      .int()
      .positive()
      .max(256 * 1024),
    agreement: share,
    otherViews: share,
  }),
});
export type FrameEntry = z.infer<typeof entrySchema>;
const registrySchema = z.object({
  schemaVersion: z.literal(1),
  derivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  parameters: z.object({}).passthrough(),
  frames: z.array(entrySchema),
});

/** The committed frames must parse; a malformed file fails the build rather than the page. */
export function loadOrbitFrames(raw: unknown): Map<number, FrameEntry> {
  const parsed = registrySchema.safeParse(raw);
  if (!parsed.success)
    throw new Error('src/lib/art/orbit-frames.json is malformed; run `npm run art:frames`');
  return new Map(parsed.data.frames.map((entry) => [entry.id, entry]));
}

/** An entry as framing.ts draws with it. */
export function frameOf(entry: FrameEntry): PlateFrame {
  const { drift } = entry;
  return {
    width: entry.width,
    height: entry.height,
    projection: entry.projection,
    velocityScale: entry.velocityScale,
    view: entry.view.triple,
    drift: {
      config: {
        scale: drift.scale,
        arcFraction: drift.arcFraction,
        eccentricity: drift.eccentricity,
      },
      orientation: {
        inclination: drift.inclination,
        ascendingNode: drift.ascendingNode,
        argumentOfPeriapsis: drift.argumentOfPeriapsis,
        initialMeanAnomaly: drift.initialMeanAnomaly,
      },
      semiMajor: drift.semiMajor,
      semiMinor: drift.semiMinor,
    },
    box: entry.box,
    symmetry: entry.symmetry,
  };
}

/**
 * A frame bound to its work: nothing when its record or, where the Light interpretation names
 * its film, the film it was measured against no longer agree.
 */
export function bindFrame(
  entry: FrameEntry | undefined,
  id: number,
  light?: Pick<ArtInterpretation, 'films'>,
): PlateFrame | undefined {
  const orbit = workOrbit(id);
  if (!entry || !orbit) return undefined;
  if (entry.seed !== orbit.generation.seed || entry.traitsSha256 !== orbit.traitsSha256)
    return undefined;
  const film = light?.films.find((candidate) => candidate.id === 'normal');
  if (film && film.sourceSha256 !== entry.film.sha256) return undefined;
  if (!(entry.box.width > 0 && entry.box.height > 0)) return undefined;
  return frameOf(entry);
}

const frames = loadOrbitFrames(data);

/** A work's frame on its Light film, or nothing without one that still binds. */
export function plateFrame(
  id: number,
  light?: Pick<ArtInterpretation, 'films'>,
): PlateFrame | undefined {
  return bindFrame(frames.get(id), id, light);
}

/** The Light film a work's frame was measured against: what anything placed by the frame binds to. */
export function frameFilmSha256(id: number): string | undefined {
  return frames.get(id)?.film.sha256;
}
