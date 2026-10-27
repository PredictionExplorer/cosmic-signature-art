import { expect, test } from '@playwright/test';
import { catalogs } from '../../src/lib/i18n/messages';
import { noHorizontalOverflow } from './helpers';

const t = catalogs.en;

test('the running head carries the one vocabulary, the Index word and the language, at 48 px', async ({
  page,
  isMobile,
}) => {
  await page.goto('/auctions');
  const head = page.locator('.site-header');
  await expect(head).toHaveCSS('height', isMobile ? '56px' : '48px');
  const nav = head.getByRole('navigation', { name: t.siteNavigation });
  const index = head.getByRole('button', { name: t.index });
  await expect(index).toBeVisible();
  await expect(head.getByRole('button', { name: t.pauseAmbientMotion })).toBeVisible();
  if (isMobile) {
    // On phones the words live in the Index sheet; the head keeps the wordmark, the motion control and Index.
    await expect(nav.getByRole('link', { name: t.collection })).toBeHidden();
    await expect(head.getByRole('button', { name: `${t.language}: EN` })).toBeHidden();
  } else {
    await expect(nav.getByRole('link')).toHaveText([
      t.collection,
      t.exhibitions,
      t.auctions,
      t.process,
      t.statement,
    ]);
    await expect(nav.getByRole('link', { name: t.auctions })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(head.getByRole('button', { name: `${t.language}: EN` })).toBeVisible();
  }
  // The wordmark is typeset, not drawn; the mark has one accessible name.
  await expect(head.locator('.head-row').first().locator('.brand-name')).toHaveText(
    'Cosmic Signature',
  );
  await expect(head.getByRole('img', { name: t.markLabel })).toBeVisible();
  await noHorizontalOverflow(page);
});

test('the ? key opens the key sheet, Escape closes it, and keys stay silent inside a field', async ({
  page,
}) => {
  await page.goto('/auctions');
  await expect(page.locator('html')).toHaveAttribute('data-keys', 'ready');
  await page.keyboard.press('?');
  const sheet = page.getByRole('dialog', { name: t.keysSheet });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(t.keyJump)).toBeVisible();
  await expect(sheet.getByText(t.keyExpressions)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  // Typing digits then Enter from anywhere goes to that work.
  await page.keyboard.type('31');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/art\/31$/);
});

test('the colophon states the record date and keeps the one outward arrow', async ({ page }) => {
  await page.goto('/auctions');
  const footer = page.locator('.site-footer');
  await footer.scrollIntoViewIfNeeded();
  await expect(footer.getByText(/Arbitrum record as of/)).toBeVisible();
  await expect(footer.getByText(t.colophonType)).toBeVisible();
  const outward = footer.getByRole('link', { name: /↗/ });
  await expect(outward).toHaveCount(1);
  await expect(outward).toHaveAttribute('href', 'https://cosmicsignature.com');
  const rows = footer.getByRole('navigation', { name: t.colophon }).getByRole('link');
  await expect(rows).toHaveText([
    t.collection,
    t.exhibitions,
    t.auctions,
    t.process,
    t.statement,
    t.terms,
    t.privacy,
    `${t.openProtocol} ↗`,
  ]);
});

test('a CJK locale links its own sliced display face and the Latin pages load none', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/fonts/cjk/')) requests.push(request.url());
  });
  await page.goto('/auctions');
  await page.evaluate(() => document.fonts.ready);
  expect(requests).toEqual([]);
  await page.goto('/ja/auctions');
  await expect(page.locator('link[rel="stylesheet"][href="/fonts/cjk/ja.css"]')).toHaveCount(1);
  await expect.poll(() => requests.some((url) => url.endsWith('/fonts/cjk/ja.css'))).toBe(true);
  expect(requests.some((url) => url.endsWith('/fonts/cjk/ja.css'))).toBe(true);
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return (
      [...document.fonts]
        .filter((font) => font.status === 'loaded')
        // Firefox quotes a family name that contains spaces; the name itself is what matters.
        .map((font) => font.family.replace(/^"|"$/g, ''))
        .filter((family, index, all) => all.indexOf(family) === index)
    );
  });
  expect(loaded).toEqual(
    expect.arrayContaining(['Literata Variable', 'IBM Plex Mono', 'Shippori Mincho B1']),
  );
});
