/** Public, serializable art records. Safe to import from client components. */
export type ArtSource = 'live' | 'curated-fallback';
export type InterpretationId = 'light' | 'ink' | (string & {});
export type MediaSource = 'local-archive' | 'published-manifest' | 'legacy-url';

export interface ArtFilm {
  id: string;
  label: string;
  src: string;
  /** Original published source when src is a local delivery derivative. */
  sourceUrl?: string;
  durationSeconds?: number;
  poster?: string;
  sha256?: string;
  sourceSha256?: string;
  mimeType: 'video/mp4';
  /** Same token, interpretation and variant; never reuse a different work's film. */
  variantKey: string;
  delivery: 'original-web' | 'local-preview';
}

export interface ArtInterpretation {
  id: InterpretationId;
  label: string;
  still?: string;
  thumbnail?: string;
  master?: string;
  stillSha256?: string;
  sourceUrl?: string;
  width?: number;
  height?: number;
  films: ArtFilm[];
  source: MediaSource;
  /** A manifest advertises an asset; it does not prove continued availability. */
  availability: 'local-copy' | 'advertised' | 'unverified';
}

export interface Artwork {
  id: number;
  title: string;
  seed?: `0x${string}`;
  cycle?: number;
  mintedAt?: string;
  /** Indexed ERC-721 custody, potentially the anchoring contract; not ownerOf(). */
  owner?: string;
  originalRecipient?: string;
  anchoring?: {
    active: boolean;
    previouslyUsed?: boolean;
    participant?: string;
  };
  media: ArtInterpretation[];
  provenance: {
    source: ArtSource;
    recordUrl: string;
    metadataUrl?: string;
    manifestUrl?: string;
    mintTransactionHash?: string;
    mintBlock?: number;
    checkedOn?: string;
    ownership: 'indexed' | 'unavailable';
  };
  availability: {
    record: 'indexed' | 'archived';
    media: 'local-copy' | 'advertised' | 'unverified' | 'unavailable';
    ink: 'known' | 'unknown' | 'not-advertised';
  };
}

export interface CollectionOptions {
  offset?: number;
  limit?: number;
  /** Token ID, #ID, or a case-insensitive token-name search. */
  query?: string;
  /** Fetch each page item's advertised interpretations; bounded to six concurrent reads. */
  includeMedia?: boolean;
}

export interface CollectionResult {
  items: Artwork[];
  source: ArtSource;
  offset: number;
  limit: number;
  hasMore: boolean;
  nextOffset: number | null;
  /** Null when the indexer does not report a total. Never infer from max token ID. */
  total: number | null;
  scope: 'collection' | 'search' | 'curated-selection';
  /** Stable code for localized UI copy; never render an upstream error verbatim. */
  notice?: 'indexer-unavailable' | 'search-unavailable' | 'partial-records';
}

export interface ArtworkResult {
  artwork: Artwork | null;
  status: 'found' | 'not-found' | 'unavailable';
  source: ArtSource;
  notice?: 'indexer-unavailable' | 'media-unavailable';
}

export function getInterpretation(
  artwork: Artwork,
  id: InterpretationId,
): ArtInterpretation | undefined {
  return artwork.media.find((interpretation) => interpretation.id === id);
}
