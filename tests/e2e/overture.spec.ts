import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { EXPRESSION_KEY, OVERTURE_KEY } from '../../src/lib/storage-keys';

/**
 * The Overture (third-physics.md §5.8): a first visit to the home opens on black, the day's
 * work's bodies draw its plate where its Light film drew it while the still condenses beneath
 * them, and the plate lands on the day's expression. On the suite's venue day that is Ink, so
 * the landing is the Overture's own crossing. Each test here starts as a first visit; the rest
 * of the suite is a returning one.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const { rungs } = JSON.parse(
  readFileSync(new URL('../../src/lib/art/still-ladder.json', import.meta.url), 'utf8'),
);
/** The suite's venue day, 6 November 2026, hangs № 023 on the home. */
const DAY_WORK = 23;

// WebKit holds a streamed page hidden a moment after load, beside the route's fallback.
const room = (page: Page) => page.locator('[data-presentation="home"]').filter({ visible: true });
const stored = (page: Page, key: string, where: 'local' | 'session') =>
  page.evaluate(
    ([name, kind]) => (kind === 'local' ? localStorage : sessionStorage).getItem(name),
    [key, where] as const,
  );

test('a first visit opens on black and lands on the day’s Ink by the Overture’s crossing', async ({
  page,
}, info) => {
  test.skip(info.project.name.includes('reduced-motion'), 'Reduced motion opens on the plate.');
  test.slow();
  await page.goto('/');
  const html = page.locator('html');
  // From the first paint: the black, and the head waiting beneath it.
  await expect(html).toHaveAttribute('data-overture', /^(pending|playing)$/);
  await expect(html).toHaveAttribute('data-room', 'night');
  await expect(html).toHaveAttribute('data-overture', 'playing', { timeout: 20_000 });
  await expect(page.locator('.site-header')).toHaveCSS('opacity', '0');
  expect(await stored(page, OVERTURE_KEY, 'local')).toBe('seen');
  // Landing on an Ink day is the Overture's own crossing, in the order the ink came to rest.
  await expect(html).toHaveAttribute('data-turning', 'overture', { timeout: 30_000 });
  await expect(html).not.toHaveAttribute('data-overture', { timeout: 30_000 });
  await expect(room(page)).toHaveAttribute('data-expression', 'ink');
  await expect(page.locator('.site-header')).toHaveCSS('opacity', '1');
  // None of it was the visitor's choice.
  expect(await stored(page, EXPRESSION_KEY, 'session')).toBeNull();
  // Seen once, it is not offered again.
  await page.reload();
  await expect(html).not.toHaveAttribute('data-overture');
  await expect(room(page)).toHaveAttribute('data-expression', 'ink');
});

test('the bodies draw the plate itself: their trails lie on the day’s Light still', async ({
  page,
}, info) => {
  test.skip(info.project.name.includes('reduced-motion'), 'Reduced motion opens on the plate.');
  test.slow();
  await page.goto('/');
  const overture = page.locator('[data-arrangement]');
  // Registered: the score is drawn on the plate, in its own place, not beside it.
  await expect(overture).toHaveAttribute('data-arrangement', 'registered', { timeout: 20_000 });
  // Landing: the whole window has been drawn, and the trails are still there to read.
  await expect(overture).toHaveAttribute('data-landing', '', { timeout: 30_000 });
  const still = rungs.find(
    (rung: { id: number; expression: string; width: number }) =>
      rung.id === DAY_WORK && rung.expression === 'light' && rung.width === 1280,
  ).src;
  const share = await page.evaluate(async (src) => {
    const trails = document.querySelector<HTMLCanvasElement>('[data-arrangement] canvas')!;
    const { width, height } = trails;
    const ink = trails.getContext('2d')!.getImageData(0, 0, width, height).data;
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    /** The still on the trails' canvas, as the plate lays it out, or turned half round. */
    const plate = (turned: boolean) => {
      context.setTransform(
        turned ? -1 : 1,
        0,
        0,
        turned ? -1 : 1,
        turned ? width : 0,
        turned ? height : 0,
      );
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      return context.getImageData(0, 0, width, height).data;
    };
    /**
     * Of the trails' lit pixels, the share with a mark of the still within two pixels. A trail is
     * a hairline at a fifth of full light, so its pixels are lit faintly; any of them counts.
     */
    const onMarks = (marks: Uint8ClampedArray) => {
      let on = 0;
      let lit = 0;
      for (let y = 2; y < height - 2; y++)
        for (let x = 2; x < width - 2; x++) {
          if (ink[(y * width + x) * 4 + 3] < 16) continue;
          lit += 1;
          let brightest = 0;
          for (let dy = -2; dy <= 2; dy++)
            for (let dx = -2; dx <= 2; dx++) {
              const p = ((y + dy) * width + x + dx) * 4;
              brightest = Math.max(brightest, marks[p] + marks[p + 1] + marks[p + 2]);
            }
          if (brightest >= 60) on += 1;
        }
      return { on: lit ? on / lit : 0, lit };
    };
    return { plate: onMarks(plate(false)), turned: onMarks(plate(true)) };
  }, still);
  // A desk's trails light about 11,000 pixels and a phone's 3,000; 98–99 % lie on the still's
  // marks, against 30–48 % on the still turned half round, a control that any light would meet.
  expect(share.plate.lit).toBeGreaterThan(1_000);
  expect(share.plate.on).toBeGreaterThan(0.95);
  expect(share.turned.on).toBeLessThan(share.plate.on - 0.3);
});

test('any input ends it at once, and the press that ends it presses nothing beneath', async ({
  page,
}, info) => {
  test.skip(info.project.name.includes('reduced-motion'), 'Reduced motion opens on the plate.');
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-overture', 'playing', { timeout: 20_000 });
  const url = page.url();
  // A link beneath the black, where a press would land if the Overture let it through.
  await page.evaluate(() => {
    const probe = document.createElement('a');
    probe.href = '/collection';
    probe.textContent = 'probe';
    probe.style.cssText = 'position:fixed;left:0;top:0;width:240px;height:240px;z-index:1';
    document.body.append(probe);
  });
  await page.mouse.click(120, 120);
  await expect(html).not.toHaveAttribute('data-overture');
  await expect(room(page)).toHaveAttribute('data-expression', 'ink');
  await expect(page.locator('.site-header')).toHaveCSS('opacity', '1');
  // Nothing beneath was pressed: given a moment, the page has not gone anywhere.
  await page.waitForTimeout(800);
  expect(page.url()).toBe(url);
});

test('reduced motion opens on the plate at once', async ({ page }, info) => {
  test.skip(!info.project.name.includes('reduced-motion'), 'Motion is welcome here.');
  await page.goto('/');
  await expect(page.locator('html')).not.toHaveAttribute('data-overture');
  await expect(room(page)).toHaveAttribute('data-expression', 'ink');
  expect(await stored(page, OVERTURE_KEY, 'local')).toBeNull();
});
