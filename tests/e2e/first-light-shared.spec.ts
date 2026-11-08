import { expect, test, type Page } from '@playwright/test';
import { OVERTURE_KEY, VISIT_KEY } from '../../src/lib/storage-keys';
import { performs, stored, watchTheGate } from './helpers';

/**
 * First Light on a shared link (docs/first-light.md §16). A first visit that opens on a work, as
 * a link someone sent opens one, performs over the work's own plate and lands on it. Later pages
 * of the visit, a link that asks for an expression, and a browser that has seen it stand as they
 * open. On the suite's venue day № 031 opens in Ink, so the landing is the Overture's crossing.
 * A browser that cannot draw the light lets the page stand at once.
 */
test.use({ storageState: { cookies: [], origins: [] } });

// The work's own plate: WebKit holds a streamed page hidden a moment, beside its fallback.
const plate = (page: Page) =>
  page.locator('[data-presentation="gallery"]').filter({ visible: true }).first();

test('a shared link opens on the work’s plate, performs over it, and lands on its Ink', async ({
  page,
}, info) => {
  test.skip(info.project.name.includes('reduced-motion'), 'Reduced motion opens on the plate.');
  test.slow();
  const gate = await watchTheGate(page);
  await page.goto('/art/31');
  const html = page.locator('html');
  // From the first paint the work's plate stands alone: the head waits.
  expect((await gate())[0]).toBe('pending');
  expect(await stored(page, VISIT_KEY, 'session')).toBe('1');
  await expect(plate(page)).toBeVisible();
  if (await performs(page)) {
    await expect(page.locator('.site-header')).toHaveCSS('opacity', '0');
    expect(await stored(page, OVERTURE_KEY, 'local')).toBe('seen');
    await expect(page.getByRole('button', { name: 'Skip' })).toBeVisible();
    await expect(html).not.toHaveAttribute('data-overture', { timeout: 40_000 });
  }
  await expect(plate(page)).toHaveAttribute('data-expression', 'ink');
  await expect(page.locator('.site-header')).toHaveCSS('opacity', '1');
  // The visit has begun: the same page again stands as it opens.
  await page.reload();
  await expect(html).not.toHaveAttribute('data-overture');
  await expect(plate(page)).toHaveAttribute('data-expression', 'ink');
});

test('a work reached within a visit, or asked for an expression, stands as it opens', async ({
  page,
}) => {
  await page.goto('/collection');
  const gate = await watchTheGate(page);
  await page.goto('/art/31');
  await expect(plate(page)).toBeVisible();
  expect(await gate()).not.toContain('pending');
  // A new tab is a new visit; a link that asks for an expression is answered as it asks.
  const asked = await page.context().newPage();
  const askedGate = await watchTheGate(asked);
  await asked.goto('/art/31?expression=light');
  await expect(plate(asked)).toHaveAttribute('data-expression', 'light');
  expect(await askedGate()).not.toContain('pending');
});
