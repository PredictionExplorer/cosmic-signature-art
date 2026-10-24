import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import {
  createPublicClient,
  decodeEventLog,
  decodeFunctionData,
  formatEther,
  http,
  keccak256,
  type Address,
  type Hex,
  type TransactionReceipt,
} from 'viem';
import { auctionAbi } from '../../src/lib/auction/abi';
import { MINIMUM_BID, minimumNextBid } from '../../src/lib/auction/rules';
import { en as t } from '../../src/lib/i18n/en';
import { resetLocalAuctionFixture } from './chain-fixture';
import type { Rehearsal } from './types';
import type { submitted } from './wallet';
declare global {
  interface Window {
    __localAuctionSubmissions: typeof submitted;
  }
}
let fixture: Rehearsal;
let requestId = 0;
async function rpc<T>(method: string, params: readonly unknown[] = []): Promise<T> {
  const endpoint = new URL(fixture.rpcUrl);
  if (
    endpoint.protocol !== 'http:' ||
    endpoint.port !== '8548' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)
  )
    throw new Error('Only the owned loopback node is permitted');
  const response = await fetch(endpoint, {
    method: 'POST',
    redirect: 'error',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json()) as { result: T; error?: { message: string } };
  if (body.error) throw new Error(body.error.message);
  return body.result;
}
const client = () => createPublicClient({ transport: http(fixture.rpcUrl), cacheTime: 0 });
const lot = (id = fixture.tokenId) =>
  client().readContract({
    address: fixture.auctionAddress,
    abi: auctionAbi,
    functionName: 'getAuction',
    args: [BigInt(id)],
  });
const credit = (account: Address) =>
  client().readContract({
    address: fixture.auctionAddress,
    abi: auctionAbi,
    functionName: 'refundCredits',
    args: [account],
  });
async function synchronize(page: Page) {
  const block = await client().getBlock();
  await page.clock.setSystemTime(Number(block.timestamp) * 1000);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}
async function warp(page: Page, time: bigint) {
  await rpc('evm_setNextBlockTimestamp', [Number(time)]);
  await rpc('evm_mine');
  await synchronize(page);
}
async function connect(page: Page, name: string) {
  const disconnect = page.getByRole('button', { name: t.disconnect, exact: true });
  if (await disconnect.count()) await disconnect.click();
  await page.getByRole('button', { name, exact: true }).click();
  await expect(disconnect).toBeVisible();
}
async function prepare(page: Page, total: bigint) {
  await page.getByLabel(t.bidTotal, { exact: true }).fill(formatEther(total));
  await page.getByRole('button', { name: t.bidReviewAction, exact: true }).click();
  await expect(page.getByRole('dialog', { name: t.bidReview })).toBeVisible();
}
async function confirmation(page: Page, previousHash?: string): Promise<TransactionReceipt> {
  const status = page.locator('.transaction-status');
  await expect(status).toContainText(t.transactionConfirmed);
  const link = status.getByRole('link', { name: new RegExp(t.viewChain) });
  await expect(link).toHaveAttribute('href', /\/tx\/0x[a-fA-F0-9]{64}$/);
  if (previousHash) await expect(link).not.toHaveAttribute('href', new RegExp(`${previousHash}$`));
  const hash = (await link.getAttribute('href'))!.split('/').at(-1)! as Hex;
  const receipt = await client().getTransactionReceipt({ hash });
  expect(receipt.status).toBe('success');
  expect(receipt.to?.toLowerCase()).toBe(fixture.auctionAddress.toLowerCase());
  return receipt;
}
async function bid(page: Page, total: bigint, sender: Address, funding = total) {
  const previous = await page
    .locator('.transaction-status a')
    .evaluateAll((links) => links[0]?.getAttribute('href') ?? null);
  await prepare(page, total);
  const dialog = page.getByRole('dialog', { name: t.bidReview });
  await expect(dialog.locator('dl')).toContainText(`${formatEther(funding)} ETH`);
  await dialog.getByRole('button', { name: t.confirmBid, exact: true }).click();
  const receipt = await confirmation(page, previous?.split('/').at(-1));
  const transaction = await client().getTransaction({ hash: receipt.transactionHash });
  expect(transaction.from.toLowerCase()).toBe(sender.toLowerCase());
  expect(transaction.value).toBe(funding);
  expect(decodeFunctionData({ abi: auctionAbi, data: transaction.input })).toMatchObject({
    functionName: 'bid',
    args: [BigInt(fixture.tokenId), total],
  });
  const events = receipt.logs
    .filter((log) => log.address.toLowerCase() === fixture.auctionAddress.toLowerCase())
    .map((log) => decodeEventLog({ abi: auctionAbi, data: log.data, topics: log.topics }));
  expect(events.some((event) => event.eventName === 'AuctionBidPlaced')).toBe(true);
  const state = await lot();
  expect(state.highestBid).toBe(total);
  expect(state.highestBidder.toLowerCase()).toBe(sender.toLowerCase());
  return receipt;
}
async function action(page: Page, label: string) {
  const previous = await page
    .locator('.transaction-status a')
    .evaluateAll((links) => links[0]?.getAttribute('href') ?? null);
  await page.getByRole('button', { name: label, exact: true }).click();
  return confirmation(page, previous?.split('/').at(-1));
}
async function submissions(page: Page) {
  return page.evaluate(() => window.__localAuctionSubmissions.length);
}

test.beforeEach(async ({ page }) => {
  fixture = (await resetLocalAuctionFixture()) as Rehearsal;
  expect(await rpc('eth_chainId')).toBe('0x7a69');
  expect(keccak256((await client().getCode({ address: fixture.auctionAddress }))!)).toBe(
    fixture.codeHash,
  );
  await page.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin !== 'http://127.0.0.1:4321') {
      await route.abort();
      throw new Error('The real-contract rehearsal attempted a non-local request');
    }
    await route.continue();
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const block = await client().getBlock();
  await page.clock.install({ time: Number(block.timestamp) * 1000 });
});

test('the actual V4 auction completes through the production browser client', async ({
  page,
}, testInfo) => {
  const alice = fixture.accounts[1];
  const bob = fixture.accounts[2];
  const keeper = fixture.accounts[3];
  const recipient = fixture.accounts[4];
  const receipts: Hex[] = [];
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Local work ${fixture.tokenId}`);
  await expect(page.locator('.auction-panel-heading h2')).toHaveText(t.preview);
  await expect(page.locator('input[name="bid"]')).toHaveCount(0);
  expect(await submissions(page)).toBe(0);
  expect((await lot()).endAt).toBe(0n);

  await warp(page, BigInt(fixture.eligibleAt));
  await expect(page.locator('.auction-panel-heading h2')).toHaveText(t.waiting);
  await connect(page, 'Local Alice');
  const first = await bid(page, MINIMUM_BID, alice);
  receipts.push(first.transactionHash);
  const firstBlock = await client().getBlock({ blockNumber: first.blockNumber });
  const initialEnd = (await lot()).endAt;
  expect(initialEnd).toBe(firstBlock.timestamp + 172800n);
  await expect(page.locator('.auction-panel-heading h2')).toHaveText(t.active);

  const raised = minimumNextBid(MINIMUM_BID);
  receipts.push((await bid(page, raised, alice, raised - MINIMUM_BID)).transactionHash);
  expect((await lot()).endAt).toBe(initialEnd);
  // A pending self-raise must become invalid when another wallet takes the lead.
  await prepare(page, raised * 3n);
  const reviewedCount = await submissions(page);
  const competingData = (await import('viem')).encodeFunctionData({
    abi: auctionAbi,
    functionName: 'bid',
    args: [BigInt(fixture.tokenId), raised * 2n],
  });
  const competing = await rpc<Hex>('eth_sendTransaction', [
    {
      from: bob,
      to: fixture.auctionAddress,
      data: competingData,
      value: `0x${(raised * 2n).toString(16)}`,
    },
  ]);
  const competingReceipt = await client().getTransactionReceipt({ hash: competing });
  expect(competingReceipt.status).toBe('success');
  receipts.push(competing);
  await synchronize(page);
  const dialog = page.getByRole('dialog', { name: t.bidReview });
  await expect(dialog.getByRole('button', { name: t.confirmBid, exact: true })).toBeDisabled();
  await expect(dialog).toContainText(t.reviewChanged);
  expect(await submissions(page)).toBe(reviewedCount);
  await dialog.getByRole('button', { name: t.cancel, exact: true }).click();
  expect(await credit(alice)).toBe(raised);

  // Failed ETH delivery preserves the credit; a chosen recipient receives the exact amount.
  await page
    .locator('.refund-panel')
    .getByLabel(t.recipient, { exact: true })
    .fill(fixture.nftAddress);
  const beforeRejectedRefund = await submissions(page);
  await page.getByRole('button', { name: t.withdraw, exact: true }).click();
  await expect(page.locator('.transaction-status')).toContainText(t.transactionFailed);
  expect(await submissions(page)).toBe(beforeRejectedRefund);
  expect(await credit(alice)).toBe(raised);
  const recipientBefore = await client().getBalance({ address: recipient });
  await page.locator('.refund-panel').getByLabel(t.recipient, { exact: true }).fill(recipient);
  receipts.push((await action(page, t.withdraw)).transactionHash);
  expect(await credit(alice)).toBe(0n);
  expect(await client().getBalance({ address: recipient })).toBe(recipientBefore + raised);

  await warp(page, initialEnd - 100n);
  await connect(page, 'Local Bob');
  const beforeLate = await lot();
  const lateAmount = minimumNextBid(beforeLate.highestBid);
  const late = await bid(page, lateAmount, bob, lateAmount - beforeLate.highestBid);
  receipts.push(late.transactionHash);
  const lateBlock = await client().getBlock({ blockNumber: late.blockNumber });
  expect((await lot()).endAt).toBe(lateBlock.timestamp + 600n);
  expect((await lot()).endAt).toBeGreaterThan(initialEnd);
  await warp(page, (await lot()).endAt - 10n);
  const secondLateBefore = await lot();
  const secondLateAmount = minimumNextBid(secondLateBefore.highestBid);
  const secondLate = await bid(
    page,
    secondLateAmount,
    bob,
    secondLateAmount - secondLateBefore.highestBid,
  );
  receipts.push(secondLate.transactionHash);
  const secondLateBlock = await client().getBlock({ blockNumber: secondLate.blockNumber });
  expect((await lot()).endAt).toBe(secondLateBlock.timestamp + 600n);
  expect((await lot(fixture.tokenId + 1)).endAt).toBe(0n);

  await warp(page, (await lot()).endAt);
  await expect(page.locator('.auction-panel-heading h2')).toHaveText(t.ended);
  await expect(page.locator('input[name="bid"]')).toHaveCount(0);
  await connect(page, 'Local Keeper');
  const settlement = await action(page, t.settle);
  expect(settlement.from.toLowerCase()).toBe(keeper.toLowerCase());
  receipts.push(settlement.transactionHash);
  expect((await lot()).settled).toBe(true);
  await expect(page.getByRole('button', { name: t.claim, exact: true })).toHaveCount(0);
  await connect(page, 'Local Bob');
  await page
    .locator('.settlement-actions')
    .getByLabel(t.recipient, { exact: true })
    .fill(fixture.nftAddress);
  const beforeRejectedNft = await submissions(page);
  await page.getByRole('button', { name: t.claim, exact: true }).click();
  await expect(page.locator('.transaction-status')).toContainText(t.transactionFailed);
  expect(await submissions(page)).toBe(beforeRejectedNft);
  expect((await lot()).delivered).toBe(false);
  await page
    .locator('.settlement-actions')
    .getByLabel(t.recipient, { exact: true })
    .fill(recipient);
  receipts.push((await action(page, t.claim)).transactionHash);
  const owner = (await client().readContract({
    address: fixture.nftAddress,
    abi: fixture.nftAbi,
    functionName: 'ownerOf',
    args: [BigInt(fixture.tokenId)],
  })) as Address;
  expect(owner.toLowerCase()).toBe(recipient.toLowerCase());
  await expect(page.getByText(t.delivered, { exact: true })).toBeVisible();

  await connect(page, 'Local Keeper');
  const reserveBefore = await client().getBalance({ address: fixture.gameAddress });
  const forwarded = await action(page, t.forward);
  receipts.push(forwarded.transactionHash);
  expect(await client().getBalance({ address: fixture.gameAddress })).toBe(
    reserveBefore + secondLateAmount,
  );
  const gameEvents = forwarded.logs
    .filter((log) => log.address.toLowerCase() === fixture.gameAddress.toLowerCase())
    .map((log) => decodeEventLog({ abi: fixture.gameAbi, data: log.data, topics: log.topics }));
  expect(gameEvents.map((event) => event.eventName)).toContain('EthDonated');
  expect(gameEvents.map((event) => event.eventName)).not.toContain('BidPlaced');
  expect(await lot()).toMatchObject({
    settled: true,
    delivered: true,
    proceedsForwarded: true,
    highestBid: secondLateAmount,
  });
  expect(
    await client().readContract({
      address: fixture.auctionAddress,
      abi: auctionAbi,
      functionName: 'totalLiabilities',
    }),
  ).toBe(0n);
  expect(await client().getBalance({ address: fixture.auctionAddress })).toBe(0n);
  await expect(page.getByText(t.proceedsSent, { exact: true })).toBeVisible();
  const confirmed = await Promise.all(
    receipts.map(async (hash) => {
      const [receipt, transaction] = await Promise.all([
        client().getTransactionReceipt({ hash }),
        client().getTransaction({ hash }),
      ]);
      return {
        hash,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        from: receipt.from,
        to: receipt.to,
        status: receipt.status,
        gasUsed: receipt.gasUsed,
        effectiveGasPrice: receipt.effectiveGasPrice,
        value: transaction.value,
        input: transaction.input,
        logs: receipt.logs,
      };
    }),
  );
  const custody = await Promise.all(
    Array.from({ length: 8 }, async (_, index) => ({
      tokenId: fixture.tokenId + index,
      owner: await client().readContract({
        address: fixture.nftAddress,
        abi: fixture.nftAbi,
        functionName: 'ownerOf',
        args: [BigInt(fixture.tokenId + index)],
      }),
    })),
  );
  const issuanceReceipt = await client().getTransactionReceipt({
    hash: fixture.evidence.issuanceTransaction as Hex,
  });
  const proof = {
    browser: testInfo.project.name,
    fixture: {
      chainId: fixture.chainId,
      tokenId: fixture.tokenId,
      auction: fixture.auctionAddress,
      game: fixture.gameAddress,
      nft: fixture.nftAddress,
      codeHash: fixture.codeHash,
      issuance: fixture.evidence,
    },
    issuanceReceipt,
    actionOrder: [
      'first bid',
      'leader raise',
      'external competing bid',
      'refund to selected recipient',
      'first late extension',
      'second late extension',
      'keeper settlement',
      'winner NFT delivery',
      'proceeds to game reserve',
    ],
    confirmed,
    browserSubmissions: await submissions(page),
    rejectedBeforeSubmission: [
      'refund to nonpayable NFT contract',
      'NFT delivery to unsupported receiver',
    ],
    staleReviewInvalidated: true,
    final: {
      highestBid: secondLateAmount,
      lot: await lot(),
      reserveBefore,
      reserveAfter: await client().getBalance({ address: fixture.gameAddress }),
      refundAmount: raised,
      refundRecipient: recipient,
      recipientBeforeRefund: recipientBefore,
      liabilities: await client().readContract({
        address: fixture.auctionAddress,
        abi: auctionAbi,
        functionName: 'totalLiabilities',
      }),
      auctionBalance: await client().getBalance({ address: fixture.auctionAddress }),
      custody,
    },
  };
  const evidencePath = testInfo.outputPath('confirmed-lifecycle.json');
  await writeFile(
    evidencePath,
    JSON.stringify(proof, (_, value) => (typeof value === 'bigint' ? value.toString() : value), 2),
  );
  await testInfo.attach('real-contract-receipts', {
    path: evidencePath,
    contentType: 'application/json',
  });
});

test('the local gateway rejects admin methods and unrelated wallets or recipients without changing chain state', async ({
  request,
}) => {
  const before = await client().getBlock();
  const stateBefore = await lot();
  const nonceBefore = await client().getTransactionCount({ address: fixture.accounts[1] });
  const allowed = { jsonrpc: '2.0', id: 901, method: 'eth_blockNumber', params: [] };
  const headers = { origin: 'http://127.0.0.1:4321' };
  const requestBody = (method: string, params: unknown[]) => ({
    jsonrpc: '2.0',
    id: 902,
    method,
    params,
  });
  const forbidden = [
    requestBody('hardhat_reset', []),
    requestBody('evm_mine', []),
    requestBody('eth_sendTransaction', [
      { from: fixture.accounts[1], to: fixture.gameAddress, value: '0x1' },
    ]),
    requestBody('eth_sendTransaction', [
      {
        from: '0x0000000000000000000000000000000000000099',
        to: fixture.auctionAddress,
        value: '0x1',
      },
    ]),
    [allowed, requestBody('hardhat_reset', [])],
  ];
  for (const data of forbidden) {
    const response = await request.post('/rpc', { data, headers });
    expect(response.status()).toBe(400);
    expect((await response.json()).error.code).toBe(-32600);
  }
  const foreign = await request.post('/rpc', {
    data: allowed,
    headers: { origin: 'https://example.com' },
  });
  expect(foreign.status()).toBe(400);
  const absent = await request.post('/rpc', { data: allowed });
  expect(absent.status()).toBe(400);
  const authorized = await request.post('/rpc', { data: allowed, headers });
  expect(authorized.status()).toBe(200);
  expect((await authorized.json()).result).toBe(`0x${before.number.toString(16)}`);
  expect((await client().getBlock()).hash).toBe(before.hash);
  expect(await lot()).toEqual(stateBefore);
  expect(await client().getTransactionCount({ address: fixture.accounts[1] })).toBe(nonceBefore);
});
