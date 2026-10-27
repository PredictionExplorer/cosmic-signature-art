import { isAddress, isAddressEqual, type Address } from 'viem';
import type { Activity, ActivityScope } from '../../src/lib/auction/activity';
import { fixture, readBatch } from './client';
export type { Activity, ActivityScope } from '../../src/lib/auction/activity';

/** The fixture's batches: page 0 holds 031, 035 and 023; page 1 holds 014. */
export async function batchForToken(tokenId: number): Promise<number> {
  if (fixture.failure) throw new Error('Synthetic RPC outage');
  if (tokenId === 14) return 1;
  if ([31, 35, 23].includes(tokenId)) return 0;
  throw new Error('UnknownAuction: the token belongs to no registered batch');
}

/** Synthetic activity shaped by the fixture: read-only, no network, no signing. */
export async function readActivity(account: Address, scope: ActivityScope): Promise<Activity> {
  if (!isAddress(account)) throw new RangeError('Invalid account');
  if (fixture.failure) throw new Error('Synthetic RPC outage');
  const page = 'page' in scope ? scope.page : await batchForToken(scope.tokenId);
  const batch = await readBatch(page);
  const leads = isAddressEqual(fixture.leader, account);
  const bidding = fixture.phase === 'active' || fixture.phase === 'ended';
  const leading = leads && bidding ? [{ tokenId: 31, amount: fixture.highest }] : [];
  const won =
    leads && fixture.phase === 'settled'
      ? [{ tokenId: 31, amount: fixture.highest, delivered: fixture.delivered }]
      : [];
  return {
    account,
    blockTime: batch.blockTime,
    ids: batch.ids,
    leading,
    won,
    held: leads && fixture.delivered ? [31] : [],
    committed: leading.reduce((sum, entry) => sum + entry.amount, 0n),
    refundable: fixture.refund,
  };
}
