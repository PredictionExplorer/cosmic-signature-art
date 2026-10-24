// @vitest-environment node
// Opt-in: requires a dedicated, disposable Hardhat node. Never runs against a remote RPC.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeErrorResult,
  encodeFunctionData,
  http,
  keccak256,
  parseEventLogs,
  type Abi,
  type Address,
  type EIP1193Provider,
  type Hex,
} from 'viem';
import { GAME_ADDRESS, NFT_ADDRESS } from '../site';
import { auctionAbi } from './abi';
import { DURATION_SECONDS, EXTENSION_SECONDS, MINIMUM_BID, PREVIEW_SECONDS } from './rules';
import type { AuctionAction } from './client';

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
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Local rehearsal RPC returned HTTP ${response.status}`);
  const payload = (await response.json()) as {
    result?: unknown;
    error?: { message: string; code: number; data?: unknown };
  };
  if (payload.error) throw Object.assign(new Error(payload.error.message), payload.error);
  return payload.result;
}

function walletProvider(account: Address, transactionTime?: bigint): EIP1193Provider {
  return {
    on: () => undefined,
    removeListener: () => undefined,
    request: (async ({ method, params }: { method: string; params?: readonly unknown[] }) => {
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [account];
      // Pin the execution block after the client's preflight, so boundary tests do not depend
      // on how many wall-clock seconds elapsed while fetching and simulating the reviewed bid.
      if (method === 'eth_sendTransaction' && transactionTime !== undefined)
        await rpc('evm_setNextBlockTimestamp', [Number(transactionTime)]);
      return rpc(method, params);
    }) as EIP1193Provider['request'],
  };
}

describe.runIf(!!rehearsalRpc)('auction frontend client against real local contracts', () => {
  const transport = http(rehearsalRpc, { fetchOptions: { redirect: 'error' }, retryCount: 0 });
  const chainClient = createPublicClient({ chain: rehearsalChain, transport, cacheTime: 0 });
  const wallet = createWalletClient({ chain: rehearsalChain, transport });
  let accounts: Address[];
  let gameArtifact: Artifact;
  let nftArtifact: Artifact;
  let actorArtifact: Artifact;
  let auction: Address;
  let actor: Address;
  let client: typeof import('./client');
  let clock = 0;
  let fixtureSnapshot: unknown;
  let submittedHashes: Hex[];

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
    expect((await chainClient.waitForTransactionReceipt({ hash })).status).toBe('success');
    await synchronizeClock();
  }
  async function writeActor(functionName: string, args: readonly unknown[]) {
    const hash = await wallet.writeContract({
      account: accounts[0],
      address: actor,
      abi: actorArtifact.abi,
      functionName,
      args,
    });
    expect((await chainClient.waitForTransactionReceipt({ hash })).status).toBe('success');
    await synchronizeClock();
  }
  async function mineAt(timestamp: bigint) {
    await rpc('evm_setNextBlockTimestamp', [Number(timestamp)]);
    await rpc('evm_mine');
    await synchronizeClock();
  }
  async function submit(account: Address, tokenId: number, action: AuctionAction, at?: bigint) {
    if (at !== undefined && BigInt(Math.floor(clock / 1000)) < at - 1n) await mineAt(at - 1n);
    const receipt = await client.submitAction(
      walletProvider(account, at),
      account,
      tokenId,
      action,
      (hash) => {
        submittedHashes.push(hash);
      },
    );
    expect(receipt.status).toBe('success');
    await synchronizeClock();
    return receipt;
  }
  async function expectAccounting(escrow: bigint, refunds: bigint, proceeds: bigint) {
    const totals = await Promise.all(
      (
        [
          'totalBidEscrow',
          'totalRefundCredits',
          'totalPendingProceeds',
          'totalLiabilities',
        ] as const
      ).map((functionName) =>
        chainClient.readContract({ address: auction, abi: auctionAbi, functionName }),
      ),
    );
    expect(totals).toEqual([escrow, refunds, proceeds, escrow + refunds + proceeds]);
    expect(await chainClient.getBalance({ address: auction })).toBe(escrow + refunds + proceeds);
  }
  async function expectOwner(tokenId: number, owner: Address) {
    const actual = await chainClient.readContract({
      address: NFT_ADDRESS,
      abi: nftArtifact.abi,
      functionName: 'ownerOf',
      args: [BigInt(tokenId)],
    });
    expect(String(actual).toLowerCase()).toBe(owner.toLowerCase());
  }

  beforeAll(async () => {
    const url = rehearsalRpc ? new URL(rehearsalRpc) : null;
    if (
      !url ||
      url.protocol !== 'http:' ||
      url.username ||
      url.password ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    ) {
      throw new Error('The integration fixture only permits a disposable loopback RPC');
    }
    expect(await rpc('eth_chainId')).toBe('0x7a69');
    expect(await rpc('web3_clientVersion')).toMatch(/^HardhatNetwork\//);
    await rpc('hardhat_reset');
    accounts = (await rpc('eth_accounts')) as Address[];
    expect(accounts.length).toBeGreaterThanOrEqual(5);
    gameArtifact = await artifact('tests/ArtAuctionTestHarness.sol/ArtAuctionTestGame.json');
    actorArtifact = await artifact('tests/ArtAuctionTestHarness.sol/ArtAuctionTestActor.json');
    nftArtifact = await artifact('production/CosmicSignatureNft.sol/CosmicSignatureNft.json');
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
    const actorDeploymentHash = await wallet.deployContract({
      account: accounts[0],
      abi: actorArtifact.abi,
      bytecode: actorArtifact.bytecode,
    });
    actor = (await chainClient.waitForTransactionReceipt({ hash: actorDeploymentHash }))
      .contractAddress!;
    await writeGame('mintAndRegister', [auction, 17n, 123n]);
    const runtime = await chainClient.getCode({ address: auction });
    vi.stubEnv('NEXT_PUBLIC_AUCTION_ADDRESS', auction);
    vi.stubEnv('NEXT_PUBLIC_CHAIN_ID', '31337');
    vi.stubEnv('NEXT_PUBLIC_RPC_URL', rehearsalRpc);
    vi.stubEnv('NEXT_PUBLIC_AUCTION_CODE_HASH', keccak256(runtime!));
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
    vi.resetModules();
    client = await import('./client');
    fixtureSnapshot = await rpc('evm_snapshot');
  }, 60000);

  beforeEach(async () => {
    expect(await rpc('evm_revert', [fixtureSnapshot])).toBe(true);
    fixtureSnapshot = await rpc('evm_snapshot');
    submittedHashes = [];
    await synchronizeClock();
  });

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

  it('enforces eligibility, the exact ten-minute boundary, repeated extensions and final closing', async () => {
    const [alice, bob, keeper] = accounts.slice(1, 4);
    const preview = await client.readAuction(0);
    expect(preview.lot.eligibleAt - preview.blockTime).toBe(PREVIEW_SECONDS);
    expect(preview.lot.endAt).toBe(0n);
    await mineAt(preview.lot.eligibleAt - 1n);
    await expect(
      submit(alice, 0, { kind: 'bid', total: MINIMUM_BID, expectedFunding: MINIMUM_BID }),
    ).rejects.toThrow();
    expect(submittedHashes).toEqual([]);
    await mineAt(preview.lot.eligibleAt);
    const opening = MINIMUM_BID + 1n;
    const first = await submit(alice, 0, { kind: 'bid', total: opening, expectedFunding: opening });
    const firstBlock = await chainClient.getBlock({ blockNumber: first.blockNumber });
    const started = await client.readAuction(0);
    const originalEnd = firstBlock.timestamp + DURATION_SECONDS;
    expect(started.lot.endAt).toBe(originalEnd);
    // An odd-wei opening exercises rounding up, not floating point or truncating ten percent.
    const boundaryBid = 11_000_000_000_002n;
    expect(started.minimum).toBe(boundaryBid);
    const boundary = await submit(
      bob,
      0,
      { kind: 'bid', total: boundaryBid, expectedFunding: boundaryBid },
      originalEnd - EXTENSION_SECONDS,
    );
    expect((await chainClient.getBlock({ blockNumber: boundary.blockNumber })).timestamp).toBe(
      originalEnd - EXTENSION_SECONDS,
    );
    expect((await client.readAuction(0)).lot.endAt).toBe(originalEnd);

    const earlyExtension = await submit(
      alice,
      0,
      { kind: 'bid', total: 2n * MINIMUM_BID, expectedFunding: 2n * MINIMUM_BID },
      originalEnd - EXTENSION_SECONDS + 1n,
    );
    let latestEnd = originalEnd + 1n;
    expect((await client.readAuction(0)).lot.endAt).toBe(latestEnd);
    expect(
      parseEventLogs({
        abi: auctionAbi,
        logs: earlyExtension.logs,
        eventName: 'AuctionBidPlaced',
      })[0]?.args,
    ).toMatchObject({
      nftId: 0n,
      amount: 2n * MINIMUM_BID,
      ethPaid: 2n * MINIMUM_BID,
      endAt: latestEnd,
    });

    for (const [bidder, amount] of [
      [bob, 3n * MINIMUM_BID],
      [alice, 4n * MINIMUM_BID],
    ] as const) {
      const receipt = await submit(
        bidder,
        0,
        { kind: 'bid', total: amount, expectedFunding: amount },
        latestEnd - 1n,
      );
      const block = await chainClient.getBlock({ blockNumber: receipt.blockNumber });
      latestEnd = block.timestamp + EXTENSION_SECONDS;
      expect((await client.readAuction(0)).lot.endAt).toBe(latestEnd);
    }
    expect(latestEnd).toBe(originalEnd + 1n + 2n * (EXTENSION_SECONDS - 1n));
    expect((await client.readAuction(0, alice)).refund).toBe(opening + 2n * MINIMUM_BID);
    expect((await client.readAuction(0, bob)).refund).toBe(boundaryBid + 3n * MINIMUM_BID);
    const refunds = opening + boundaryBid + 5n * MINIMUM_BID;
    await expectAccounting(4n * MINIMUM_BID, refunds, 0n);

    await mineAt(latestEnd - 1n);
    await expect(submit(keeper, 0, { kind: 'settle' })).rejects.toThrow();
    expect(submittedHashes).toHaveLength(5);
    await mineAt(latestEnd);
    await expect(
      submit(bob, 0, { kind: 'bid', total: 5n * MINIMUM_BID, expectedFunding: 5n * MINIMUM_BID }),
    ).rejects.toThrow();
    expect(submittedHashes).toHaveLength(5);
    await submit(keeper, 0, { kind: 'settle' });
    await expectAccounting(0n, refunds, 4n * MINIMUM_BID);
    await expect(submit(keeper, 0, { kind: 'settle' })).rejects.toThrow();
    expect((await client.readAuction(7)).lot).toMatchObject({ endAt: 0n, settled: false });
    await expect(submit(keeper, 7, { kind: 'settle' })).rejects.toThrow();
    expect(submittedHashes).toHaveLength(6);
  }, 60000);

  it('keeps overlapping lots independent, aggregates refunds and never silently spends refund credit', async () => {
    const [alice, bob, keeper, recipient] = accounts.slice(1, 5);
    const preview = await client.readAuction(1);
    await mineAt(preview.lot.eligibleAt);
    const firstOffer = MINIMUM_BID + 1n;
    await submit(alice, 1, { kind: 'bid', total: firstOffer, expectedFunding: firstOffer });
    await submit(bob, 1, {
      kind: 'bid',
      total: 2n * MINIMUM_BID,
      expectedFunding: 2n * MINIMUM_BID,
    });
    const firstLot = await client.readAuction(1);
    await mineAt(firstLot.lot.endAt - 1000n);
    await submit(alice, 2, {
      kind: 'bid',
      total: 3n * MINIMUM_BID,
      expectedFunding: 3n * MINIMUM_BID,
    });
    await submit(bob, 2, {
      kind: 'bid',
      total: 4n * MINIMUM_BID,
      expectedFunding: 4n * MINIMUM_BID,
    });
    const secondLot = await client.readAuction(2);
    const refund = firstOffer + 3n * MINIMUM_BID;
    expect((await client.readAuction(1, alice)).refund).toBe(refund);
    expect((await client.readAuction(2, alice)).refund).toBe(refund);
    const thirdFirst = await submit(alice, 3, {
      kind: 'bid',
      total: MINIMUM_BID,
      expectedFunding: MINIMUM_BID,
    });
    expect((await chainClient.getTransaction({ hash: thirdFirst.transactionHash })).value).toBe(
      MINIMUM_BID,
    );
    const thirdRaise = await submit(alice, 3, {
      kind: 'bid',
      total: 2n * MINIMUM_BID,
      expectedFunding: MINIMUM_BID,
    });
    expect((await chainClient.getTransaction({ hash: thirdRaise.transactionHash })).value).toBe(
      MINIMUM_BID,
    );
    expect((await client.readAuction(3, alice)).refund).toBe(refund);
    expect((await client.readAuction(1)).lot.endAt).toBe(firstLot.lot.endAt);
    expect((await client.readAuction(2)).lot.endAt).toBe(secondLot.lot.endAt);
    await expectAccounting(8n * MINIMUM_BID, refund, 0n);

    const recipientBefore = await chainClient.getBalance({ address: recipient });
    await submit(alice, 2, { kind: 'withdrawRefund', recipient });
    expect(await chainClient.getBalance({ address: recipient })).toBe(recipientBefore + refund);
    expect((await client.readAuction(1, alice)).refund).toBe(0n);
    await expectAccounting(8n * MINIMUM_BID, 0n, 0n);
    await mineAt(firstLot.lot.endAt);
    await submit(keeper, 1, { kind: 'settle' });
    await expectAccounting(6n * MINIMUM_BID, 0n, 2n * MINIMUM_BID);
    await submit(keeper, 1, { kind: 'forwardProceeds' });
    await submit(bob, 1, { kind: 'claimNft', recipient });
    await expectOwner(1, recipient);
    const untouched = await client.readAuction(2);
    expect(untouched.lot).toMatchObject({
      endAt: secondLot.lot.endAt,
      settled: false,
      delivered: false,
    });
    expect(untouched.blockTime).toBeLessThan(untouched.lot.endAt);
    await expectOwner(2, auction);
    await expectOwner(3, auction);
    await expectAccounting(6n * MINIMUM_BID, 0n, 0n);
    expect(submittedHashes).toHaveLength(10);
  }, 60000);

  it('recovers from rejected refunds, NFT delivery and proceeds while blocking receiver reentrancy', async () => {
    const [alice, bob, keeper] = accounts.slice(1, 4);
    await mineAt((await client.readAuction(0)).lot.eligibleAt);
    await submit(alice, 0, { kind: 'bid', total: MINIMUM_BID, expectedFunding: MINIMUM_BID });
    await submit(bob, 0, {
      kind: 'bid',
      total: 2n * MINIMUM_BID,
      expectedFunding: 2n * MINIMUM_BID,
    });
    await writeActor('setRejectEth', [true]);
    await writeActor('setRejectNft', [true]);
    await expect(submit(alice, 0, { kind: 'withdrawRefund', recipient: actor })).rejects.toThrow();
    expect((await client.readAuction(0, alice)).refund).toBe(MINIMUM_BID);
    await expectAccounting(2n * MINIMUM_BID, MINIMUM_BID, 0n);
    await mineAt((await client.readAuction(0)).lot.endAt);
    await submit(keeper, 0, { kind: 'settle' });
    await expect(submit(alice, 0, { kind: 'claimNft', recipient: alice })).rejects.toThrow();
    await expect(submit(bob, 0, { kind: 'claimNft', recipient: actor })).rejects.toThrow();
    await expectOwner(0, auction);
    expect((await client.readAuction(0)).lot.delivered).toBe(false);
    await writeGame('setRejectDonations', [true]);
    await expect(submit(keeper, 0, { kind: 'forwardProceeds' })).rejects.toThrow();
    expect((await client.readAuction(0)).lot.proceedsForwarded).toBe(false);
    await expectAccounting(0n, MINIMUM_BID, 2n * MINIMUM_BID);
    expect(submittedHashes).toHaveLength(3);

    const reentrancyError = encodeErrorResult({
      abi: auctionAbi,
      errorName: 'ReentrancyGuardReentrantCall',
    });
    await writeActor('setRejectEth', [false]);
    await writeActor('configureCallback', [
      auction,
      encodeFunctionData({ abi: auctionAbi, functionName: 'withdrawRefund', args: [actor] }),
      0n,
      false,
    ]);
    await submit(alice, 0, { kind: 'withdrawRefund', recipient: actor });
    expect(await chainClient.getBalance({ address: actor })).toBe(MINIMUM_BID);
    expect(
      await chainClient.readContract({
        address: actor,
        abi: actorArtifact.abi,
        functionName: 'callbackResult',
      }),
    ).toBe(reentrancyError);
    expect((await client.readAuction(0, alice)).refund).toBe(0n);
    await expectAccounting(0n, 0n, 2n * MINIMUM_BID);

    await writeActor('setRejectNft', [false]);
    await writeActor('configureCallback', [
      auction,
      encodeFunctionData({ abi: auctionAbi, functionName: 'claimNft', args: [0n, actor] }),
      0n,
      false,
    ]);
    await submit(bob, 0, { kind: 'claimNft', recipient: actor });
    await expectOwner(0, actor);
    expect(
      await chainClient.readContract({
        address: actor,
        abi: actorArtifact.abi,
        functionName: 'callbackSucceeded',
      }),
    ).toBe(false);
    expect(
      await chainClient.readContract({
        address: actor,
        abi: actorArtifact.abi,
        functionName: 'callbackCount',
      }),
    ).toBe(2n);
    expect(
      await chainClient.readContract({
        address: actor,
        abi: actorArtifact.abi,
        functionName: 'callbackResult',
      }),
    ).toBe(reentrancyError);
    expect((await client.readAuction(0)).lot.proceedsForwarded).toBe(false);

    await writeGame('setRejectDonations', [false]);
    await writeGame('configureCallback', [
      auction,
      encodeFunctionData({ abi: auctionAbi, functionName: 'forwardProceeds', args: [0n] }),
      0n,
      false,
    ]);
    await submit(keeper, 0, { kind: 'forwardProceeds' });
    expect(
      await chainClient.readContract({
        address: GAME_ADDRESS,
        abi: gameArtifact.abi,
        functionName: 'callbackResult',
      }),
    ).toBe(reentrancyError);
    expect(
      await chainClient.readContract({
        address: GAME_ADDRESS,
        abi: gameArtifact.abi,
        functionName: 'totalDonations',
      }),
    ).toBe(2n * MINIMUM_BID);
    expect(
      await chainClient.readContract({
        address: GAME_ADDRESS,
        abi: gameArtifact.abi,
        functionName: 'donationCount',
      }),
    ).toBe(1n);
    expect(
      await chainClient.readContract({
        address: GAME_ADDRESS,
        abi: gameArtifact.abi,
        functionName: 'receiveCount',
      }),
    ).toBe(0n);
    await expectAccounting(0n, 0n, 0n);
    expect((await client.readAuction(0)).lot).toMatchObject({
      settled: true,
      delivered: true,
      proceedsForwarded: true,
    });
    await expect(submit(alice, 0, { kind: 'withdrawRefund', recipient: alice })).rejects.toThrow();
    await expect(submit(bob, 0, { kind: 'claimNft', recipient: bob })).rejects.toThrow();
    await expect(submit(keeper, 0, { kind: 'forwardProceeds' })).rejects.toThrow();
    expect(submittedHashes).toHaveLength(6);
  }, 60000);
});
