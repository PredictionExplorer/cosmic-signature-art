import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { getArtwork } from '@/lib/art/server';
import { generateMetadata as artMetadata } from './page';
import { generateMetadata as auctionMetadata } from '../../auctions/[id]/page';

vi.mock('@/lib/art/server', () => ({ getArtwork: vi.fn() }));

beforeEach(() => vi.mocked(getArtwork).mockReset());

describe.each([
  ['art', artMetadata],
  ['auctions', auctionMetadata],
] as const)('%s sharing identity', (section, generateMetadata) => {
  it('shares the requested artwork in Ink with its own canonical token identity', async () => {
    vi.mocked(getArtwork).mockResolvedValue({
      artwork: getCuratedArtwork(31)!,
      status: 'found',
      source: 'curated-fallback',
    });
    const result = await generateMetadata({ params: Promise.resolve({ locale: 'ja', id: '031' }) });
    expect(result.alternates?.canonical).toBe(`https://cosmic.art/ja/${section}/31`);
    if (section === 'art') {
      // An indexed work's card is drawn beside its route from its own rung; the page names no
      // image of its own and needs no live read to share it.
      expect(result.openGraph).not.toHaveProperty('images');
      expect(result.twitter).not.toHaveProperty('images');
      expect(getArtwork).not.toHaveBeenCalled();
      return;
    }
    expect(result.openGraph?.images).toEqual([
      expect.objectContaining({
        url: expect.stringMatching(/\/art\/31-ink\.webp$/),
        width: 3456,
        height: 2234,
      }),
    ]);
    expect(result.twitter?.images).toEqual(result.openGraph?.images);
    expect(getArtwork).toHaveBeenCalledWith(31);
  });

  it('uses a matching Light still when that token has no Ink', async () => {
    vi.mocked(getArtwork).mockResolvedValue({
      artwork: getCuratedArtwork(2)!,
      status: 'found',
      source: 'curated-fallback',
    });
    const result = await generateMetadata({ params: Promise.resolve({ locale: 'en', id: '2' }) });
    if (section === 'art') {
      expect(result.openGraph).not.toHaveProperty('images');
      return;
    }
    expect(result.openGraph?.images).toEqual([
      expect.objectContaining({ url: expect.stringMatching(/\/art\/2-light\.webp$/) }),
    ]);
  });

  it('does not substitute a different token image during an outage', async () => {
    vi.mocked(getArtwork).mockResolvedValue({
      artwork: null,
      status: 'unavailable',
      source: 'curated-fallback',
    });
    const result = await generateMetadata({ params: Promise.resolve({ locale: 'en', id: '999' }) });
    expect(getArtwork).toHaveBeenCalledWith(999);
    expect(result.openGraph).not.toHaveProperty('images');
    expect(result.twitter).not.toHaveProperty('images');
  });

  it('rejects malformed identity and unsupported locales before contacting the indexer', async () => {
    expect(
      await generateMetadata({ params: Promise.resolve({ locale: 'en', id: '1e2' }) }),
    ).toEqual({});
    expect(
      await generateMetadata({ params: Promise.resolve({ locale: 'invalid', id: '31' }) }),
    ).toEqual({});
    expect(getArtwork).not.toHaveBeenCalled();
  });
});
