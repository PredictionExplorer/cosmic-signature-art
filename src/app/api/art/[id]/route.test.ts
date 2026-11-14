// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocked = vi.hoisted(() => ({ getArtwork: vi.fn() }));
vi.mock('@/lib/art/server', () => mocked);
import { GET } from './route';
import { createArtRepository } from '@/lib/art/adapter';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { collectionIndex, indexedWork } from '@/lib/art/collection-index';
describe('public artwork route', () => {
  beforeEach(() => vi.clearAllMocks());
  it.each(['-1', '1.5', '9007199254740992', '%2f..'])(
    'rejects invalid token %s without upstream requests',
    async (id) => {
      const response = await GET(new Request('http://localhost/api/art/' + id), {
        params: Promise.resolve({ id }),
      });
      expect(response.status).toBe(404);
      expect(mocked.getArtwork).not.toHaveBeenCalled();
    },
  );
  it('returns the validated artwork with a bounded public cache lifetime', async () => {
    mocked.getArtwork.mockResolvedValue({
      status: 'found',
      source: 'curated-fallback',
      artwork: getCuratedArtwork(23),
    });
    const response = await GET(new Request('http://localhost/api/art/23'), {
      params: Promise.resolve({ id: '23' }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).artwork.id).toBe(23);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=30, s-maxage=60');
  });
  it('does not cache an outage as a permanent missing artwork', async () => {
    mocked.getArtwork.mockResolvedValue({
      status: 'unavailable',
      source: 'curated-fallback',
      artwork: null,
    });
    const response = await GET(new Request('http://localhost/api/art/99'), {
      params: Promise.resolve({ id: '99' }),
    });
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  describe('with the real reader and an indexer that cannot be read', () => {
    const get = (id: number) =>
      GET(new Request(`http://localhost/api/art/${id}`), {
        params: Promise.resolve({ id: String(id) }),
      });
    const outage = () =>
      mocked.getArtwork.mockImplementation(
        createArtRepository({ fetch: () => Promise.reject(new TypeError('fetch failed')) })
          .getArtwork,
      );

    it('answers 200 with the index’s record of a work, marked as the snapshot it is', async () => {
      // On purpose: this was a 503 for every work outside the curated registry. The sale's
      // catalogue reads this route for a lot's pictures, and the venue holds them.
      outage();
      expect(getCuratedArtwork(17)).toBeUndefined();
      const response = await get(17);
      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=30, s-maxage=60');
      const body = await response.json();
      expect(body).toMatchObject({
        status: 'found',
        source: 'index-snapshot',
        notice: 'indexer-unavailable',
        artwork: {
          id: 17,
          seed: indexedWork(17)!.seed,
          provenance: {
            source: 'index-snapshot',
            checkedOn: collectionIndex.checkedOn,
            ownership: 'unavailable',
          },
        },
      });
      expect(body.artwork.owner).toBeUndefined();
      expect(body.artwork.media.map((media: { id: string }) => media.id)).toEqual(['light', 'ink']);
    });

    it('still answers 503, uncached, for a number the venue does not hold', async () => {
      outage();
      const response = await get(999);
      expect(response.status).toBe(503);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(await response.json()).toMatchObject({ status: 'unavailable', artwork: null });
    });

    it('answers 404 for an indexed number the indexer says does not exist', async () => {
      mocked.getArtwork.mockImplementation(
        createArtRepository({
          fetch: async () =>
            new Response(JSON.stringify({ error: 'record not found' }), { status: 400 }),
        }).getArtwork,
      );
      const response = await get(17);
      expect(response.status).toBe(404);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    });
  });
});
