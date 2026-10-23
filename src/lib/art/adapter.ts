import { curatedArtworks, getCuratedArtwork, withCuratedMedia } from './catalog';
import { MAX_COLLECTION_LIMIT, MEDIA_REVALIDATE_SECONDS } from './constants';
import { parseMediaManifest, preferVerifiedLocalDelivery } from './media';
import { parseArtworkId, parseTokenRecord, successEnvelopeSchema } from './validation';
import { createArtRequest, ArtReadError as ReadError, type ArtFetchLike } from './request';
import type { Artwork, ArtworkResult, CollectionOptions, CollectionResult } from './types';

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function options(input: CollectionOptions) {
  const offset = input.offset ?? 0;
  const rawLimit = input.limit ?? 24;
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 1_000_000 ||
    !Number.isSafeInteger(rawLimit) ||
    rawLimit < 1
  )
    throw new RangeError('Invalid collection pagination');
  const query = (input.query ?? '').trim();
  if (query.length > 100 || Array.from(query).some((character) => character.charCodeAt(0) < 32))
    throw new RangeError('Invalid collection search');
  return { offset, limit: Math.min(rawLimit, MAX_COLLECTION_LIMIT), query };
}

export function createArtRepository(config: { fetch?: ArtFetchLike; timeoutMs?: number } = {}) {
  const request = createArtRequest(config);

  async function hydrateMedia(artwork: Artwork): Promise<ArtworkResult> {
    if (!artwork.provenance.manifestUrl)
      return { artwork, status: 'found', source: 'live', notice: 'media-unavailable' };
    try {
      const raw = await request(artwork.provenance.manifestUrl, MEDIA_REVALIDATE_SECONDS);
      const parsed = parseMediaManifest(raw, artwork);
      if (parsed === null) throw new ReadError();
      const media = preferVerifiedLocalDelivery(artwork, parsed);
      artwork = {
        ...artwork,
        media,
        availability: {
          ...artwork.availability,
          media: media.some((item) => item.availability === 'local-copy')
            ? 'local-copy'
            : media.length
              ? 'advertised'
              : 'unavailable',
          ink: media.some((item) => item.id === 'ink') ? 'known' : 'not-advertised',
        },
      };
      return { artwork, status: 'found', source: 'live' };
    } catch {
      return { artwork, status: 'found', source: 'live', notice: 'media-unavailable' };
    }
  }

  async function hydratePage(items: Artwork[]): Promise<Artwork[]> {
    const result: Artwork[] = new Array(items.length);
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(6, items.length) }, async () => {
        while (next < items.length) {
          const index = next++;
          const hydrated = await hydrateMedia(items[index]);
          result[index] = hydrated.artwork ?? items[index];
        }
      }),
    );
    return result;
  }

  async function getArtwork(input: string | number): Promise<ArtworkResult> {
    const id = parseArtworkId(input);
    if (id === null) return { artwork: null, status: 'not-found', source: 'live' };
    try {
      const raw = await request(`/api/cosmicgame/cst/info/${id}`);
      if (!successEnvelopeSchema.safeParse(raw).success) throw new ReadError();
      const record = parseTokenRecord(object(raw).TokenInfo);
      if (!record || record.id !== id) throw new ReadError();
      return await hydrateMedia(withCuratedMedia(record));
    } catch (error) {
      if (error instanceof ReadError && error.notFound)
        return { artwork: null, status: 'not-found', source: 'live' };
      const local = getCuratedArtwork(id);
      return {
        artwork: local ? structuredClone(local) : null,
        status: local ? 'found' : 'unavailable',
        source: 'curated-fallback',
        notice: 'indexer-unavailable',
      };
    }
  }

  async function getCollection(input: CollectionOptions = {}): Promise<CollectionResult> {
    const { offset, limit, query } = options(input);
    const base = { offset, limit, scope: query ? ('search' as const) : ('collection' as const) };
    if (/^#?\d+$/.test(query)) {
      const result = await getArtwork(query.replace(/^#/, ''));
      return {
        ...base,
        source: result.source,
        items: offset === 0 && result.artwork ? [result.artwork] : [],
        hasMore: false,
        nextOffset: null,
        total: result.status === 'unavailable' ? null : result.artwork ? 1 : 0,
        notice: result.notice === 'indexer-unavailable' ? 'search-unavailable' : undefined,
        scope: result.source === 'curated-fallback' ? 'curated-selection' : 'search',
      };
    }
    try {
      const path = query
        ? `/api/cosmicgame/cst/names/search/${encodeURIComponent(query)}`
        : `/api/cosmicgame/cst/list/all/${offset}/${limit + 1}`;
      const raw = await request(path);
      if (!successEnvelopeSchema.safeParse(raw).success) throw new ReadError();
      const records = object(raw)[query ? 'TokenNameSearchResults' : 'CosmicSignatureTokenList'];
      if (records !== null && !Array.isArray(records)) throw new ReadError();
      const rows: unknown[] = records ?? [];
      if (rows.length > 10_000) throw new ReadError();
      const page = query ? rows.slice(offset, offset + limit) : rows.slice(0, limit);
      const parsed = page.map(parseTokenRecord);
      const seen = new Set<number>();
      const items = parsed.flatMap((artwork) => {
        if (!artwork || seen.has(artwork.id)) return [];
        seen.add(artwork.id);
        return [withCuratedMedia(artwork)];
      });
      const hasMore = query ? rows.length > offset + limit : rows.length > limit;
      return {
        ...base,
        items: input.includeMedia ? await hydratePage(items) : items,
        source: 'live',
        hasMore,
        nextOffset: hasMore ? offset + limit : null,
        total: query ? rows.length : null,
        notice: items.length !== page.length ? 'partial-records' : undefined,
      };
    } catch {
      const matching = query
        ? curatedArtworks.filter((artwork) =>
            artwork.title.toLocaleLowerCase('en').includes(query.toLocaleLowerCase('en')),
          )
        : curatedArtworks;
      const items = matching.slice(offset, offset + limit);
      const hasMore = matching.length > offset + limit;
      return {
        ...base,
        items: structuredClone(items),
        source: 'curated-fallback',
        scope: 'curated-selection',
        hasMore,
        nextOffset: hasMore ? offset + limit : null,
        total: null,
        notice: query ? 'search-unavailable' : 'indexer-unavailable',
      };
    }
  }

  return { getArtwork, getCollection };
}
