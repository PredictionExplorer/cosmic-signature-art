import { z } from 'zod';
import registry from './collection-previews.json';
import type { ArtInterpretation, Artwork } from './types';
import { seedPackageUrl } from './constants';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const entrySchema = z.object({
  id: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  seed: z.string().regex(/^0x[a-f0-9]{1,64}$/),
  src: z.string().regex(/^\/art\/previews\/[0-9]+-[a-f0-9]+\.mp4$/),
  sourceUrl: z.string(),
  sourceSha256: hash,
  stillSha256: hash,
  sha256: hash,
  bytes: z
    .number()
    .int()
    .positive()
    .max(2 * 1024 * 1024),
  width: z.number().int().positive().max(768),
  height: z.number().int().positive().max(768),
  durationSeconds: z.number().positive().max(12),
  startSeconds: z.number().nonnegative(),
  sourceDurationSeconds: z.number().positive(),
});

const registrySchema = z.object({ schemaVersion: z.literal(1), previews: z.array(entrySchema) });

/** Local delivery is available only for the exact token, published source and paired still. */
export function createCollectionPreviewLookup(raw: unknown) {
  const parsed = registrySchema.safeParse(raw);
  const entries = new Map<number, z.infer<typeof entrySchema>>();
  if (parsed.success) {
    const duplicates = new Set<number>();
    for (const entry of parsed.data.previews) {
      if (entries.has(entry.id)) duplicates.add(entry.id);
      entries.set(entry.id, entry);
    }
    duplicates.forEach((id) => entries.delete(id));
  }
  return (work: Pick<Artwork, 'id' | 'seed'>, media: ArtInterpretation): ArtInterpretation => {
    const cleanMedia = { ...media };
    delete cleanMedia.previewFilm;
    const entry = entries.get(work.id);
    const film = media.films.find((candidate) => candidate.id === 'normal');
    if (
      !entry ||
      !work.seed ||
      entry.seed !== work.seed ||
      media.id !== 'ink' ||
      entry.stillSha256 !== media.stillSha256 ||
      entry.sourceSha256 !== film?.sourceSha256 ||
      entry.sourceUrl !== seedPackageUrl(work.seed, 'videos/web/ember.mp4') ||
      entry.sourceUrl !== film.sourceUrl ||
      entry.startSeconds + entry.durationSeconds > entry.sourceDurationSeconds + 0.05 ||
      !entry.src.startsWith(`/art/previews/${work.id}-`) ||
      !entry.src.endsWith(`-${entry.sha256.slice(0, 16)}.mp4`)
    )
      return cleanMedia;
    return {
      ...cleanMedia,
      previewFilm: {
        id: 'catalogue',
        label: 'Web preview',
        src: entry.src,
        sourceUrl: entry.sourceUrl,
        durationSeconds: entry.durationSeconds,
        startSeconds: entry.startSeconds,
        sha256: entry.sha256,
        sourceSha256: entry.sourceSha256,
        mimeType: 'video/mp4',
        variantKey: `${work.id}:ink:catalogue`,
        delivery: 'local-preview',
        poster: media.still,
      },
    };
  };
}

const lookup = createCollectionPreviewLookup(registry);
export function withCollectionPreviews(
  work: Artwork,
  media: ArtInterpretation[],
): ArtInterpretation[] {
  return media.map((interpretation) => lookup(work, interpretation));
}
