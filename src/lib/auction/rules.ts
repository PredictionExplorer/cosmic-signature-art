export const MINIMUM_BID = 10_000_000_000_000n;
export const PREVIEW_SECONDS = 7n * 24n * 60n * 60n;
export const DURATION_SECONDS = 48n * 60n * 60n;
export const EXTENSION_SECONDS = 600n;
export function minimumNextBid(highest: bigint): bigint {
  if (highest < 0n) throw new RangeError('Negative bid');
  return highest === 0n ? MINIMUM_BID : highest + (highest + 9n) / 10n;
}
export function bidFunding(total: bigint, highest: bigint, isLeader: boolean): bigint {
  if (total < minimumNextBid(highest)) throw new RangeError('Bid below minimum');
  return isLeader ? total - highest : total;
}
export function parseEthInput(value: string): bigint | null {
  if (!/^(?:0|[1-9]\d{0,59})(?:\.\d{1,18})?$/.test(value.trim())) return null;
  const [whole, fraction = ''] = value.trim().split('.');
  const result = BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, '0'));
  return result < 1n << 256n ? result : null;
}
export type AuctionRecord = {
  roundNum: bigint;
  eligibleAt: bigint;
  endAt: bigint;
  highestBidder: `0x${string}`;
  highestBid: bigint;
  registered: boolean;
  settled: boolean;
  delivered: boolean;
  proceedsForwarded: boolean;
};
export function auctionPhase(
  lot: AuctionRecord,
  time: bigint,
): 'preview' | 'waiting' | 'active' | 'ended' | 'settled' {
  return lot.settled
    ? 'settled'
    : time < lot.eligibleAt
      ? 'preview'
      : lot.endAt === 0n
        ? 'waiting'
        : time < lot.endAt
          ? 'active'
          : 'ended';
}
