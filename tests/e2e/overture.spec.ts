import { expect, test, type Page } from '@playwright/test';
import { EXPRESSION_KEY, OVERTURE_KEY } from '../../src/lib/storage-keys';

/**
 * The Overture (third-physics.md §5.8): a first visit to the home opens on black, the day's
 * work's orbit is drawn as its Light still condenses beside it, and the plate lands on the
 * day's expression. On the suite's venue day that is Ink, so the landing is the Overture's own
 * crossing. Each test here starts as a first visit; the rest of the suite is a returning one.
 */
test.use({ storageState: { cookies: [], origins: [] } });

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
