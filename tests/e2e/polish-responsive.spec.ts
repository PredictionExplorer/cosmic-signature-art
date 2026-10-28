import { expect, test, type Locator } from '@playwright/test';
import { catalogs } from '../../src/lib/i18n/messages';
import { localizedPath, type Locale } from '../../src/lib/i18n/routing';
import { imageLoaded, noHorizontalOverflow, pauseAmbientMotion } from './helpers';

const cases: { locale: Locale; width: number; height: number; label: string }[] = [
  { locale: 'en', width: 320, height: 740, label: 'small phone' },
  { locale: 'en', width: 390, height: 844, label: 'phone' },
  { locale: 'en', width: 834, height: 1112, label: 'portrait iPad' },
  { locale: 'en', width: 1024, height: 768, label: 'landscape iPad' },
  { locale: 'en', width: 1440, height: 900, label: 'laptop' },
  { locale: 'uk', width: 320, height: 740, label: 'small phone' },
  { locale: 'ja', width: 390, height: 844, label: 'phone' },
  { locale: 'uk', width: 834, height: 1112, label: 'portrait iPad' },
  { locale: 'ja', width: 834, height: 1112, label: 'portrait iPad' },
];

async function withinViewport(element: Locator, width: number, height: number) {
  await expect(element).toBeVisible();
  const box = (await element.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
  return box;
}

async function comfortableTarget(button: Locator, width: number, height: number) {
  const box = await withinViewport(button, width, height);
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
}

for (const { locale, width, height, label } of cases) {
  test(`${locale} ${label} ${width}×${height}: the work, label and viewing controls form one usable composition`, async ({
    page,
  }) => {
    const t = catalogs[locale];
    await page.setViewportSize({ width, height });
    await page.goto(`${localizedPath(locale, '/art/31')}?view=still`, {
      waitUntil: 'domcontentloaded',
    });
    await pauseAmbientMotion(page);
    await expect(page.locator('html')).toHaveAttribute('data-keys', 'ready');
    await page.evaluate(() => document.fonts.ready);

    const current = page.locator(
      '[data-artwork-stage="page"]:visible [data-layer-state="current"]',
    );
    const image = current.locator('img.art-still');
    await imageLoaded(image);
    await expect(image).toHaveClass(/is-settled/);
    await noHorizontalOverflow(page);

    const media = await withinViewport(current.locator('.art-media'), width, height);
    expect(Math.abs(media.width / media.height - 3456 / 2234)).toBeLessThan(0.02);
    await expect(image).toHaveCSS('object-fit', 'contain');
    const strip = await withinViewport(current.locator('.strip'), width, height);
    expect(strip.y).toBeGreaterThanOrEqual(media.y + media.height - 1);

    if (width < 768) {
      // The whole artwork screen must fit comfortably without a blank viewport below it.
      const screen = (await current.locator(':scope > [data-plate-ground]').boundingBox())!;
      expect(screen.height).toBeLessThan(height * 0.7);
    } else if (height > width) {
      // Portrait tablet captions belong to their artwork, even on a tall screen.
      expect(strip.y - (media.y + media.height)).toBeLessThanOrEqual(36);
    }

    const options = current.getByRole('button', { name: t.ways, exact: true });
    for (const name of [t.light, t.film, t.ways]) {
      await comfortableTarget(current.getByRole('button', { name, exact: true }), width, height);
    }
    await expect(current.getByRole('button', { name: t.enlarge, exact: true })).toHaveCount(0);
    await expect(options).toHaveAttribute('aria-expanded', 'false');

    // Space belongs to the focused disclosure, not the artwork's global playback shortcut.
    await options.focus();
    await options.press('Space');
    await expect(options).toHaveAttribute('aria-expanded', 'true');
    await expect(current.locator('[data-film-state]')).toHaveAttribute('data-film-state', 'still');
    await withinViewport(current.locator('[data-viewing-options-panel]'), width, height);
    for (const name of [t.enlarge, t.sit]) {
      await comfortableTarget(current.getByRole('button', { name, exact: true }), width, height);
    }

    const study = current.getByRole('button', { name: t.enlarge, exact: true });
    await study.focus();
    await study.press('Space');
    const room = page.getByRole('dialog', { name: `№ 031 · ${t.viewingRoom}`, exact: true });
    await expect(room).toBeVisible();
    await expect(room.locator('video')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(room).not.toBeVisible();
    await expect(options).toBeFocused();
    await expect(options).toHaveAttribute('aria-expanded', 'false');
    await noHorizontalOverflow(page);
  });
}
