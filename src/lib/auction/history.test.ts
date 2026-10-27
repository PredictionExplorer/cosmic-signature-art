import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEther } from 'viem';

vi.mock('./config', () => ({
  auctionAddress: '0x0000000000000000000000000000000000000099',
  auctionConfigured: true,
  rpcUrl: 'http://127.0.0.1:1',
  chainId: 42161,
  expectedCodeHash: undefined,
}));

import {
  BLOCK_WINDOW,
  MAX_ENTRIES,
  MAX_WINDOWS,
  clearHistoryCache,
  historyRange,
  orderEntries,
  readBidHistory,
  validBid,
  validDelivery,
  windows,
  type BidEntry,
  type LogsClient,
  type RawLog,
} from './history';

const contract = '0x0000000000000000000000000000000000000099';
const bidder = '0x0000000000000000000000000000000000000031';
const other = '0x0000000000000000000000000000000000000035';
const hash = `0x${'ab'.repeat(32)}` as const;

function bidLog(overrides: Partial<RawLog> & { args?: Partial<RawLog['args']> } = {}): RawLog {
  return {
    address: contract,
    blockNumber: 1000n,
    logIndex: 3,
    transactionHash: hash,
    ...overrides,
    args: {
      nftId: 31n,
      roundNum: 2n,
      bidder,
      amount: parseEther('1'),
      ethPaid: parseEther('1'),
      endAt: 2000n,
      ...overrides.args,
    },
  };
}

describe('the history range', () => {
  it("reaches back from the lot's eligibility, one window of slack, never past the cap", () => {
    const range = historyRange({ latestBlock: 10_000_000n, blockTime: 1_000n, since: 900n });
    expect(range).toEqual({
      fromBlock: 10_000_000n - (100n * 5n + BLOCK_WINDOW),
      toBlock: 10_000_000n,
      capped: false,
    });
    const capped = historyRange({ latestBlock: 10_000_000n, blockTime: 10_000_000n, since: 0n });
    expect(capped.fromBlock).toBe(10_000_000n - BLOCK_WINDOW * BigInt(MAX_WINDOWS));
    expect(capped.capped).toBe(true);
    // A young chain clamps at the genesis block and is complete.
    expect(historyRange({ latestBlock: 50n, blockTime: 10n, since: 0n })).toEqual({
      fromBlock: 0n,
      toBlock: 50n,
      capped: false,
    });
    expect(historyRange({ latestBlock: 100n, blockTime: 5n, since: 10n }).fromBlock).toBe(0n);
    expect(() => historyRange({ latestBlock: -1n, blockTime: 1n, since: 0n })).toThrow();
  });

  it('pages the span newest first in bounded windows whose edges sit on the window size', () => {
    expect(windows(0n, 150_000n)).toEqual([
      [100_000n, 150_000n],
      [0n, 99_999n],
    ]);
    // The oldest window is a whole span too, so a read that moved on by a few blocks reuses it.
    expect(windows(250_000n, 450_000n)).toEqual([
      [400_000n, 450_000n],
      [300_000n, 399_999n],
      [200_000n, 299_999n],
    ]);
    expect(windows(100n, 100n)).toEqual([[0n, 100n]]);
    expect(windows(0n, BLOCK_WINDOW * 40n)).toHaveLength(MAX_WINDOWS);
  });
});

describe('log validation', () => {
  it('keeps only mined logs of the configured contract for this token', () => {
    const entry = validBid(bidLog(), 31, contract)!;
    expect(entry).toMatchObject({
      kind: 'bid',
      bidder,
      amount: parseEther('1'),
      blockNumber: 1000n,
    });
    expect(validBid(bidLog({ address: other }), 31, contract)).toBeNull();
    expect(validBid(bidLog({ args: { nftId: 32n } }), 31, contract)).toBeNull();
    expect(validBid(bidLog({ args: { bidder: 'nobody' } }), 31, contract)).toBeNull();
    expect(validBid(bidLog({ args: { amount: '1' } }), 31, contract)).toBeNull();
    expect(validBid(bidLog({ blockNumber: null }), 31, contract)).toBeNull();
    expect(validBid(bidLog({ logIndex: null }), 31, contract)).toBeNull();
    expect(validBid(bidLog({ transactionHash: null }), 31, contract)).toBeNull();
    const delivery = validDelivery(
      bidLog({ args: { winner: bidder, recipient: other } }),
      31,
      contract,
    )!;
    expect(delivery).toMatchObject({ kind: 'delivered', winner: bidder, recipient: other });
    expect(
      validDelivery(bidLog({ args: { winner: bidder, recipient: 'x' } }), 31, contract),
    ).toBeNull();
    expect(
      validDelivery(
        bidLog({ args: { winner: bidder, recipient: other, nftId: 1n } }),
        31,
        contract,
      ),
    ).toBeNull();
  });

  it('orders newest first, once per log, and truncates to the newest entries', () => {
    const entry = (blockNumber: bigint, logIndex: number): BidEntry => ({
      ...validBid(
        bidLog({
          blockNumber,
          logIndex,
          transactionHash: `0x${blockNumber.toString(16).padStart(64, '0')}`,
        }),
        31,
        contract,
      )!,
    });
    const ordered = orderEntries([entry(5n, 1), entry(7n, 0), entry(7n, 2), entry(5n, 1)]);
    expect(ordered.entries.map((item) => [item.blockNumber, item.logIndex])).toEqual([
      [7n, 2],
      [7n, 0],
      [5n, 1],
    ]);
    expect(ordered.truncated).toBe(false);
    const many = orderEntries(
      Array.from({ length: MAX_ENTRIES + 5 }, (_, index) => entry(BigInt(index), 0)),
    );
    expect(many.entries).toHaveLength(MAX_ENTRIES);
    expect(many.entries[0].blockNumber).toBe(BigInt(MAX_ENTRIES + 4));
    expect(many.truncated).toBe(true);
  });
});

describe('readBidHistory', () => {
  function client(
    logs: (range: { fromBlock: bigint; toBlock: bigint; event: { name: string } }) => unknown[],
  ) {
    const getLogs = vi.fn(
      async (request: { fromBlock: bigint; toBlock: bigint; event: { name: string } }) =>
        logs(request),
    );
    const getBlock = vi.fn(async ({ blockNumber }: { blockNumber: bigint }) => ({
      timestamp: blockNumber * 2n,
    }));
    return { getLogs, getBlock } as unknown as LogsClient & {
      getLogs: typeof getLogs;
      getBlock: typeof getBlock;
    };
  }
  const range = { latestBlock: 250_000n, blockTime: 1_000n, since: 900n };
  beforeEach(() => clearHistoryCache());

  it('reads bids and the delivery across windows, newest first, with block timestamps', async () => {
    const fake = client(({ fromBlock, event }) =>
      event.name === 'AuctionBidPlaced'
        ? fromBlock > 150_000n
          ? [bidLog({ blockNumber: 200_000n, logIndex: 1 })]
          : [bidLog({ blockNumber: 120_000n, logIndex: 0, args: { bidder: other } })]
        : fromBlock > 150_000n
          ? [
              bidLog({
                blockNumber: 210_000n,
                logIndex: 4,
                args: { winner: bidder, recipient: other },
              }),
            ]
          : [],
    );
    const history = await readBidHistory(31, range, fake);
    expect(history.complete).toBe(true);
    expect(history.truncated).toBe(false);
    expect(history.toBlock).toBe(250_000n);
    expect(history.entries.map((entry) => entry.kind)).toEqual(['delivered', 'bid', 'bid']);
    expect(history.entries[0].timestamp).toBe(420_000n);
    expect(history.entries[2]).toMatchObject({ bidder: other, timestamp: 240_000n });
    // Two windows, each read for bids and deliveries, none past the latest block and none
    // starting earlier than the whole aligned span that holds the range's first block.
    expect(fake.getLogs).toHaveBeenCalledTimes(4);
    const floor = (history.fromBlock / BLOCK_WINDOW) * BLOCK_WINDOW;
    for (const [request] of fake.getLogs.mock.calls) {
      expect(request.fromBlock).toBeGreaterThanOrEqual(floor);
      expect(request.toBlock).toBeLessThanOrEqual(history.toBlock);
    }
  });

  it('refuses a bad token, and never invents when the chain cannot be read', async () => {
    await expect(
      readBidHistory(
        -1,
        range,
        client(() => []),
      ),
    ).rejects.toThrow(RangeError);
    const failing = client(() => {
      throw new Error('rate limited');
    });
    await expect(readBidHistory(31, range, failing)).rejects.toThrow(/unavailable/);
  });

  it('keeps what the newest windows yielded when an older window fails, marked incomplete', async () => {
    let calls = 0;
    const fake = client(({ event }) => {
      calls += 1;
      if (calls > 2) throw new Error('rate limited');
      return event.name === 'AuctionBidPlaced' ? [bidLog({ blockNumber: 240_000n })] : [];
    });
    const history = await readBidHistory(31, range, fake);
    expect(history.entries).toHaveLength(1);
    expect(history.complete).toBe(false);
  });

  it('keeps the settled windows between reads and re-reads only the newest', async () => {
    const fake = client(({ event, fromBlock }) =>
      event.name === 'AuctionBidPlaced' && fromBlock < 200_000n
        ? [bidLog({ blockNumber: 199_000n })]
        : [],
    );
    const first = await readBidHistory(31, range, fake);
    expect(first.entries).toHaveLength(1);
    expect(fake.getLogs).toHaveBeenCalledTimes(4);
    // A price-only refresh moves the latest block a little; the older window is already known.
    const again = await readBidHistory(31, { ...range, latestBlock: 250_010n }, fake);
    expect(again.entries).toHaveLength(1);
    expect(fake.getLogs).toHaveBeenCalledTimes(6);
    for (const [request] of fake.getLogs.mock.calls.slice(4))
      expect(request.fromBlock).toBe(200_000n);
    clearHistoryCache();
    await readBidHistory(31, range, fake);
    expect(fake.getLogs).toHaveBeenCalledTimes(10);
  });

  it('leaves a timestamp null when its block cannot be read', async () => {
    const fake = client(({ event }) =>
      event.name === 'AuctionBidPlaced' ? [bidLog({ blockNumber: 240_000n })] : [],
    );
    fake.getBlock.mockRejectedValue(new Error('no block'));
    const history = await readBidHistory(31, range, fake);
    expect(history.entries[0].timestamp).toBeNull();
  });
});
