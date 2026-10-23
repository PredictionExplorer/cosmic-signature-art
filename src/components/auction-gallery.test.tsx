import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocked = vi.hoisted(() => ({ readBatch: vi.fn() }));
const coordinator = vi.hoisted(() => ({
  use: vi.fn(),
  intent: vi.fn(),
  clearIntent: vi.fn(),
  fail: vi.fn(),
}));
vi.mock('./collection-motion', () => ({ useCollectionMotion: coordinator.use }));
vi.mock('./artwork-transition', () => ({
  ArtworkTransition: ({
    children,
    artworkId,
    interpretationId,
  }: {
    children: ReactNode;
    artworkId: number;
    interpretationId: string;
  }) => (
    <div data-transition-token={artworkId} data-transition-expression={interpretationId}>
      {children}
    </div>
  ),
}));
vi.mock('@/lib/auction/client', () => mocked);

import AuctionGallery from './auction-gallery';
import { en } from '@/lib/i18n/en';
import { MINIMUM_BID } from '@/lib/auction/rules';
import { getCuratedArtwork } from '@/lib/art/catalog';
import type { Artwork } from '@/lib/art/types';
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
  mocked.readBatch.mockReset();
  coordinator.use.mockReturnValue({
    gridRef: { current: null },
    activeId: null,
    intent: coordinator.intent,
    clearIntent: coordinator.clearIntent,
    fail: coordinator.fail,
  });
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
    expect(screen.getAllByText(en.openingBid)).toHaveLength(8);
    expect(screen.getAllByText('0.00001 ETH')).toHaveLength(8);
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

function batch(id = 72, highestBid = MINIMUM_BID) {
  return {
    count: 2n,
    ids: [id],
    blockTime: 110n,
    lots: [{ tokenId: id, lot: { ...lot, highestBid } }],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('auction discovery freshness and pagination', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ artwork: null })));
  });

  it('polls changed financial state without restarting media loading and skips hidden polling', async () => {
    vi.useFakeTimers();
    mocked.readBatch.mockResolvedValue(batch());
    render(<AuctionGallery locale="en" t={en} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('0.00001 ETH')).toBeVisible();
    expect(fetch).toHaveBeenCalledOnce();
    mocked.readBatch.mockResolvedValue(batch(72, MINIMUM_BID * 2n));
    await act(async () => {
      vi.advanceTimersByTime(12000);
    });
    expect(screen.getByText('0.00002 ETH')).toBeVisible();
    expect(fetch).toHaveBeenCalledOnce();
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    await act(async () => {
      vi.advanceTimersByTime(12000);
    });
    expect(mocked.readBatch).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    fireEvent(document, new Event('visibilitychange'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocked.readBatch).toHaveBeenCalledTimes(3);
  });

  it('retains lot access but hides stale prices during an unresolved RPC refresh', async () => {
    vi.useFakeTimers();
    mocked.readBatch.mockResolvedValue(batch());
    render(<AuctionGallery locale="en" t={en} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('0.00001 ETH')).toBeVisible();
    mocked.readBatch.mockReturnValue(new Promise(() => undefined));
    await act(async () => {
      vi.advanceTimersByTime(26000);
    });
    expect(screen.queryByText('0.00001 ETH')).toBeNull();
    expect(screen.getByText(en.liveUnavailable)).toBeVisible();
    expect(screen.getByRole('link', { name: /Signature 72/ })).toHaveAttribute(
      'href',
      '/auctions/72',
    );
    expect(mocked.readBatch).toHaveBeenCalledTimes(2);
  });

  it('clears previous-page lots while loading, blocks page skipping, and retains recovery navigation on failure', async () => {
    mocked.readBatch.mockResolvedValueOnce(batch()).mockRejectedValueOnce(new Error('RPC failure'));
    render(<AuctionGallery locale="en" t={en} />);
    await screen.findByRole('link', { name: /Signature 72/ });
    fireEvent.click(screen.getByRole('button', { name: en.older }));
    expect(screen.queryByRole('link', { name: /Signature 72/ })).toBeNull();
    expect(screen.getByRole('button', { name: en.older })).toBeDisabled();
    await screen.findByText(en.liveUnavailable);
    expect(screen.getByRole('button', { name: en.newer })).toBeEnabled();
    mocked.readBatch.mockResolvedValue(batch());
    fireEvent.click(screen.getByRole('button', { name: en.newer }));
    await screen.findByRole('link', { name: /Signature 72/ });
    expect(mocked.readBatch.mock.calls.map(([page]) => page)).toEqual([0, 1, 0]);
  });

  it('ignores an obsolete page result that completes after navigating back', async () => {
    const older = deferred<ReturnType<typeof batch>>();
    mocked.readBatch
      .mockResolvedValueOnce(batch())
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce(batch());
    render(<AuctionGallery locale="en" t={en} />);
    await screen.findByRole('link', { name: /Signature 72/ });
    fireEvent.click(screen.getByRole('button', { name: en.older }));
    fireEvent.click(screen.getByRole('button', { name: en.newer }));
    await screen.findByRole('link', { name: /Signature 72/ });
    await act(async () => older.resolve(batch(64)));
    expect(screen.queryByRole('link', { name: /Signature 64/ })).toBeNull();
    expect(screen.getByRole('link', { name: /Signature 72/ })).toBeVisible();
  });
});

const works: Artwork[] = [31, 23, 35].map((id) => {
  const archived = getCuratedArtwork(id)!;
  return {
    ...archived,
    media: archived.media
      .filter((media) => id !== 35 || media.id === 'light')
      .map((media) => ({
        ...media,
        previewFilm:
          id === 31 && media.id === 'ink'
            ? { ...media.films[0], src: '/art/previews/31-ink.mp4', durationSeconds: 8 }
            : undefined,
      })),
  };
});

function showArtworkMedia() {
  mocked.readBatch.mockResolvedValue({
    count: 1n,
    ids: works.map((work) => work.id),
    blockTime: 110n,
    lots: works.map(({ id }) => ({ tokenId: id, lot })),
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const id = Number(url.split('/').pop());
      return Response.json({ status: 'found', artwork: works.find((work) => work.id === id) });
    }),
  );
}

function card(id: number) {
  return screen.getByRole('link', { name: new RegExp(`Signature ${id}\\b`) });
}

describe('cinematic auction catalogue', () => {
  it('only makes verified compact Ink previews eligible, never complete originals', async () => {
    showArtworkMedia();
    const { container } = render(<AuctionGallery locale="en" t={en} />);
    await waitFor(() =>
      expect(coordinator.use).toHaveBeenLastCalledWith({ enabled: true, ids: [31] }),
    );
    expect(container.querySelectorAll('[data-collection-preview]')).toHaveLength(3);
    expect(card(31)).toHaveAttribute('data-preview-available', 'true');
    expect(card(23)).toHaveAttribute('data-preview-available', 'false');
    expect(card(35)).toHaveAttribute('data-preview-available', 'false');
    expect(container.querySelector('video')).toBeNull();
  });

  it('attaches only the selected compact source and releases it when switching to Light', async () => {
    showArtworkMedia();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    coordinator.use.mockImplementation(({ enabled }: { enabled: boolean }) => ({
      gridRef: { current: null },
      activeId: enabled ? 31 : null,
      intent: coordinator.intent,
      clearIntent: coordinator.clearIntent,
      fail: coordinator.fail,
    }));
    const { container } = render(<AuctionGallery locale="en" t={en} />);
    await waitFor(() =>
      expect(container.querySelector('video')).toHaveAttribute('src', '/art/previews/31-ink.mp4'),
    );
    const video = container.querySelector('video')!;
    expect(container.querySelectorAll('video')).toHaveLength(1);
    expect(card(31)).toHaveAttribute('data-motion', 'active');
    expect(card(23)).toHaveAttribute('data-motion', 'still');
    fireEvent.click(screen.getByRole('button', { name: en.light }));
    expect(container.querySelector('video')).toBeNull();
    expect(video).not.toHaveAttribute('src');
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });

  it('preserves the displayed expression in localized native links and shared surfaces', async () => {
    showArtworkMedia();
    const { container } = render(<AuctionGallery locale="ja" t={en} />);
    await waitFor(() =>
      expect(coordinator.use).toHaveBeenLastCalledWith({ enabled: true, ids: [31] }),
    );
    expect(card(31)).toHaveAttribute('href', '/ja/auctions/31');
    expect(card(35)).toHaveAttribute('href', '/ja/auctions/35?expression=light');
    expect(container.querySelector('[data-transition-token="31"]')).toHaveAttribute(
      'data-transition-expression',
      'ink',
    );
    fireEvent.click(screen.getByRole('button', { name: en.light }));
    expect(coordinator.use).toHaveBeenLastCalledWith({ enabled: false, ids: [] });
    for (const work of works)
      expect(card(work.id)).toHaveAttribute('href', `/ja/auctions/${work.id}?expression=light`);
    expect(container.querySelector('[data-transition-token="31"]')).toHaveAttribute(
      'data-transition-expression',
      'light',
    );
  });

  it('routes keyboard intent to the playback coordinator while preserving normal links', async () => {
    showArtworkMedia();
    render(<AuctionGallery locale="en" t={en} />);
    await screen.findByRole('link', { name: /Signature 31/ });
    fireEvent.focus(card(31));
    expect(coordinator.intent).toHaveBeenLastCalledWith(31, 'focus');
    fireEvent.blur(card(31));
    expect(coordinator.clearIntent).toHaveBeenLastCalledWith(31, 'focus');
    expect(card(31).tagName).toBe('A');
    expect(card(31)).not.toHaveAttribute('role', 'button');
  });

  it('retains opening rules and actual cycle/time when no bid has been placed', async () => {
    mocked.readBatch.mockResolvedValue({ ...batch(72, 0n), blockTime: 90n });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('No artwork yet')));
    const { container } = render(<AuctionGallery locale="en" t={en} />);
    expect(await screen.findByText(en.preview)).toBeVisible();
    expect(screen.getByText(en.openingBid)).toBeVisible();
    expect(screen.queryByText(en.highest)).toBeNull();
    expect(screen.getByText(`${en.cycle} 4`)).toBeVisible();
    expect(screen.getByText(en.eligible)).toBeVisible();
    expect(container.querySelector('time')).toHaveAttribute('dateTime', '1970-01-01T00:01:40.000Z');
  });

  it('shows the actual closing timestamp and current bid without inventing a countdown', async () => {
    const value = batch();
    value.lots[0].lot.endAt = 200n;
    mocked.readBatch.mockResolvedValue(value);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('No artwork yet')));
    const { container } = render(<AuctionGallery locale="en" t={en} />);
    expect(await screen.findByText(en.active)).toBeVisible();
    expect(screen.getByText(en.highest)).toBeVisible();
    expect(screen.queryByText(en.openingBid)).toBeNull();
    expect(screen.getByText(en.ends)).toBeVisible();
    expect(container.querySelector('time')).toHaveAttribute('dateTime', '1970-01-01T00:03:20.000Z');
  });

  it('ignores wrong-token and malformed media replies without losing on-chain lot access', async () => {
    mocked.readBatch.mockResolvedValue({
      count: 1n,
      ids: [72, 73],
      blockTime: 110n,
      lots: [72, 73].map((tokenId) => ({ tokenId, lot })),
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ status: 'found', artwork: works[0] }))
        .mockResolvedValueOnce(
          Response.json({ status: 'found', artwork: { id: 73, media: [null] } }),
        ),
    );
    const { container } = render(<AuctionGallery locale="en" t={en} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(card(72)).toHaveAttribute('href', '/auctions/72');
    expect(card(73)).toHaveAttribute('href', '/auctions/73');
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getAllByText('0.00001 ETH')).toHaveLength(2);
  });

  it('omits timestamps beyond the Date range while retaining the true lot amount', async () => {
    const value = batch();
    value.lots[0].lot.eligibleAt = (1n << 64n) - 1n;
    mocked.readBatch.mockResolvedValue(value);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('No artwork yet')));
    const { container } = render(<AuctionGallery locale="en" t={en} />);
    expect(await screen.findByText(en.preview)).toBeVisible();
    expect(container.querySelector('time')).toBeNull();
    expect(screen.getByText('0.00001 ETH')).toBeVisible();
  });
});
