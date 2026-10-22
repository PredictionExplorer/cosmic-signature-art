import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { zeroAddress, type Address, type EIP1193Provider, type Hex } from 'viem';
import { en } from '@/lib/i18n/en';
import type { AuctionAction, Snapshot } from '@/lib/auction/client';
import { MINIMUM_BID } from '@/lib/auction/rules';

const mocks = vi.hoisted(() => ({
  readAuction: vi.fn(),
  submitAction: vi.fn(),
  switchChain: vi.fn(),
}));
vi.mock('@/lib/auction/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auction/client')>()),
  readAuction: mocks.readAuction,
  submitAction: mocks.submitAction,
  switchChain: mocks.switchChain,
}));
vi.mock('@/lib/auction/config', () => ({
  auctionAddress: '0x1111111111111111111111111111111111111111',
  auctionConfigured: true,
  chainId: 42161,
  rpcUrl: 'https://rpc.invalid.example',
  expectedCodeHash: undefined,
}));

import { LiveAuction } from './live-auction';
import { AuctionConfigurationError } from '@/lib/auction/client';

const AUCTION = '0x1111111111111111111111111111111111111111' as Address;
const ACCOUNT = '0x2222222222222222222222222222222222222222' as Address;
const OTHER = '0x3333333333333333333333333333333333333333' as Address;
const RECIPIENT = '0x4444444444444444444444444444444444444444' as Address;
const HASH = `0x${'a'.repeat(64)}` as Hex;
const t = {
  ...en,
  reviewChanged: 'The required payment changed. Review again.',
  leadingWallet: 'Leading wallet',
};
let snapshot: Snapshot;
let provider: EIP1193Provider;
let walletAccount: Address;
let walletChain: string;
let listeners: Map<string, Set<(value: unknown) => void>>;
let announce: () => void;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function emit(event: string, value: unknown) {
  act(() => {
    listeners.get(event)?.forEach((listener) => listener(value));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readAuction.mockReset();
  mocks.submitAction.mockReset();
  mocks.switchChain.mockReset();
  const blockTime = BigInt(Math.floor(Date.now() / 1000));
  snapshot = {
    lot: {
      roundNum: 1n,
      eligibleAt: blockTime - 1n,
      endAt: 0n,
      highestBidder: zeroAddress,
      highestBid: 0n,
      registered: true,
      settled: false,
      delivered: false,
      proceedsForwarded: false,
    },
    minimum: MINIMUM_BID,
    refund: 0n,
    blockTime,
    blockNumber: 123n,
    fetchedAt: Date.now(),
  };
  mocks.readAuction.mockImplementation(async () => ({ ...snapshot, lot: { ...snapshot.lot } }));
  mocks.submitAction.mockImplementation(
    async (
      _provider: EIP1193Provider,
      _account: Address,
      _token: number,
      _action: AuctionAction,
      onHash: (hash: Hex) => void,
    ) => {
      onHash(HASH);
      return { status: 'success', transactionHash: HASH };
    },
  );
  mocks.switchChain.mockResolvedValue(undefined);
  walletAccount = ACCOUNT;
  walletChain = '0xa4b1';
  listeners = new Map();
  provider = {
    request: vi.fn(async ({ method }: { method: string }) => {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [walletAccount];
      if (method === 'eth_chainId') return walletChain;
      throw new Error(`Unexpected wallet method ${method}`);
    }) as EIP1193Provider['request'],
    on: ((event: string, listener: (value: unknown) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
    }) as EIP1193Provider['on'],
    removeListener: ((event: string, listener: (value: unknown) => void) =>
      listeners.get(event)?.delete(listener)) as EIP1193Provider['removeListener'],
  };
  announce = () =>
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: { info: { uuid: 'test-wallet', name: 'Test wallet' }, provider },
      }),
    );
  window.addEventListener('eip6963:requestProvider', announce);
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value() {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value() {
      this.open = false;
    },
  });
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
});
afterEach(() => {
  window.removeEventListener('eip6963:requestProvider', announce);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function showConnected() {
  render(<LiveAuction tokenId={100} t={t} locale="en" />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Test wallet' }));
  await screen.findByRole('button', { name: t.disconnect });
  await waitFor(() => expect(mocks.readAuction).toHaveBeenCalledWith(100, ACCOUNT));
  return user;
}

async function openReview(value: string) {
  const user = await showConnected();
  await user.type(screen.getByRole('textbox', { name: t.bidTotal }), value);
  await user.click(screen.getByRole('button', { name: `${t.placeBid} ↗` }));
  const dialog = await screen.findByRole('dialog');
  return { user, dialog };
}

describe('LiveAuction reviewed bidding', () => {
  it('connects through the announced wallet and submits the exact direct offer after review', async () => {
    const { user, dialog } = await openReview('100');
    expect(within(dialog).getByText(t.bidWarning)).toBeVisible();
    expect(within(dialog).getAllByText('100 ETH')).toHaveLength(2);
    expect(mocks.submitAction).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: t.confirmBid }));
    await waitFor(() => expect(mocks.submitAction).toHaveBeenCalledOnce());
    expect(mocks.submitAction.mock.calls[0].slice(0, 4)).toEqual([
      provider,
      ACCOUNT,
      100,
      { kind: 'bid', total: 100n * 10n ** 18n, expectedFunding: 100n * 10n ** 18n },
    ]);
    expect(await screen.findByText(t.transactionConfirmed)).toBeVisible();
    expect(screen.getByRole('link', { name: `${t.viewChain} ↗` })).toHaveAttribute(
      'href',
      `https://arbiscan.io/tx/${HASH}`,
    );
  });

  it('submits only the reviewed additional ETH for a leading bidder', async () => {
    snapshot.lot.highestBidder = ACCOUNT;
    snapshot.lot.highestBid = 10n ** 18n;
    snapshot.lot.endAt = snapshot.blockTime + 3600n;
    snapshot.minimum = 11n * 10n ** 17n;
    const { user, dialog } = await openReview('3');
    expect(within(dialog).getByText('3 ETH')).toBeVisible();
    expect(within(dialog).getByText('2 ETH')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: t.confirmBid }));
    await waitFor(() => expect(mocks.submitAction).toHaveBeenCalledOnce());
    expect(mocks.submitAction.mock.calls[0][3]).toEqual({
      kind: 'bid',
      total: 3n * 10n ** 18n,
      expectedFunding: 2n * 10n ** 18n,
    });
  });

  it('freezes reviewed funding and disables confirmation if a poll discovers an intervening outbid', async () => {
    snapshot.lot.highestBidder = ACCOUNT;
    snapshot.lot.highestBid = 10n ** 18n;
    snapshot.lot.endAt = snapshot.blockTime + 3600n;
    snapshot.minimum = 11n * 10n ** 17n;
    const { dialog } = await openReview('3');
    snapshot.lot.highestBidder = OTHER;
    snapshot.lot.highestBid = 2n * 10n ** 18n;
    snapshot.minimum = 22n * 10n ** 17n;
    fireEvent(window, new Event('focus'));
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: t.confirmBid })).toBeDisabled(),
    );
    expect(within(dialog).getByText('2 ETH')).toBeVisible();
    expect(within(dialog).queryByText('3 ETH')).toBeVisible(); // Total stays three; additional payment stays the reviewed two.
    expect(within(dialog).getByText(t.reviewChanged)).toBeVisible();
    expect(mocks.submitAction).not.toHaveBeenCalled();
  });

  it.each(['0.000001', '1e-5', '0.0000000000000000001'])(
    'rejects invalid or below-minimum input %s before review',
    async (value) => {
      const user = await showConnected();
      await user.type(screen.getByRole('textbox', { name: t.bidTotal }), value);
      await user.click(screen.getByRole('button', { name: `${t.placeBid} ↗` }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(mocks.submitAction).not.toHaveBeenCalled();
    },
  );

  it('invalidates an open review on account change and uses only the new account snapshot', async () => {
    const { dialog } = await openReview('1');
    const oldRead = deferred<Snapshot>();
    mocks.readAuction.mockImplementation((_id, account) =>
      account === OTHER ? Promise.resolve({ ...snapshot, refund: 456n }) : oldRead.promise,
    );
    fireEvent(window, new Event('focus'));
    walletAccount = OTHER;
    emit('accountsChanged', [OTHER, ACCOUNT]);
    await waitFor(() => expect(dialog).not.toHaveAttribute('open'));
    await waitFor(() => expect(mocks.readAuction).toHaveBeenCalledWith(100, OTHER));
    await act(async () => {
      oldRead.resolve({ ...snapshot, refund: 999n });
    });
    expect(screen.getByText(/0\.000000000000000456 ETH/)).toBeVisible();
    expect(screen.queryByText(/0\.000000000000000999 ETH/)).toBeNull();
    expect(mocks.submitAction).not.toHaveBeenCalled();
  });

  it('invalidates a review and disables bids when the wallet changes chain', async () => {
    const { dialog } = await openReview('1');
    walletChain = '0x1';
    emit('chainChanged', '0x1');
    await waitFor(() => expect(dialog).not.toHaveAttribute('open'));
    expect(await screen.findByRole('button', { name: t.wrongNetwork })).toBeVisible();
    expect(screen.getByRole('button', { name: `${t.placeBid} ↗` })).toBeDisabled();
    expect(mocks.submitAction).not.toHaveBeenCalled();
  });
});

describe('LiveAuction unavailable data and transaction outcomes', () => {
  it.each(['configuration', 'rpc', 'unregistered'])(
    'disables financial actions when %s reads fail',
    async (failure) => {
      mocks.readAuction.mockRejectedValue(
        failure === 'configuration'
          ? new AuctionConfigurationError('Mismatch')
          : new Error(failure === 'unregistered' ? 'UnknownAuction' : 'RPC unavailable'),
      );
      await showConnected();
      const expected =
        failure === 'configuration'
          ? t.configMismatch
          : failure === 'unregistered'
            ? t.unregistered
            : t.liveUnavailable;
      expect(await screen.findByText(expected)).toBeVisible();
      expect(screen.queryByRole('button', { name: `${t.placeBid} ↗` })).toBeNull();
      expect(screen.queryByRole('button', { name: t.settle })).toBeNull();
      expect(mocks.submitAction).not.toHaveBeenCalled();
    },
  );

  it('ages an unresolved snapshot out and disables actions rather than using it indefinitely', async () => {
    vi.useFakeTimers();
    render(<LiveAuction tokenId={100} t={t} locale="en" />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Test wallet' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: `${t.placeBid} ↗` })).toBeEnabled();
    mocks.readAuction.mockImplementation(() => new Promise<Snapshot>(() => undefined));
    await act(async () => {
      vi.advanceTimersByTime(26000);
    });
    expect(screen.getByRole('button', { name: `${t.placeBid} ↗` })).toBeDisabled();
    expect(mocks.submitAction).not.toHaveBeenCalled();
  });

  it('preserves the hash and never reports success when a submitted transaction outcome is unknown', async () => {
    mocks.submitAction.mockImplementation(async (_provider, _account, _token, _action, onHash) => {
      onHash(HASH);
      throw new Error('Receipt polling timed out after submission');
    });
    const { user, dialog } = await openReview('1');
    await user.click(within(dialog).getByRole('button', { name: t.confirmBid }));
    expect(await screen.findByText(t.transactionFailed)).toBeVisible();
    expect(screen.getByRole('link', { name: `${t.viewChain} ↗` })).toHaveAttribute(
      'href',
      `https://arbiscan.io/tx/${HASH}`,
    );
    expect(screen.queryByText(t.transactionConfirmed)).toBeNull();
    expect(mocks.submitAction).toHaveBeenCalledOnce();
  });

  it('does not display a fabricated hash after a wallet rejects signing', async () => {
    mocks.submitAction.mockRejectedValue(new Error('User rejected request'));
    const { user, dialog } = await openReview('1');
    await user.click(within(dialog).getByRole('button', { name: t.confirmBid }));
    expect(await screen.findByText(t.transactionFailed)).toBeVisible();
    expect(screen.queryByRole('link', { name: `${t.viewChain} ↗` })).toBeNull();
    expect(screen.queryByText(t.transactionConfirmed)).toBeNull();
  });

  it('keeps a pending transaction separate from account/network changes and does not confirm it without a receipt', async () => {
    const submission = deferred<unknown>();
    mocks.submitAction.mockImplementation((_provider, _account, _token, _action, onHash) => {
      onHash(HASH);
      return submission.promise;
    });
    const { user, dialog } = await openReview('1');
    await user.click(within(dialog).getByRole('button', { name: t.confirmBid }));
    expect(await screen.findByText(t.transactionPending)).toBeVisible();
    walletAccount = OTHER;
    walletChain = '0x1';
    emit('accountsChanged', [OTHER]);
    emit('chainChanged', '0x1');
    await waitFor(() => expect(mocks.readAuction).toHaveBeenCalledWith(100, OTHER));
    expect(screen.queryByText(t.transactionConfirmed)).toBeNull();
    expect(screen.getByRole('link', { name: `${t.viewChain} ↗` })).toHaveAttribute(
      'href',
      `https://arbiscan.io/tx/${HASH}`,
    );
    await act(async () => {
      submission.reject(new Error('Unconfirmed'));
    });
    expect(await screen.findByText(t.transactionFailed)).toBeVisible();
    expect(screen.queryByText(t.transactionConfirmed)).toBeNull();
    expect(screen.getByRole('button', { name: `${t.placeBid} ↗` })).toBeDisabled();
    expect(mocks.submitAction).toHaveBeenCalledOnce();
  });
});

describe('LiveAuction independent delivery and refund destinations', () => {
  it.each(['claimNft', 'withdrawRefund'] as const)(
    'rejects invalid %s recipients and sends the chosen valid destination',
    async (kind) => {
      if (kind === 'claimNft') {
        snapshot.lot = {
          ...snapshot.lot,
          highestBidder: ACCOUNT,
          highestBid: MINIMUM_BID,
          endAt: snapshot.blockTime - 1n,
          settled: true,
        };
      } else snapshot.refund = MINIMUM_BID;
      const user = await showConnected();
      const input = screen.getByRole('textbox', { name: t.recipient });
      const buttonName = kind === 'claimNft' ? t.claim : t.withdraw;
      for (const invalid of ['not-an-address', zeroAddress, AUCTION]) {
        await user.clear(input);
        await user.type(input, invalid);
        expect(screen.getByRole('button', { name: buttonName })).toBeDisabled();
      }
      expect(mocks.submitAction).not.toHaveBeenCalled();
      await user.clear(input);
      await user.type(input, RECIPIENT);
      await user.click(screen.getByRole('button', { name: buttonName }));
      await waitFor(() => expect(mocks.submitAction).toHaveBeenCalledOnce());
      expect(mocks.submitAction.mock.calls[0][3]).toEqual({ kind, recipient: RECIPIENT });
    },
  );

  it('lets a connected non-winner forward settled proceeds without offering them NFT delivery', async () => {
    snapshot.lot = {
      ...snapshot.lot,
      highestBidder: OTHER,
      highestBid: MINIMUM_BID,
      endAt: snapshot.blockTime - 1n,
      settled: true,
    };
    const user = await showConnected();
    expect(screen.queryByRole('button', { name: t.claim })).toBeNull();
    await user.click(screen.getByRole('button', { name: t.forward }));
    await waitFor(() => expect(mocks.submitAction).toHaveBeenCalledOnce());
    expect(mocks.submitAction.mock.calls[0][3]).toEqual({ kind: 'forwardProceeds' });
  });
});
