import { expect, test, type Page } from '@playwright/test';
import { catalogs } from '../../src/lib/i18n/messages';
import { noHorizontalOverflow } from './helpers';

const t = catalogs.en;
const pageStage = '[data-artwork-stage="page"]:visible';
const current = `${pageStage} [data-layer-state="current"]`;
const roomSelector = '[data-testid="artwork-room"]';
const frameSelector = `${roomSelector} > div`;

async function artworkReady(page: Page, path = '/art/31?view=still') {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/№ 031/);
  await expect(page.locator(pageStage)).toHaveAttribute('data-expression', 'ink');
  const still = page.locator(`${current} img.art-still`);
  await expect(still).toBeVisible();
  await expect
    .poll(() =>
      still.evaluate((element) => {
        const image = element as HTMLImageElement;
        return image.complete && image.naturalWidth > 0;
      }),
    )
    .toBe(true);
  const paused = await page.evaluate(() => {
    const saved = sessionStorage.getItem('cosmic-art-motion-v1');
    return saved ? saved === 'paused' : matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  await expect(page.locator('button.motion-toggle')).toHaveAttribute(
    'aria-pressed',
    String(paused),
  );
  // Under a still preference the server and the client agree, so the toggle cannot prove
  // hydration; the keys' marker is set only once the client's listeners are attached.
  await expect(page.locator('html')).toHaveAttribute('data-keys', 'ready');
}

async function openRoom(page: Page) {
  await page.locator(current).getByRole('button', { name: t.enlarge, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('img')).toBeVisible();
  return dialog;
}

test('the room is the work’s own material, with every word on one edge strip that rests and returns', async ({
  page,
}) => {
  await artworkReady(page);
  const dialog = await openRoom(page);
  const frame = page.locator(frameSelector).first();
  // The Ink sheet's measured tone is the ground; the Light field is black.
  expect(await frame.evaluate((element) => element.style.getPropertyValue('--room-surface'))).toBe(
    '#efe9dd',
  );
  const still = dialog.locator('img');
  const layout = await still.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height, vw: innerWidth, vh: innerHeight };
  });
  expect(layout.width).toBeLessThanOrEqual(layout.vw + 1);
  expect(layout.height).toBeLessThanOrEqual(layout.vh + 1);
  for (const name of [t.ink, t.light, t.still, t.film, t.detail, t.close]) {
    const word = dialog.getByRole('button', { name, exact: true });
    await expect(word).toBeVisible();
    expect(await word.evaluate((element) => getComputedStyle(element).fontSize)).toBe('15px');
  }
  // No native controls, no select, no header: the strip is the chrome.
  await expect(dialog.locator('select, header')).toHaveCount(0);
  // The strip rests after the quiet spell and returns on movement; it never leaves the DOM.
  // Under reduced motion nothing fades on its own: the strip stays.
  const reduced = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (reduced) {
    await page.waitForTimeout(3000);
    await expect(frame).not.toHaveAttribute('data-idle', '');
  } else {
    await expect(frame).toHaveAttribute('data-idle', '', { timeout: 6000 });
    await expect(dialog.getByRole('button', { name: t.close, exact: true })).toBeAttached();
    await page.mouse.move(300, 300);
    await page.mouse.move(320, 310);
    await expect(frame).not.toHaveAttribute('data-idle', '');
  }
  await dialog.getByRole('button', { name: t.light, exact: true }).click();
  await expect(frame).toHaveAttribute('data-material', 'light');
  expect(await frame.evaluate((element) => element.style.getPropertyValue('--room-surface'))).toBe(
    '#000000',
  );
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});

test('Detail opens the loupe on the first measured window at native scale; Whole plate and W return', async ({
  page,
}) => {
  await artworkReady(page);
  const dialog = await openRoom(page);
  await dialog.getByRole('button', { name: t.detail, exact: true }).click();
  const loupe = dialog.locator('[data-loupe][role="group"]');
  await expect(loupe).toBeVisible();
  await expect(loupe).toHaveAttribute('data-scale', 'native');
  const image = loupe.locator('img');
  // The published still, moved by transform alone, at one artwork pixel per device pixel.
  await expect(image).toHaveAttribute('width', '3456');
  const transform = await image.evaluate((element) => element.style.transform);
  const scale = Number(/scale\(([\d.]+)\)/.exec(transform)?.[1]);
  const dpr = await page.evaluate(() => devicePixelRatio);
  expect(scale).toBeCloseTo(1 / dpr, 3);
  await expect(dialog.getByRole('status')).toHaveText(
    /^Detail of Plate 031 \(1:1\) · x [\d,]+–[\d,]+ \/ y [\d,]+–[\d,]+$/,
  );
  // The measured windows are the loupe's presets; the whole plate is always one press away.
  const second = dialog.getByRole('button', { name: 'Detail 2', exact: true });
  await second.click();
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: t.wholePlate, exact: true }).click();
  await expect(loupe).toHaveCount(0);
  await expect(dialog.locator('img')).toBeVisible();
  await page.keyboard.press('z');
  await expect(loupe).toBeVisible();
  await loupe.focus();
  const before = await image.evaluate((element) => element.style.transform);
  await page.keyboard.press('ArrowRight');
  expect(await image.evaluate((element) => element.style.transform)).not.toBe(before);
  await page.keyboard.press('w');
  await expect(loupe).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});

test('a long study opens the Slow room: no native controls, the one-pixel transport, Space to pause', async ({
  page,
}) => {
  await artworkReady(page);
  const dialog = await openRoom(page);
  const frame = page.locator(frameSelector).first();
  await dialog
    .getByRole('button', { name: new RegExp(`^${t.longStudy} · \\d+ s(?: · .+)?$`) })
    .click();
  await expect(frame).toHaveAttribute('data-slow', '');
  const film = dialog.locator('video');
  await expect(film).toHaveAttribute('src', /ember_medium\.mp4$/);
  await expect(film).not.toHaveAttribute('controls');
  const transport = dialog.getByRole('slider', { name: t.filmPosition, exact: true });
  await expect(transport).toBeAttached();
  expect(await transport.evaluate((element) => element.getBoundingClientRect().bottom)).toBeCloseTo(
    await page.evaluate(() => innerHeight),
    0,
  );
  await page.keyboard.press(' ');
  await expect
    .poll(() => film.evaluate((element) => (element as HTMLVideoElement).paused))
    .toBe(true);
  await dialog.getByRole('button', { name: t.still, exact: true }).click();
  await expect(frame).not.toHaveAttribute('data-slow', '');
  await expect(dialog.locator('video')).toHaveCount(0);
});

test('the Expansion grows the work from its plate when motion is allowed, and swaps at once under reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await artworkReady(page);
  await page.locator(current).getByRole('button', { name: t.enlarge, exact: true }).click();
  const animated = await page.evaluate(() =>
    document
      .getAnimations()
      .some((animation) =>
        (animation.effect as KeyframeEffect | null)?.target?.closest(
          '[data-testid="artwork-room"]',
        ),
      ),
  );
  expect(animated).toBe(true);
  await expect(page.getByRole('dialog').locator('img')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await artworkReady(page);
  await page.locator(current).getByRole('button', { name: t.enlarge, exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document
          .getAnimations()
          .filter((animation) =>
            (animation.effect as KeyframeEffect | null)?.target?.closest(
              '[data-testid="artwork-room"]',
            ),
          ).length,
    ),
  ).toBe(0);
});

test('the gatefold hangs both plates at equal scale and offers a seam the keyboard moves', async ({
  page,
}) => {
  await artworkReady(page);
  const gatefold = page.getByRole('region', { name: /^Plate 031, in ink and in light/ });
  await gatefold.scrollIntoViewIfNeeded();
  const plates = gatefold.getByRole('img');
  await expect(plates).toHaveCount(2);
  await expect(plates.nth(0)).toHaveAttribute('alt', '№ 031 · Ink');
  await expect(plates.nth(1)).toHaveAttribute('alt', '№ 031 · Light');
  const widths = await plates.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().width),
  );
  expect(Math.abs(widths[0] - widths[1])).toBeLessThanOrEqual(1);
  await noHorizontalOverflow(page);
  await gatefold.getByRole('button', { name: t.gatefoldSeam, exact: true }).click();
  const seam = gatefold.getByRole('slider', { name: t.gatefoldSeamLabel, exact: true });
  await expect(seam).toHaveValue('50');
  await seam.focus();
  for (let index = 0; index < 10; index += 1) await page.keyboard.press('ArrowLeft');
  await expect(seam).toHaveValue('40');
  const frame = gatefold.locator('[data-gatefold-seam]');
  expect(await frame.evaluate((element) => element.style.getPropertyValue('--gatefold-seam'))).toBe(
    '40%',
  );
  await expect(frame.getByRole('img')).toHaveCount(2);
  await noHorizontalOverflow(page);
});
