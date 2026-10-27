import { describe, expect, it, vi } from 'vitest';
import { parseEther } from 'viem';

vi.mock('./config', () => ({
  auctionAddress: '0x0000000000000000000000000000000000000099',
  auctionConfigured: true,
  rpcUrl: 'http://127.0.0.1:1',
  chainId: 42161,
  expectedCodeHash: undefined,
}));

import { readActivity, type ActivityClient } from './activity';
import type { AuctionRecord } from './rules';
import { NFT_ADDRESS } from '../site';

const account = '0x0000000000000000000000000000000000000031';
const other = '0x0000000000000000000000000000000000000035';
const lot = (overrides: Partial<AuctionRecord>): AuctionRecord => ({
  roundNum: 2n,
  eligibleAt: 100n,
  endAt: 0n,
  highestBidder: '0x0000000000000000000000000000000000000000',
  highestBid: 0n,
  registered: true,
  settled: false,
  delivered: false,
  proceedsForwarded: false,
  ...overrides,
});
const batch = vi.fn(async () => ({
  count: 1n,
  ids: [64, 65, 66, 67],
  blockTime: 500n,
  lots: [
    {
      tokenId: 64,
      lot: lot({ highestBidder: account, highestBid: parseEther('0.4'), endAt: 900n }),
    },
    { tokenId: 65, lot: lot({ highestBidder: other, highestBid: parseEther('1'), endAt: 900n }) },
    {
      tokenId: 66,
      lot: lot({ highestBidder: account, highestBid: parseEther('2'), endAt: 400n, settled: true }),
    },
    {
      tokenId: 67,
      lot: lot({
        highestBidder: account,
        highestBid: parseEther('3'),
        endAt: 400n,
        settled: true,
        delivered: true,
      }),
    },
  ],
}));
function client(owners: Record<number, string | Error>) {
  const readContract = vi.fn(
    async (request: { functionName: string; address: string; args: unknown[] }) => {
      if (request.functionName === 'refundCredits') return parseEther('0.25');
      expect(request.address).toBe(NFT_ADDRESS);
      const owner = owners[Number(request.args[0])];
      if (owner instanceof Error) throw owner;
      return owner;
    },
  );
  return { readContract } as unknown as ActivityClient & { readContract: typeof readContract };
}

describe('readActivity', () => {
  it('reads what the collector leads, has won, holds and may retrieve, without writing', async () => {
    const fake = client({ 64: other, 65: other, 66: other, 67: account });
    const activity = await readActivity(account, 0, fake, batch);
    expect(activity.leading).toEqual([{ tokenId: 64, amount: parseEther('0.4') }]);
    expect(activity.won).toEqual([
      { tokenId: 66, amount: parseEther('2'), delivered: false },
      { tokenId: 67, amount: parseEther('3'), delivered: true },
    ]);
    expect(activity.held).toEqual([67]);
    expect(activity.committed).toBe(parseEther('0.4'));
    expect(activity.refundable).toBe(parseEther('0.25'));
    expect(activity.blockTime).toBe(500n);
    expect(batch).toHaveBeenCalledWith(0);
    expect(fake.readContract).toHaveBeenCalledTimes(5);
  });

  it('treats an unreadable owner as not held and refuses a malformed account', async () => {
    const fake = client({ 64: new Error('burned'), 65: other, 66: other, 67: other });
    const activity = await readActivity(account, 0, fake, batch);
    expect(activity.held).toEqual([]);
    await expect(readActivity('0x12' as `0x${string}`, 0, fake, batch)).rejects.toThrow(RangeError);
  });
});
