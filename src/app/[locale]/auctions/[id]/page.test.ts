import { expect, it, vi } from 'vitest';
import { getArtwork } from '@/lib/art/server';
import AuctionWork from './page';

vi.mock('@/lib/art/server', () => ({ getArtwork: vi.fn() }));

it('does not hold the auction page behind a media service that never responds', async () => {
  vi.mocked(getArtwork).mockReturnValue(new Promise(() => {}));
  // The async media child is streamed independently; the financial panel can hydrate immediately.
  await expect(
    AuctionWork({ params: Promise.resolve({ locale: 'en', id: '31' }) }),
  ).resolves.toBeDefined();
}, 1000);
