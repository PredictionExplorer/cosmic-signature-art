import { describe, expect, it, vi } from 'vitest';
import { createArtRepository } from './adapter';
import { curatedArtworks, getCuratedArtwork } from './catalog';
import { ART_API_ORIGIN } from './constants';

const seed = `0x${'a'.repeat(64)}`;
const row = (id: number) => ({ TokenId: id, Seed: seed, TokenName: '', RoundNum: 0 });
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const page = (rows: unknown[]) => response({ status: 1, CosmicSignatureTokenList: rows });

describe('collection adapter', () => {
  it('uses a lookahead row without pretending the highest token ID is a total', async () => {
    const fetcher = vi.fn().mockResolvedValue(page([row(99), row(70), row(42)]));
    const result = await createArtRepository({ fetch: fetcher }).getCollection({
      offset: 20,
      limit: 2,
    });
    expect(result.items.map((item) => item.id)).toEqual([99, 70]);
    expect(result).toMatchObject({ source: 'live', hasMore: true, nextOffset: 22, total: null });
    expect(fetcher.mock.calls[0][0]).toBe(`${ART_API_ORIGIN}/api/cosmicgame/cst/list/all/20/3`);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: 'error', next: { revalidate: 60 } });
  });

  it('can reach a final page containing token zero', async () => {
    const fetcher = vi.fn().mockResolvedValue(page([row(1), row(0)]));
    const result = await createArtRepository({ fetch: fetcher }).getCollection({
      offset: 70,
      limit: 2,
    });
    expect(result.items.map((item) => item.id)).toEqual([1, 0]);
    expect(result).toMatchObject({ source: 'live', hasMore: false, nextOffset: null });
  });

  it('distinguishes a successful empty collection from an outage', async () => {
    const result = await createArtRepository({
      fetch: vi.fn().mockResolvedValue(page([])),
    }).getCollection();
    expect(result).toMatchObject({ items: [], source: 'live', hasMore: false });
    expect(result.notice).toBeUndefined();
  });

  it('discards invalid identities and duplicate rows without shifting upstream offsets', async () => {
    const fetcher = vi.fn().mockResolvedValue(page([row(9), row(9), { TokenId: '../1' }, row(4)]));
    const result = await createArtRepository({ fetch: fetcher }).getCollection({ limit: 3 });
    expect(result.items.map((item) => item.id)).toEqual([9]);
    expect(result).toMatchObject({ nextOffset: 3, notice: 'partial-records' });
  });

  it.each([{ status: 0 }, { status: 1 }, { status: 1, CosmicSignatureTokenList: 'bad' }])(
    'labels invalid envelopes as a limited fallback',
    async (body) => {
      const result = await createArtRepository({
        fetch: vi.fn().mockResolvedValue(response(body)),
      }).getCollection();
      expect(result).toMatchObject({
        source: 'curated-fallback',
        scope: 'curated-selection',
        total: null,
        notice: 'indexer-unavailable',
      });
      expect(result.items).toHaveLength(15);
      expect(result.items.every((item) => item.owner === undefined)).toBe(true);
    },
  );

  it('does not display an unrelated page of the archive for a later failed page', async () => {
    const result = await createArtRepository({
      fetch: vi.fn().mockRejectedValue(new Error('offline')),
    }).getCollection({ offset: 48 });
    expect(result.items).toEqual([]);
    expect(result.source).toBe('curated-fallback');
  });

  it('keeps a name search global rather than filtering just the current collection page', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        response({ status: 1, TokenNameSearchResults: [row(50), row(19), row(8)] }),
      );
    const result = await createArtRepository({ fetch: fetcher }).getCollection({
      query: 'Blue & Gold',
      offset: 1,
      limit: 1,
    });
    expect(fetcher.mock.calls[0][0]).toContain('/names/search/Blue%20%26%20Gold');
    expect(result.items.map((item) => item.id)).toEqual([19]);
    expect(result).toMatchObject({ total: 3, nextOffset: 2, scope: 'search' });
  });

  it('bounds page size and rejects invalid offsets without sending a request', async () => {
    const fetcher = vi.fn().mockResolvedValue(page([]));
    const repository = createArtRepository({ fetch: fetcher });
    const result = await repository.getCollection({ limit: 1000 });
    expect(result.limit).toBe(48);
    await expect(repository.getCollection({ offset: -1 })).rejects.toThrow(RangeError);
    await expect(repository.getCollection({ offset: Number.POSITIVE_INFINITY })).rejects.toThrow(
      RangeError,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('aborts a stalled network read and exposes a recoverable fallback', async () => {
    let aborted = false;
    const repository = createArtRepository({
      timeoutMs: 5,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            aborted = true;
            reject(new Error('aborted'));
          });
        }),
    });
    const result = await repository.getCollection();
    expect(aborted).toBe(true);
    expect(result.notice).toBe('indexer-unavailable');
  });

  it('rejects an excessive body before interpreting upstream content', async () => {
    const result = await createArtRepository({
      fetch: vi.fn().mockResolvedValue(
        new Response('{}', {
          headers: { 'content-length': '999999999' },
        }),
      ),
    }).getCollection();
    expect(result.source).toBe('curated-fallback');
  });
});

describe('individual artwork reads', () => {
  it('rejects path injection and unsafe IDs without contacting the source', async () => {
    const fetcher = vi.fn();
    const repository = createArtRepository({ fetch: fetcher });
    for (const id of ['../31', '-1', '1e3', 'Infinity', '9007199254740992']) {
      expect((await repository.getArtwork(id)).status).toBe('not-found');
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not substitute a curated work when the authoritative endpoint says it does not exist', async () => {
    const repository = createArtRepository({
      fetch: vi.fn().mockResolvedValue(response({ error: 'record not found' }, 400)),
    });
    expect(await repository.getArtwork(31)).toMatchObject({
      artwork: null,
      status: 'not-found',
      source: 'live',
    });
  });

  it('distinguishes unknown-token outage from confirmed absence', async () => {
    const repository = createArtRepository({
      fetch: vi.fn().mockRejectedValue(new Error('offline')),
    });
    expect(await repository.getArtwork(999)).toMatchObject({
      artwork: null,
      status: 'unavailable',
      notice: 'indexer-unavailable',
    });
  });

  it('never accepts a different token returned from the requested detail endpoint', async () => {
    const repository = createArtRepository({
      fetch: vi.fn().mockResolvedValue(response({ status: 1, TokenInfo: row(42) })),
    });
    expect((await repository.getArtwork(100)).status).toBe('unavailable');
  });

  it('uses only the matching archived token and never returns stale ownership', async () => {
    const repository = createArtRepository({
      fetch: vi.fn().mockRejectedValue(new Error('offline')),
    });
    const result = await repository.getArtwork(31);
    expect(result.artwork?.seed).toBe(getCuratedArtwork(31)?.seed);
    expect(result.artwork?.owner).toBeUndefined();
    expect(result.artwork?.provenance.ownership).toBe('unavailable');
    result.artwork!.title = 'Changed';
    expect(curatedArtworks.find((item) => item.id === 31)?.title).toBe('Signature 31');
  });

  it('retains indexed custody separately from the verified anchoring participant', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          status: 1,
          TokenInfo: {
            ...row(100),
            Staked: true,
            CurOwnerAddr: `0x${'1'.repeat(40)}`,
            StakedOwnerAddr: `0x${'2'.repeat(40)}`,
          },
        }),
      )
      .mockResolvedValueOnce(response({ schema_version: 2, assets: [] }));
    const result = await createArtRepository({ fetch: fetcher }).getArtwork(100);
    expect(result.artwork?.owner).toBe(`0x${'1'.repeat(40)}`);
    expect(result.artwork?.anchoring?.participant).toBe(`0x${'2'.repeat(40)}`);
    expect(result.artwork?.availability.ink).toBe('not-advertised');
  });
});

describe('collection media enrichment', () => {
  it('fetches only manifests for page items with at most six concurrent requests', async () => {
    const rows = Array.from({ length: 13 }, (_, i) => ({
      ...row(100 + i),
      Seed: `0x${'a'.repeat(62)}${i.toString(16).padStart(2, '0')}`,
    }));
    let inFlight = 0;
    let maximum = 0;
    const requested: string[] = [];
    const fetcher = vi.fn(async (url: string) => {
      requested.push(url);
      if (url.includes('/cst/list/')) return page(rows);
      inFlight++;
      maximum = Math.max(maximum, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight--;
      return response({
        schema_version: 2,
        assets: [
          {
            role: 'ember_web_full',
            path: 'images/web/ember_full.webp',
            kind: 'image',
            width: 3456,
            height: 2234,
          },
        ],
      });
    });
    const result = await createArtRepository({ fetch: fetcher }).getCollection({
      limit: 12,
      includeMedia: true,
    });
    expect(maximum).toBe(6);
    expect(result.items.map((item) => item.id)).toEqual(
      rows.slice(0, 12).map((item) => item.TokenId),
    );
    expect(result.items.every((item) => item.media.some((media) => media.id === 'ink'))).toBe(true);
    expect(requested).toHaveLength(13);
    expect(requested.some((url) => url.includes('/cst/info/'))).toBe(false);
    expect(requested.every((url) => url.startsWith(ART_API_ORIGIN))).toBe(true);
    expect(result.hasMore).toBe(true);
  });

  it('preserves known Light identity on a manifest failure without inventing Ink', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(page([row(100)]))
      .mockRejectedValueOnce(new Error('media service down'));
    const result = await createArtRepository({ fetch: fetcher }).getCollection({
      includeMedia: true,
    });
    expect(result.source).toBe('live');
    expect(result.items[0].media.map((item) => item.id)).toEqual(['light']);
    expect(result.items[0].availability).toMatchObject({ media: 'unverified', ink: 'unknown' });
  });

  it('never fetches URLs supplied by a malformed seed or manifest asset', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(page([{ TokenId: 100, Seed: 'https://evil.example/seed' }]));
    const result = await createArtRepository({ fetch: fetcher }).getCollection({
      includeMedia: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.items[0].media).toEqual([]);
  });
});
