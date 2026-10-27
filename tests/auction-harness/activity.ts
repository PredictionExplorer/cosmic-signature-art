import { isAddress, isAddressEqual, type Address } from 'viem';
import type { Activity } from '../../src/lib/auction/activity';
import { fixture, readBatch } from './client';
export type { Activity } from '../../src/lib/auction/activity';

/** Synthetic activity shaped by the fixture: read-only, no network, no signing. */
export async function readActivity(account: Address, page = 0): Promise<Activity> {
  if (!isAddress(account)) throw new RangeError('Invalid account');
  if (fixture.failure) throw new Error('Synthetic RPC outage');
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
