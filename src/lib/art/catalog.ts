import records from './curated-records.json';
import mediaRecords from './curated-media.json';
import { ART_API_ORIGIN, seedPackageUrl } from './constants';
import type { Artwork, ArtInterpretation } from './types';

/** An explicitly limited, identity-verified archive. Not the collection total. */
export const curatedArtworks: Artwork[] = mediaRecords.map(({ id, media }) => {
  const record = records.records.find((candidate) => candidate.id === id);
  if (!record) throw new Error(`Missing identity record for curated artwork ${id}`);
  const seed = record.seed as `0x${string}`;
  const interpretations: ArtInterpretation[] = media.map((entry) => ({
    id: entry.id,
    label: entry.id === 'ink' ? 'Ink' : 'Light',
    still: entry.still,
    thumbnail: entry.still,
    stillSha256: entry.stillSha256,
    sourceUrl: entry.sourceUrl,
    width: entry.width,
    height: entry.height,
    films: entry.film
      ? [
          {
            id: 'normal',
            label: 'Film',
            ...entry.film,
            poster: entry.still,
            mimeType: 'video/mp4' as const,
            variantKey: `${id}:ink:normal`,
            delivery: 'local-preview' as const,
          },
        ]
      : [],
    source: 'local-archive',
    availability: 'local-copy',
  }));
  return {
    id,
    title: `Signature ${id}`,
    seed,
    cycle: record.cycle,
    mintedAt: record.mintedAt,
    media: interpretations,
    provenance: {
      source: 'curated-fallback',
      recordUrl: `${ART_API_ORIGIN}/api/cosmicgame/cst/info/${id}`,
      metadataUrl: `${ART_API_ORIGIN}/metadata/${id}`,
      manifestUrl: seedPackageUrl(seed, 'metadata/assets.json'),
      mintTransactionHash: record.transactionHash,
      checkedOn: record.checkedOn,
      ownership: 'unavailable',
    },
    availability: {
      record: 'archived',
      media: 'local-copy',
      ink: interpretations.some((m) => m.id === 'ink') ? 'known' : 'unknown',
    },
  };
});

export function getCuratedArtwork(id: number): Artwork | undefined {
  return curatedArtworks.find((artwork) => artwork.id === id);
}

/** Attach local assets only when the live seed agrees with the archived identity. */
export function withCuratedMedia(artwork: Artwork): Artwork {
  const local = getCuratedArtwork(artwork.id);
  if (!local || !artwork.seed || local.seed !== artwork.seed) return artwork;
  return {
    ...artwork,
    media: local.media,
    availability: { ...artwork.availability, media: 'local-copy', ink: local.availability.ink },
  };
}
