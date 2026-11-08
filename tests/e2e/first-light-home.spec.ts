import { expect, test, type Page } from '@playwright/test';
import { EXPRESSION_KEY, OVERTURE_KEY } from '../../src/lib/storage-keys';

/**
 * First Light on the home (docs/first-light.md §4), the home's one timed event: a first visit
 * opens on the day's plate, the light performs over it and gives it back, and the plate lands on
 * the day's expression. On the suite's venue day that is Ink, so the landing is the Overture's
 * own crossing. Each test here starts as a first visit; the rest of the suite is a returning one.
 * A browser that cannot draw the light lets the page stand at once, as it would have opened.
 */
test.use({ storageState: { cookies: [], origins: [] } });

// WebKit holds a streamed page hidden a moment after load, beside the route's fallback.
const room = (page: Page) => page.locator('[data-presentation="home"]').filter({ visible: true });
const stored = (page: Page, key: string, where: 'local' | 'session') =>
  page.evaluate(
    ([name, kind]) => (kind === 'local' ? localStorage : sessionStorage).getItem(name),
    [key, where] as const,
  );

/** Whether the light performs here: it takes the plate, or the page stands at once. */
async function performs(page: Page) {
  const html = page.locator('html');
  await expect
    .poll(async () => (await html.getAttribute('data-overture')) ?? 'stood', { timeout: 20_000 })
    .toMatch(/^(playing|landing|dawn|stood)$/);
  return (await html.getAttribute('data-overture')) !== null;
}

/**
 * Every value the gate takes, from the document's first moment: the room script sets it before
 * anything paints. A browser that cannot draw the light lifts it at once, often before the page
 * has loaded, so a poll after the load can miss it; this reads it back instead.
 */
async function watchTheGate(page: Page) {
  await page.addInitScript(() => {
    const taken: (string | null)[] = [];
    Object.defineProperty(window, '__gate', { value: taken });
    new MutationObserver((records) => {
      // Each record holds the value before its change; the value after is the next one's, or now.
      records.forEach((_, i) =>
        taken.push(
          i + 1 < records.length
            ? records[i + 1].oldValue
            : document.documentElement.getAttribute('data-overture'),
        ),
      );
    }).observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-overture'],
      attributeOldValue: true,
    });
  });
  return () => page.evaluate(() => (window as unknown as { __gate: (string | null)[] }).__gate);
}

test('a first visit opens on the plate, performs, and lands on the day’s Ink by its crossing', async ({
  page,
}, info) => {
  test.skip(info.project.name.includes('reduced-motion'), 'Reduced motion opens on the plate.');
  test.slow();
  const gate = await watchTheGate(page);
  await page.goto('/');
  const html = page.locator('html');
  // From the first paint the day's plate stands alone: the head waits.
  expect((await gate())[0]).toBe('pending');
  await expect(room(page)).toBeVisible();
  if (await performs(page)) {
    await expect(page.locator('.site-header')).toHaveCSS('opacity', '0');
    expect(await stored(page, OVERTURE_KEY, 'local')).toBe('seen');
    await expect(page.getByRole('button', { name: 'Skip' })).toBeVisible();
    // Landing on an Ink day is the Overture's own crossing, in the order the ink came to rest.
    await expect(html).toHaveAttribute('data-turning', 'overture', { timeout: 30_000 });
    await expect(html).not.toHaveAttribute('data-overture', { timeout: 30_000 });
  }
  await expect(room(page)).toHaveAttribute('data-expression', 'ink');
  await expect(page.locator('.site-header')).toHaveCSS('opacity', '1');
  // None of it was the visitor's choice.
  expect(await stored(page, EXPRESSION_KEY, 'session')).toBeNull();
  // Seen once, it is not offered again.
  await page.reload();
  await expect(html).not.toHaveAttribute('data-overture');
  await expect(room(page)).toHaveAttribute('data-expression', 'ink');
});

test('the light lands where the plate lies, on the plate’s own still', async ({ page }, info) => {
  test.skip(info.project.name.includes('reduced-motion'), 'Reduced motion opens on the plate.');
  await page.goto('/');
  test.skip(!(await performs(page)), 'This browser cannot draw the light; the page stands.');
  const landing = await page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('[data-first-light]')!;
    const art = document
      .querySelector<HTMLElement>('[data-presentation="home"] [data-layer] .art-media')!
      .getBoundingClientRect();
    return {
      still: stage.dataset.still!.split(' ').map(Number),
      art: [art.left, art.top, art.width, art.height],
    };
  });
  // The still is contained in the plate's box: as wide as it, or as tall, and centred in it.
  const [x, y, width, height] = landing.still;
  const [left, top, boxWidth, boxHeight] = landing.art;
  expect(Math.abs(width - boxWidth) <= 1 || Math.abs(height - boxHeight) <= 1).toBe(true);
  expect(Math.abs(x + width / 2 - (left + boxWidth / 2))).toBeLessThanOrEqual(1);
  expect(Math.abs(y + height / 2 - (top + boxHeight / 2))).toBeLessThanOrEqual(1);
});

test('any input ends it at once, and the press that ends it presses nothing beneath', async ({
  page,
}, info) => {
  test.skip(info.project.name.includes('reduced-motion'), 'Reduced motion opens on the plate.');
  await page.goto('/');
  const html = page.locator('html');
  test.skip(!(await performs(page)), 'This browser cannot draw the light; the page stands.');
  await expect(html).toHaveAttribute('data-overture', 'playing', { timeout: 20_000 });
  const url = page.url();
  // A link beneath the light, where a press would land if the light let it through.
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
