import { describe, expect, it, vi } from 'vitest';
import { createArtRepository } from './adapter';
import { curatedArtworks, getCuratedArtwork } from './catalog';
import { collectionIndex, indexedWork } from './collection-index';
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

  it('cancels an excessive declared body without consuming its stream', async () => {
    const cancel = vi.fn();
    const result = await createArtRepository({
      fetch: vi.fn().mockResolvedValue(
        new Response(new ReadableStream({ cancel }), {
          headers: { 'content-length': '999999999' },
        }),
      ),
    }).getCollection();
    expect(result.source).toBe('curated-fallback');
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('cancels a streamed body that exceeds the limit despite a misleading size header', async () => {
    const cancel = vi.fn();
    const result = await createArtRepository({
      fetch: vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
            },
            cancel,
          }),
          { headers: { 'content-length': '2' } },
        ),
      ),
    }).getCollection();
    expect(result.source).toBe('curated-fallback');
    expect(cancel).toHaveBeenCalledOnce();
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
    // 999 is in neither the registry nor the index: the venue cannot say, and does not guess.
    expect(indexedWork(999)).toBeUndefined();
    expect(await repository.getArtwork(999)).toMatchObject({
      artwork: null,
      status: 'unavailable',
      source: 'curated-fallback',
      notice: 'indexer-unavailable',
    });
  });

  it('never accepts a different token returned from the requested detail endpoint', async () => {
    const repository = createArtRepository({
      fetch: vi.fn().mockResolvedValue(response({ status: 1, TokenInfo: row(42) })),
    });
    expect((await repository.getArtwork(100)).status).toBe('unavailable');
    // Nor for a work the index holds: the wrong record is an unreadable one, and the snapshot
    // stands in with its own seed, never the other token's.
    const held = await repository.getArtwork(17);
    expect(held).toMatchObject({ status: 'found', source: 'index-snapshot' });
    expect(held.artwork).toMatchObject({ id: 17, seed: indexedWork(17)!.seed });
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

  // 17 is in the build-time index and not in the curated registry, as 57 of the 72 works are.
  const outages: [string, () => Promise<Response>][] = [
    ['rejects', () => Promise.reject(new TypeError('fetch failed'))],
    ['answers 500', async () => response({ error: 'internal' }, 500)],
    ['answers 503 with a page of HTML', async () => new Response('<html>', { status: 503 })],
    ['answers nonsense', async () => response({ status: 1, TokenInfo: { TokenId: '../1' } })],
    ['answers without its envelope', async () => response({ TokenInfo: row(17) })],
  ];
  it.each(outages)('finds a work the index holds when the indexer %s', async (_name, fetcher) => {
    expect(getCuratedArtwork(17)).toBeUndefined();
    const indexed = indexedWork(17)!;
    const result = await createArtRepository({ fetch: fetcher }).getArtwork(17);
    expect(result).toMatchObject({
      status: 'found',
      source: 'index-snapshot',
      notice: 'indexer-unavailable',
    });
    const artwork = result.artwork!;
    expect(artwork).toMatchObject({ id: 17, seed: indexed.seed, cycle: indexed.cycle });
    // Both expressions with the still's local rungs, so the plate paints from this origin.
    for (const expression of ['ink', 'light'] as const) {
      const media = artwork.media.find((item) => item.id === expression)!;
      expect(media.stillSha256).toBe(indexed.media[expression]!.still!.sha256);
      expect(media.rungs!.length).toBeGreaterThan(0);
      for (const rung of media.rungs!) expect(rung.src).toMatch(/^\/art\//);
    }
  });

  it('finds a work the index holds when the indexer stalls past the deadline', async () => {
    vi.useFakeTimers();
    try {
      const pending = createArtRepository({
        timeoutMs: 100,
        fetch: () => new Promise<Response>(() => {}),
      }).getArtwork(17);
      await vi.advanceTimersByTimeAsync(100);
      expect(await pending).toMatchObject({
        status: 'found',
        source: 'index-snapshot',
        notice: 'indexer-unavailable',
        artwork: { id: 17 },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('dates a record from the index by the day the index was read, and names no holder', async () => {
    const result = await createArtRepository({
      fetch: vi.fn().mockRejectedValue(new Error('offline')),
    }).getArtwork(17);
    const { provenance } = result.artwork!;
    // The entry stamps the present moment on a live record only (artwork-entry.tsx): a
    // snapshot must never be called live, or the page would say it was read just now.
    expect(provenance.source).toBe('index-snapshot');
    expect(provenance.checkedOn).toBe(collectionIndex.checkedOn);
    expect(provenance.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(provenance.ownership).toBe('unavailable');
    expect(result.artwork!.owner).toBeUndefined();
  });

  it('hands out its own copy of an indexed record each time', async () => {
    const repository = createArtRepository({
      fetch: vi.fn().mockRejectedValue(new Error('offline')),
    });
    const first = (await repository.getArtwork(17)).artwork!;
    first.title = 'Changed';
    first.media.length = 0;
    const second = (await repository.getArtwork(17)).artwork!;
    expect(second.title).not.toBe('Changed');
    expect(second.media.length).toBeGreaterThan(0);
  });

  it('does not find an indexed work the indexer says does not exist', async () => {
    const repository = createArtRepository({
      fetch: vi.fn().mockResolvedValue(response({ error: 'record not found' }, 400)),
    });
    expect(indexedWork(17)).toBeDefined();
    expect(await repository.getArtwork(17)).toEqual({
      artwork: null,
      status: 'not-found',
      source: 'live',
    });
  });

  it('prefers the curated registry to the index for a work both hold', async () => {
    const repository = createArtRepository({
      fetch: vi.fn().mockRejectedValue(new Error('offline')),
    });
    expect(indexedWork(31)).toBeDefined();
    const result = await repository.getArtwork(31);
    expect(result).toMatchObject({
      status: 'found',
      source: 'curated-fallback',
      notice: 'indexer-unavailable',
    });
    expect(result.artwork).toEqual(getCuratedArtwork(31));
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

describe('a search for a number', () => {
  const offline = () => vi.fn().mockRejectedValue(new Error('offline'));

  it('is a search of the collection while the indexer answers', async () => {
    const found = vi
      .fn()
      .mockResolvedValueOnce(response({ status: 1, TokenInfo: row(17) }))
      .mockResolvedValueOnce(response({ schema_version: 2, assets: [] }));
    expect(
      await createArtRepository({ fetch: found }).getCollection({ query: '#17' }),
    ).toMatchObject({ source: 'live', scope: 'search', total: 1, notice: undefined });
    const absent = vi.fn().mockResolvedValue(response({ error: 'record not found' }, 400));
    expect(
      await createArtRepository({ fetch: absent }).getCollection({ query: '17' }),
    ).toMatchObject({ source: 'live', scope: 'search', total: 0, items: [], notice: undefined });
  });

  it.each(['17', '#17'])(
    'finds %s in the index during an outage, and never calls that a search of the collection',
    async (query) => {
      const repository = createArtRepository({ fetch: offline() });
      const result = await repository.getCollection({ query });
      expect(result.items.map((item) => item.id)).toEqual([17]);
      expect(result.items[0].provenance.source).toBe('index-snapshot');
      expect(result).toMatchObject({
        source: 'index-snapshot',
        scope: 'curated-selection',
        notice: 'search-unavailable',
        total: 1,
        hasMore: false,
        nextOffset: null,
      });
      // The one work is the whole answer: a later page of it holds nothing.
      expect((await repository.getCollection({ query, offset: 24 })).items).toEqual([]);
    },
  );

  it('answers from the registry for a curated number during an outage, as before', async () => {
    const result = await createArtRepository({ fetch: offline() }).getCollection({ query: '31' });
    expect(result.items).toEqual([getCuratedArtwork(31)]);
    expect(result).toMatchObject({
      source: 'curated-fallback',
      scope: 'curated-selection',
      notice: 'search-unavailable',
      total: 1,
    });
  });

  it('cannot count a number the venue does not hold during an outage', async () => {
    const result = await createArtRepository({ fetch: offline() }).getCollection({ query: '999' });
    expect(result).toMatchObject({
      items: [],
      source: 'curated-fallback',
      scope: 'curated-selection',
      notice: 'search-unavailable',
      total: null,
    });
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
