/** Public, serializable art records. Safe to import from client components. */
import { ART_WIDTH } from './constants';
export type ArtSource = 'live' | 'curated-fallback';
export type InterpretationId = 'light' | 'ink' | (string & {});
/** The two authored expressions; any other interpretation id is a future medium. */
export type Expression = 'light' | 'ink';
export function isExpression(id: InterpretationId): id is Expression {
  return id === 'light' || id === 'ink';
}
export type MediaSource = 'local-archive' | 'published-manifest' | 'legacy-url';

export interface ArtFilm {
  id: string;
  label: string;
  src: string;
  /** Original published source when src is a local delivery derivative. */
  sourceUrl?: string;
  durationSeconds?: number;
  /** The published file's size, as the manifest states it; a derivative carries its own. */
  bytes?: number;
  /** Where an excerpt begins inside its source film, in source seconds. */
  startSeconds?: number;
  /** The source's frame rate, carried by the frame-exact plate clips. */
  frameRate?: number;
  frames?: number;
  poster?: string;
  sha256?: string;
  sourceSha256?: string;
  mimeType: 'video/mp4';
  /** Same token, interpretation and variant; never reuse a different work's film. */
  variantKey: string;
  delivery: 'original-web' | 'local-preview';
}

/** A detail window of the published still, in its pixels: one of the loupe's first views. */
export interface PlateDetail {
  x: number;
  y: number;
  width: number;
  height: number;
  /** The share of the expression's weight (ink darkness, or light) inside this window. */
  share: number;
}

/** One rung of the still ladder: a hash-recorded local derivative of the published still. */
export interface StillRung {
  src: string;
  width: number;
  height: number;
  sha256: string;
  bytes: number;
}

export interface ArtInterpretation {
  id: InterpretationId;
  label: string;
  still?: string;
  /** The publisher's own small preview of the same still, painted first on every plate. */
  thumbnail?: string;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
  master?: string;
  /**
   * The published master's hash, as the still ladder recorded it when it cut the rungs; the
   * live manifest parser carries no master hash yet, so the ladder registry is the one source.
   */
  masterSha256?: string;
  stillSha256?: string;
  sourceUrl?: string;
  width?: number;
  height?: number;
  films: ArtFilm[];
  /** Bounded, short browsing derivative. Never substitute it for a complete film. */
  previewFilm?: ArtFilm;
  /**
   * The final eight seconds of the complete film at 1280 px and 60 fps, cut frame-exactly and
   * proved to end on the published still, so a plate can play to its still and rest there.
   */
  settlingFilm?: ArtFilm;
  /** The first ten seconds of the complete film at 1280 px, for the works the home may open on. */
  openingFilm?: ArtFilm;
  /** Smaller rungs of the published still, cut from its 16-bit master, ascending by width. */
  rungs?: StillRung[];
  /** The still's heaviest windows, measured offline and bound to its hash; at most three. */
  detail?: PlateDetail[];
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

/** The smallest rung at least as wide as `width`, or the widest when none is; the ladder is ascending. */
export function rungFor(rungs: StillRung[] | undefined, width: number): StillRung | undefined {
  if (!rungs?.length) return undefined;
  return rungs.find((rung) => rung.width >= width) ?? rungs[rungs.length - 1];
}

/** The still ladder as a srcset: the rungs, then the published still at its native width. */
export function stillSourceSet(media?: ArtInterpretation): string | undefined {
  if (!media?.still || !media.rungs?.length) return undefined;
  return [
    ...media.rungs.map((rung) => `${rung.src} ${rung.width}w`),
    `${media.still} ${media.width ?? ART_WIDTH}w`,
  ].join(', ');
}
