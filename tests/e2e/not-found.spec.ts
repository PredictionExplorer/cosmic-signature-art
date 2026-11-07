import { expect, test, type APIResponse, type TestInfo } from '@playwright/test';
import { catalogs } from '../../src/lib/i18n/messages';
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
async function expectNotHere(response: APIResponse, locale: Locale) {
  const label = response.url();
  expect(response.status(), label).toBe(404);
  const html = await response.text();
  expect(html, label).toContain(`<html lang="${locale}"`);
  expect(html, label).toMatch(/<html[^>]* data-room="night"/);
  expect(html, label).toContain('<meta name="robots" content="noindex"/>');
  expect(html.match(/<h1[^>]*>([^<]*)<\/h1>/)?.[1], label).toBe(catalogs[locale].notFound);
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
      await expectNotHere(await request.get(localizedPath(locale, path)), locale);
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
  await expectNotHere(await request.get('/art/9999'), 'en');
  await expectNotHere(await request.get('/uk/art/9999'), 'uk');
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
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(catalogs.en.notFound);
  await expect(page.locator('html')).toHaveAttribute('data-room', 'night');
});
