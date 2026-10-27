import { erc721Abi, isAddress, isAddressEqual, type Address } from 'viem';
import { auctionAbi } from './abi';
import { publicClient, readBatch, AuctionConfigurationError } from './client';
import { auctionAddress } from './config';
import { NFT_ADDRESS } from '../site';
import { isLeading } from './catalogue';

/**
 * A collector's view of the current sale, read from the chain and never written to it: the
 * lots they lead, the ETH those bids commit, the credit they may retrieve, the works they
 * have won and still await, and the works of this sale their wallet holds. The panel's own
 * refund and withdraw remain the only actions; this sheet initiates none.
 */
export type Activity = {
  account: Address;
  blockTime: bigint;
  ids: number[];
  leading: Array<{ tokenId: number; amount: bigint }>;
  won: Array<{ tokenId: number; amount: bigint; delivered: boolean }>;
  held: number[];
  committed: bigint;
  refundable: bigint;
};
export type ActivityClient = {
  readContract: typeof publicClient.readContract;
};
/** The lots the view is read against: the sale's page of eight, or the batch a token belongs to. */
export type ActivityScope = { page: number } | { tokenId: number };
/** A sale is one batch of eight registered tokens. */
export const BATCH_SIZE = 8;
/** Batches are walked newest first; a token outside this many is not a lot the venue shows. */
export const MAX_BATCHES_WALKED = 64;

/**
 * The page (newest batch first, as readBatch counts) whose eight tokens include `tokenId`.
 * Read from the contract's own batch registry; a token no registered batch holds is not a lot.
 */
export async function batchForToken(
  tokenId: number,
  client: ActivityClient = publicClient,
): Promise<number> {
  if (!Number.isSafeInteger(tokenId) || tokenId < 0) throw new RangeError('Invalid token ID');
  if (!auctionAddress) throw new AuctionConfigurationError('Missing auction address');
  const base = { address: auctionAddress, abi: auctionAbi } as const;
  const count = await client.readContract({ ...base, functionName: 'registeredBatchCount' });
  const walked = count < BigInt(MAX_BATCHES_WALKED) ? Number(count) : MAX_BATCHES_WALKED;
  for (let page = 0; page < walked; page += 1) {
    const first = await client.readContract({
      ...base,
      functionName: 'firstNftIdByBatchIndex',
      args: [count - 1n - BigInt(page)],
    });
    if (first <= BigInt(tokenId) && BigInt(tokenId) < first + BigInt(BATCH_SIZE)) return page;
  }
  throw new Error('UnknownAuction: the token belongs to no registered batch');
}

export async function readActivity(
  account: Address,
  scope: ActivityScope,
  client: ActivityClient = publicClient,
  batch: typeof readBatch = readBatch,
): Promise<Activity> {
  if (!isAddress(account)) throw new RangeError('Invalid account');
  if (!auctionAddress) throw new AuctionConfigurationError('Missing auction address');
  const page = 'page' in scope ? scope.page : await batchForToken(scope.tokenId, client);
  if (!Number.isSafeInteger(page) || page < 0) throw new RangeError('Invalid batch page');
  const result = await batch(page);
  const [refundable, owners] = await Promise.all([
    client.readContract({
      address: auctionAddress,
      abi: auctionAbi,
      functionName: 'refundCredits',
      args: [account],
    }),
    Promise.all(
      result.ids.map((tokenId) =>
        client
          .readContract({
            address: NFT_ADDRESS,
            abi: erc721Abi,
            functionName: 'ownerOf',
            args: [BigInt(tokenId)],
          })
          .catch(() => null),
      ),
    ),
  ]);
  const leading: Activity['leading'] = [];
  const won: Activity['won'] = [];
  for (const { tokenId, lot } of result.lots) {
    if (!isLeading(lot, account)) continue;
    if (lot.settled) won.push({ tokenId, amount: lot.highestBid, delivered: lot.delivered });
    else leading.push({ tokenId, amount: lot.highestBid });
  }
  const held = result.ids.filter((tokenId, index) => {
    const owner = owners[index];
    return typeof owner === 'string' && isAddress(owner) && isAddressEqual(owner, account);
  });
  return {
    account,
    blockTime: result.blockTime,
    ids: result.ids,
    leading,
    won,
    held,
    committed: leading.reduce((sum, entry) => sum + entry.amount, 0n),
    refundable: typeof refundable === 'bigint' ? refundable : 0n,
  };
}
