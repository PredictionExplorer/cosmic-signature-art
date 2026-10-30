import { z } from 'zod';
import registry from './arrival-maps.json' with { type: 'json' };
import { isExpression, type ArtInterpretation, type Artwork } from './types';

/**
 * The arrival maps (scripts/build-arrival-maps.mjs): when each part of a still first arrived in
 * its published film, normalised to 0–255 in a lossless 576 × 372 WebP of a few kilobytes. A map
 * binds to an interpretation only when the token, seed and still hash agree, and, where the
 * interpretation advertises its film, the hash of the film it was measured from agrees too (the
 * local archive keeps some stills without their films); a stale map is dropped, never used.
 * Server side only.
 */
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const entrySchema = z.object({
  id: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  seed: z.string().regex(/^0x[a-f0-9]{64}$/),
  expression: z.enum(['ink', 'light']),
  src: z.string().regex(/^\/art\/arrival\/[0-9]+-(?:ink|light)-[a-f0-9]{16}\.webp$/),
  sha256: hash,
  bytes: z
    .number()
    .int()
    .positive()
    .max(256 * 1024),
  width: z.literal(576),
  height: z.literal(372),
  sourceSha256: hash,
  stillSha256: hash,
  frames: z.number().int().positive(),
  figureShare: z.number().min(0).max(1),
});
type Entry = z.infer<typeof entrySchema>;
const registrySchema = z.object({
  schemaVersion: z.literal(1),
  measuredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  parameters: z.object({ spread: z.number().positive().max(4) }).passthrough(),
  maps: z.array(entrySchema),
});

export function createArrivalLookup(raw: unknown) {
  const parsed = registrySchema.safeParse(raw);
  const entries = new Map<string, Entry>();
  const spread = parsed.success ? parsed.data.parameters.spread : 0;
  if (parsed.success) {
    const duplicates = new Set<string>();
    for (const entry of parsed.data.maps) {
      const key = `${entry.id}:${entry.expression}`;
      if (entries.has(key)) duplicates.add(key);
      entries.set(key, entry);
    }
    duplicates.forEach((key) => entries.delete(key));
  }
  return (work: Pick<Artwork, 'id' | 'seed'>, media: ArtInterpretation): ArtInterpretation => {
    const clean = { ...media };
    delete clean.arrival;
    if (!isExpression(media.id) || !work.seed) return clean;
    const entry = entries.get(`${work.id}:${media.id}`);
    const film = media.films.find((candidate) => candidate.id === 'normal');
    if (
      !entry ||
      entry.seed !== work.seed ||
      entry.stillSha256 !== media.stillSha256 ||
      (film && entry.sourceSha256 !== film.sourceSha256) ||
      !entry.src.startsWith(`/art/arrival/${work.id}-${media.id}-`) ||
      !entry.src.endsWith(`-${entry.sha256.slice(0, 16)}.webp`)
    )
      return clean;
    clean.arrival = {
      src: entry.src,
      sha256: entry.sha256,
      width: entry.width,
      height: entry.height,
      spread,
    };
    return clean;
  };
}

const lookup = createArrivalLookup(registry);
export function withArrivalMaps(
  work: Pick<Artwork, 'id' | 'seed'>,
  media: ArtInterpretation[],
): ArtInterpretation[] {
  return media.map((interpretation) => lookup(work, interpretation));
}
