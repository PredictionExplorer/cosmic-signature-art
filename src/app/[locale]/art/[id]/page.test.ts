import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { getArtwork } from '@/lib/art/server';
import { workDescription } from '@/lib/art/work-description';
import { messages } from '@/lib/i18n/messages';
import { locales } from '@/lib/i18n/routing';
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

describe('a work page’s description', () => {
  it('is the venue’s own line for that work, in the page’s language, wherever it is read', async () => {
    for (const locale of locales) {
      const result = await artMetadata({ params: Promise.resolve({ locale, id: '31' }) });
      const said = workDescription(31, messages(locale), locale);
      // A search result, a shared link and a card all say the one thing.
      expect(result.description, locale).toBe(said);
      expect(result.openGraph?.description, locale).toBe(said);
      expect(result.twitter?.description, locale).toBe(said);
    }
    const english = await artMetadata({ params: Promise.resolve({ locale: 'en', id: '31' }) });
    expect(english.description).toBe(
      'Three bodies, together for all 1,000,000 steps this work records. They are still bound to one another at step 8,000,000, where the record stops looking.',
    );
    // The token's own text said "fate: eternal dance" here, in English under every language.
    const ukrainian = await artMetadata({ params: Promise.resolve({ locale: 'uk', id: '31' }) });
    expect(ukrainian.description).toMatch(/^Три тіла, разом упродовж усіх/);
    expect(ukrainian.description).not.toMatch(/eternal|Round|[A-Za-z]/);
    expect(getArtwork).not.toHaveBeenCalled();
  });

  it('describes a work the venue holds no record for as every work is', async () => {
    vi.mocked(getArtwork).mockResolvedValue({
      artwork: null,
      status: 'unavailable',
      source: 'curated-fallback',
    });
    for (const locale of ['en', 'ko'] as const) {
      const result = await artMetadata({ params: Promise.resolve({ locale, id: '999' }) });
      expect(result.description).toBe(messages(locale).statementLine);
      expect(result.openGraph?.description).toBe(messages(locale).statementLine);
    }
  });
});
