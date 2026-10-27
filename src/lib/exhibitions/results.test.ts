import { describe, expect, it, vi } from 'vitest';
import { parseEther, zeroAddress } from 'viem';
import { BATCH_SIZE, MAX_PAGES, collectCycleLots, type BatchPage } from './results';

function lot(settled: boolean, highestBid = 0n) {
  return {
    roundNum: 1n,
    eligibleAt: 0n,
    endAt: 0n,
    highestBid,
    highestBidder: zeroAddress,
    registered: true,
    settled,
    delivered: false,
    proceedsForwarded: false,
  };
}
/** Batches of eight from `first` down, newest first: page 0 is the highest batch. */
function batches(firsts: number[], count = BigInt(firsts.length)) {
  return async (page: number): Promise<BatchPage> => {
    const first = firsts[page];
    if (first === undefined) return { count, ids: [], lots: [] };
    const ids = Array.from({ length: BATCH_SIZE }, (_, i) => first + i);
    return { count, ids, lots: ids.map((tokenId) => ({ tokenId, lot: lot(tokenId % 2 === 0) })) };
  };
}

describe('collecting a cycle’s lots', () => {
  it('reads newest batches first and stops once every id sought is in hand', async () => {
    const read = vi.fn(batches([64, 56, 48, 40, 32, 24]));
    const { lots, partial } = await collectCycleLots([48, 50, 55], read);
    expect([...lots.keys()].sort((a, b) => a - b)).toEqual([48, 50, 55]);
    expect(lots.get(48)?.settled).toBe(true);
    expect(partial).toBe(false);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('stops at the first batch older than the oldest id sought', async () => {
    const read = vi.fn(batches([64, 56, 48, 40, 32, 24]));
    const { lots } = await collectCycleLots([57, 99], read);
    expect([...lots.keys()]).toEqual([57]);
    // 64, 56 hold the cycle; 48 lies below 57 and ends the walk.
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('skips a batch that cannot be read and says the list may be short', async () => {
    const underlying = batches([64, 56, 48]);
    const read = vi.fn(async (page: number) => {
      if (page === 1) throw new Error('rpc');
      return underlying(page);
    });
    const { lots, partial } = await collectCycleLots([50, 58, 66], read);
    expect([...lots.keys()].sort((a, b) => a - b)).toEqual([50, 66]);
    expect(partial).toBe(true);
  });

  it('never reads past the registered count or the page bound', async () => {
    const read = vi.fn(batches([8], 1n));
    expect((await collectCycleLots([3], read)).lots.size).toBe(0);
    expect(read).toHaveBeenCalledTimes(2);
    const endless = vi.fn(async () => ({
      count: 1000n,
      ids: [1000, 1001],
      lots: [{ tokenId: 1000, lot: lot(true, parseEther('1')) }],
    }));
    await collectCycleLots([5], endless);
    expect(endless).toHaveBeenCalledTimes(MAX_PAGES);
    expect((await collectCycleLots([], read)).lots.size).toBe(0);
  });
});
