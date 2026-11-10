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
  // The narrowest desk that sets the line inside the strip, in the language with the longest words.
  { locale: 'uk', width: 1280, height: 720, label: 'small laptop' },
  // A phone on its side: as wide as a tablet, with no height to give the line a row.
  { locale: 'en', width: 844, height: 390, label: 'phone on its side' },
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

    // The line under the still is whole and in view with the work, inside its strip: beside the
    // numeral on a wide desk, and on a row of its own beneath the words anywhere narrower, where
    // a room tall enough has had the plate give up that row's height.
    const words = (await current.locator('.strip-words').boundingBox())!;
    const said = current.locator('.strip p');
    if (width >= 768 && width < 1280 && height <= 560) {
      // A screen that wide and that short keeps the picture's room and the strip's one row. The
      // line is not shown, and is still there to be read aloud.
      expect(strip.height).toBe(56);
      expect(Math.abs(media.height - (height - 48 - 56))).toBeLessThanOrEqual(1);
      await expect(said).toHaveText(/\S/);
      const kept = (await current.locator('.strip [data-line]').boundingBox())!;
      expect([kept.width, kept.height]).toEqual([1, 1]);
    } else {
      const line = await withinViewport(said, width, height);
      expect(line.y).toBeGreaterThanOrEqual(strip.y - 1);
      expect(line.y + line.height).toBeLessThanOrEqual(strip.y + strip.height + 1);
      if (width >= 1280) {
        expect(strip.height).toBe(56);
        expect(line.x + line.width).toBeLessThanOrEqual(words.x);
      } else {
        expect(line.y).toBeGreaterThanOrEqual(words.y + words.height - 1);
        // Each sentence is whole on its line wherever the sheet is wide enough to hold one.
        if (width >= 768)
          for (const sentence of await said.locator('em > span').all())
            expect((await sentence.boundingBox())!.height).toBeLessThan(24);
      }
    }

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
