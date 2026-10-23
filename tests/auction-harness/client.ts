import { zeroAddress, parseEther, type Address, type EIP1193Provider, type Hex } from 'viem';
import type { AuctionAction, Snapshot } from '../../src/lib/auction/client';
export type { AuctionAction, Snapshot } from '../../src/lib/auction/client';
export { zeroAddress };
export class AuctionConfigurationError extends Error {}
export const account: Address = '0x0000000000000000000000000000000000000031';
const other: Address = '0x0000000000000000000000000000000000000035';
type Phase = 'waiting' | 'preview' | 'active' | 'ended' | 'settled';
type Submission = { tokenId: number; account: Address; action: AuctionAction };
const listeners = new Map<string, Set<(value: unknown) => void>>();
export const fixture = {
  phase: 'active' as Phase,
  failure: false,
  stale: false,
  highest: parseEther('1'),
  leader: other,
  refund: 0n,
  delivered: false,
  forwarded: false,
  walletChain: '0xa4b1',
  calls: [] as Submission[],
  providerMethods: [] as string[],
  emit(name: string, value: unknown) {
    for (const listener of listeners.get(name) ?? []) listener(value);
  },
  refresh() {
    window.dispatchEvent(new Event('focus'));
  },
};
export const provider = {
  async request({ method }: { method: string }) {
    fixture.providerMethods.push(method);
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [account];
    if (method === 'eth_chainId') return fixture.walletChain;
    throw new Error(`Test wallet forbids ${method}; no network or real signing is possible`);
  },
  on(name: string, listener: (value: unknown) => void) {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name)!.add(listener);
  },
  removeListener(name: string, listener: (value: unknown) => void) {
    listeners.get(name)?.delete(listener);
  },
} as EIP1193Provider;
export async function switchChain() {
  fixture.walletChain = '0xa4b1';
  fixture.emit('chainChanged', fixture.walletChain);
}
export async function readAuction(): Promise<Snapshot> {
  if (fixture.failure) throw new Error('Synthetic RPC outage');
  const time = BigInt(Math.floor(Date.now() / 1000));
  const noBid = fixture.phase === 'waiting' || fixture.phase === 'preview';
  return {
    lot: {
      roundNum: 12n,
      eligibleAt: fixture.phase === 'preview' ? time + 3600n : time - 3600n,
      endAt: noBid ? 0n : fixture.phase === 'active' ? time + 8000n : time - 1n,
      highestBid: noBid ? 0n : fixture.highest,
      highestBidder: noBid ? zeroAddress : fixture.leader,
      registered: true,
      settled: fixture.phase === 'settled',
      delivered: fixture.delivered,
      proceedsForwarded: fixture.forwarded,
    },
    minimum: noBid ? parseEther('0.00001') : (fixture.highest * 11n + 9n) / 10n,
    refund: fixture.refund,
    blockTime: time,
    blockNumber: 123n,
    fetchedAt: Date.now() - (fixture.stale ? 30_000 : 0),
  };
}
export async function readBatch(page: number) {
  const snapshot = await readAuction();
  const ids = page === 0 ? [31, 35, 23] : [14];
  return {
    count: 2n,
    ids,
    lots: ids.map((tokenId) => ({ tokenId, lot: snapshot.lot })),
    blockTime: snapshot.blockTime,
  };
}
export async function submitAction(
  _provider: EIP1193Provider,
  sender: Address,
  tokenId: number,
  action: AuctionAction,
  onHash: (hash: Hex) => void,
) {
  // Intentionally never delegates to a provider, network, or production client.
  fixture.calls.push({ tokenId, account: sender, action });
  onHash(`0x${'ab'.repeat(32)}`);
  if (action.kind === 'bid') {
    fixture.highest = action.total;
    fixture.leader = sender;
    fixture.phase = 'active';
  } else if (action.kind === 'settle') fixture.phase = 'settled';
  else if (action.kind === 'claimNft') fixture.delivered = true;
  else if (action.kind === 'forwardProceeds') fixture.forwarded = true;
  else if (action.kind === 'withdrawRefund') fixture.refund = 0n;
}
