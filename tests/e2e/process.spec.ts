import { expect, test } from '@playwright/test';
import { catalogs } from '../../src/lib/i18n/messages';
import { readFileSync } from 'node:fs';
import {
  artworkImageSource,
  imageLoaded,
  noHorizontalOverflow,
  pauseAmbientMotion,
} from './helpers';

test('Process moves from a seamless Light room into matching Ink paper and restores gallery chrome', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/process');
  await pauseAmbientMotion(page);
  const header = page.locator('.site-header');
  const lightRoom = page.getByRole('region', { name: catalogs.en.processTitle });
  const light = page.locator('#light .art-media:visible');
  await light.scrollIntoViewIfNeeded();
  await imageLoaded(light.locator('img.art-still'));
  await expect(header).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(lightRoom).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(light).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(light.locator('img.art-still')).toHaveAttribute('alt', 'Signature 31 · Light');
  const archive = JSON.parse(
    readFileSync(new URL('../../src/lib/art/curated-records.json', import.meta.url), 'utf8'),
  ) as { records: { id: number; seed: string }[] };
  const seed = archive.records.find((item) => item.id === 31)!.seed;
  await artworkImageSource(light.locator('img.art-still'), 31, 'light', true);
  if (await light.locator('video').count()) {
    expect(await light.locator('video').getAttribute('src')).toContain(
      `/${seed}/videos/web/main.mp4`,
    );
  }
  await page
    .getByRole('navigation', { name: catalogs.en.ways })
    .getByRole('link', { name: /02/ })
    .click();
  await expect(page).toHaveURL(/\/process#ink$/);
  await expect(page.locator('#ink-title')).toBeInViewport();
  const ink = page.locator('#ink .art-media');
  await ink.scrollIntoViewIfNeeded();
  await imageLoaded(ink.locator('img.art-still'));
  await expect(page.locator('#ink')).toHaveCSS('background-color', 'rgb(241, 235, 223)');
  // The plate is letterboxed in its own measured ground (plate-records: № 031 Ink is #efe9dd).
  await expect(ink).toHaveCSS('background-color', 'rgb(239, 233, 221)');
  await artworkImageSource(ink.locator('img.art-still'), 31, 'ink');
  // Sample the authentic local still's paper, not an invented CSS approximation.
  const paperPixel = await ink.locator('img.art-still').evaluate((element) => {
    const image = element as HTMLImageElement;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0, 16, 16, 0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
  });
  expect(
    paperPixel.every((channel, index) => Math.abs(channel - [241, 235, 223][index]) <= 8),
  ).toBe(true);
  await noHorizontalOverflow(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(header).toBeInViewport();
  await page.getByRole('heading', { level: 1 }).click();
  const screenshot = testInfo.outputPath('process-redesign.png');
  await page.screenshot({
    path: screenshot,
    fullPage: true,
    animations: 'disabled',
    style: 'nextjs-portal { visibility: hidden; }',
  });
  await testInfo.attach('process-redesign', { path: screenshot, contentType: 'image/png' });
  await header.getByRole('link', { name: catalogs.en.collection, exact: true }).click();
  await expect(page).toHaveURL(/\/collection$/);
  await expect(page.locator('.process-page:visible')).toHaveCount(0);
  await expect(header).not.toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(header).toHaveCSS('color', 'rgb(34, 35, 31)');
  expect(errors).toEqual([]);
});
