import { expect, test, type Locator, type Page } from './fixtures';
import sharp from 'sharp';
import { catalogs } from '../../src/lib/i18n/messages';

const t = catalogs.en;

/*
  The orbit in the hand (docs/first-light.md §14).

  Every project checks what the section does:
  - the hand, the keys and the way back;
  - the slider;
  - that a phone's swipe still scrolls the page.

  Where a browser cannot draw it (CI's Firefox has no WebGL 2), the orbit is never offered to the
  hand, and the section stands exactly as it did. The pixels are checked only where a GPU draws
  them; CI has none.
*/

async function orbitSection(page: Page, path = '/art/31') {
  await page.goto(path);
  const orbit = page.getByRole('region', { name: t.orbitTitle });
  await orbit.scrollIntoViewIfNeeded();
  await expect(orbit).toHaveAttribute('data-phase', 'derived', { timeout: 30_000 });
  return orbit;
}

/** Whether this browser can draw WebGL 2 at all. */
function canDraw(page: Page) {
  return page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')));
}

/**
 * The orbit in depth, offered to the hand: it must be, where WebGL 2 draws. Elsewhere it is
 * never offered, and null is returned.
 */
async function inDepth(page: Page, orbit: Locator) {
  const depth = orbit.locator('canvas[data-layer="light"]');
  if (!(await canDraw(page))) {
    await expect(depth).toHaveAttribute('data-turns', 'false');
    await expect(orbit.getByText(t.orbitTurnHint)).toHaveCount(0);
    return null;
  }
  await expect(depth).toHaveAttribute('data-turns', 'true', { timeout: 30_000 });
  return depth;
}

/** Pause the performance, if it plays, so the moment holds still. */
async function paused(orbit: Locator) {
  const pause = orbit.getByRole('button', { name: t.pause });
  if (await pause.isVisible()) await pause.click();
}

test('a hand turns the orbit in depth, and lets it go back to the generator’s view', async ({
  page,
}, info) => {
  test.skip(info.project.name.includes('mobile'), 'A phone takes it with a hold: see below.');
  const orbit = await orbitSection(page);
  const depth = await inDepth(page, orbit);
  if (!depth) return;
  await expect(orbit.getByText(t.orbitTurnHint)).toBeVisible();
  const box = (await depth.boundingBox())!;
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 220, y + 40, { steps: 10 });
  await expect(depth).toHaveAttribute('data-view', 'turned');
  await expect(orbit.getByRole('button', { name: t.orbitGeneratorView })).toBeVisible();
  await page.mouse.up();
  // Let go, it returns: by a spring, or at once where motion is unwelcome.
  await expect(depth).toHaveAttribute('data-view', 'flat', {
    timeout: info.project.name.includes('reduced-motion') ? 500 : 3_000,
  });
  await expect(orbit.getByRole('button', { name: t.orbitGeneratorView })).toHaveCount(0);
  // Given back, the drawing on the plate stands whole again.
  await expect(orbit.locator('canvas[data-layer="marks"]')).toHaveCSS('opacity', '1');
});

test('the keys turn it and leave it where they put it; Escape gives it back', async ({ page }) => {
  const orbit = await orbitSection(page);
  const depth = await inDepth(page, orbit);
  if (!depth) return;
  await depth.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Shift+ArrowDown');
  await expect(depth).toHaveAttribute('data-view', 'turned');
  await page.waitForTimeout(1_000);
  await expect(depth).toHaveAttribute('data-view', 'turned');
  await page.keyboard.press('Escape');
  await expect(depth).toHaveAttribute('data-view', 'flat', { timeout: 3_000 });
  // The visible word gives it back too.
  await page.keyboard.press('ArrowRight');
  await orbit.getByRole('button', { name: t.orbitGeneratorView }).click();
  await expect(depth).toHaveAttribute('data-view', 'flat', { timeout: 3_000 });
});

test('the score is a slider that sets the moment, either way', async ({ page }) => {
  const orbit = await orbitSection(page);
  await paused(orbit);
  const slider = orbit.getByRole('slider', { name: t.orbitTimeLabel });
  await slider.focus();
  await page.keyboard.press('Home');
  await expect(
    orbit.getByText(/^Step [\d,]+ of 1,000,000 · 00:00 into the Light film$/),
  ).toBeVisible();
  await page.keyboard.press('PageUp');
  await expect(slider).toHaveAttribute('aria-valuetext', /· 00:01 into the Light film$/);
  await page.keyboard.press('PageUp');
  await page.keyboard.press('ArrowLeft');
  await expect(slider).toHaveValue('119');
  await page.keyboard.press('End');
  await expect(slider).toHaveValue('1801');
  // The closest approach is a word away, wherever the clock stands.
  await orbit.getByRole('button', { name: t.toClosestApproach }).click();
  await expect(orbit.getByText('Closest approach · bodies 1–3, 80.2 apart')).toBeVisible({
    timeout: 10_000,
  });
});

test('on a phone a swipe over the orbit scrolls the page, and a hold takes it', async ({
  page,
  browserName,
  faults,
}, info) => {
  // A fault of the page's own, known and left for the sculpture's next change: its touchmove
  // listener cancels a move the browser has already begun to scroll with (orbit-sculpture.tsx),
  // and Chromium says each time that it will not. When the listener asks `event.cancelable`
  // first, this line goes.
  faults.allow(/^console error: Ignored attempt to cancel a touchmove event with cancelable=false/);
  test.skip(
    !info.project.name.includes('mobile') || browserName !== 'chromium',
    'Touch is driven through Chromium’s own protocol; WebKit’s native scroll cannot be driven.',
  );
  const orbit = await orbitSection(page);
  const depth = await inDepth(page, orbit);
  if (!depth) return;
  await expect(orbit.getByText(t.orbitTurnHintTouch)).toBeVisible();
  const touch = await page.context().newCDPSession(page);
  const send = (
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    points: { x: number; y: number }[],
  ) => touch.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  let box = (await depth.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height * 0.8;
  const before = await page.evaluate(() => window.scrollY);
  await send('touchStart', [{ x, y }]);
  for (let step = 1; step <= 12; step++) await send('touchMove', [{ x, y: y - step * 15 }]);
  await send('touchEnd', []);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before + 40);
  await expect(depth).toHaveAttribute('data-view', 'flat');
  // Held still past the hold, the finger takes the orbit, and the page holds still beneath it.
  await depth.evaluate((node) => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
  box = (await depth.boundingBox())!;
  const [hx, hy] = [box.x + box.width / 2, box.y + box.height / 2];
  expect(hy).toBeGreaterThan(0);
  expect(hy).toBeLessThan(page.viewportSize()!.height);
  await send('touchStart', [{ x: hx, y: hy }]);
  await page.waitForTimeout(450);
  const held = await page.evaluate(() => window.scrollY);
  for (let step = 1; step <= 10; step++)
    await send('touchMove', [{ x: hx - step * 15, y: hy + step * 4 }]);
  await expect(depth).toHaveAttribute('data-view', 'turned');
  expect(await page.evaluate(() => window.scrollY)).toBe(held);
  await send('touchEnd', []);
  await expect(depth).toHaveAttribute('data-view', 'flat', { timeout: 3_000 });
});

/** Mean absolute difference, per channel, between two same-sized PNGs. */
async function difference(a: Buffer, b: Buffer) {
  const [one, two] = await Promise.all(
    [a, b].map((png) => sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })),
  );
  let sum = 0;
  for (let i = 0; i < one.data.length; i++) sum += Math.abs(one.data[i] - two.data[i]);
  return sum / one.data.length;
}

test('in ink the event is drawn on the sheet’s own tone, and given back to the very pixel', async ({
  page,
}, info) => {
  test.skip(!!process.env.CI, 'CI has no GPU to draw the orbit in depth.');
  test.skip(info.project.name.includes('mobile'), 'The desk checks the pixels.');
  test.slow();
  const orbit = await orbitSection(page);
  const depth = await inDepth(page, orbit);
  if (!depth) return;
  await paused(orbit);
  await expect(orbit).toHaveAttribute('data-material', 'ink');
  const stage = orbit.locator('[data-drawing="plate"]').first();
  const flat = await stage.screenshot();
  await depth.focus();
  await page.keyboard.press('Shift+ArrowLeft');
  await expect(depth).toHaveAttribute('data-view', 'turned');
  await page.waitForTimeout(200);
  const turned = await stage.screenshot();
  // Turned, the plate's drawing gives way to the event in depth.
  expect(await difference(flat, turned)).toBeGreaterThan(8);
  // Where no ink lies, the sheet is its own tone: the stage's corner.
  const tone = await stage.evaluate((node) =>
    getComputedStyle(node).getPropertyValue('--plate-ground').trim(),
  );
  const expected = [1, 3, 5].map((at) => parseInt(tone.slice(at, at + 2), 16));
  const { data, info: shape } = await sharp(turned)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const corner = (4 * shape.width + 4) * 3;
  for (let channel = 0; channel < 3; channel++)
    expect(Math.abs(data[corner + channel] - expected[channel])).toBeLessThanOrEqual(3);
  await page.keyboard.press('Escape');
  await expect(depth).toHaveAttribute('data-view', 'flat', { timeout: 3_000 });
  await page.waitForTimeout(200);
  // Given back, it is the plate's drawing again, pixel for pixel.
  expect(await difference(flat, await stage.screenshot())).toBeLessThan(1);
});
