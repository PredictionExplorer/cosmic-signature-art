import { describe, expect, it, vi } from 'vitest';
import { DEPLOYMENT_URL, venueCard } from '@/lib/site';

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const { CARD } = await import('@/components/sharing-card');
const door = await import('./page');
const work = await import('./[id]/page');

type Shared = { openGraph?: { images?: unknown }; twitter?: { images?: unknown } };
const pictures = (shared: Shared) => ({
  openGraph: shared.openGraph?.images as { url: string; width: number; height: number }[],
  twitter: shared.twitter?.images as { url: string }[],
});

describe('how the proof is shared', () => {
  it('names the venue’s card at the size the card is drawn', () => {
    expect(venueCard('uk')).toMatchObject({ url: '/uk/opengraph-image', ...CARD });
  });

  // A page's sharing words replace the frame's whole, its card with them: a page that names
  // no image is shared as bare text, however the frame is set.
  it.each(['en', 'uk'] as const)('shares the door with the venue’s card (%s)', async (locale) => {
    const shared = pictures(
      (await door.generateMetadata({ params: Promise.resolve({ locale }) })) as Shared,
    );
    expect(shared.openGraph[0]).toMatchObject({
      url: `${DEPLOYMENT_URL}/${locale}/opengraph-image`,
      ...CARD,
    });
    expect(shared.twitter[0].url).toBe(shared.openGraph[0].url);
  });

  it.each(['en', 'ja'] as const)(
    'shares a work’s proof with the venue’s card (%s)',
    async (locale) => {
      const shared = pictures(
        (await work.generateMetadata({ params: Promise.resolve({ locale, id: '31' }) })) as Shared,
      );
      expect(shared.openGraph[0]).toMatchObject({
        url: `${DEPLOYMENT_URL}/${locale}/opengraph-image`,
        ...CARD,
      });
      expect(shared.twitter[0].url).toBe(shared.openGraph[0].url);
    },
  );
});
