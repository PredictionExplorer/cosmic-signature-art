import { expect, test, type Locator, type Page } from './fixtures';
import AxeBuilder from '@axe-core/playwright';
import { catalogs } from '../../src/lib/i18n/messages';
import { locales, localizedPath } from '../../src/lib/i18n/routing';
import { fill } from '../../src/lib/i18n/format';

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
  test(`${locale} sale opens as a title spread, accessible and honest about launch readiness`, async ({
    page,
  }) => {
    const t = catalogs[locale];
    await pauseMotion(page);
    await page.goto(localizedPath(locale, '/auctions'));
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    // The sale's title spread is the one screen in the venue with no work on it.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      fill(t.saleTitle, { n: '01' }),
    );
    await expect(page.getByText(t.auctionNotLive, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(t.statementSigned, { exact: true })).toBeVisible();
    // Two facing pages: on a desk the foreword's page lies right of the spine at the middle of the
    // screen, beside the title's, each kept a margin clear of it; a phone reads the foreword after
    // the title. It is said once.
    const foreword = page.getByText(t.auctionIntro, { exact: true });
    await expect(foreword).toHaveCount(1);
    const title = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
    const facing = (await foreword.boundingBox())!;
    const { width } = page.viewportSize()!;
    if (width >= 1024) {
      expect(title.x + title.width).toBeLessThanOrEqual(width / 2 - 36);
      expect(facing.x).toBeGreaterThanOrEqual(width / 2 + 36);
    } else {
      expect(facing.y).toBeGreaterThan(title.y + title.height);
    }
    await expect(page.locator('input[name="bid"]')).toHaveCount(0);
    await expect(page.locator('.live-auction')).toHaveCount(0);
    // The coming cycle's chapter strip stands where the lots will hang, its number from the index.
    await expect(
      page
        .getByRole('region', { name: t.contractStatusLabel })
        .getByText(new RegExp(`^${t.cycle} \\d+$`)),
    ).toBeVisible();
    // Its status line is set as the venue's eyebrow, at the size the title spread's own keeps.
    const eyebrowSize = (eyebrow: Locator) =>
      eyebrow.evaluate((element) => getComputedStyle(element).fontSize);
    expect(
      await eyebrowSize(
        page.getByRole('region', { name: t.contractStatusLabel }).locator('p.eyebrow'),
      ),
    ).toBe(await eyebrowSize(page.locator('main .eyebrow').first()));
    // Until a sale is offered, the last imprinted cycle hangs below, labelled as not offered:
    // each work is described as such and leads to its own page, never to a lot.
    const meanwhile = page.getByRole('region', {
      name: new RegExp(`^${t.saleMeanwhileLabel} ${t.cycle} \\d+$`),
    });
    await expect(meanwhile.getByText(t.saleMeanwhileLabel, { exact: true })).toBeVisible();
    const works = meanwhile.locator('a[href*="/art/"]');
    await expect(works).toHaveCount(48);
    await expect(meanwhile.locator('a[href*="/auctions"]')).toHaveCount(0);
    await expect(works.first()).toHaveAccessibleDescription(t.saleMeanwhileLabel);
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
    await expect(page).toHaveTitle(/№\s031/);
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
    const options = page.locator(current).getByRole('button', { name: t.ways, exact: true });
    await options.click();
    const study = page.locator(current).getByRole('button', { name: t.enlarge, exact: true });
    await study.click();
    const room = page.getByRole('dialog', {
      name: `№ 031 · ${t.viewingRoom}`,
      exact: true,
    });
    await expect(room).toBeVisible();
    // A sale surface shows the work alone: the derived views (the When lens) are never offered.
    await expect(room.getByRole('button', { name: t.whenLens, exact: true })).toHaveCount(0);
    await room.getByRole('button', { name: new RegExp(`^${t.light}$`) }).click();
    await expect(room.locator('[data-artwork-stage="room"]')).toHaveAttribute(
      'data-expression',
      'light',
    );
    await room.getByRole('button', { name: t.close, exact: true }).click();
    await expect(room).not.toBeVisible();
    await expect(options).toBeFocused();
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
  await expect(page.locator('[data-wing]')).toHaveCount(0);
  await page
    .locator(current)
    .getByRole('button', { name: /^Light$/ })
    .click();
  await expect(stage).toHaveAttribute('data-expression', 'light');
  await expect(page.locator('html')).not.toHaveAttribute('data-turning', /./);
  await expect(page.locator(`${current} img.art-still`)).toHaveAttribute(
    'alt',
    '№\u00a0031 · Light',
  );
  // The Light plate lends the head its night, type and all, though the route's room is paper.
  await expect(page.locator('html')).toHaveAttribute('data-room', 'paper');
  await expect(page.locator('.site-header')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(page.locator('.site-header')).toHaveCSS('color', 'rgb(241, 235, 223)');
  await page.locator(current).getByRole('button', { name: /^Ink$/ }).click();
  await expect(stage).toHaveAttribute('data-expression', 'ink');
  await expect(page).toHaveTitle(/№\s031 · Auctions/);
});
