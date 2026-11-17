import { expect, test } from './fixtures';
import { pauseAmbientMotion } from './helpers';

/**
 * The suite's helpers, tested as the page's own code is. A helper that returns too soon does
 * not fail where it is wrong: it lets the next press land on a page that is not listening, and
 * a test somewhere else fails one run in many.
 */

/** Every script a route loads before it can hydrate. */
const ROUTE_SCRIPT = /\/_next\/static\/chunks\/.+\.js(\?|$)/;

test('pauseAmbientMotion returns only once the page is hydrated, under reduced motion too', async ({
  page,
}) => {
  // Under reduced motion the server's page is already what the helper waits to see: paused.
  // That is the case it was wrong in, so every project meets it.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // The route's scripts are held back, so the server's page stands unhydrated for as long as
  // the test needs.
  let arrive!: () => void;
  const held = new Promise<void>((resolve) => (arrive = resolve));
  await page.route(ROUTE_SCRIPT, async (route) => {
    await held;
    await route.continue().catch(() => {});
  });
  await page.goto('/statement', { waitUntil: 'domcontentloaded' });
  const toggle = page.locator('button.motion-toggle');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).not.toHaveAttribute('data-keys', 'ready');

  let returned = false;
  const paused = pauseAmbientMotion(page).then(() => (returned = true));
  // A helper that does not wait is given every chance to return.
  await page.waitForTimeout(1_000);
  expect(returned, 'The helper returned while no script of the page had run.').toBe(false);

  arrive();
  await paused;
  await expect(page.locator('html')).toHaveAttribute('data-keys', 'ready');
  // The page is listening: the press that follows the helper is answered.
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
});
