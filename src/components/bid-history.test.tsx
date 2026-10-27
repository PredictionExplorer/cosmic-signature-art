import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEther } from 'viem';
import { en } from '@/lib/i18n/en';
import type { Snapshot } from '@/lib/auction/client';
import type { BidHistory as History } from '@/lib/auction/history';

const mocks = vi.hoisted(() => ({ readBidHistory: vi.fn() }));
vi.mock('@/lib/auction/history', () => ({ readBidHistory: mocks.readBidHistory }));

import { BidHistory } from './bid-history';

const bidder = '0x6308000000000000000000000000000000001F7C';
const other = '0x7406000000000000000000000000000000006c6c';
const hash = `0x${'ab'.repeat(32)}` as const;
function snapshot(overrides: Partial<Snapshot['lot']> = {}): Snapshot {
  return {
    lot: {
      roundNum: 2n,
      eligibleAt: 1_000n,
      endAt: 9_000n,
      highestBidder: bidder,
      highestBid: parseEther('0.42'),
      registered: true,
      settled: false,
      delivered: false,
      proceedsForwarded: false,
      ...overrides,
    },
    minimum: parseEther('0.462'),
    refund: 0n,
    blockTime: 5_000n,
    blockNumber: 777n,
    fetchedAt: Date.now(),
  };
}
const history: History = {
  entries: [
    {
      kind: 'bid',
      bidder,
      amount: parseEther('0.42'),
      ethPaid: parseEther('0.42'),
      endAt: 9_000n,
      blockNumber: 700n,
      logIndex: 2,
      transactionHash: hash,
      timestamp: 1_762_783_200n,
    },
    {
      kind: 'bid',
      bidder: other,
      amount: parseEther('0.3'),
      ethPaid: parseEther('0.3'),
      endAt: 9_000n,
      blockNumber: 650n,
      logIndex: 0,
      transactionHash: `0x${'cd'.repeat(32)}`,
      timestamp: null,
    },
  ],
  complete: true,
  truncated: false,
  fromBlock: 0n,
  toBlock: 777n,
};

beforeEach(() => {
  mocks.readBidHistory.mockReset();
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
    timeZone: 'UTC',
  } as Intl.ResolvedDateTimeFormatOptions);
});
afterEach(() => vi.restoreAllMocks());

describe('the bid history', () => {
  it("lists the contract's bids newest first with amount, wallet, block time and the transaction", async () => {
    mocks.readBidHistory.mockResolvedValue(history);
    render(<BidHistory tokenId={31} t={en} locale="en" snapshot={snapshot()} />);
    expect(await screen.findByText('0.42 ETH · 0x6308…1F7C · Nov 10, 14:00 UTC')).toBeVisible();
    expect(screen.getByText('0.3 ETH · 0x7406…6c6c')).toBeVisible();
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', `https://arbiscan.io/tx/${hash}`);
    expect(mocks.readBidHistory).toHaveBeenCalledWith(31, {
      latestBlock: 777n,
      blockTime: 5_000n,
      since: 1_000n,
    });
    expect(screen.queryByText(en.historyPartial)).toBeNull();
  });

  it('reads nothing before a first bid, and says so', () => {
    render(
      <BidHistory
        tokenId={31}
        t={en}
        locale="en"
        snapshot={snapshot({ endAt: 0n, highestBid: 0n })}
      />,
    );
    expect(screen.getByText(en.historyNone)).toBeVisible();
    expect(mocks.readBidHistory).not.toHaveBeenCalled();
  });

  it('names an unreadable or incomplete history instead of inventing one', async () => {
    mocks.readBidHistory.mockRejectedValue(new Error('rate limited'));
    const view = render(<BidHistory tokenId={31} t={en} locale="en" snapshot={snapshot()} />);
    expect(await screen.findByRole('status')).toHaveTextContent(en.bidHistoryUnavailable);
    mocks.readBidHistory.mockResolvedValue({ ...history, complete: false });
    view.rerender(
      <BidHistory
        tokenId={31}
        t={en}
        locale="en"
        snapshot={snapshot({ highestBid: parseEther('1') })}
      />,
    );
    expect(await screen.findByText(en.historyPartial)).toBeVisible();
  });

  it("says the list may be behind when a refresh fails after a read, and reads in the visitor's zone", async () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      timeZone: 'Europe/Kyiv',
    } as Intl.ResolvedDateTimeFormatOptions);
    mocks.readBidHistory.mockResolvedValue(history);
    const view = render(<BidHistory tokenId={31} t={en} locale="en" snapshot={snapshot()} />);
    expect(
      await screen.findByText('0.42 ETH · 0x6308…1F7C · Nov 10, 14:00 UTC (16:00 in your zone)'),
    ).toBeVisible();
    expect(screen.queryByRole('status')).toBeNull();
    mocks.readBidHistory.mockRejectedValue(new Error('rate limited'));
    view.rerender(
      <BidHistory
        tokenId={31}
        t={en}
        locale="en"
        snapshot={snapshot({ highestBid: parseEther('1') })}
      />,
    );
    expect(await screen.findByRole('status')).toHaveTextContent(en.historyStale);
    // The bids already read stay on the page, marked as possibly behind, never dropped.
    expect(screen.getByText(/0x6308…1F7C/)).toBeVisible();
  });

  it('shows the delivery once the record says so and reads again when the record changes', async () => {
    mocks.readBidHistory.mockResolvedValue(history);
    const view = render(<BidHistory tokenId={31} t={en} locale="en" snapshot={snapshot()} />);
    await screen.findByText(/0x6308…1F7C/);
    mocks.readBidHistory.mockResolvedValue({
      ...history,
      entries: [
        {
          kind: 'delivered',
          winner: bidder,
          recipient: other,
          blockNumber: 800n,
          logIndex: 1,
          transactionHash: hash,
          timestamp: null,
        },
        ...history.entries,
      ],
    });
    view.rerender(
      <BidHistory
        tokenId={31}
        t={en}
        locale="en"
        snapshot={snapshot({ settled: true, delivered: true })}
      />,
    );
    expect(await screen.findByText('Delivered to 0x7406…6c6c')).toBeVisible();
    await waitFor(() => expect(mocks.readBidHistory).toHaveBeenCalledTimes(2));
  });
});
