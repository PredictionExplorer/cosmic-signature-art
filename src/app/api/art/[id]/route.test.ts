// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocked = vi.hoisted(() => ({ getArtwork: vi.fn() }));
vi.mock('@/lib/art/server', () => mocked);
import { GET } from './route';
import { getCuratedArtwork } from '@/lib/art/catalog';
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
});
