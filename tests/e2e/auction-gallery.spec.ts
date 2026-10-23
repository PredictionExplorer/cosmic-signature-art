import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { catalogs } from '../../src/lib/i18n/messages';
import { locales, localizedPath } from '../../src/lib/i18n/routing';

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
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${t.signature} 31`);
    await expect(page.getByText(t.auctionNotLive, { exact: true }).first()).toBeVisible();
    const stage = page.locator('[data-artwork-stage="page"]:visible');
    await expect(stage).toHaveAttribute('data-expression', 'ink');
    await expect(stage.locator('img')).toBeVisible();
    await expect
      .poll(() =>
        stage.locator('img').evaluate((image) => (image as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    await expect(
      page.getByRole('link', { name: new RegExp(t.auctionViewRecord) }).first(),
    ).toHaveAttribute('href', localizedPath(locale, '/art/31#record'));
    await expect(page.locator('input[name="bid"]')).toHaveCount(0);
    await noOverflow(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: t.enlarge, exact: true }).click();
    const room = page.getByRole('dialog', {
      name: `${t.signature} 31 · ${t.viewingRoom}`,
      exact: true,
    });
    await expect(room).toBeVisible();
    await room.getByRole('button', { name: new RegExp(`^(?:0[12] )?${t.light}$`) }).click();
    await expect(room.locator('[data-artwork-stage="room"]')).toHaveAttribute(
      'data-expression',
      'light',
    );
    await room.getByRole('button', { name: t.close, exact: true }).click();
    await expect(room).not.toBeVisible();
    await expect(page.getByRole('button', { name: t.enlarge, exact: true })).toBeFocused();
  });
}

test('auction pages keep restored motion preferences and the original work identity', async ({
  page,
}) => {
  await pauseMotion(page);
  await page.goto('/auctions/31');
  const t = catalogs.en;
  const stage = page.locator('[data-artwork-stage="page"]:visible');
  await expect(stage).toHaveAttribute('data-expression', 'ink');
  await expect(page.locator('.motion-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(stage.locator('video')).toHaveCount(0);
  const viewer = page.getByRole('region', { name: t.ways, exact: true });
  await viewer.getByRole('button', { name: /^(?:0[12] )?Light$/ }).click();
  await expect(stage).toHaveAttribute('data-expression', 'light');
  await expect(stage.locator('img')).toHaveAttribute('alt', 'Signature 31 · Light');
  await viewer.getByRole('button', { name: /^(?:0[12] )?Ink$/ }).click();
  await expect(stage).toHaveAttribute('data-expression', 'ink');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Signature 31');
});
