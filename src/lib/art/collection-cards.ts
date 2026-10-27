import { collectionIndex, indexedAssetUrl, type IndexedWork } from './collection-index';
import { withLocalDerivatives } from './derivatives';
import { ART_API_ORIGIN, seedPackageUrl } from './constants';
import { preferVerifiedLocalDelivery } from './media';
import type { ArtFilm, ArtInterpretation, Artwork } from './types';

/**
 * A card built from the build-time index alone, so a page of the collection renders without
 * waiting on eighteen manifest reads. The media are the publisher's own URLs and hashes as the
 * manifest advertised them; the hash-verified local derivatives (excerpt, plate clips, still
 * ladder) and the curated local stills attach through the same checks the live path uses, so a
 * stale snapshot can never paint the wrong file.
 */
const filmDefinitions = {
  light: [
    ['main', 'normal', 'Film'],
    ['sweep', 'sweep', 'Spectral sweep'],
  ],
  ink: [
    ['main', 'normal', 'Film'],
    ['medium', 'medium', 'Long study'],
    ['slow', 'slow', 'Extended study'],
  ],
} as const;

export function artworkFromIndex(work: IndexedWork): Artwork {
  const seed = work.seed as `0x${string}`;
  const media: ArtInterpretation[] = [];
  for (const expression of ['light', 'ink'] as const) {
    const published = work.media[expression];
    if (!published) continue;
    const still = published.still ?? published.preview;
    const stillUrl = indexedAssetUrl(work, still?.path);
    const films: ArtFilm[] = filmDefinitions[expression].flatMap(([key, id, label]) => {
      const file = published.films[key];
      if (!file) return [];
      const src = indexedAssetUrl(work, file.path)!;
      return [
        {
          id,
          label,
          src,
          sourceUrl: src,
          durationSeconds: file.durationSeconds,
          poster: stillUrl,
          sha256: file.sha256,
          sourceSha256: file.sha256,
          mimeType: 'video/mp4' as const,
          variantKey: `${work.id}:${expression}:${id}`,
          delivery: 'original-web' as const,
        },
      ];
    });
    if (!stillUrl && films.length === 0) continue;
    media.push({
      id: expression,
      label: expression === 'ink' ? 'Ink' : 'Light',
      still: stillUrl,
      thumbnail: indexedAssetUrl(work, published.preview?.path) ?? stillUrl,
      thumbnailWidth: (published.preview ?? still)?.width,
      thumbnailHeight: (published.preview ?? still)?.height,
      sourceUrl: stillUrl,
      stillSha256: still?.sha256,
      width: still?.width,
      height: still?.height,
      films,
      source: 'published-manifest',
      availability: 'advertised',
    });
  }
  const artwork: Artwork = {
    id: work.id,
    title: work.name ?? `Signature ${work.id}`,
    seed,
    cycle: work.cycle,
    mintedAt: work.mintedAt,
    media: [],
    provenance: {
      source: 'live',
      recordUrl: `${ART_API_ORIGIN}/api/cosmicgame/cst/info/${work.id}`,
      metadataUrl: `${ART_API_ORIGIN}/metadata/${work.id}`,
      manifestUrl: seedPackageUrl(seed, 'metadata/assets.json'),
      mintTransactionHash: work.mintTransactionHash,
      checkedOn: collectionIndex.checkedOn,
      ownership: 'unavailable',
    },
    availability: {
      record: 'indexed',
      media: media.length ? 'advertised' : 'unavailable',
      ink: media.some((item) => item.id === 'ink') ? 'known' : 'not-advertised',
    },
  };
  const delivered = preferVerifiedLocalDelivery(artwork, withLocalDerivatives(artwork, media));
  return {
    ...artwork,
    media: delivered,
    availability: {
      ...artwork.availability,
      media: delivered.some((item) => item.availability === 'local-copy')
        ? 'local-copy'
        : artwork.availability.media,
    },
  };
}
