import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocked = vi.hoisted(() => ({ readBatch: vi.fn() }));
const coordinator = vi.hoisted(() => ({
  use: vi.fn(),
  intent: vi.fn(),
  clearIntent: vi.fn(),
  fail: vi.fn(),
  rest: vi.fn(),
}));
const motion = vi.hoisted(() => ({ paused: false, theatre: 'playing' as 'playing' | 'hushed' }));
vi.mock('./collection-motion', () => ({ useCollectionMotion: coordinator.use }));
vi.mock('./motion-provider', () => ({
  useMotion: () => motion,
  setTheatre: vi.fn(),
  MotionProvider: ({ children }: { children: ReactNode }) => children,
}));
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
vi.mock('@/lib/auction/activity', () => ({ readActivity: vi.fn() }));

import AuctionGallery from './auction-gallery';
import { HOLD_MS } from './artwork-media';
import { stubDialog } from '../../tests/dialog-support';
import { en } from '@/lib/i18n/en';
import { MINIMUM_BID } from '@/lib/auction/rules';
import { getCuratedArtwork } from '@/lib/art/catalog';
import type { Artwork } from '@/lib/art/types';

class VisibilityObserver implements IntersectionObserver {
  static instances: VisibilityObserver[] = [];
  readonly root = null;
  readonly rootMargin = '0px';
  readonly thresholds = [0];
  private targets = new Set<Element>();
  constructor(private readonly callback: IntersectionObserverCallback) {
    VisibilityObserver.instances.push(this);
  }
  observe(target: Element) {
    this.targets.add(target);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  setVisible(visible: boolean) {
    this.callback(
      [...this.targets].map((target): IntersectionObserverEntry => ({
        target,
        isIntersecting: visible,
        intersectionRatio: visible ? 1 : 0,
        boundingClientRect: target.getBoundingClientRect(),
        intersectionRect: target.getBoundingClientRect(),
        rootBounds: null,
        time: 0,
      })),
      this,
    );
  }
}

/** Animation frames are queued and flushed by hand, as a browser would paint them later. */
const frames: FrameRequestCallback[] = [];
function paint() {
  act(() => {
    for (const callback of frames.splice(0)) callback(0);
  });
}

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
const bidder = '0x6308000000000000000000000000000000001F7C';
let activeId: number | null = null;
beforeEach(() => {
  vi.clearAllMocks();
  mocked.readBatch.mockReset();
  activeId = null;
  coordinator.use.mockImplementation(() => ({
    gridRef: { current: null },
    activeId,
    intent: coordinator.intent,
    clearIntent: coordinator.clearIntent,
    fail: coordinator.fail,
    rest: coordinator.rest,
  }));
  VisibilityObserver.instances = [];
  vi.stubGlobal('IntersectionObserver', VisibilityObserver);
  frames.length = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  stubDialog();
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-sit');
  document.documentElement.style.removeProperty('--plate-tone');
  document.documentElement.removeAttribute('data-plate-material');
});

const lotName = (n: number, id: number) => `Lot ${n} · № ${String(id).padStart(3, '0')}`;

describe('the catalogue keeps financial access independent of media', () => {
  it('hangs every lot with its chain line when every media request fails', async () => {
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
    ids.forEach((id, index) => {
      const article = screen.getByRole('article', { name: lotName(index + 1, id) });
      expect(within(article).getByRole('link', { name: en.collect })).toHaveAttribute(
        'href',
        `/auctions/${id}${index % 2 ? '?expression=light' : ''}`,
      );
      expect(article).toHaveAttribute('data-expression', index % 2 ? 'light' : 'ink');
    });
    expect(screen.getAllByText('Available to start · opening minimum 0.00001 ETH')).toHaveLength(8);
    // The venue could not read the media; it says so, and never that none was published.
    expect(await screen.findAllByText(en.mediaUnavailable)).toHaveLength(8);
    expect(screen.queryByText(en.mediaNotPublished)).toBeNull();
    expect(screen.getByRole('navigation', { name: en.orderOfSale })).toHaveTextContent('№ 072');
  });

  it('says nothing while a record is pending, "not yet published" only from the publisher, and "unavailable" otherwise', async () => {
    const ids = [72, 73, 74, 75];
    mocked.readBatch.mockResolvedValue({
      count: 1n,
      ids,
      blockTime: 110n,
      lots: ids.map((tokenId) => ({ tokenId, lot })),
    });
    const record = (id: number, notice?: string) => ({
      status: 'found',
      source: 'live',
      artwork: { id, title: `Signature ${id}`, media: [] },
      ...(notice ? { notice } : {}),
    });
    const fetch = vi.fn((url: string) => {
      if (url.endsWith('/72')) return new Promise<Response>(() => {});
      if (url.endsWith('/73')) return Promise.resolve(Response.json(record(73)));
      if (url.endsWith('/74'))
        return Promise.resolve(
          Response.json({ status: 'unavailable', artwork: null }, { status: 503 }),
        );
      return Promise.resolve(Response.json(record(75, 'media-unavailable')));
    });
    vi.stubGlobal('fetch', fetch);
    render(<AuctionGallery locale="en" t={en} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    const article = (n: number, id: number) =>
      screen.getByRole('article', { name: lotName(n, id) });
    await waitFor(() =>
      expect(within(article(2, 73)).getByText(en.mediaNotPublished)).toBeInTheDocument(),
    );
    expect(within(article(3, 74)).getByText(en.mediaUnavailable)).toBeInTheDocument();
    expect(within(article(4, 75)).getByText(en.mediaUnavailable)).toBeInTheDocument();
    expect(within(article(1, 72)).queryByText(en.mediaNotPublished)).toBeNull();
    expect(within(article(1, 72)).queryByText(en.mediaUnavailable)).toBeNull();
  });

  it('keeps a failed media page from erasing a settled result or inventing a price', async () => {
    mocked.readBatch.mockResolvedValue({
      count: 1n,
      ids: [72],
      blockTime: 300n,
      lots: [
        {
          tokenId: 72,
          lot: {
            ...lot,
            highestBid: MINIMUM_BID * 3n,
            highestBidder: bidder,
            endAt: 200n,
            settled: true,
          },
        },
      ],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ artwork: null }, { status: 503 })),
    );
    render(<AuctionGallery locale="uk" t={en} />);
    // The failed media read settles on its own clock; the chain line must not wait on it.
    expect(
      await screen.findByText(
        'Settled · 0.00003 ETH · won by 0x6308…1F7C · awaiting delivery',
        {},
        { timeout: 5000 },
      ),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: en.collect })).toHaveAttribute(
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

function batch(id = 72, highestBid = 0n) {
  return {
    count: 2n,
    ids: [id],
    blockTime: 110n,
    lots: [
      {
        tokenId: id,
        lot: {
          ...lot,
          highestBid,
          highestBidder: highestBid ? bidder : lot.highestBidder,
          endAt: highestBid ? 9_000n : 0n,
        },
      },
    ],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('catalogue freshness and the order of sale as pager', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ artwork: null })));
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      timeZone: 'UTC',
    } as Intl.ResolvedDateTimeFormatOptions);
  });

  it('polls changed financial state without restarting media loading and skips hidden polling', async () => {
    vi.useFakeTimers();
    mocked.readBatch.mockResolvedValue(batch());
    render(<AuctionGallery locale="en" t={en} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText(/opening minimum 0.00001 ETH/)).toBeVisible();
    expect(fetch).toHaveBeenCalledOnce();
    mocked.readBatch.mockResolvedValue(batch(72, MINIMUM_BID * 2n));
    await act(async () => {
      vi.advanceTimersByTime(12000);
    });
    expect(screen.getByText(/Bidding open · 0.00002 ETH/)).toBeVisible();
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

  it('retains the lot but withholds a stale chain line during an unresolved refresh', async () => {
    vi.useFakeTimers();
    mocked.readBatch.mockResolvedValue(batch());
    render(<AuctionGallery locale="en" t={en} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText(/0.00001 ETH/)).toBeVisible();
    mocked.readBatch.mockReturnValue(new Promise(() => undefined));
    await act(async () => {
      vi.advanceTimersByTime(26000);
    });
    expect(screen.queryByText(/0.00001 ETH/)).toBeNull();
    expect(screen.getByText(en.liveUnavailable)).toBeVisible();
    expect(screen.getByRole('article', { name: lotName(1, 72) })).toBeVisible();
    expect(mocked.readBatch).toHaveBeenCalledTimes(2);
  });

  it('clears previous-page lots while loading, blocks page skipping, and retains recovery navigation on failure', async () => {
    mocked.readBatch.mockResolvedValueOnce(batch()).mockRejectedValueOnce(new Error('RPC failure'));
    render(<AuctionGallery locale="en" t={en} />);
    await screen.findByRole('article', { name: lotName(1, 72) });
    fireEvent.click(screen.getByRole('button', { name: en.older }));
    expect(screen.queryByRole('article', { name: lotName(1, 72) })).toBeNull();
    expect(screen.getByRole('button', { name: en.older })).toBeDisabled();
    await screen.findByText(en.liveUnavailable);
    expect(screen.getByRole('button', { name: en.newer })).toBeEnabled();
    mocked.readBatch.mockResolvedValue(batch());
    fireEvent.click(screen.getByRole('button', { name: en.newer }));
    await screen.findByRole('article', { name: lotName(1, 72) });
    expect(mocked.readBatch.mock.calls.map(([page]) => page)).toEqual([0, 1, 0]);
  });

  it('ignores an obsolete page result that completes after navigating back', async () => {
    const older = deferred<ReturnType<typeof batch>>();
    mocked.readBatch
      .mockResolvedValueOnce(batch())
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce(batch());
    render(<AuctionGallery locale="en" t={en} />);
    await screen.findByRole('article', { name: lotName(1, 72) });
    fireEvent.click(screen.getByRole('button', { name: en.older }));
    fireEvent.click(screen.getByRole('button', { name: en.newer }));
    await screen.findByRole('article', { name: lotName(1, 72) });
    await act(async () => older.resolve(batch(64)));
    expect(screen.queryByRole('article', { name: lotName(1, 64) })).toBeNull();
    expect(screen.getByRole('article', { name: lotName(1, 72) })).toBeVisible();
  });
});

const curated: Record<number, Artwork> = Object.fromEntries(
  [31, 23, 35].map((id) => [id, getCuratedArtwork(id)!]),
);
const traits = {
  31: { structure: 'Orbit Ribbons', underlay: 'Harmonic Weave', fate: 'Eternal Dance', cycle: 1 },
};

function showPlates() {
  mocked.readBatch.mockResolvedValue({
    count: 1n,
    ids: [31, 23, 35],
    blockTime: 110n,
    lots: [31, 23, 35].map((tokenId) => ({ tokenId, lot })),
  });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ artwork: null }, { status: 503 })),
  );
}

describe('the lots as plates', () => {
  it('alternates Ink on paper and Light on black, paints from the curated archive, and lends the lease only settling clips', async () => {
    showPlates();
    render(<AuctionGallery locale="en" t={en} traits={traits} curated={curated} />);
    const first = await screen.findByRole('article', { name: lotName(1, 31) });
    expect(first).toHaveAttribute('data-expression', 'ink');
    expect(screen.getByRole('article', { name: lotName(2, 23) })).toHaveAttribute(
      'data-expression',
      'light',
    );
    expect(screen.getByRole('article', { name: lotName(3, 35) })).toHaveAttribute(
      'data-expression',
      'ink',
    );
    expect(within(first).getByRole('img')).toHaveAttribute('alt', '№ 031 · Ink');
    expect(first).toHaveTextContent(
      '№ 031 · Cycle 1 · Orbit Ribbons · Harmonic Weave · Eternal Dance',
    );
    expect(first).toHaveAttribute('data-preview-available', 'true');
    // The curated archive records no Light film, so no Light settling clip binds until the
    // live record arrives; the lease is offered only what can honestly move.
    expect(screen.getByRole('article', { name: lotName(2, 23) })).toHaveAttribute(
      'data-preview-available',
      'false',
    );
    expect(coordinator.use).toHaveBeenLastCalledWith({ enabled: true, ids: [31, 35] });
    expect(screen.queryByText(en.mediaNotPublished)).toBeNull();
    expect(document.querySelectorAll('video')).toHaveLength(0);
  });

  it('plays the settling clip of the lot the lease names, never the excerpt, and rests it at the end', async () => {
    showPlates();
    activeId = 31;
    render(<AuctionGallery locale="en" t={en} curated={curated} />);
    const first = await screen.findByRole('article', { name: lotName(1, 31) });
    act(() => VisibilityObserver.instances.forEach((observer) => observer.setVisible(true)));
    const video = await waitFor(() => {
      const element = first.querySelector('video');
      expect(element).not.toBeNull();
      return element!;
    });
    expect(video.getAttribute('src')).toMatch(/^\/art\/clips\/31-ink-settling-[a-f0-9]{16}\.mp4$/);
    expect(document.querySelectorAll('video')).toHaveLength(1);
    // The clip's last frame is held and faded into the still before the lease moves on.
    vi.useFakeTimers();
    fireEvent.ended(video);
    expect(coordinator.rest).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(HOLD_MS + 699);
    });
    expect(coordinator.rest).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(coordinator.rest).toHaveBeenCalledWith(31);
    vi.useRealTimers();
    fireEvent.pointerEnter(screen.getByRole('article', { name: lotName(2, 23) }), {
      pointerType: 'mouse',
    });
    expect(coordinator.intent).toHaveBeenCalledWith(23, 'pointer', 'mouse');
  });

  it('asks a rested lot to play again from the start when the lease names it anew', async () => {
    showPlates();
    activeId = 31;
    const view = render(<AuctionGallery locale="en" t={en} curated={curated} />);
    const first = await screen.findByRole('article', { name: lotName(1, 31) });
    act(() => VisibilityObserver.instances.forEach((observer) => observer.setVisible(true)));
    const video = await waitFor(() => {
      const element = first.querySelector('video');
      expect(element).not.toBeNull();
      return element!;
    });
    vi.useFakeTimers();
    fireEvent.ended(video);
    act(() => {
      vi.advanceTimersByTime(HOLD_MS + 700);
    });
    vi.useRealTimers();
    // The lease moves on, then names the rested lot again: it is asked to play from frame 0.
    // (The lots are memoised; a fresh catalog object stands in for the lease's own re-render.)
    activeId = 23;
    view.rerender(<AuctionGallery locale="en" t={{ ...en }} curated={curated} />);
    expect(first).toHaveAttribute('data-motion', 'still');
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    activeId = 31;
    view.rerender(<AuctionGallery locale="en" t={{ ...en }} curated={curated} />);
    await waitFor(() => expect(play).toHaveBeenCalled());
    expect((first.querySelector('video') as HTMLVideoElement).currentTime).toBe(0);
  });

  it("Sit fades the lot's chrome and the running head until the next input after the press", async () => {
    vi.useFakeTimers();
    showPlates();
    render(<AuctionGallery locale="en" t={en} curated={curated} />);
    await act(async () => {
      await Promise.resolve();
    });
    const first = screen.getByRole('article', { name: lotName(1, 31) });
    fireEvent.click(within(first).getByRole('button', { name: en.sit }));
    expect(first).toHaveAttribute('data-sit', '');
    expect(document.documentElement).toHaveAttribute('data-sit', '');
    fireEvent.pointerMove(window);
    expect(first).toHaveAttribute('data-sit', '');
    await act(async () => {
      vi.advanceTimersByTime(700);
    });
    fireEvent.pointerMove(window);
    expect(first).not.toHaveAttribute('data-sit');
    expect(document.documentElement).not.toHaveAttribute('data-sit');
  });

  it('lends the running head the ground of the lot beneath it', async () => {
    showPlates();
    coordinator.use.mockImplementation(() => ({
      gridRef: { current: document.body },
      activeId: null,
      intent: coordinator.intent,
      clearIntent: coordinator.clearIntent,
      fail: coordinator.fail,
      rest: coordinator.rest,
    }));
    const rects = new Map<string, DOMRect>();
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const id = (this as HTMLElement).dataset?.lotId;
      return (
        (id ? rects.get(id) : undefined) ??
        ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0 } as DOMRect)
      );
    });
    render(<AuctionGallery locale="en" t={en} curated={curated} />);
    await screen.findByRole('article', { name: lotName(2, 23) });
    paint();
    rects.set('23', { top: -10, bottom: 800 } as DOMRect);
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    paint();
    expect(document.documentElement.style.getPropertyValue('--plate-tone')).toBe('#000000');
    expect(document.documentElement).toHaveAttribute('data-plate-material', 'night');
    rects.clear();
    rects.set('31', { top: 0, bottom: 900 } as DOMRect);
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    paint();
    expect(document.documentElement.style.getPropertyValue('--plate-tone')).toBe('#efe9dd');
    expect(document.documentElement).toHaveAttribute('data-plate-material', 'paper');
    // Nothing beneath the head: the route's own ground returns.
    rects.clear();
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    paint();
    expect(document.documentElement.style.getPropertyValue('--plate-tone')).toBe('');
  });
});
