import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { catalogs } from '../../src/lib/i18n/messages';
import { locales, localizedPath } from '../../src/lib/i18n/routing';

const current = '[data-artwork-stage="page"]:visible [data-layer-state="current"]';

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(1);
}
async function pauseMotion(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem('cosmic-art-motion-v1', 'paused'));
}

for (const locale of locales) {
  test(`${locale} auction exhibition is cinematic, accessible and honest about launch readiness`, async ({
    page,
  }) => {
    const t = catalogs[locale];
    await pauseMotion(page);
    await page.goto(localizedPath(locale, '/auctions'));
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.auctionTitle);
    await expect(page.getByText(t.auctionNotLive, { exact: true }).first()).toBeVisible();
    await expect(
      page
        .locator('[data-auction-exhibition]:visible')
        .getByText(t.auctionEditorialNote, { exact: true }),
    ).toBeVisible();
    await expect(page.locator('input[name="bid"]')).toHaveCount(0);
    await expect(page.locator('.live-auction')).toHaveCount(0);
    const hero = page.locator('[data-auction-exhibition]:visible');
    await expect(hero).toBeVisible();
    await expect(hero.locator('img').first()).toBeVisible();
    await expect
      .poll(() =>
        hero
          .locator('img')
          .first()
          .evaluate((image) => (image as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    await noOverflow(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    const terms = page.getByRole('main').getByRole('link', { name: new RegExp(t.auctionReadMore) });
    await expect(terms).toHaveAttribute('href', localizedPath(locale, '/terms'));
  });

  test(`${locale} lot viewing and provenance remain available before auction activation`, async ({
    page,
  }) => {
    const t = catalogs[locale];
    await pauseMotion(page);
    await page.goto(localizedPath(locale, '/auctions/31'));
    await expect(page).toHaveTitle(/№ 031/);
    await expect(page.getByText(t.auctionNotLive, { exact: true }).first()).toBeVisible();
    const stage = page.locator('[data-artwork-stage="page"]:visible');
    await expect(stage).toHaveAttribute('data-expression', 'ink');
    const still = page.locator(`${current} img.art-still`);
    await expect(still).toBeVisible();
    await expect
      .poll(() => still.evaluate((image) => (image as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    await expect(
      page.getByRole('link', { name: new RegExp(t.auctionViewRecord) }).first(),
    ).toHaveAttribute('href', localizedPath(locale, '/art/31#record'));
    await expect(page.locator('input[name="bid"]')).toHaveCount(0);
    // The bid rail silences the venue's keys.
    await expect(page.locator('#lot-actions')).toHaveAttribute('data-keys-suppressed', '');
    await noOverflow(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    const study = page.locator(current).getByRole('button', { name: t.enlarge, exact: true });
    await study.click();
    const room = page.getByRole('dialog', {
      name: `№ 031 · ${t.viewingRoom}`,
      exact: true,
    });
    await expect(room).toBeVisible();
    await room.getByRole('button', { name: new RegExp(`^${t.light}$`) }).click();
    await expect(room.locator('[data-artwork-stage="room"]')).toHaveAttribute(
      'data-expression',
      'light',
    );
    await room.getByRole('button', { name: t.close, exact: true }).click();
    await expect(room).not.toBeVisible();
    await expect(study).toBeFocused();
  });
}

test('auction pages keep restored motion preferences and the original work identity', async ({
  page,
}) => {
  await pauseMotion(page);
  await page.goto('/auctions/31');
  const stage = page.locator('[data-artwork-stage="page"]:visible');
  await expect(stage).toHaveAttribute('data-expression', 'ink');
  await expect(page.locator('button.motion-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(stage.locator('video')).toHaveCount(0);
  // Paused: the Turn is one frame, and the lot page has no night wing beneath the plate.
  await expect(page.locator('[data-night-wing]')).toHaveCount(0);
  await page
    .locator(current)
    .getByRole('button', { name: /^Light$/ })
    .click();
  await expect(stage).toHaveAttribute('data-expression', 'light');
  await expect(page.locator('html')).not.toHaveAttribute('data-turning', /./);
  await expect(page.locator(`${current} img.art-still`)).toHaveAttribute('alt', '№ 031 · Light');
  await page.locator(current).getByRole('button', { name: /^Ink$/ }).click();
  await expect(stage).toHaveAttribute('data-expression', 'ink');
  await expect(page).toHaveTitle(/№ 031 · Auctions/);
});
