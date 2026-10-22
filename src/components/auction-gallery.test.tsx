import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocked = vi.hoisted(() => ({ readBatch: vi.fn() }));
vi.mock('@/lib/auction/client', () => mocked);
vi.mock('./artwork-media', () => ({
  ArtworkMedia: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));
import AuctionGallery from './auction-gallery';
import { en } from '@/lib/i18n/en';
import { MINIMUM_BID } from '@/lib/auction/rules';
const lot = {
  roundNum: 4n,
  eligibleAt: 100n,
  endAt: 0n,
  highestBidder: '0x0000000000000000000000000000000000000000',
  highestBid: 0n,
  registered: true,
  settled: false,
  delivered: false,
  proceedsForwarded: false,
};
beforeEach(() => {
  vi.clearAllMocks();
});
describe('auction discovery keeps financial access independent of media', () => {
  it('retains all authenticated lot links when every media request fails', async () => {
    const ids = Array.from({ length: 8 }, (_, i) => 72 + i);
    mocked.readBatch.mockResolvedValue({
      count: 1n,
      ids,
      blockTime: 110n,
      lots: ids.map((tokenId) => ({ tokenId, lot })),
    });
    const fetch = vi.fn().mockRejectedValue(new Error('Media host unavailable'));
    vi.stubGlobal('fetch', fetch);
    render(<AuctionGallery locale="en" t={en} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(8));
    for (const id of ids)
      expect(screen.getByRole('link', { name: new RegExp(`Signature ${id}`) })).toHaveAttribute(
        'href',
        `/auctions/${id}`,
      );
    expect(screen.getAllByText(en.waiting)).toHaveLength(8);
    expect(screen.getAllByText(`${en.minimum}: 0.00001 ETH`)).toHaveLength(8);
  });
  it('keeps a failed media page from erasing a completed result or fabricating a price', async () => {
    mocked.readBatch.mockResolvedValue({
      count: 1n,
      ids: [72],
      blockTime: 300n,
      lots: [
        { tokenId: 72, lot: { ...lot, highestBid: MINIMUM_BID * 3n, endAt: 200n, settled: true } },
      ],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ artwork: null }, { status: 503 })),
    );
    render(<AuctionGallery locale="uk" t={en} />);
    expect(await screen.findByText(en.settled)).toBeVisible();
    expect(screen.getByText('0.00003 ETH')).toBeVisible();
    expect(screen.getByRole('link', { name: /Signature 72/ })).toHaveAttribute(
      'href',
      '/uk/auctions/72',
    );
  });
  it('limits media requests to four concurrently and aborts on unmount', async () => {
    const ids = Array.from({ length: 8 }, (_, i) => 72 + i);
    mocked.readBatch.mockResolvedValue({
      count: 1n,
      ids,
      blockTime: 110n,
      lots: ids.map((tokenId) => ({ tokenId, lot })),
    });
    const resolve: Array<(response: Response) => void> = [];
    const fetch = vi.fn(() => new Promise<Response>((done) => resolve.push(done)));
    vi.stubGlobal('fetch', fetch);
    const view = render(<AuctionGallery locale="en" t={en} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    await act(async () => {
      resolve.forEach((done) => done(Response.json({ artwork: null }, { status: 503 })));
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(8));
    const signal = (fetch.mock.calls[7] as unknown as [string, RequestInit])[1].signal!;
    view.unmount();
    expect(signal.aborted).toBe(true);
  });
});
