import { expect, test, type Page } from '@playwright/test';
import { catalogs } from '../../src/lib/i18n/messages';
import { noHorizontalOverflow } from './helpers';

const t = catalogs.en;

async function pauseMotion(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem('cosmic-art-motion-v1', 'paused'));
}

test('the exhibitions are a quiet list: the hang, four trails and every cycle, each dated and summarised', async ({
  page,
  isMobile,
}) => {
  await pauseMotion(page);
  await page.goto('/exhibitions');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.exhibitions);
  const rows = page.getByRole('main').getByRole('listitem').getByRole('link');
  await expect(rows).toHaveCount(8);
  await expect(rows.first()).toHaveAccessibleName(t.hangTitle);
  await expect(rows.first()).toHaveAttribute('href', '/exhibitions/a-hang');
  await expect(rows.nth(1)).toHaveAccessibleName(t.trailLongCurve);
  await expect(rows.nth(1)).toContainText(t.trailLongCurveRule);
  await expect(rows.nth(5)).toHaveAccessibleName('Cycle 0');
  await expect(rows.nth(5)).toContainText('24 works');
  // The running head carries the room; on a phone its words live in the Index sheet.
  if (!isMobile)
    await expect(
      page.locator('.site-header').getByRole('link', { name: t.exhibitions }).first(),
    ).toHaveAttribute('aria-current', 'page');
  await noHorizontalOverflow(page);
});

test('a trail states its rule, hangs its works in the plate sequence and prints the measure beside each', async ({
  page,
}) => {
  await pauseMotion(page);
  await page.goto('/exhibitions/the-long-curve');
  const main = page.getByRole('main');
  const spread = main.locator('header').first();
  await expect(main.getByRole('heading', { level: 1 })).toHaveText(t.trailLongCurve);
  await expect(spread.getByText(`${t.trail} · October 27, 2026`)).toBeVisible();
  await expect(spread.getByText('Hung by Cosmic Signature')).toBeVisible();
  await expect(spread.getByText(t.trailLongCurveRule)).toBeVisible();
  await expect(spread.getByText(t.trailLongCurveNote)).toBeVisible();
  const measures = main.getByRole('list').last().getByRole('listitem');
  const count = await main.locator('ol').nth(0).getByRole('listitem').count();
  expect(count).toBeGreaterThanOrEqual(6);
  expect(count).toBeLessThanOrEqual(12);
  await expect(measures.first().getByRole('link')).toContainText('№ 059');
  await expect(measures.first().getByRole('link')).toContainText('eccentricity 0.499');
  await expect(measures.first().getByRole('link')).toHaveAttribute('href', '/art/59');
  // The plates above are the works' own stills, numeral captions only.
  const plates = main.locator('.work-grid .work-card');
  await expect(plates).toHaveCount(count);
  await expect(plates.first()).toHaveAttribute('href', '/art/59');
  await expect(plates.first().locator('img').first()).toHaveAttribute(
    'src',
    /full|ember_full|\.webp/,
  );
  await noHorizontalOverflow(page);
});

test('the hang seeds three plates from local stills and grows the one under the hand', async ({
  page,
  isMobile,
}) => {
  await pauseMotion(page);
  await page.goto('/exhibitions/a-hang');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1 })).toHaveText(t.hangTitle);
  await expect(main.getByText(t.hangNote)).toBeVisible();
  const leaves = main.getByRole('link', { name: /^№ 0(23|31|35) · Ink$/ });
  await expect(leaves).toHaveCount(3);
  for (const [index, id] of ['23', '31', '35'].entries()) {
    await expect(leaves.nth(index).locator('img.art-still')).toHaveAttribute(
      'src',
      `/art/${id}-ink.webp`,
    );
    await expect(leaves.nth(index)).toHaveAttribute('data-state', 'even');
  }
  if (!isMobile) {
    await leaves.nth(1).hover();
    await expect(leaves.nth(1)).toHaveAttribute('data-state', 'chosen');
    await expect(leaves.nth(0)).toHaveAttribute('data-state', 'other');
    const chosen = await leaves.nth(1).boundingBox();
    const other = await leaves.nth(0).boundingBox();
    await expect
      .poll(async () => (await leaves.nth(1).boundingBox())!.width)
      .toBeGreaterThan(other!.width * 1.8);
    expect(chosen).not.toBeNull();
    await leaves.nth(1).click();
    await expect(page).toHaveURL(/\/art\/31$/);
  } else {
    // On a phone the first tap chooses, the second enters.
    await leaves.nth(2).tap();
    await expect(leaves.nth(2)).toHaveAttribute('data-state', 'chosen');
    await expect(page).toHaveURL(/\/exhibitions\/a-hang$/);
    await leaves.nth(2).tap();
    await expect(page).toHaveURL(/\/art\/35$/);
  }
});

test('a cycle keeps every work of the cycle with its count and imprint date', async ({ page }) => {
  await pauseMotion(page);
  await page.goto('/exhibitions/cycle-1');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1 })).toHaveText('Cycle 1');
  await expect(
    main.locator('header').first().getByText(`${t.cycle} · August 11, 2026`),
  ).toBeVisible();
  await expect(main.getByText('24 works').first()).toBeVisible();
  await expect(main.locator('.work-grid .work-card')).toHaveCount(24);
  await expect(main.getByText(t.results)).toHaveCount(0);
  await expect(
    main.getByRole('navigation', { name: t.otherExhibitions }).getByRole('link'),
  ).toHaveCount(8);
  await noHorizontalOverflow(page);
});

test('the sharing cards are drawn from the works’ own rungs for a work, the home and the collection', async ({
  page,
  request,
}, testInfo) => {
  for (const [name, path] of [
    ['work', '/art/31'],
    ['home', '/'],
    ['collection', '/collection'],
  ] as const) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    const href = await page.locator('meta[property="og:image"]').first().getAttribute('content');
    expect(href, `${path} has an og:image`).toMatch(/opengraph-image/);
    // The tag names the deployment's origin; the card itself is served by the server under test.
    const card = new URL(href!);
    const response = await request.get(`${card.pathname}${card.search}`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
    const body = await response.body();
    expect(body.length).toBeGreaterThan(20_000);
    const file = testInfo.outputPath(`card-${name}.png`);
    await (await import('node:fs/promises')).writeFile(file, body);
    await testInfo.attach(`card-${name}`, { path: file, contentType: 'image/png' });
  }
  const alt = await page
    .goto('/art/31')
    .then(() => page.locator('meta[property="og:image:alt"]').first().getAttribute('content'));
  expect(alt).toBe('№ 031 · Ink');
});

test('an unknown exhibition is not here, and the venue says which work is next door', async ({
  page,
}) => {
  // The page streams behind the loading plate, so the status is the venue's; the body is the 404.
  await page.goto('/exhibitions/nowhere');
  await expect(page.getByRole('main')).toContainText(/next door/);
  await expect(page.getByRole('main')).not.toContainText(t.hangTitle);
});
