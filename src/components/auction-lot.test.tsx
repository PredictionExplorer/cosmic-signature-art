import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEther } from 'viem';
import { en } from '@/lib/i18n/en';
import type { Snapshot } from '@/lib/auction/client';

const mocks = vi.hoisted(() => ({
  readAuction: vi.fn(),
  readBidHistory: vi.fn(),
  readActivity: vi.fn(),
}));
vi.mock('@/lib/auction/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auction/client')>()),
  readAuction: mocks.readAuction,
}));
vi.mock('@/lib/auction/history', () => ({ readBidHistory: mocks.readBidHistory }));
vi.mock('@/lib/auction/activity', () => ({ readActivity: mocks.readActivity }));
vi.mock('@/lib/auction/config', () => ({
  auctionAddress: '0x1111111111111111111111111111111111111111',
  auctionConfigured: true,
  chainId: 42161,
  rpcUrl: 'https://rpc.invalid.example',
  expectedCodeHash: undefined,
}));

import { AuctionLot } from './auction-lot';
import { MotionProvider } from './motion-provider';
import { AuctionConfigurationError } from '@/lib/auction/client';
import { stubDialog, stubMatchMedia } from '../../tests/dialog-support';

const bidder = '0x6308000000000000000000000000000000001F7C';
const snapshot: Snapshot = {
  lot: {
    roundNum: 2n,
    eligibleAt: 1_762_783_200n,
    endAt: 1_762_783_200n + 48n * 3600n,
    highestBidder: bidder,
    highestBid: parseEther('0.42'),
    registered: true,
    settled: false,
    delivered: false,
    proceedsForwarded: false,
  },
  minimum: parseEther('0.462'),
  refund: 0n,
  blockTime: 1_762_783_200n + 10n,
  blockNumber: 777n,
  fetchedAt: Date.now(),
};
function Lot() {
  return (
    <MotionProvider>
      <AuctionLot tokenId={31} t={en} locale="en" panel={<p>the live panel</p>} />
    </MotionProvider>
  );
}
beforeEach(() => {
  stubDialog();
  stubMatchMedia();
  mocks.readAuction.mockReset();
  mocks.readBidHistory.mockResolvedValue({
    entries: [],
    complete: true,
    truncated: false,
    fromBlock: 0n,
    toBlock: 777n,
  });
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
    timeZone: 'UTC',
  } as Intl.ResolvedDateTimeFormatOptions);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the lot strip', () => {
  it('states the chain in one line, keeps the keys silent, and opens the panel in a hushed sheet', async () => {
    mocks.readAuction.mockResolvedValue(snapshot);
    render(<Lot />);
    expect(
      await screen.findByText(
        'Bidding open · 0.42 ETH · closes Nov 12, 14:00 UTC · late bids leave 10 minutes',
      ),
    ).toHaveAttribute('data-phase', 'active');
    expect(document.getElementById('lot-actions')).toHaveAttribute('data-keys-suppressed', '');
    expect(screen.queryByText('the live panel')).toBeNull();
    expect(mocks.readAuction).toHaveBeenCalledWith(31);
    const collect = screen.getByRole('button', { name: en.collectThisWork });
    await act(async () => {
      fireEvent.click(collect);
    });
    const sheet = screen.getByRole('dialog', { name: `№ 031 · ${en.bidSheet}` });
    expect(sheet).toHaveAttribute('open');
    expect(screen.getByText('the live panel')).toBeVisible();
    expect(screen.getByText(en.auctionAtAGlance)).toBeVisible();
    expect(document.querySelector('.site')).toHaveAttribute('data-theatre', 'hushed');
    await act(async () => {
      fireEvent(sheet, new Event('cancel', { cancelable: true }));
    });
    expect(screen.queryByText('the live panel')).toBeNull();
    expect(document.querySelector('.site')).toHaveAttribute('data-theatre', 'playing');
    expect(collect).toHaveFocus();
  });

  it('opens the activity sheet without hushing, and names a mismatched or unavailable contract', async () => {
    mocks.readAuction.mockResolvedValue(snapshot);
    render(<Lot />);
    await screen.findByText(/Bidding open/);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: en.yourActivity }));
    });
    expect(screen.getByRole('dialog', { name: en.yourActivity })).toHaveAttribute('open');
    expect(document.querySelector('.site')).toHaveAttribute('data-theatre', 'playing');
    // The sheet reads the collector's view against this lot's own batch, whichever page it is on.
    mocks.readActivity.mockResolvedValue({
      account: bidder,
      blockTime: 5_000n,
      ids: [31],
      leading: [],
      won: [],
      held: [],
      committed: 0n,
      refundable: 0n,
    });
    const sheet = screen.getByRole('dialog', { name: en.yourActivity });
    const typed = bidder.toLowerCase();
    fireEvent.change(within(sheet).getByLabelText(en.activityAddress), {
      target: { value: typed },
    });
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: en.activityLookUp }));
    });
    expect(mocks.readActivity).toHaveBeenCalledWith(typed, { tokenId: 31 });
  });

  it('reports a configuration mismatch and an unavailable read in the chain line', async () => {
    mocks.readAuction.mockRejectedValue(new AuctionConfigurationError('Deployment mismatch'));
    const view = render(<Lot />);
    expect(await screen.findByText(en.configMismatch)).toBeVisible();
    view.unmount();
    mocks.readAuction.mockRejectedValue(new Error('UnknownAuction'));
    render(<Lot />);
    expect(await screen.findByText(en.unregistered)).toBeVisible();
  });
});
