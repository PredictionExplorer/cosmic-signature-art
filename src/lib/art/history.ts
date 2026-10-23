import { ART_API_ORIGIN } from './constants';
import { createArtRequest, type ArtFetchLike } from './request';
import { parseArtworkId } from './validation';
import {
  DEFAULT_HISTORY_PAGE_SIZE,
  MAX_HISTORY_PAGE_SIZE,
  historyCursorSchema,
  parseNameHistoryPage,
  parseTransferHistoryPage,
} from './history-validation';
import type {
  ArtworkHistory,
  ArtworkHistoryEvent,
  ArtworkHistoryOptions,
  ArtworkHistoryPage,
} from './history-types';

function checkedCursor(cursor?: string): string | undefined {
  if (cursor === undefined) return undefined;
  const parsed = historyCursorSchema.safeParse(cursor);
  if (!parsed.success) throw new RangeError('Invalid artwork history cursor');
  return parsed.data;
}

export function createArtworkHistoryRepository(
  config: { fetch?: ArtFetchLike; timeoutMs?: number } = {},
) {
  const request = createArtRequest(config);

  async function readPage<Event extends ArtworkHistoryEvent>(
    tokenId: number,
    resource: 'transfers' | 'name-history',
    limit: number,
    cursor: string | undefined,
    parse: (
      raw: unknown,
      scope: { tokenId: number; limit: number; cursor?: string },
    ) => { items: Event[]; nextCursor: string | null } | null,
  ): Promise<ArtworkHistoryPage<Event>> {
    const url = new URL(
      `/api/v2/cosmicgame/cosmic-signature-tokens/${tokenId}/${resource}`,
      ART_API_ORIGIN,
    );
    url.searchParams.set('limit', String(limit));
    if (cursor) url.searchParams.set('cursor', cursor);
    const base = { sourceUrl: url.href, cursor: cursor ?? null, limit };
    try {
      const raw = await request(url.href);
      const parsed = parse(raw, { tokenId, limit, cursor });
      if (parsed) return { ...base, ...parsed, status: 'available' };
    } catch {
      // Each stream remains independently usable if the other read fails.
    }
    return { ...base, items: [], nextCursor: null, status: 'unavailable' };
  }

  async function getArtworkHistory(
    input: string | number,
    options: ArtworkHistoryOptions = {},
  ): Promise<ArtworkHistory> {
    const tokenId = parseArtworkId(input);
    if (tokenId === null) throw new RangeError('Invalid artwork history token');
    const requestedLimit = options.limit ?? DEFAULT_HISTORY_PAGE_SIZE;
    if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1)
      throw new RangeError('Invalid artwork history page size');
    const limit = Math.min(requestedLimit, MAX_HISTORY_PAGE_SIZE);
    const transferCursor = checkedCursor(options.transferCursor);
    const nameCursor = checkedCursor(options.nameCursor);
    const [transfers, names] = await Promise.all([
      readPage(tokenId, 'transfers', limit, transferCursor, parseTransferHistoryPage),
      readPage(tokenId, 'name-history', limit, nameCursor, parseNameHistoryPage),
    ]);
    return { tokenId, transfers, names };
  }

  return { getArtworkHistory };
}
