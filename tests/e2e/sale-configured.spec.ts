import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  decodeFunctionData,
  encodeFunctionResult,
  erc721Abi,
  keccak256,
  parseEther,
  toHex,
  zeroAddress,
  type Hex,
} from 'viem';
import { auctionAbi } from '../../src/lib/auction/abi';
import { MINIMUM_BID } from '../../src/lib/auction/rules';
import { GAME_ADDRESS, NFT_ADDRESS } from '../../src/lib/site';
import { en as t } from '../../src/lib/i18n/en';

/**
 * The real sale pages with a contract configured. The suite's own server has no auction
 * address, so this file starts a second Next dev server with one, in its own dist directory,
 * and answers the chain itself: every JSON-RPC call the page makes is routed to a canned
 * reply encoded from the contract's ABI. Nothing reaches a network. Chromium desktop only;
 * the catalogue's own behaviour across browsers is the auction harness's to prove. The second
 * server builds into .next-sale-e2e (ignored by the repository and by lint) so it can run
 * beside the suite's own server; the type files it rewrites on start are restored.
 */
const PROJECT = 'chromium-desktop';
const AUCTION = '0x00000000000000000000000000000000000000a1' as const;
const CODE: Hex = '0x6080';
const RPC = 'http://127.0.0.1:1/rpc';
const PORT = 4327 + Number(process.env.TEST_PARALLEL_INDEX ?? 0);
const ORIGIN = `http://127.0.0.1:${PORT}`;
/** The batch's first token; 031 is curated, so its plate paints before any record arrives. */
const FIRST = 31;
const BIDDER = '0x6308000000000000000000000000000000001f7c' as const;
const BLOCK = 123_456n;

test.describe.configure({ mode: 'serial' });
test.skip(
  ({ browserName, isMobile, reducedMotion }) =>
    browserName !== 'chromium' || !!isMobile || reducedMotion === 'reduce',
  'One configured server, one browser.',
);

let server: ChildProcess | undefined;
const output: string[] = [];
/** Next rewrites these for its own dist directory on start; the checkout is left as found. */
const TYPE_FILES = ['tsconfig.json', 'next-env.d.ts'] as const;
const typeFiles = new Map<string, string>();
function restoreTypeFiles() {
  for (const [file, contents] of typeFiles) writeFileSync(resolve(file), contents);
}

async function ready(path: string, timeoutMs: number) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const response = await fetch(`${ORIGIN}${path}`);
      if (response.status === 200) return;
    } catch {
      /* not up yet */
    }
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw new Error(`Configured sale server never answered ${path}:\n${output.join('')}`);
}

test.beforeAll(async ({ browserName }, testInfo) => {
  if (browserName !== 'chromium' || testInfo.project.name !== PROJECT) return;
  testInfo.setTimeout(300_000);
  for (const file of TYPE_FILES) typeFiles.set(file, readFileSync(resolve(file), 'utf8'));
  server = spawn(
    process.execPath,
    [
      resolve('node_modules/next/dist/bin/next'),
      'dev',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(PORT),
    ],
    {
      cwd: resolve('.'),
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NEXT_PUBLIC_AUCTION_ADDRESS: AUCTION,
        NEXT_PUBLIC_RPC_URL: RPC,
        NEXT_PUBLIC_CHAIN_ID: '42161',
        NEXT_PUBLIC_AUCTION_CODE_HASH: keccak256(CODE),
        NEXT_DIST_DIR: '.next-sale-e2e',
      },
    },
  );
  server.stdout?.on('data', (chunk) => output.push(String(chunk)));
  server.stderr?.on('data', (chunk) => output.push(String(chunk)));
  await ready('/en/auctions', 240_000);
  await ready('/en/auctions/31', 120_000);
  restoreTypeFiles();
});

test.afterAll(() => {
  restoreTypeFiles();
  if (!server?.pid) return;
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    server.kill('SIGTERM');
  }
});

type Call = { id: number; method: string; params?: unknown[] };
function lot(id: bigint, now: bigint) {
  const active = id === BigInt(FIRST);
  return {
    roundNum: 2n,
    eligibleAt: now - 86_400n,
    endAt: active ? now + 3_600n : 0n,
    highestBidder: active ? BIDDER : zeroAddress,
    highestBid: active ? parseEther('0.42') : 0n,
    registered: true,
    settled: false,
    delivered: false,
    proceedsForwarded: false,
  };
}
function call(data: Hex, to: string) {
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (to.toLowerCase() === NFT_ADDRESS.toLowerCase()) {
    const { functionName, args } = decodeFunctionData({ abi: erc721Abi, data });
    if (functionName === 'ownerOf')
      return encodeFunctionResult({
        abi: erc721Abi,
        functionName,
        result: (args as [bigint])[0] === BigInt(FIRST) + 7n ? BIDDER : GAME_ADDRESS,
      });
    throw new Error(`Unexpected NFT call ${functionName}`);
  }
  const { functionName, args } = decodeFunctionData({ abi: auctionAbi, data });
  switch (functionName) {
    case 'game':
      return encodeFunctionResult({ abi: auctionAbi, functionName, result: GAME_ADDRESS });
    case 'nft':
      return encodeFunctionResult({ abi: auctionAbi, functionName, result: NFT_ADDRESS });
    case 'registeredBatchCount':
      return encodeFunctionResult({ abi: auctionAbi, functionName, result: 1n });
    case 'firstNftIdByBatchIndex':
      return encodeFunctionResult({ abi: auctionAbi, functionName, result: BigInt(FIRST) });
    case 'getAuction':
      return encodeFunctionResult({
        abi: auctionAbi,
        functionName,
        result: lot((args as [bigint])[0], now),
      });
    case 'minimumNextBid':
      return encodeFunctionResult({
        abi: auctionAbi,
        functionName,
        result: (args as [bigint])[0] === BigInt(FIRST) ? parseEther('0.462') : MINIMUM_BID,
      });
    case 'refundCredits':
      return encodeFunctionResult({ abi: auctionAbi, functionName, result: 0n });
    default:
      throw new Error(`Unexpected auction call ${functionName}`);
  }
}
function reply({ id, method, params }: Call) {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const block = {
    number: toHex(BLOCK),
    hash: `0x${'11'.repeat(32)}`,
    parentHash: `0x${'10'.repeat(32)}`,
    timestamp: toHex(now),
    transactions: [],
  };
  try {
    switch (method) {
      case 'eth_chainId':
        return { jsonrpc: '2.0', id, result: '0xa4b1' };
      case 'eth_blockNumber':
        return { jsonrpc: '2.0', id, result: toHex(BLOCK) };
      case 'eth_getBlockByNumber':
        return { jsonrpc: '2.0', id, result: block };
      case 'eth_getCode':
        return { jsonrpc: '2.0', id, result: CODE };
      case 'eth_getLogs':
        return { jsonrpc: '2.0', id, result: [] };
      case 'eth_call': {
        const { to, data } = (params as [{ to: string; data: Hex }])[0];
        return { jsonrpc: '2.0', id, result: call(data, to) };
      }
      default:
        return { jsonrpc: '2.0', id, error: { code: -32601, message: `No ${method} here` } };
    }
  } catch (error) {
    return { jsonrpc: '2.0', id, error: { code: -32000, message: String(error) } };
  }
}

/** Every chain read the page makes is answered here; no request leaves the test. */
async function answerTheChain(page: Page) {
  await page.route(RPC, async (route) => {
    const body = route.request().postDataJSON() as Call | Call[];
    const batch = Array.isArray(body);
    const replies = (batch ? body : [body]).map(reply);
    await route.fulfill({ json: batch ? replies : replies[0] });
  });
}

test("the configured sale hangs the lots as plates, each with the chain's own line", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await answerTheChain(page);
  await page.goto(`${ORIGIN}/en/auctions`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Sale 01/);
  const first = page.getByRole('article', { name: 'Lot 1 · № 031' });
  await expect(first).toBeVisible();
  await expect(first.locator('[data-phase="active"]')).toHaveText(
    /^Bidding open · 0\.42 ETH · closes .+ UTC.* · late bids leave 10 minutes$/,
  );
  // The curated plate paints at once; the venue never claims the publisher withheld its media.
  await expect(first.locator('img.art-still')).toHaveAttribute('src', /31-ink/);
  await expect(first.getByText(t.mediaNotPublished)).toHaveCount(0);
  const second = page.getByRole('article', { name: 'Lot 2 · № 032' });
  await expect(second.locator('[data-phase="waiting"]')).toHaveText(
    'Available to start · opening minimum 0.00001 ETH',
  );
  await expect(second).toHaveAttribute('data-expression', 'light');
  const order = page.getByRole('navigation', { name: t.orderOfSale });
  await expect(order).toContainText('№ 031');
  await expect(order).toContainText('№ 038');
  await expect(page.getByRole('article')).toHaveCount(8);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("the lot page states the chain, hushes the theatre behind the bid sheet, and reads the collector's own batch", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await answerTheChain(page);
  await page.goto(`${ORIGIN}/en/auctions/31`, { waitUntil: 'domcontentloaded' });
  const strip = page.locator('#lot-actions');
  await expect(strip.locator('[data-phase="active"]')).toHaveText(/^Bidding open · 0\.42 ETH/);
  await expect(strip).toHaveAttribute('data-keys-suppressed', '');
  await expect(page.getByRole('region', { name: t.bidHistory })).toContainText(t.historyNone);
  const site = page.locator('.site');
  await expect(site).toHaveAttribute('data-theatre', 'playing');
  await page.getByRole('button', { name: t.collectThisWork, exact: true }).click();
  const sheet = page.getByRole('dialog', { name: `№ 031 · ${t.bidSheet}` });
  await expect(sheet).toBeVisible();
  await expect(site).toHaveAttribute('data-theatre', 'hushed');
  await expect(sheet.getByText('0.42', { exact: false }).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(site).toHaveAttribute('data-theatre', 'playing');
  await expect(page.getByRole('button', { name: t.collectThisWork, exact: true })).toBeFocused();
  // The collector's view reads this lot's own batch from the contract's registry.
  await page.getByRole('button', { name: t.yourActivity, exact: true }).click();
  const activity = page.getByRole('dialog', { name: t.yourActivity });
  await expect(activity).toBeVisible();
  await activity.getByLabel(t.activityAddress).fill(BIDDER);
  await activity.getByRole('button', { name: t.activityLookUp }).click();
  await expect(activity.getByText('Activity of 0x6308…1f7c')).toBeVisible();
  await expect(activity).toContainText('№ 031 · 0.42 ETH');
  await expect(activity).toContainText(`${t.activityCommitted}0.42 ETH`);
  // English is the unprefixed locale; the held work's link stays inside the venue.
  await expect(activity.getByRole('link', { name: '№ 038' })).toHaveAttribute(
    'href',
    '/auctions/38',
  );
  await expect(site).toHaveAttribute('data-theatre', 'playing');
});
