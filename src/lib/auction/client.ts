import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  encodeFunctionData,
  http,
  isAddress,
  isAddressEqual,
  keccak256,
  zeroAddress,
  type Address,
  type EIP1193Provider,
  type Hex,
} from 'viem';
import { arbitrum } from 'viem/chains';
import { auctionAbi } from './abi';
import { auctionAddress, auctionConfigured, rpcUrl, chainId, expectedCodeHash } from './config';
import { GAME_ADDRESS, NFT_ADDRESS } from '../site';
import { bidFunding, type AuctionRecord } from './rules';

const chain =
  chainId === 31337
    ? defineChain({
        id: 31337,
        name: 'Local V4 rehearsal',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: [rpcUrl] } },
      })
    : arbitrum;
export const publicClient = createPublicClient({
  chain,
  transport: http(rpcUrl, { timeout: 12000, retryCount: 1, batch: true }),
});
export type Snapshot = {
  lot: AuctionRecord;
  minimum: bigint;
  refund: bigint;
  blockTime: bigint;
  blockNumber: bigint;
  fetchedAt: number;
};
export class AuctionConfigurationError extends Error {}
export class AuctionDataStaleError extends Error {}
export class AuctionBidReviewChangedError extends Error {}
export class AuctionTransactionReplacedError extends Error {}
export class AuctionTransactionMismatchError extends Error {}
export class AuctionTransactionUnconfirmedError extends Error {
  constructor(
    public readonly transactionHash: Hex,
    options?: ErrorOptions,
  ) {
    super('Transaction submitted; its outcome has not been confirmed', options);
  }
}

export function assertBlockFresh(blockTime: bigint, now = Date.now()) {
  const current = BigInt(Math.floor(now / 1000));
  if (blockTime < current - 120n || blockTime > current + 30n) {
    throw new AuctionDataStaleError('RPC block time is stale or inconsistent with the local clock');
  }
}

function validateTokenId(tokenId: number) {
  if (!Number.isSafeInteger(tokenId) || tokenId < 0) throw new RangeError('Invalid token ID');
}

export async function verifyDeployment(blockNumber?: bigint) {
  if (!auctionConfigured || !auctionAddress || (chainId !== 42161 && chainId !== 31337)) {
    throw new AuctionConfigurationError('Missing or unsupported configuration');
  }
  const validHash = !!expectedCodeHash && /^0x[0-9a-fA-F]{64}$/.test(expectedCodeHash);
  if ((chainId === 42161 && !validHash) || (expectedCodeHash && !validHash)) {
    throw new AuctionConfigurationError('A verified auction runtime code hash is required');
  }
  const [actualChain, game, nft, code] = await Promise.all([
    publicClient.getChainId(),
    publicClient.readContract({
      address: auctionAddress,
      abi: auctionAbi,
      functionName: 'game',
      blockNumber,
    }),
    publicClient.readContract({
      address: auctionAddress,
      abi: auctionAbi,
      functionName: 'nft',
      blockNumber,
    }),
    publicClient.getCode({ address: auctionAddress, blockNumber }),
  ]);
  if (
    actualChain !== chainId ||
    !code ||
    code === '0x' ||
    !isAddressEqual(game, GAME_ADDRESS) ||
    !isAddressEqual(nft, NFT_ADDRESS) ||
    (expectedCodeHash && keccak256(code).toLowerCase() !== expectedCodeHash.toLowerCase())
  ) {
    throw new AuctionConfigurationError('Deployment mismatch');
  }
}

export async function readAuction(tokenId: number, account?: Address): Promise<Snapshot> {
  validateTokenId(tokenId);
  const block = await publicClient.getBlock({ blockTag: 'latest' });
  assertBlockFresh(block.timestamp);
  await verifyDeployment(block.number);
  const base = { address: auctionAddress!, abi: auctionAbi, blockNumber: block.number };
  const [lot, minimum, refund] = await Promise.all([
    publicClient.readContract({ ...base, functionName: 'getAuction', args: [BigInt(tokenId)] }),
    publicClient.readContract({ ...base, functionName: 'minimumNextBid', args: [BigInt(tokenId)] }),
    account
      ? publicClient.readContract({ ...base, functionName: 'refundCredits', args: [account] })
      : 0n,
  ]);
  assertBlockFresh(block.timestamp);
  return {
    lot,
    minimum,
    refund,
    blockTime: block.timestamp,
    blockNumber: block.number,
    fetchedAt: Date.now(),
  };
}

export async function readBatch(page: number) {
  if (!Number.isSafeInteger(page) || page < 0) throw new RangeError('Invalid batch page');
  const block = await publicClient.getBlock({ blockTag: 'latest' });
  assertBlockFresh(block.timestamp);
  await verifyDeployment(block.number);
  const base = { address: auctionAddress!, abi: auctionAbi, blockNumber: block.number };
  const count = await publicClient.readContract({ ...base, functionName: 'registeredBatchCount' });
  const index = count - 1n - BigInt(page);
  if (index < 0n) {
    assertBlockFresh(block.timestamp);
    return {
      count,
      ids: [] as number[],
      lots: [] as Array<{ tokenId: number; lot: AuctionRecord }>,
      blockTime: block.timestamp,
    };
  }
  const first = await publicClient.readContract({
    ...base,
    functionName: 'firstNftIdByBatchIndex',
    args: [index],
  });
  if (first > BigInt(Number.MAX_SAFE_INTEGER - 7)) throw new Error('Token IDs exceed UI range');
  const ids = Array.from({ length: 8 }, (_, i) => Number(first) + i);
  const lots = await Promise.all(
    ids.map(async (tokenId) => ({
      tokenId,
      lot: await publicClient.readContract({
        ...base,
        functionName: 'getAuction',
        args: [BigInt(tokenId)],
      }),
    })),
  );
  assertBlockFresh(block.timestamp);
  return { count, ids, lots, blockTime: block.timestamp };
}

export type AuctionAction =
  | { kind: 'bid'; total: bigint; expectedFunding: bigint }
  | { kind: 'settle' }
  | { kind: 'claimNft'; recipient: Address }
  | { kind: 'withdrawRefund'; recipient: Address }
  | { kind: 'forwardProceeds' };

type ActionTransaction = { from: Address; to: Address | null; input: Hex; value: bigint };
function matchesAction(transaction: ActionTransaction, account: Address, data: Hex, value: bigint) {
  return (
    !!transaction.to &&
    isAddressEqual(transaction.to, auctionAddress!) &&
    isAddressEqual(transaction.from, account) &&
    transaction.input.toLowerCase() === data.toLowerCase() &&
    transaction.value === value
  );
}

export async function submitAction(
  provider: EIP1193Provider,
  account: Address,
  tokenId: number,
  action: AuctionAction,
  onHash: (hash: Hex) => void,
) {
  validateTokenId(tokenId);
  const wallet = createWalletClient({ chain, transport: custom(provider) });
  async function verifyWallet() {
    const [accounts, actualChain] = await Promise.all([wallet.getAddresses(), wallet.getChainId()]);
    if (actualChain !== chainId || !accounts[0] || !isAddressEqual(accounts[0], account)) {
      throw new Error('Wallet state changed');
    }
  }
  await verifyWallet();
  const fresh = await readAuction(tokenId, account);
  let data: Hex;
  let value = 0n;
  if (action.kind === 'bid') {
    value = bidFunding(
      action.total,
      fresh.lot.highestBid,
      isAddressEqual(fresh.lot.highestBidder, account),
    );
    if (value !== action.expectedFunding)
      throw new AuctionBidReviewChangedError('Required funding changed; review the bid again');
    data = encodeFunctionData({
      abi: auctionAbi,
      functionName: 'bid',
      args: [BigInt(tokenId), action.total],
    });
  } else if (action.kind === 'claimNft' || action.kind === 'withdrawRefund') {
    if (
      !isAddress(action.recipient) ||
      isAddressEqual(action.recipient, zeroAddress) ||
      isAddressEqual(action.recipient, auctionAddress!)
    ) {
      throw new Error('Invalid recipient');
    }
    data =
      action.kind === 'claimNft'
        ? encodeFunctionData({
            abi: auctionAbi,
            functionName: 'claimNft',
            args: [BigInt(tokenId), action.recipient],
          })
        : encodeFunctionData({
            abi: auctionAbi,
            functionName: 'withdrawRefund',
            args: [action.recipient],
          });
  } else {
    data = encodeFunctionData({
      abi: auctionAbi,
      functionName: action.kind,
      args: [BigInt(tokenId)],
    });
  }

  // Simulate exactly the calldata and ETH that will be sent. No recalculated bid amount or credit reuse.
  const transactionRequest = { account, to: auctionAddress!, data, value };
  await publicClient.call(transactionRequest);
  await verifyWallet();
  assertBlockFresh(fresh.blockTime);
  const hash = await wallet.sendTransaction({ ...transactionRequest, chain });
  onHash(hash);
  let acceptedHash = hash;
  let unrelatedReplacement = false;
  let receipt;
  try {
    receipt = await publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 1,
      timeout: 180000,
      onReplaced(replacement) {
        onHash(replacement.transaction.hash);
        if (
          replacement.reason !== 'repriced' ||
          !matchesAction(replacement.transaction, account, data, value)
        ) {
          unrelatedReplacement = true;
        } else {
          acceptedHash = replacement.transaction.hash;
        }
      },
    });
  } catch (cause) {
    throw new AuctionTransactionUnconfirmedError(acceptedHash, { cause });
  }
  if (unrelatedReplacement)
    throw new AuctionTransactionReplacedError('The auction transaction was cancelled or replaced');
  if (receipt.transactionHash.toLowerCase() !== acceptedHash.toLowerCase()) {
    throw new AuctionTransactionMismatchError('Unexpected transaction receipt');
  }
  if (receipt.status !== 'success') throw new Error('Transaction reverted');
  let transaction;
  try {
    transaction = await publicClient.getTransaction({ hash: receipt.transactionHash });
  } catch (cause) {
    throw new AuctionTransactionUnconfirmedError(receipt.transactionHash, { cause });
  }
  if (!matchesAction(transaction, account, data, value)) {
    throw new AuctionTransactionMismatchError(
      'Confirmed transaction does not match the reviewed auction action',
    );
  }
  return receipt;
}

export async function switchChain(provider: EIP1193Provider) {
  if (chainId !== 42161 && chainId !== 31337)
    throw new AuctionConfigurationError('Unsupported chain');
  await provider.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: `0x${chainId.toString(16)}` }],
  });
}
export { zeroAddress };
