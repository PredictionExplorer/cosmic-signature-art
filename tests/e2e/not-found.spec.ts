import { expect, test, type APIResponse, type Response, type TestInfo } from '@playwright/test';
import { catalogs } from '../../src/lib/i18n/messages';
import { INDEXED_WORKS } from '../../src/lib/addresses';
import { workNumber } from '../../src/lib/art/number';
import { fill } from '../../src/lib/i18n/format';
import { locales, localizedPath, type Locale } from '../../src/lib/i18n/routing';
import { noHorizontalOverflow } from './helpers';

/**
 * What does not exist is refused before its page can stream (src/proxy.ts, src/lib/addresses.ts):
 * a true 404, with the venue's own page in the visitor's language (src/app/global-not-found.tsx).
 * What exists answers as it always did.
 */

/** An address answers alike in every engine, so one project asks. */
function oneProjectAsks(info: TestInfo) {
  test.skip(info.project.name !== 'chromium-desktop', 'An address answers alike everywhere.');
}

/** The venue's 404, read from the response itself: the status, the language, the words. */
async function expectNotHere(response: APIResponse, locale: Locale, words: string) {
  const label = response.url();
  expect(response.status(), label).toBe(404);
  const html = await response.text();
  expect(html, label).toContain(`<html lang="${locale}"`);
  expect(html, label).toMatch(/<html[^>]* data-room="night"/);
  expect(html, label).toContain('<meta name="robots" content="noindex"/>');
  expect(html.match(/<h1[^>]*>([^<]*)<\/h1>/)?.[1], label).toBe(words);
}

/**
 * What the 404 says of an address: a number the collection does not hold has not been imprinted,
 * a work it cannot name is not here, and any other page is not here.
 */
const LAST_WORK = Math.max(...INDEXED_WORKS);
function wordsFor(path: string, locale: Locale) {
  const t = catalogs[locale];
  const number = /^\/(?:art|verify\/orbit)\/(\d+)$/.exec(path)?.[1];
  if (number && Number(number) > LAST_WORK)
    return fill(t.notImprinted, { work: workNumber(Number(number)) });
  return /^\/(?:art|verify\/orbit)\//.test(path) ? t.notFound : t.pageNotFound;
}

for (const locale of locales) {
  test(`${locale}: what does not exist is a 404 in its language, and what exists is here`, async ({
    request,
  }, info) => {
    oneProjectAsks(info);
    for (const path of [
      '/art/abc',
      '/art/-1',
      '/exhibitions/nothing',
      '/verify/orbit/999',
      '/verify/orbit/031',
      '/zzz',
    ])
      await expectNotHere(
        await request.get(localizedPath(locale, path)),
        locale,
        wordsFor(path, locale),
      );
    for (const path of ['/art/31', '/exhibitions/a-hang', '/exhibitions/cycle-2']) {
      const response = await request.get(localizedPath(locale, path));
      expect(response.status(), path).toBe(200);
      expect(await response.text(), path).toContain(`<html lang="${locale}"`);
    }
  });
}

test('a number beyond the index is the indexer’s to refuse', async ({ request }, info) => {
  oneProjectAsks(info);
  // The live indexer's own "record not found"; the venue never infers a total from its index.
  await expectNotHere(await request.get('/art/9999'), 'en', wordsFor('/art/9999', 'en'));
  await expectNotHere(await request.get('/uk/art/9999'), 'uk', wordsFor('/art/9999', 'uk'));
});

test('a work’s number in another spelling goes to its one spelling, for good', async ({
  request,
}, info) => {
  oneProjectAsks(info);
  for (const [from, to] of [
    ['/art/031', '/art/31'],
    ['/ja/art/031?expression=ink', '/ja/art/31?expression=ink'],
  ]) {
    const response = await request.get(from, { maxRedirects: 0 });
    expect(response.status(), from).toBe(308);
    const location = new URL(response.headers().location, response.url());
    expect(`${location.pathname}${location.search}`, from).toBe(to);
  }
});

test('the venue’s 404 is its own page, in the visitor’s language, on black', async ({ page }) => {
  const uk = catalogs.uk;
  const response = await page.goto('/uk/art/abc');
  expect(response?.status()).toBe(404);
  await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
  await expect(page.locator('html')).toHaveAttribute('data-room', 'night');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#000000');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(uk.notFound);
  await expect(page.locator('.site-header')).toBeVisible();
  await expect(page.locator('.site-footer')).toBeAttached();
  const plate = page.getByRole('main').locator('.art-media');
  await expect(plate.locator('img.art-still')).toHaveAttribute('alt', `№\u00a0031 · ${uk.light}`);
  // Its language menu points at the address the visitor asked for, not the one no route answers.
  await expect(page.locator('.site-header a[hreflang="ja"]')).toHaveAttribute(
    'href',
    '/ja/art/abc',
  );
  await expect(page.locator('html')).toHaveAttribute('data-keys', 'ready');
  await noHorizontalOverflow(page);
  await page
    .getByRole('main')
    .getByRole('link', { name: uk.nextDoor.replace('{work}', '№ 031') })
    .click();
  await expect(page).toHaveURL(/\/uk\/art\/31$/);
});

test('a number the collection does not hold is next door to the nearest work it does', async ({
  page,
}) => {
  const t = catalogs.en;
  const response = await page.goto('/art/999');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    fill(t.notImprinted, { work: workNumber(999) }),
  );
  // № 999 is past the last work, which is next door, its own Light still on the plate.
  const plate = page.getByRole('main').locator('.art-media');
  await expect(plate.locator('img.art-still')).toHaveAttribute(
    'alt',
    `${workNumber(LAST_WORK)} · ${t.light}`,
  );
  await page
    .getByRole('main')
    .getByRole('link', { name: fill(t.nextDoor, { work: workNumber(LAST_WORK) }) })
    .click();
  await expect(page).toHaveURL(new RegExp(`/art/${LAST_WORK}$`));
});

/** What a router's prefetch asks of an address: its route's shape ("/_tree"), or one segment. */
function segmentOf(response: Response) {
  return response.request().headers()['next-router-segment-prefetch'] ?? '';
}

test('an English address is never taken for the home in a locale of its name', async ({
  page,
}, info) => {
  oneProjectAsks(info);
  const answers: string[] = [];
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.searchParams.has('_rsc'))
      answers.push(`${response.status()} ${url.pathname} ${segmentOf(response)}`);
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-keys', 'ready');
  // The language menu's addresses carry their locale, so the router learns the home's route,
  // /[locale], from them. It asks for a page's segment only once it holds the page's route.
  const learned = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/uk' && segmentOf(response).endsWith('/__PAGE__'),
  );
  await page
    .locator('.site-header')
    .getByRole('button', { name: `${catalogs.en.language}: EN` })
    .click();
  await learned;
  await page.keyboard.press('Escape');
  // The colophon's English addresses come into view after that. The proxy rewrites each to
  // /en/…, so each is asked for its own page, never for the home's (/$d$locale/__PAGE__).
  const addresses = ['/process', '/statement', '/privacy'];
  const pages = addresses.map((address) =>
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === address && segmentOf(response).endsWith('/__PAGE__'),
    ),
  );
  await page.locator('.site-footer').scrollIntoViewIfNeeded();
  for (const [index, response] of (await Promise.all(pages)).entries()) {
    const address = addresses[index];
    expect(`${response.status()} ${segmentOf(response)}`, address).toBe(
      `200 /$d$locale${address}/__PAGE__`,
    );
  }
  // A mistaken route also set the router asking for the locale's layout again and again, about
  // a thousand times a second. Half a second on, each address has been asked twice: for its route
  // and for its page.
  await page.waitForTimeout(500);
  expect(answers.filter((answer) => Number(answer.split(' ')[0]) >= 400)).toEqual([]);
  for (const address of addresses)
    expect(answers.filter((answer) => answer.split(' ')[1] === address).sort(), address).toEqual([
      `200 ${address} /$d$locale${address}/__PAGE__`,
      `200 ${address} /_tree`,
    ]);
});

test('a typed number without a record arrives at the venue’s 404', async ({ page }) => {
  await page.goto('/collection');
  await expect(page.locator('html')).toHaveAttribute('data-keys', 'ready');
  // The router asks for the work, meets the 404 and loads the venue's page whole.
  const arrival = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/art/9999' && response.request().isNavigationRequest(),
  );
  await page.keyboard.type('9999');
  await page.keyboard.press('Enter');
  expect((await arrival).status()).toBe(404);
  await expect(page).toHaveURL(/\/art\/9999$/);
  // № 9999 is a number the collection does not hold: it has not been imprinted.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(wordsFor('/art/9999', 'en'));
  await expect(page.locator('html')).toHaveAttribute('data-room', 'night');
});
