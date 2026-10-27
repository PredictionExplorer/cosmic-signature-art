import { z } from 'zod';
import registry from './plate-clips.json';
import { isExpression, type ArtFilm, type ArtInterpretation, type Artwork } from './types';
import { seedPackageUrl } from './constants';

/**
 * The plate clips (scripts/build-plate-clips.mjs): the settling clip, which is the final eight
 * seconds of a published film at 1280 px and 60 fps and ends on the published still, and the
 * opening clip, its first ten seconds. A clip binds to an interpretation only when the token,
 * seed, published source hash and still hash all agree; a stale clip is dropped, never shown.
 */
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const match = z.object({ mean: z.number().nonnegative(), max: z.number(), over: z.number() });
const entrySchema = z.object({
  id: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  seed: z.string().regex(/^0x[a-f0-9]{64}$/),
  expression: z.enum(['ink', 'light']),
  kind: z.enum(['settling', 'opening']),
  src: z
    .string()
    .regex(/^\/art\/clips\/[0-9]+-(?:ink|light)-(?:settling|opening)-[a-f0-9]{16}\.mp4$/),
  sourceUrl: z.string(),
  sourceSha256: hash,
  stillSha256: hash,
  sha256: hash,
  bytes: z
    .number()
    .int()
    .positive()
    .max(8 * 1024 * 1024),
  width: z.literal(1280),
  height: z.literal(828),
  frameRate: z.literal(60),
  frames: z.number().int().positive(),
  durationSeconds: z.number().positive().max(12),
  startSeconds: z.number().nonnegative(),
  sourceDurationSeconds: z.number().positive(),
  stillMatch: match.optional(),
});
type Entry = z.infer<typeof entrySchema>;
const registrySchema = z.object({ schemaVersion: z.literal(1), clips: z.array(entrySchema) });
const sourcePath = { ink: 'videos/web/ember.mp4', light: 'videos/web/main.mp4' } as const;
/** A settling clip is one that ends on the still: the pipeline refused any other; the reader checks the record says so. */
const STILL_MATCH = { mean: 6, over: 0.005 };
const FRAME = 1 / 60;

export function createPlateClipLookup(raw: unknown) {
  const parsed = registrySchema.safeParse(raw);
  const entries = new Map<string, Entry>();
  if (parsed.success) {
    const duplicates = new Set<string>();
    for (const entry of parsed.data.clips) {
      const key = `${entry.id}:${entry.expression}:${entry.kind}`;
      if (entries.has(key)) duplicates.add(key);
      entries.set(key, entry);
    }
    duplicates.forEach((key) => entries.delete(key));
  }
  function bound(
    work: Pick<Artwork, 'id' | 'seed'>,
    media: ArtInterpretation,
    kind: Entry['kind'],
  ): ArtFilm | undefined {
    if (!isExpression(media.id) || !work.seed) return undefined;
    const entry = entries.get(`${work.id}:${media.id}:${kind}`);
    const film = media.films.find((candidate) => candidate.id === 'normal');
    if (
      !entry ||
      entry.seed !== work.seed ||
      entry.stillSha256 !== media.stillSha256 ||
      entry.sourceSha256 !== film?.sourceSha256 ||
      entry.sourceUrl !== seedPackageUrl(work.seed, sourcePath[media.id]) ||
      entry.sourceUrl !== film.sourceUrl ||
      entry.frames !== (kind === 'settling' ? 480 : 600) ||
      Math.abs(entry.durationSeconds - entry.frames / entry.frameRate) > FRAME ||
      !entry.src.startsWith(`/art/clips/${work.id}-${media.id}-${kind}-`) ||
      !entry.src.endsWith(`-${entry.sha256.slice(0, 16)}.mp4`)
    )
      return undefined;
    if (kind === 'settling') {
      const endsAtEnd =
        Math.abs(entry.startSeconds + entry.durationSeconds - entry.sourceDurationSeconds) <= FRAME;
      const onStill =
        !!entry.stillMatch &&
        entry.stillMatch.mean <= STILL_MATCH.mean &&
        entry.stillMatch.over <= STILL_MATCH.over;
      if (!endsAtEnd || !onStill) return undefined;
    } else if (entry.startSeconds !== 0) return undefined;
    return {
      id: kind,
      label: kind === 'settling' ? 'Settling' : 'Opening',
      src: entry.src,
      sourceUrl: entry.sourceUrl,
      durationSeconds: entry.durationSeconds,
      startSeconds: entry.startSeconds,
      frameRate: entry.frameRate,
      frames: entry.frames,
      poster: media.still,
      sha256: entry.sha256,
      sourceSha256: entry.sourceSha256,
      mimeType: 'video/mp4',
      variantKey: `${work.id}:${media.id}:${kind}`,
      delivery: 'local-preview',
    };
  }
  return (work: Pick<Artwork, 'id' | 'seed'>, media: ArtInterpretation): ArtInterpretation => {
    const clean = { ...media };
    delete clean.settlingFilm;
    delete clean.openingFilm;
    const settling = bound(work, media, 'settling');
    const opening = bound(work, media, 'opening');
    if (settling) clean.settlingFilm = settling;
    if (opening) clean.openingFilm = opening;
    return clean;
  };
}

const lookup = createPlateClipLookup(registry);
export function withPlateClips(
  work: Pick<Artwork, 'id' | 'seed'>,
  media: ArtInterpretation[],
): ArtInterpretation[] {
  return media.map((interpretation) => lookup(work, interpretation));
}
