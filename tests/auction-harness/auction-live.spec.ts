import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { catalogs } from '../../src/lib/i18n/messages';
import { locales } from '../../src/lib/i18n/routing';
import type { fixture } from './client';

declare global {
  interface Window {
    __auctionFixture: typeof fixture;
  }
}
const t = catalogs.en;
/** The lot page with the bid sheet open: the panel lives inside the sheet, unchanged. */
async function fixtureReady(page: Page, query = '', copy = t) {
  await page.goto(`/${query}`);
  await expect(page.getByRole('banner')).toHaveText(
    'Local UI test fixture — no real auction or transactions',
  );
  await expect(page.locator('#lot-actions [data-phase]')).toBeVisible();
  await page.getByRole('button', { name: copy.collectThisWork, exact: true }).click();
  await expect(page.getByRole('dialog', { name: `№ 031 · ${copy.bidSheet}` })).toBeVisible();
  await expect(page.locator('.live-auction')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Synthetic test wallet' })).toBeVisible();
}
async function connect(page: Page) {
  await page.getByRole('button', { name: 'Synthetic test wallet' }).click();
  await expect(page.getByRole('button', { name: t.disconnect, exact: true })).toBeVisible();
}
async function review(page: Page, amount: string) {
  await page.getByLabel(t.bidTotal, { exact: true }).fill(amount);
  await page
    .getByRole('button', { name: new RegExp(`^${t.bidReviewAction}|^${t.placeBid}`) })
    .click();
  await expect(page.getByRole('dialog', { name: t.bidReview })).toBeVisible();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(1);
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Fail closed even if a future refactor accidentally bypasses the fixture's exact aliases.
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:4320') {
      await route.abort();
      throw new Error(`Unexpected external request in isolated auction test: ${url.origin}`);
    }
    await route.continue();
  });
});

test('an exact direct bid is reviewed, cancellable, then sent only after confirmation', async ({
  page,
}) => {
  await fixtureReady(page);
  await connect(page);
  await review(page, '1.1');
  const dialog = page.getByRole('dialog', { name: t.bidReview });
  await expect(dialog).toContainText('1.1 ETH');
  expect(await page.evaluate(() => window.__auctionFixture.calls.length)).toBe(0);
  await dialog.getByRole('button', { name: t.cancel, exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await review(page, '100');
  await dialog.getByRole('button', { name: t.confirmBid, exact: true }).click();
  await expect(page.getByRole('status')).toContainText(t.transactionConfirmed);
  expect(
    await page.evaluate(() =>
      window.__auctionFixture.calls.map((call) => ({
        tokenId: call.tokenId,
        kind: call.action.kind,
        total: call.action.kind === 'bid' ? call.action.total.toString() : null,
        funding: call.action.kind === 'bid' ? call.action.expectedFunding.toString() : null,
      })),
    ),
  ).toEqual([
    { tokenId: 31, kind: 'bid', total: '100000000000000000000', funding: '100000000000000000000' },
  ]);
  expect(await page.evaluate(() => window.__auctionFixture.providerMethods)).toEqual([
    'eth_requestAccounts',
    'eth_chainId',
  ]);
  await noOverflow(page);
});

test('a leading bidder reviews only the difference; a competing bid invalidates that review', async ({
  page,
}) => {
  await fixtureReady(page, '?leader=1');
  await connect(page);
  await review(page, '1.1');
  const dialog = page.getByRole('dialog', { name: t.bidReview });
  await expect(dialog).toContainText('0.1 ETH');
  await page.evaluate(() => {
    window.__auctionFixture.highest = 1200000000000000000n;
    window.__auctionFixture.leader = '0x0000000000000000000000000000000000000035';
    window.__auctionFixture.refresh();
  });
  await expect(dialog.getByRole('button', { name: t.confirmBid })).toBeDisabled();
  await expect(dialog).toContainText(t.reviewChanged);
  expect(await page.evaluate(() => window.__auctionFixture.calls.length)).toBe(0);
});

test('paused motion keeps bid review visible and restores focus and scrolling after dismissal', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => sessionStorage.setItem('cosmic-art-motion-v1', 'paused'));
  await fixtureReady(page);
  await expect(page.locator('.site')).toHaveClass(/motion-paused/);
  await connect(page);
  const overflowBefore = await page.evaluate(() => [
    document.documentElement.style.overflow,
    document.body.style.overflow,
  ]);
  await review(page, '1.1');
  const dialog = page.getByRole('dialog', { name: t.bidReview });
  await expect(dialog).toHaveCSS('animation-name', 'none');
  await expect(dialog).toHaveCSS('opacity', '1');
  await expect(dialog.getByRole('button', { name: t.cancel, exact: true })).toBeFocused();
  await expect(page.locator('html')).toHaveCSS('overflow', 'hidden');
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.bid-form button[type="submit"]')).toBeFocused();
  expect(
    await page.evaluate(() => [
      document.documentElement.style.overflow,
      document.body.style.overflow,
    ]),
  ).toEqual(overflowBefore);
  expect(await page.evaluate(() => window.__auctionFixture.calls.length)).toBe(0);
});

test('wrong network, stale data and failed reads prevent bidding and recover with a fresh read', async ({
  page,
}) => {
  await fixtureReady(page, '?wrong-chain=1');
  await connect(page);
  const bid = page.getByRole('button', {
    name: new RegExp(`^${t.bidReviewAction}|^${t.placeBid}`),
  });
  await expect(bid).toBeDisabled();
  await page.getByRole('button', { name: t.wrongNetwork }).click();
  await expect(bid).toBeEnabled();
  await page.evaluate(() => {
    window.__auctionFixture.stale = true;
    window.__auctionFixture.refresh();
  });
  await expect(bid).toBeDisabled();
  await expect(page.locator('.auction-panel-heading h2')).toHaveText(t.status);
  await page.evaluate(() => {
    window.__auctionFixture.failure = true;
    window.__auctionFixture.refresh();
  });
  await expect(page.getByRole('status').filter({ hasText: t.liveUnavailable })).toBeVisible();
  await expect(bid).toHaveCount(0);
  await page.evaluate(() => {
    window.__auctionFixture.failure = false;
    window.__auctionFixture.stale = false;
    window.__auctionFixture.refresh();
  });
  await expect(bid).toBeEnabled();
});

test('settlement, delivery, forwarding and refunds stay distinct recoverable actions', async ({
  page,
}) => {
  await fixtureReady(page, '?phase=ended&leader=1&refund=1');
  await connect(page);
  await page.getByRole('button', { name: t.settle, exact: true }).click();
  await expect(page.getByRole('button', { name: t.claim, exact: true })).toBeVisible();
  await page.getByRole('button', { name: t.claim, exact: true }).click();
  await expect(page.getByText(t.delivered, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: t.forward, exact: true }).click();
  await expect(page.getByText(t.proceedsSent, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: t.withdraw, exact: true }).click();
  await expect(page.locator('.refund-panel')).toHaveCount(0);
  expect(
    await page.evaluate(() => window.__auctionFixture.calls.map((call) => call.action.kind)),
  ).toEqual(['settle', 'claimNft', 'forwardProceeds', 'withdrawRefund']);
});

for (const phase of ['preview', 'waiting', 'active', 'settled'] as const) {
  test(`${phase} keeps stage-appropriate actions and accessible financial information`, async ({
    page,
  }) => {
    await fixtureReady(page, `?phase=${phase}`);
    await expect(page.locator('.auction-panel-heading h2')).toHaveText(t[phase]);
    const bid = page.locator('input[name="bid"]');
    await expect(bid).toHaveCount(phase === 'active' || phase === 'waiting' ? 1 : 0);
    await noOverflow(page);
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations).toEqual([]);
  });
}

for (const locale of locales) {
  test(`${locale} makes the bidding panel and confirmation accessible`, async ({ page }) => {
    const copy = catalogs[locale];
    await fixtureReady(page, `?locale=${locale}`, copy);
    await page.getByRole('button', { name: 'Synthetic test wallet' }).click();
    await page.getByLabel(copy.bidTotal, { exact: true }).fill('1.1');
    await page
      .getByRole('button', { name: new RegExp(`^${copy.bidReviewAction}|^${copy.placeBid}`) })
      .click();
    await expect(page.getByRole('dialog', { name: copy.bidReview })).toBeVisible();
    await noOverflow(page);
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations).toEqual([]);
  });
}

test('the catalogue hangs the lots as plates with chain lines that refresh on their own', async ({
  page,
}) => {
  await page.goto('/?gallery=1');
  const gallery = page.getByRole('region', { name: t.browseLots, exact: true });
  const first = gallery.getByRole('article', { name: 'Lot 1 · № 031' });
  await expect(first).toBeVisible();
  await expect(first.getByRole('link', { name: t.collect, exact: true })).toHaveAttribute(
    'href',
    '/auctions/31',
  );
  // Ink on paper, Light on black, Ink again: neither expression leads every time.
  await expect(gallery.getByRole('article', { name: 'Lot 2 · № 035' })).toHaveAttribute(
    'data-expression',
    'light',
  );
  await expect(gallery.getByRole('article', { name: 'Lot 3 · № 023' })).toHaveAttribute(
    'data-expression',
    'ink',
  );
  await expect(gallery.locator('[data-phase]')).toHaveCount(3);
  await expect(gallery.locator('[data-phase="active"]').first()).toContainText(
    `${t.active} · 1 ETH`,
  );
  // The order of sale lists the numerals and is the pager.
  const order = gallery.getByRole('navigation', { name: t.orderOfSale, exact: true });
  await expect(order.getByRole('link', { name: '№ 035', exact: true })).toHaveAttribute(
    'href',
    '#lot-2',
  );
  await expect(order.getByRole('button', { name: t.newer, exact: true })).toBeDisabled();
  await expect(order.getByRole('button', { name: t.older, exact: true })).toBeEnabled();
  await page.evaluate(() => {
    window.__auctionFixture.failure = true;
    window.__auctionFixture.refresh();
  });
  await expect(gallery.getByRole('status')).toHaveText(t.liveUnavailable);
  await expect(first).toBeVisible();
  await expect(gallery.locator('[data-phase]')).toHaveCount(0);
  await noOverflow(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('one projector plays a settling clip across the lots, never the catalogue excerpt', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const films: string[] = [];
  page.on('request', (request) => {
    if (/\.mp4(?:\?|$)/.test(request.url())) films.push(request.url());
  });
  await page.goto('/?gallery=1');
  const gallery = page.getByRole('region', { name: t.browseLots, exact: true });
  const first = gallery.locator('[data-preview-id="31"]');
  await expect(first).toHaveAttribute('data-preview-available', 'true');
  await first.scrollIntoViewIfNeeded();
  await expect(gallery.locator('video')).toHaveCount(1);
  await expect(gallery.locator('video')).toHaveAttribute(
    'src',
    /^\/art\/clips\/31-ink-settling-[a-f0-9]{16}\.mp4$/,
  );
  await expect
    .poll(() => gallery.locator('video').evaluate((video) => (video as HTMLVideoElement).paused))
    .toBe(false);
  expect(films.length).toBeGreaterThan(0);
  expect(films.every((url) => /\/art\/clips\//.test(url))).toBe(true);
  // Sit fades the lot's chrome and the running head; the next input brings them back.
  await first.getByRole('button', { name: t.sit, exact: true }).click();
  await expect(first).toHaveAttribute('data-sit', '');
  await expect(page.locator('html')).toHaveAttribute('data-sit', '');
  await page.waitForTimeout(700);
  await page.mouse.move(200, 300);
  await expect(first).not.toHaveAttribute('data-sit', /.*/);
});

test('the bid sheet hushes the theatre while open, silences the keys, and returns focus', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.locator('.site')).toHaveAttribute('data-theatre', 'playing');
  const collect = page.getByRole('button', { name: t.collectThisWork, exact: true });
  await collect.click();
  const sheet = page.getByRole('dialog', { name: `№ 031 · ${t.bidSheet}` });
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute('data-keys-suppressed', '');
  await expect(page.locator('.site')).toHaveAttribute('data-theatre', 'hushed');
  await expect(page.locator('#lot-actions')).toHaveAttribute('data-keys-suppressed', '');
  // The plate stays in view beside the sheet: no tint lies over the work.
  await expect(sheet).toHaveCSS('background-color', 'rgb(241, 235, 223)');
  await connect(page);
  await review(page, '1.1');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: t.bidReview })).not.toBeVisible();
  await expect(page.locator('.site')).toHaveAttribute('data-theatre', 'hushed');
  await page.keyboard.press('Escape');
  await expect(sheet).not.toBeVisible();
  await expect(page.locator('.site')).toHaveAttribute('data-theatre', 'playing');
  await expect(collect).toBeFocused();
  await noOverflow(page);
});

test("the bid history lists the contract's bids and the activity sheet reads a collector's view", async ({
  page,
}) => {
  await page.goto('/?leader=1&refund=1');
  const history = page.getByRole('region', { name: t.bidHistory, exact: true });
  await expect(history.getByRole('listitem')).toHaveCount(2);
  await expect(history.getByRole('listitem').first()).toContainText('1 ETH · 0x0000…0031');
  await expect(history.getByRole('link').first()).toHaveAttribute(
    'href',
    /^https:\/\/arbiscan\.io\/tx\/0x/,
  );
  await page.getByRole('button', { name: t.yourActivity, exact: true }).click();
  const activity = page.getByRole('dialog', { name: t.yourActivity, exact: true });
  await expect(activity).toBeVisible();
  await expect(page.locator('.site')).toHaveAttribute('data-theatre', 'playing');
  await activity
    .getByRole('button', { name: `${t.activityUseWallet} · Synthetic test wallet` })
    .click();
  await expect(activity.getByText('Activity of 0x0000…0031')).toBeVisible();
  await expect(activity.getByRole('link', { name: '№ 031' })).toHaveAttribute(
    'href',
    '/auctions/31',
  );
  await expect(activity).toContainText(`${t.activityRefundable}0.1 ETH`);
  expect(await page.evaluate(() => window.__auctionFixture.providerMethods)).toEqual([
    'eth_requestAccounts',
  ]);
  expect(await page.evaluate(() => window.__auctionFixture.calls.length)).toBe(0);
  await noOverflow(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('an unreadable history says so and a partial one admits earlier bids may be missing', async ({
  page,
}) => {
  await page.goto('/?history-failure=1');
  const history = page.getByRole('region', { name: t.bidHistory, exact: true });
  await expect(history.getByRole('status')).toHaveText(t.bidHistoryUnavailable);
  await page.goto('/?history-partial=1');
  await expect(
    page.getByRole('region', { name: t.bidHistory, exact: true }).getByText(t.historyPartial),
  ).toBeVisible();
});
