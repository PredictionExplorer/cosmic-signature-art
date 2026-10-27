import { getAbiItem, isAddress, isAddressEqual, type Address, type Hex } from 'viem';
import { auctionAbi } from './abi';
import { publicClient, AuctionConfigurationError } from './client';
import { auctionAddress } from './config';

/**
 * A lot's bid history, read from the auction contract's own logs: every `AuctionBidPlaced`
 * for the token, and its `AuctionNftDelivered` once delivered. The read is bounded on both
 * sides: it reaches back only as far as the lot's eligibility (no bid can precede it) and
 * never more than MAX_WINDOWS windows, paging backwards from the latest block so the newest
 * bids arrive first. A window that fails ends the read and marks the history incomplete;
 * nothing is ever invented to fill the gap.
 */
export const BLOCK_WINDOW = 100_000n;
export const MAX_WINDOWS = 16;
/** Arbitrum One nominally produces four blocks a second; estimating five reaches back far enough. */
export const BLOCKS_PER_SECOND = 5n;
export const MAX_ENTRIES = 64;

export type BidEntry = {
  kind: 'bid';
  bidder: Address;
  amount: bigint;
  ethPaid: bigint;
  endAt: bigint;
  blockNumber: bigint;
  logIndex: number;
  transactionHash: Hex;
  timestamp: bigint | null;
};
export type DeliveryEntry = {
  kind: 'delivered';
  winner: Address;
  recipient: Address;
  blockNumber: bigint;
  logIndex: number;
  transactionHash: Hex;
  timestamp: bigint | null;
};
export type HistoryEntry = BidEntry | DeliveryEntry;
export type BidHistory = {
  entries: HistoryEntry[];
  /** False when a window failed or the span was capped: earlier bids may exist. */
  complete: boolean;
  /** True when more than MAX_ENTRIES were found and only the newest are returned. */
  truncated: boolean;
  fromBlock: bigint;
  toBlock: bigint;
};
export type HistoryRange = {
  /** The block the read ends at, normally the snapshot's own block. */
  latestBlock: bigint;
  /** That block's timestamp. */
  blockTime: bigint;
  /** The earliest moment a bid could exist: the lot's `eligibleAt`. */
  since: bigint;
};
export type LogsClient = {
  getLogs: typeof publicClient.getLogs;
  getBlock: typeof publicClient.getBlock;
};

const bidEvent = getAbiItem({ abi: auctionAbi, name: 'AuctionBidPlaced' });
const deliveredEvent = getAbiItem({ abi: auctionAbi, name: 'AuctionNftDelivered' });

/** The block span worth reading, and whether the cap cut it short. */
export function historyRange({ latestBlock, blockTime, since }: HistoryRange) {
  if (latestBlock < 0n) throw new RangeError('Invalid block number');
  const seconds = blockTime > since ? blockTime - since : 0n;
  const wanted = seconds * BLOCKS_PER_SECOND + BLOCK_WINDOW;
  const cap = BLOCK_WINDOW * BigInt(MAX_WINDOWS);
  const span = wanted > cap ? cap : wanted;
  const fromBlock = latestBlock > span ? latestBlock - span : 0n;
  return { fromBlock, toBlock: latestBlock, capped: wanted > cap && fromBlock > 0n };
}

/**
 * Windows of BLOCK_WINDOW blocks, newest first, reaching at least [fromBlock, toBlock]. Their
 * edges sit on multiples of BLOCK_WINDOW, so every window but the newest is the same whole span
 * on every read and its logs can be kept; the newest, which still grows, is read afresh. The
 * oldest may begin before fromBlock: a few more blocks of a filtered read cost nothing.
 */
export function windows(fromBlock: bigint, toBlock: bigint): Array<[bigint, bigint]> {
  const result: Array<[bigint, bigint]> = [];
  let end = toBlock;
  while (end >= fromBlock && result.length < MAX_WINDOWS) {
    const start = (end / BLOCK_WINDOW) * BLOCK_WINDOW;
    result.push([start, end]);
    if (start === 0n) break;
    end = start - 1n;
  }
  return result;
}

/**
 * Logs of a window that lies wholly in the past never change, so a lot revisited, or a lot
 * whose price alone changed, reuses them: only the newest, still-growing window is read again.
 * Bounded; the oldest entries leave first.
 */
const LOG_CACHE_LIMIT = 256;
const logCache = new Map<string, { bids: unknown[]; deliveries: unknown[] }>();
export function clearHistoryCache() {
  logCache.clear();
}
function remember(key: string, value: { bids: unknown[]; deliveries: unknown[] }) {
  if (logCache.size >= LOG_CACHE_LIMIT) logCache.delete(logCache.keys().next().value as string);
  logCache.set(key, value);
}

export type RawLog = {
  address: Address;
  blockNumber: bigint | null;
  logIndex: number | null;
  transactionHash: Hex | null;
  args: Record<string, unknown>;
};

/** A log is kept only when it is the configured contract's, this token's, and mined. */
export function validBid(log: RawLog, tokenId: number, contract: Address): BidEntry | null {
  const { nftId, bidder, amount, ethPaid, endAt } = log.args;
  if (
    !isAddressEqual(log.address, contract) ||
    nftId !== BigInt(tokenId) ||
    typeof bidder !== 'string' ||
    !isAddress(bidder) ||
    typeof amount !== 'bigint' ||
    typeof ethPaid !== 'bigint' ||
    typeof endAt !== 'bigint' ||
    log.blockNumber === null ||
    log.logIndex === null ||
    !log.transactionHash
  )
    return null;
  return {
    kind: 'bid',
    bidder,
    amount,
    ethPaid,
    endAt,
    blockNumber: log.blockNumber,
    logIndex: log.logIndex,
    transactionHash: log.transactionHash,
    timestamp: null,
  };
}
export function validDelivery(
  log: RawLog,
  tokenId: number,
  contract: Address,
): DeliveryEntry | null {
  const { nftId, winner, recipient } = log.args;
  if (
    !isAddressEqual(log.address, contract) ||
    nftId !== BigInt(tokenId) ||
    typeof winner !== 'string' ||
    !isAddress(winner) ||
    typeof recipient !== 'string' ||
    !isAddress(recipient) ||
    log.blockNumber === null ||
    log.logIndex === null ||
    !log.transactionHash
  )
    return null;
  return {
    kind: 'delivered',
    winner,
    recipient,
    blockNumber: log.blockNumber,
    logIndex: log.logIndex,
    transactionHash: log.transactionHash,
    timestamp: null,
  };
}

/** Newest first, one entry per log, at most MAX_ENTRIES. */
export function orderEntries<T extends HistoryEntry>(
  entries: T[],
): { entries: T[]; truncated: boolean } {
  const unique = new Map<string, T>();
  for (const entry of entries) unique.set(`${entry.transactionHash}:${entry.logIndex}`, entry);
  const sorted = [...unique.values()].sort((a, b) =>
    a.blockNumber === b.blockNumber
      ? b.logIndex - a.logIndex
      : a.blockNumber > b.blockNumber
        ? -1
        : 1,
  );
  return { entries: sorted.slice(0, MAX_ENTRIES), truncated: sorted.length > MAX_ENTRIES };
}

export async function readBidHistory(
  tokenId: number,
  range: HistoryRange,
  client: LogsClient = publicClient,
): Promise<BidHistory> {
  if (!Number.isSafeInteger(tokenId) || tokenId < 0) throw new RangeError('Invalid token ID');
  if (!auctionAddress) throw new AuctionConfigurationError('Missing auction address');
  const contract = auctionAddress;
  const { fromBlock, toBlock, capped } = historyRange(range);
  const found: HistoryEntry[] = [];
  let complete = !capped;
  let windowsRead = 0;
  for (const [start, end] of windows(fromBlock, toBlock)) {
    // A window that ends before the latest block is settled history; the newest one is not.
    const key = end < toBlock ? `${contract}:${tokenId}:${start}:${end}` : null;
    try {
      const kept = key ? logCache.get(key) : undefined;
      const [bids, deliveries] = kept
        ? [kept.bids, kept.deliveries]
        : await Promise.all([
            client.getLogs({
              address: contract,
              event: bidEvent,
              args: { nftId: BigInt(tokenId) },
              fromBlock: start,
              toBlock: end,
              strict: true,
            }),
            client.getLogs({
              address: contract,
              event: deliveredEvent,
              args: { nftId: BigInt(tokenId) },
              fromBlock: start,
              toBlock: end,
              strict: true,
            }),
          ]);
      if (key && !kept) remember(key, { bids, deliveries });
      windowsRead += 1;
      for (const log of bids) {
        const entry = validBid(log as unknown as RawLog, tokenId, contract);
        if (entry) found.push(entry);
      }
      for (const log of deliveries) {
        const entry = validDelivery(log as unknown as RawLog, tokenId, contract);
        if (entry) found.push(entry);
      }
    } catch (cause) {
      // Nothing read at all is an unavailable history; a later failure leaves it incomplete.
      if (windowsRead === 0) throw new Error('Bid history unavailable', { cause });
      complete = false;
      break;
    }
  }
  const ordered = orderEntries(found);
  const blocks = [...new Set(ordered.entries.map((entry) => entry.blockNumber))];
  const timestamps = new Map<bigint, bigint | null>();
  await Promise.all(
    blocks.map(async (blockNumber) => {
      try {
        const block = await client.getBlock({ blockNumber });
        timestamps.set(blockNumber, block.timestamp);
      } catch {
        timestamps.set(blockNumber, null);
      }
    }),
  );
  return {
    entries: ordered.entries.map((entry) => ({
      ...entry,
      timestamp: timestamps.get(entry.blockNumber) ?? null,
    })),
    complete,
    truncated: ordered.truncated,
    fromBlock,
    toBlock,
  };
}
