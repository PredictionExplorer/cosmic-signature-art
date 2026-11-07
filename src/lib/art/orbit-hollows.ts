import { z } from 'zod';
import data from './orbit-hollows.json' with { type: 'json' };
import { workOrbit } from './orbit-records';
import { frameFilmSha256 } from './orbit-frames';
import type { ArtInterpretation } from './types';

/**
 * Where each body came to rest on its work's Ink still (scripts/build-orbit-hollows.mjs). The Ink
 * edition stirs its sumi with the bodies where the Light film draws them, so a work's frame
 * places them on the Ink sheet as well; each body holds no ink and leaves a hollow where it
 * stood when the window ended. An Ink still that bears its bodies out lets the orbit section
 * draw on the Ink plate as on the Light (third-physics-phase-d.md §7).
 *
 * An entry binds to its work only while the orbit record's seed and trait file hash, the film
 * the frame was measured against, and the Ink still's hash all agree; a stale one is dropped,
 * and the section draws the orbit in its own plane instead. Server side.
 */
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const share = z.number().finite().nonnegative();
const bodySchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  paper: z.boolean(),
  hollow: z.object({ offset: share, radius: share }).nullable(),
});
const entrySchema = z.object({
  id: z.number().int().nonnegative(),
  seed: z.string().regex(/^0x[a-f0-9]{64}$/),
  traitsSha256: hash,
  filmSha256: hash,
  ink: z.object({
    stillSha256: hash,
    rung: z.object({
      src: z.string().regex(/^\/art\/stills\/\d+-ink-\d+-[a-f0-9]{16}\.webp$/),
      sha256: hash,
    }),
  }),
  step: z.number().int().nonnegative(),
  bodies: z.array(bodySchema).length(3),
});
export type HollowEntry = z.infer<typeof entrySchema>;
const registrySchema = z.object({
  schemaVersion: z.literal(1),
  derivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  parameters: z
    .object({
      hollow: z
        .object({
          accept: z.object({ radius: z.tuple([share, share]), offset: share }),
        })
        .passthrough(),
    })
    .passthrough(),
  hollows: z.array(entrySchema),
});
type Accept = z.infer<typeof registrySchema>['parameters']['hollow']['accept'];

/** The committed hollows must parse; a malformed file fails the build rather than the page. */
export function loadOrbitHollows(raw: unknown): {
  accept: Accept;
  entries: Map<number, HollowEntry>;
} {
  const parsed = registrySchema.safeParse(raw);
  if (!parsed.success)
    throw new Error('src/lib/art/orbit-hollows.json is malformed; run `npm run art:hollows`');
  return {
    accept: parsed.data.parameters.hollow.accept,
    entries: new Map(parsed.data.hollows.map((entry) => [entry.id, entry])),
  };
}

/**
 * Whether a still bears out its bodies' places: every body stands on paper, since a body holds
 * no ink, and at least one in a hollow of its own, a body's size and centred on its place.
 */
export function bearsOut(entry: HollowEntry, accept: Accept): boolean {
  const own = ({ hollow }: HollowEntry['bodies'][number]) =>
    !!hollow &&
    hollow.radius >= accept.radius[0] &&
    hollow.radius <= accept.radius[1] &&
    hollow.offset <= accept.offset;
  return entry.bodies.every((body) => body.paper) && entry.bodies.some(own);
}

/**
 * Whether an entry binds to its work: the orbit record and the frame's film are the ones it
 * was measured with, the Ink still on view is the one it read, and the still bears it out.
 */
export function bindHollows(
  entry: HollowEntry | undefined,
  id: number,
  ink: Pick<ArtInterpretation, 'stillSha256'> | undefined,
  { accept, filmSha256 }: { accept: Accept; filmSha256: string | undefined },
): boolean {
  const orbit = workOrbit(id);
  if (!entry || !orbit || !ink?.stillSha256 || !filmSha256) return false;
  if (entry.seed !== orbit.generation.seed || entry.traitsSha256 !== orbit.traitsSha256)
    return false;
  if (entry.filmSha256 !== filmSha256 || entry.ink.stillSha256 !== ink.stillSha256) return false;
  return bearsOut(entry, accept);
}

const { accept, entries } = loadOrbitHollows(data);

/** Whether the orbit can be drawn on a work's Ink plate, where its bodies came to rest. */
export function inkBearsOrbit(id: number, ink?: Pick<ArtInterpretation, 'stillSha256'>): boolean {
  return bindHollows(entries.get(id), id, ink, { accept, filmSha256: frameFilmSha256(id) });
}
