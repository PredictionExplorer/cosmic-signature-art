// @vitest-environment node
// Opt-in: requires a dedicated, disposable Hardhat node. Never runs against a remote RPC.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  keccak256,
  type Abi,
  type Address,
  type EIP1193Provider,
  type Hex,
} from 'viem';
import { GAME_ADDRESS, NFT_ADDRESS } from '../site';
import { auctionAbi } from './abi';
import { MINIMUM_BID } from './rules';

const rehearsalRpc = process.env.ART_AUCTION_REHEARSAL_RPC;
const contractRoot =
  process.env.ART_AUCTION_CONTRACT_ROOT || resolve(process.cwd(), '../Cosmic-Signature');
type Artifact = { abi: Abi; bytecode: Hex; deployedBytecode: Hex };

async function artifact(path: string): Promise<Artifact> {
  return JSON.parse(
    await readFile(resolve(contractRoot, 'artifacts/production/contracts', path), 'utf8'),
  ) as Artifact;
}

const rehearsalChain = defineChain({
  id: 31337,
  name: 'Disposable auction client rehearsal',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [rehearsalRpc || 'http://127.0.0.1:8547'] } },
});

let requestId = 0;
async function rpc(method: string, params: readonly unknown[] = []): Promise<unknown> {
  const response = await fetch(rehearsalRpc!, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
  });
  const payload = (await response.json()) as {
    result?: unknown;
    error?: { message: string; code: number; data?: unknown };
  };
  if (payload.error) throw Object.assign(new Error(payload.error.message), payload.error);
  return payload.result;
}

function walletProvider(account: Address): EIP1193Provider {
  return {
    on: () => undefined,
    removeListener: () => undefined,
    request: (async ({ method, params }: { method: string; params?: readonly unknown[] }) => {
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [account];
      return rpc(method, params);
    }) as EIP1193Provider['request'],
  };
}

describe.runIf(!!rehearsalRpc)('auction frontend client against real local contracts', () => {
  const transport = http(rehearsalRpc);
  const chainClient = createPublicClient({ chain: rehearsalChain, transport, cacheTime: 0 });
  const wallet = createWalletClient({ chain: rehearsalChain, transport });
  let accounts: Address[];
  let gameArtifact: Artifact;
  let auction: Address;
  let client: typeof import('./client');
  let clock = 0;

  async function synchronizeClock() {
    clock = Number((await chainClient.getBlock()).timestamp) * 1000;
  }
  async function writeGame(functionName: string, args: readonly unknown[]) {
    const hash = await wallet.writeContract({
      account: accounts[0],
      address: GAME_ADDRESS,
      abi: gameArtifact.abi,
      functionName,
      args,
    });
    await chainClient.waitForTransactionReceipt({ hash });
    await synchronizeClock();
  }

  beforeAll(async () => {
    if (
      !rehearsalRpc ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(rehearsalRpc).hostname)
    ) {
      throw new Error('The integration fixture only permits a disposable loopback RPC');
    }
    expect(await rpc('eth_chainId')).toBe('0x7a69');
    await rpc('hardhat_reset');
    accounts = (await rpc('eth_accounts')) as Address[];
    expect(accounts.length).toBeGreaterThanOrEqual(4);
    gameArtifact = await artifact('tests/ArtAuctionTestHarness.sol/ArtAuctionTestGame.json');
    const nftArtifact = await artifact('production/CosmicSignatureNft.sol/CosmicSignatureNft.json');
    const auctionArtifact = await artifact(
      'production/CosmicSignatureArtAuction.sol/CosmicSignatureArtAuction.json',
    );

    // Only the disposable local chain is changed. The game double distinguishes explicit donations
    // from receive(), while the NFT and auction use the actual compiled production implementations.
    await rpc('hardhat_setCode', [GAME_ADDRESS, gameArtifact.deployedBytecode]);
    const nftDeploymentHash = await wallet.deployContract({
      account: accounts[0],
      abi: nftArtifact.abi,
      bytecode: nftArtifact.bytecode,
      args: [GAME_ADDRESS],
    });
    const nftDeployment = await chainClient.waitForTransactionReceipt({ hash: nftDeploymentHash });
    const nftRuntime = await chainClient.getCode({ address: nftDeployment.contractAddress! });
    await rpc('hardhat_setCode', [NFT_ADDRESS, nftRuntime]);
    await writeGame('setNft', [NFT_ADDRESS]);
    const auctionDeploymentHash = await wallet.deployContract({
      account: accounts[0],
      abi: auctionArtifact.abi,
      bytecode: auctionArtifact.bytecode,
      args: [GAME_ADDRESS, NFT_ADDRESS],
    });
    const auctionDeployment = await chainClient.waitForTransactionReceipt({
      hash: auctionDeploymentHash,
    });
    auction = auctionDeployment.contractAddress!;
    await writeGame('mintAndRegister', [auction, 17n, 123n]);
    const runtime = await chainClient.getCode({ address: auction });
    vi.stubEnv('NEXT_PUBLIC_AUCTION_ADDRESS', auction);
    vi.stubEnv('NEXT_PUBLIC_CHAIN_ID', '31337');
    vi.stubEnv('NEXT_PUBLIC_RPC_URL', rehearsalRpc);
    vi.stubEnv('NEXT_PUBLIC_AUCTION_CODE_HASH', keccak256(runtime!));
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
    vi.resetModules();
    client = await import('./client');
  }, 60000);

  afterAll(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('executes exact bids, self-raises, refunds, settlement, delivery and correct game funding', async () => {
    const alice = accounts[1];
    const bob = accounts[2];
    const keeper = accounts[3];
    const aliceProvider = walletProvider(alice);
    const bobProvider = walletProvider(bob);
    const keeperProvider = walletProvider(keeper);
    const hashes: Hex[] = [];
    const onHash = (hash: Hex) => hashes.push(hash);
    await expect(client.verifyDeployment()).resolves.toBeUndefined();
    expect(await client.readBatch(0)).toMatchObject({ count: 1n, ids: [0, 1, 2, 3, 4, 5, 6, 7] });
    const batch = await client.readBatch(0);
    expect(batch.lots).toHaveLength(8);
    expect(
      batch.lots.every((item) => item.lot.roundNum === 17n && item.lot.highestBid === 0n),
    ).toBe(true);
    const preview = await client.readAuction(0, alice);
    expect(preview.lot.roundNum).toBe(17n);
    await expect(
      client.submitAction(
        aliceProvider,
        alice,
        0,
        { kind: 'bid', total: MINIMUM_BID, expectedFunding: MINIMUM_BID },
        onHash,
      ),
    ).rejects.toThrow();
    expect(hashes).toEqual([]);

    await rpc('evm_setNextBlockTimestamp', [Number(preview.lot.eligibleAt)]);
    await rpc('evm_mine');
    await synchronizeClock();
    await client.submitAction(
      aliceProvider,
      alice,
      0,
      { kind: 'bid', total: MINIMUM_BID, expectedFunding: MINIMUM_BID },
      onHash,
    );
    await synchronizeClock();
    const raised = (MINIMUM_BID * 11n) / 10n;
    const raiseReceipt = await client.submitAction(
      aliceProvider,
      alice,
      0,
      { kind: 'bid', total: raised, expectedFunding: raised - MINIMUM_BID },
      onHash,
    );
    const raiseTransaction = await chainClient.getTransaction({
      hash: raiseReceipt.transactionHash,
    });
    expect(raiseTransaction.value).toBe(raised - MINIMUM_BID);
    await synchronizeClock();

    const finalPrice = MINIMUM_BID * 2n;
    await client.submitAction(
      bobProvider,
      bob,
      0,
      { kind: 'bid', total: finalPrice, expectedFunding: finalPrice },
      onHash,
    );
    await synchronizeClock();
    const outbid = await client.readAuction(0, alice);
    expect(outbid.refund).toBe(raised);
    expect(outbid.lot.highestBidder.toLowerCase()).toBe(bob.toLowerCase());
    const hashesBeforeStaleReview = hashes.length;
    await expect(
      client.submitAction(
        aliceProvider,
        alice,
        0,
        { kind: 'bid', total: MINIMUM_BID * 10n, expectedFunding: MINIMUM_BID * 10n - raised },
        onHash,
      ),
    ).rejects.toBeInstanceOf(client.AuctionBidReviewChangedError);
    expect(hashes.length).toBe(hashesBeforeStaleReview);

    const recipientBalance = await chainClient.getBalance({ address: keeper });
    await client.submitAction(
      aliceProvider,
      alice,
      0,
      { kind: 'withdrawRefund', recipient: keeper },
      onHash,
    );
    expect(await chainClient.getBalance({ address: keeper })).toBe(recipientBalance + raised);
    await synchronizeClock();
    await rpc('evm_setNextBlockTimestamp', [Number(outbid.lot.endAt)]);
    await rpc('evm_mine');
    await synchronizeClock();
    await client.submitAction(keeperProvider, keeper, 0, { kind: 'settle' }, onHash);
    await synchronizeClock();
    await writeGame('setRejectDonations', [true]);
    await expect(
      client.submitAction(keeperProvider, keeper, 0, { kind: 'forwardProceeds' }, onHash),
    ).rejects.toThrow();
    expect((await client.readAuction(0)).lot.proceedsForwarded).toBe(false);

    await client.submitAction(bobProvider, bob, 0, { kind: 'claimNft', recipient: keeper }, onHash);
    await synchronizeClock();
    const nftOwner = await chainClient.readContract({
      address: NFT_ADDRESS,
      abi: [
        {
          type: 'function',
          name: 'ownerOf',
          stateMutability: 'view',
          inputs: [{ name: 'tokenId', type: 'uint256' }],
          outputs: [{ type: 'address' }],
        },
      ],
      functionName: 'ownerOf',
      args: [0n],
    });
    expect(nftOwner.toLowerCase()).toBe(keeper.toLowerCase());
    await writeGame('setRejectDonations', [false]);
    await client.submitAction(keeperProvider, keeper, 0, { kind: 'forwardProceeds' }, onHash);
    await synchronizeClock();
    const finished = await client.readAuction(0, alice);
    expect(finished.lot).toMatchObject({
      settled: true,
      delivered: true,
      proceedsForwarded: true,
      highestBid: finalPrice,
    });
    expect(finished.refund).toBe(0n);
    expect(
      await chainClient.readContract({
        address: GAME_ADDRESS,
        abi: gameArtifact.abi,
        functionName: 'totalDonations',
      }),
    ).toBe(finalPrice);
    expect(
      await chainClient.readContract({
        address: GAME_ADDRESS,
        abi: gameArtifact.abi,
        functionName: 'receiveCount',
      }),
    ).toBe(0n);
    expect(
      await chainClient.readContract({
        address: auction,
        abi: auctionAbi,
        functionName: 'totalLiabilities',
      }),
    ).toBe(0n);
    expect(await chainClient.getBalance({ address: auction })).toBe(0n);
    expect(hashes.length).toBe(7);
  }, 60000);
});
