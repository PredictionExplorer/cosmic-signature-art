import { z } from 'zod';
import { seedPackageUrl } from './constants';
import { getCuratedArtwork } from './catalog';
import type { ArtFilm, ArtInterpretation, Artwork } from './types';
import { withLocalDerivatives } from './derivatives';

const assetSchema = z.object({
  role: z.string().max(100),
  path: z.string().max(240),
  kind: z.string().max(30),
  width: z.number().int().positive().max(100_000).optional(),
  height: z.number().int().positive().max(100_000).optional(),
  duration_seconds: z.number().positive().max(86_400).optional(),
  bytes: z.number().int().positive().optional(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .optional(),
});
const manifestSchema = z.object({
  schema_version: z.literal(2),
  assets: z.array(z.unknown()).max(256),
});
type Asset = z.infer<typeof assetSchema>;

/** Known published role/path pairs, not filename guesses or executable manifest URLs. */
const modeDefinitions = [
  {
    id: 'light',
    label: 'Light',
    image: ['web_full', 'images/web/full.webp'],
    preview: ['web_preview', 'images/web/preview.webp'],
    master: ['source_master', 'images/source/master.png'],
    films: [
      { id: 'normal', label: 'Film', role: 'main_web', path: 'videos/web/main.mp4' },
      {
        id: 'sweep',
        label: 'Spectral sweep',
        role: 'spectral_sweep_web',
        path: 'videos/web/spectral_sweep.mp4',
      },
    ],
  },
  {
    id: 'ink',
    label: 'Ink',
    image: ['ember_web_full', 'images/web/ember_full.webp'],
    preview: ['ember_web_preview', 'images/web/ember_preview.webp'],
    master: ['ember_source_master', 'images/source/ember.png'],
    films: [
      { id: 'normal', label: 'Film', role: 'ember_web', path: 'videos/web/ember.mp4' },
      {
        id: 'medium',
        label: 'Long study',
        role: 'ember_medium_web',
        path: 'videos/web/ember_medium.mp4',
      },
      {
        id: 'slow',
        label: 'Extended study',
        role: 'ember_slow_web',
        path: 'videos/web/ember_slow.mp4',
      },
    ],
  },
] as const;

export function parseMediaManifest(raw: unknown, artwork: Artwork): ArtInterpretation[] | null {
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success || !artwork.seed) return null;
  const assets = parsed.data.assets.flatMap((candidate) => {
    const asset = assetSchema.safeParse(candidate);
    return asset.success ? [asset.data] : [];
  });
  const find = (role: string, path: string, kind: 'image' | 'video'): Asset | undefined => {
    const matches = assets.filter((asset) => asset.role === role);
    return matches.length === 1 && matches[0].path === path && matches[0].kind === kind
      ? matches[0]
      : undefined;
  };
  const url = (asset?: Asset) => (asset ? seedPackageUrl(artwork.seed!, asset.path) : undefined);
  const interpretations: ArtInterpretation[] = [];
  for (const mode of modeDefinitions) {
    const full = find(mode.image[0], mode.image[1], 'image');
    const preview = find(mode.preview[0], mode.preview[1], 'image');
    const master = find(mode.master[0], mode.master[1], 'image');
    const still = full ?? preview ?? master;
    const films: ArtFilm[] = mode.films.flatMap((definition) => {
      const file = find(definition.role, definition.path, 'video');
      if (!file) return [];
      return [
        {
          id: definition.id,
          label: definition.label,
          src: url(file)!,
          sourceUrl: url(file),
          durationSeconds: file.duration_seconds,
          bytes: file.bytes,
          poster: url(still),
          sha256: file.sha256?.toLowerCase(),
          sourceSha256: file.sha256?.toLowerCase(),
          mimeType: 'video/mp4' as const,
          variantKey: `${artwork.id}:${mode.id}:${definition.id}`,
          delivery: 'original-web' as const,
        },
      ];
    });
    if (!still && films.length === 0) continue;
    interpretations.push({
      id: mode.id,
      label: mode.label,
      still: url(still),
      thumbnail: url(preview ?? still),
      thumbnailWidth: (preview ?? still)?.width,
      thumbnailHeight: (preview ?? still)?.height,
      master: url(master),
      sourceUrl: url(still),
      stillSha256: still?.sha256?.toLowerCase(),
      width: still?.width,
      height: still?.height,
      films,
      source: 'published-manifest',
      availability: 'advertised',
    });
  }
  return withLocalDerivatives(artwork, interpretations);
}

/** Only substitute a local delivery film when both its source and still hashes match. */
export function preferVerifiedLocalDelivery(
  artwork: Artwork,
  media: ArtInterpretation[],
): ArtInterpretation[] {
  const curated = getCuratedArtwork(artwork.id);
  if (!curated || curated.seed !== artwork.seed) return media;
  return media.map((published) => {
    const local = curated.media.find((item) => item.id === published.id);
    if (!local?.stillSha256 || local.stillSha256 !== published.stillSha256) return published;
    return {
      ...published,
      still: local.still,
      thumbnail: local.thumbnail,
      thumbnailWidth: local.thumbnailWidth,
      thumbnailHeight: local.thumbnailHeight,
      source: 'local-archive',
      availability: 'local-copy',
      films: published.films.map((film) => {
        const delivery = local.films.find(
          (candidate) =>
            candidate.variantKey === film.variantKey &&
            candidate.sourceSha256 &&
            candidate.sourceSha256 === film.sourceSha256,
        );
        return delivery ? { ...delivery, sourceUrl: film.sourceUrl, poster: local.still } : film;
      }),
    };
  });
}
