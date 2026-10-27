import { parseEther, type Address, type Hex } from 'viem';
import type { BidHistory, HistoryEntry, HistoryRange } from '../../src/lib/auction/history';
import { fixture } from './client';
export type { BidHistory, HistoryEntry, HistoryRange } from '../../src/lib/auction/history';

const other: Address = '0x0000000000000000000000000000000000000035';
const hash = (n: number): Hex => `0x${n.toString(16).padStart(64, '0')}`;

/** Synthetic bid history shaped by the fixture: no logs are read, no network is touched. */
export async function readBidHistory(tokenId: number, range: HistoryRange): Promise<BidHistory> {
  if (fixture.historyFailure) throw new Error('Synthetic history outage');
  const now = BigInt(Math.floor(Date.now() / 1000));
  const entries: HistoryEntry[] = [];
  if (tokenId === 31 && fixture.phase !== 'waiting' && fixture.phase !== 'preview') {
    entries.push(
      {
        kind: 'bid',
        bidder: fixture.leader,
        amount: fixture.highest,
        ethPaid: fixture.highest,
        endAt: now + 8000n,
        blockNumber: 123n,
        logIndex: 2,
        transactionHash: hash(123),
        timestamp: now - 600n,
      },
      {
        kind: 'bid',
        bidder: other,
        amount: parseEther('0.9'),
        ethPaid: parseEther('0.9'),
        endAt: now + 8000n,
        blockNumber: 120n,
        logIndex: 0,
        transactionHash: hash(120),
        timestamp: now - 3600n,
      },
    );
    if (fixture.delivered)
      entries.unshift({
        kind: 'delivered',
        winner: fixture.leader,
        recipient: fixture.leader,
        blockNumber: 130n,
        logIndex: 1,
        transactionHash: hash(130),
        timestamp: now - 60n,
      });
  }
  return {
    entries,
    complete: !fixture.historyPartial,
    truncated: false,
    fromBlock: 0n,
    toBlock: range.latestBlock,
  };
}
