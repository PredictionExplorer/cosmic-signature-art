import { expect, test } from '@playwright/test';
import { catalogs } from '../../src/lib/i18n/messages';
import {
  artworkImageSource,
  collectionLoaded,
  noHorizontalOverflow,
  pauseAmbientMotion,
} from './helpers';

test('Atlas selection, rehanging and material changes lead to the selected token', async ({
  page,
}) => {
  await page.goto('/collection?view=atlas');
  await pauseAmbientMotion(page);
  const atlas = page.locator('.atlas:visible');
  await atlas.getByRole('button', { name: 'Signature 35', exact: true }).click();
  await expect(atlas.locator('.position-anchor .constellation-select')).toHaveAttribute(
    'aria-label',
    'Signature 35',
  );
  await expect(atlas.locator('.atlas-selection h2')).toHaveText('Signature 35');
  await atlas.getByRole('button', { name: 'Rehang the constellation', exact: true }).click();
  await expect(atlas.locator('.constellation')).toHaveClass(/rehung/);
  await atlas.getByRole('button', { name: 'Light', exact: true }).click();
  await artworkImageSource(atlas.locator('.position-anchor img.art-still'), 35, 'light');
  await expect(atlas.locator('video')).toHaveCount(0);
  await noHorizontalOverflow(page);
  await atlas.getByRole('link', { name: 'Enter this work', exact: true }).click();
  await expect(page).toHaveURL(/\/art\/35$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Signature 35');
});

test('the complete catalogue can be traversed to the first token and searched by token zero', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/collection');
  await pauseAmbientMotion(page);
  const main = page.getByRole('main');
  const seen = new Set<string>();
  let pages = 0;
  while (true) {
    await collectionLoaded(page);
    const cards = main.locator('#works .work-grid:not(.collection-skeleton) .work-card');
    const links = await cards.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('href')),
    );
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toMatch(/^\/art\/\d+(?:\?expression=light)?$/);
      const identity = new URL(link!, page.url()).pathname;
      expect(seen.has(identity)).toBe(false);
      seen.add(identity);
    }
    pages += 1;
    const earlier = main.locator('.pagination').getByRole('link', { name: /Earlier works/ });
    if (!(await earlier.count())) break;
    await earlier.click();
    await expect(page).toHaveURL(/\/collection\?offset=\d+#works$/);
    // The URL can update before the streamed catalogue replaces the preceding page.
    await expect(cards.first()).not.toHaveAttribute('href', links[0]!, { timeout: 30_000 });
  }
  expect(pages).toBeGreaterThan(1);
  expect(seen.has('/art/0')).toBe(true);
  const newer = main.locator('.pagination').getByRole('link', { name: /Later works/ });
  await expect(newer).toBeVisible();
  const lastPageFirst = await main.locator('#works .work-card').first().getAttribute('href');
  await newer.click();
  await expect(main.locator('#works .work-card').first()).not.toHaveAttribute(
    'href',
    lastPageFirst!,
    { timeout: 30_000 },
  );
  await collectionLoaded(page);
  await page.getByRole('textbox', { name: catalogs.en.search }).fill('0');
  await page.getByRole('button', { name: /Find work/ }).click();
  await expect(page).toHaveURL(/\/collection\?q=0$/);
  const result = main.locator('#works .work-grid .work-card');
  await expect(result).toHaveCount(1);
  // Published works can gain new expressions. Choose Light explicitly instead of
  // assuming that the first token will always have only its original rendering.
  await main
    .locator('#works')
    .getByRole('button', { name: catalogs.en.light, exact: true })
    .click();
  await expect(result).toHaveAttribute('href', '/art/0?expression=light');
  await collectionLoaded(page);
  await result.click();
  await expect(page).toHaveURL(/\/art\/0\?expression=light$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Signature 0');
  await expect(main).toHaveCount(1);
  await expect(main.locator('.viewer-plate .art-media')).toHaveAttribute('data-material', 'light');
  await expect(main.locator('#record')).toContainText(catalogs.en.cycle);
  await noHorizontalOverflow(page);
});
