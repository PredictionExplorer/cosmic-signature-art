import { describe, expect, it, vi } from 'vitest';
import { ART_API_ORIGIN } from './constants';
import { createArtworkHistoryRepository } from './history';

const zero = `0x${'0'.repeat(40)}`;
const alice = `0x${'1'.repeat(40)}`;
const bob = `0x${'2'.repeat(40)}`;
const event = {
  nftTokenId: 23,
  eventLogId: 23560,
  blockNumber: 477268350,
  occurredAt: '2026-06-25T17:40:26Z',
  transactionHash: `0x${'3'.repeat(64)}`,
};
const transfer = { ...event, transferType: 'transfer', fromAddress: alice, toAddress: bob };
const renamed = { ...event, tokenName: 'A name', changedByAddress: alice };
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const page = (data: unknown[], nextCursor?: string, limit = 12) =>
  response({ data, meta: { limit, nextCursor } });

describe('artwork history repository', () => {
  it('loads separately ordered, independently paginated streams from fixed token-specific endpoints', async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.includes('/transfers')
        ? page([transfer], 'older_transfers')
        : page([renamed], 'older_names'),
    );
    const result = await createArtworkHistoryRepository({ fetch: fetcher }).getArtworkHistory(23);
    expect(result).toMatchObject({
      tokenId: 23,
      transfers: { status: 'available', nextCursor: 'older_transfers' },
      names: { status: 'available', nextCursor: 'older_names' },
    });
    expect(result.transfers.items[0].kind).toBe('transfer');
    expect(result.names.items[0].newName).toBe('A name');
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      `${ART_API_ORIGIN}/api/v2/cosmicgame/cosmic-signature-tokens/23/transfers?limit=12`,
      `${ART_API_ORIGIN}/api/v2/cosmicgame/cosmic-signature-tokens/23/name-history?limit=12`,
    ]);
    expect(result.transfers).toMatchObject({ cursor: null, limit: 12 });
  });

  it('can reach an older mint and cleared name using each stream’s own cursor', async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.includes('/transfers')
        ? page(
            [{ ...transfer, fromAddress: zero, transferType: 'mint', eventLogId: 18861 }],
            undefined,
            1,
          )
        : page([{ ...renamed, eventLogId: 18860, tokenName: '' }], undefined, 1),
    );
    const result = await createArtworkHistoryRepository({ fetch: fetcher }).getArtworkHistory(
      '23',
      {
        transferCursor: 'older_transfers',
        nameCursor: 'older_names',
        limit: 1,
      },
    );
    expect(fetcher.mock.calls[0][0]).toContain('limit=1&cursor=older_transfers');
    expect(fetcher.mock.calls[1][0]).toContain('limit=1&cursor=older_names');
    expect(result.transfers).toMatchObject({
      cursor: 'older_transfers',
      nextCursor: null,
      status: 'available',
    });
    expect(result.transfers.items[0].kind).toBe('mint');
    expect(result.names.items[0].newName).toBe('');
  });

  it('keeps successful empty history distinct from missing or unavailable history', async () => {
    const repository = createArtworkHistoryRepository({
      fetch: async (url) =>
        url.includes('/transfers') ? response({ detail: 'Token not indexed' }, 404) : page([]),
    });
    const result = await repository.getArtworkHistory(23);
    expect(result.transfers).toMatchObject({ status: 'unavailable', items: [] });
    expect(result.names).toMatchObject({ status: 'available', items: [], nextCursor: null });
  });

  it('rejects a malformed stream while retaining the other stream', async () => {
    const result = await createArtworkHistoryRepository({
      fetch: async (url) =>
        url.includes('/transfers') ? page([{ ...transfer, nftTokenId: 22 }]) : page([renamed]),
    }).getArtworkHistory(23);
    expect(result.transfers.status).toBe('unavailable');
    expect(result.names.items[0].kind).toBe('name');
  });

  it('does not fabricate any fallback historical events during an outage', async () => {
    const result = await createArtworkHistoryRepository({
      fetch: async () => {
        throw new Error('offline');
      },
    }).getArtworkHistory(23);
    expect(result.transfers).toMatchObject({ status: 'unavailable', items: [], nextCursor: null });
    expect(result.names).toMatchObject({ status: 'unavailable', items: [], nextCursor: null });
  });

  it('bounds page size and supports token zero', async () => {
    const fetcher = vi.fn(async () => page([], undefined, 50));
    const result = await createArtworkHistoryRepository({ fetch: fetcher }).getArtworkHistory(0, {
      limit: 1000,
    });
    expect(result.tokenId).toBe(0);
    expect(result.transfers.limit).toBe(50);
    expect(fetcher.mock.calls).toHaveLength(2);
  });

  it('rejects invalid IDs and cursor input before sending any request', async () => {
    const fetcher = vi.fn();
    const repository = createArtworkHistoryRepository({ fetch: fetcher });
    for (const id of ['../23', '-1', 'Infinity', Number.MAX_SAFE_INTEGER + 1])
      await expect(repository.getArtworkHistory(id)).rejects.toThrow(RangeError);
    for (const cursor of ['', 'https://evil.example', 'a&cursor=b', 'a/b', 'x'.repeat(1025)]) {
      await expect(repository.getArtworkHistory(23, { transferCursor: cursor })).rejects.toThrow(
        RangeError,
      );
      await expect(repository.getArtworkHistory(23, { nameCursor: cursor })).rejects.toThrow(
        RangeError,
      );
    }
    for (const limit of [0, -1, 1.5, Infinity, NaN])
      await expect(repository.getArtworkHistory(23, { limit })).rejects.toThrow(RangeError);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
