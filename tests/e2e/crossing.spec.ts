import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { catalogs } from '../../src/lib/i18n/messages';

/*
  The crossing in the order the work was made (docs/third-physics-phase-b.md). Every frame of
  a crossing is the two published stills and nothing else: each pixel is one of them, or, on
  the soft front, a mix of the two. The running head and the strip follow the same front, and
  the straight seam remains wherever the crossing cannot be painted or motion is still.
*/

const t = catalogs.en;
const pageStage = '[data-artwork-stage="page"]:visible';
const current = `${pageStage} [data-layer-state="current"]`;

async function workReady(page: Page, id: number) {
  await page.goto(`/art/${id}?view=still`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator(pageStage)).toHaveAttribute('data-expression', 'ink');
  const still = page.locator(`${current} img.art-still`);
  await expect
    .poll(() =>
      still.evaluate((element) => {
        const image = element as HTMLImageElement;
        return image.complete && image.naturalWidth > 0;
      }),
    )
    .toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-keys', 'ready');
}

/** Count every frame on which the crossing's canvas is painted, from the first script on. */
async function watchCanvas(page: Page) {
  await page.addInitScript(() => {
    const state = { painted: 0, headFront: 0, stripFront: 0 };
    Object.assign(window, { __crossing: state });
    const look = () => {
      if (document.querySelector('canvas[data-active]')) state.painted += 1;
      if (
        document.querySelector<HTMLElement>('.head-overlay')?.style.clipPath.startsWith('polygon')
      )
        state.headFront += 1;
      if (
        document
          .querySelector<HTMLElement>('[data-artwork-stage="page"] [data-layer="light"]')
          ?.style.clipPath.startsWith('polygon')
      )
        state.stripFront += 1;
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
}

function crossingState(page: Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __crossing: { painted: number; headFront: number; stripFront: number };
        }
      ).__crossing,
  );
}

type Pixels = { data: Buffer; width: number; height: number };
async function pixels(png: Buffer): Promise<Pixels> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * How a frame is made of the two stills. `outside` is the share of pixels that lie outside
 * the span between the two stills in any channel, which neither still nor any mix of them can
 * paint; `ink` and `light` are the shares, among the pixels where the stills clearly differ,
 * that each still shows untouched.
 */
function composition(frame: Pixels, ink: Pixels, light: Pixels, tolerance = 24) {
  let outside = 0;
  let distinct = 0;
  let inkShown = 0;
  let lightShown = 0;
  for (let i = 0; i < frame.data.length; i += 3) {
    let between = true;
    let apart = 0;
    let toInk = 0;
    let toLight = 0;
    for (let c = 0; c < 3; c++) {
      const f = frame.data[i + c];
      const a = ink.data[i + c];
      const b = light.data[i + c];
      if (f < Math.min(a, b) - tolerance || f > Math.max(a, b) + tolerance) between = false;
      apart = Math.max(apart, Math.abs(a - b));
      toInk = Math.max(toInk, Math.abs(f - a));
      toLight = Math.max(toLight, Math.abs(f - b));
    }
    if (!between) outside += 1;
    if (apart < 96) continue;
    distinct += 1;
    if (toInk <= tolerance) inkShown += 1;
    else if (toLight <= tolerance) lightShown += 1;
  }
  return {
    outside: outside / (frame.data.length / 3),
    ink: inkShown / Math.max(1, distinct),
    light: lightShown / Math.max(1, distinct),
  };
}

for (const id of [31, 23, 35]) {
  test(`№ ${String(id).padStart(3, '0')} crosses in its own order, from its two stills and nothing else`, async ({
    page,
  }) => {
    test.skip(
      test.info().project.name.endsWith('reduced-motion'),
      'The reduced-motion projects prove the one-frame Turn below.',
    );
    await watchCanvas(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await workReady(page, id);
    test.skip(
      !(await page.evaluate(() => !!document.createElement('canvas').getContext('webgl'))),
      'This browser offers no WebGL; the straight seam is its Turn, proved below.',
    );
    await expect(page.locator('html')).toHaveAttribute('data-crossing', 'arrival', {
      timeout: 15_000,
    });
    const stage = page.locator(pageStage);
    const plate = page.locator(`${current} .plate`);
    const clip = (await plate.boundingBox())!;
    const shot = async () => pixels(await page.screenshot({ clip }));
    const inkStill = await shot();

    const frames: Pixels[] = [];
    await page.locator(`${current} [data-turn="light"]`).click();
    const started = Date.now();
    while (Date.now() - started < 2600) frames.push(await shot());
    await expect(stage).toHaveAttribute('data-expression', 'light', { timeout: 6000 });
    await expect(page.locator('html')).not.toHaveAttribute('data-turning', /./);
    // The canvas rests, and the head and the strip are the seam's own again.
    await expect(page.locator(`${pageStage} canvas[data-active]`)).toHaveCount(0);
    expect(
      await page.locator('.head-overlay').evaluate((e) => (e as HTMLElement).style.clipPath),
    ).toBe('');
    expect(
      await page
        .locator(`${pageStage} [data-layer="light"]`)
        .evaluate((e) => (e as HTMLElement).style.clipPath),
    ).toBe('');
    const lightStill = await shot();

    const made = frames.map((frame) => composition(frame, inkStill, lightStill));
    // No frame paints anything but the two stills and their mix.
    for (const frame of made) expect(frame.outside).toBeLessThan(0.04);
    // Some frame shows both stills at once, untouched, side by side.
    const mixed = made.reduce((best, frame) =>
      Math.min(frame.ink, frame.light) > Math.min(best.ink, best.light) ? frame : best,
    );
    expect(mixed.ink).toBeGreaterThan(0.05);
    expect(mixed.light).toBeGreaterThan(0.05);
    const seen = await crossingState(page);
    expect(seen.painted).toBeGreaterThan(5);
    expect(seen.headFront).toBeGreaterThan(0);
    expect(seen.stripFront).toBeGreaterThan(0);

    // And back to Ink, in the order the current came to rest.
    await page.locator(`${current} [data-turn="ink"]`).click();
    await expect(stage).toHaveAttribute('data-expression', 'ink', { timeout: 6000 });
    await expect(page.locator('html')).not.toHaveAttribute('data-turning', /./);
    await expect(page.locator(`${pageStage} canvas[data-active]`)).toHaveCount(0);
  });
}

test('under a still preference the Turn is one frame, and nothing is prepared for a crossing', async ({
  page,
}) => {
  await watchCanvas(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await workReady(page, 31);
  await page.waitForTimeout(2000);
  await expect(page.locator('html')).not.toHaveAttribute('data-crossing', /./);
  await page.locator(`${current} [data-turn="light"]`).click();
  await expect(page.locator(pageStage)).toHaveAttribute('data-expression', 'light', {
    timeout: 3000,
  });
  expect((await crossingState(page)).painted).toBe(0);
});

test('where WebGL is unavailable, the straight seam is the Turn', async ({ page }) => {
  await watchCanvas(page);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      if (/webgl/.test(type)) return null;
      return (original as (...args: unknown[]) => RenderingContext | null).call(
        this,
        type,
        ...rest,
      );
    } as typeof original;
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await workReady(page, 31);
  await page.waitForTimeout(2000);
  await expect(page.locator('html')).not.toHaveAttribute('data-crossing', /./);
  await page.locator(`${current} [data-turn="light"]`).click();
  await expect(page.locator('html')).toHaveAttribute('data-turning', 'time');
  const night = page.locator(`${pageStage} [data-layer="light"]`);
  await expect.poll(() => night.evaluate((e) => getComputedStyle(e).clipPath)).toMatch(/^inset\(/);
  await expect(page.locator(pageStage)).toHaveAttribute('data-expression', 'light', {
    timeout: 5000,
  });
  expect((await crossingState(page)).painted).toBe(0);
});

test('the When lens colours each mark by its moment, labelled analysis, never the work', async ({
  page,
}) => {
  await workReady(page, 31);
  await page.locator(current).getByRole('button', { name: t.ways, exact: true }).click();
  await page.locator(current).getByRole('button', { name: t.enlarge, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('img')).toBeVisible();
  // The room opens with the Expansion; the still is measured where it comes to rest.
  await expect
    .poll(() => dialog.locator('img').evaluate((image) => image.getAnimations().length))
    .toBe(0);
  const still = await dialog.locator('img').boundingBox();
  const lens = dialog.getByRole('button', { name: t.whenLens, exact: true });
  await lens.click();
  await expect(lens).toHaveAttribute('aria-pressed', 'true');
  const drawn = dialog.locator('canvas[data-room-media]');
  await expect(drawn).toHaveAttribute('data-when', 'painted', { timeout: 15_000 });
  await expect(drawn).toHaveAttribute('role', 'img');
  await expect(drawn).toHaveAttribute('aria-label', new RegExp(t.analysisNotWork));
  await expect(dialog.getByRole('status')).toContainText(`${t.whenInk} · ${t.analysisNotWork}`);
  // The lens lies exactly where the still lay.
  const box = (await drawn.boundingBox())!;
  for (const key of ['x', 'y', 'width', 'height'] as const)
    expect(Math.abs(box[key] - still![key])).toBeLessThan(1.5);
  // Coloured marks on a dark ground, not the paper of the sheet.
  const { data } = await pixels(await drawn.screenshot());
  let sum = 0;
  for (let i = 0; i < data.length; i += 3) sum += data[i] + data[i + 1] + data[i + 2];
  expect(sum / (data.length * 255)).toBeLessThan(0.35);
  // T returns to the still; Light keeps the lens and reads its own order.
  await page.keyboard.press('t');
  await expect(lens).toHaveAttribute('aria-pressed', 'false');
  await expect(dialog.locator('img')).toBeVisible();
  await page.keyboard.press('t');
  await page.keyboard.press('l');
  await expect(dialog.getByRole('status')).toContainText(t.whenLight);
  await expect(dialog.locator('canvas[data-room-media]')).toHaveAttribute('data-when', 'painted', {
    timeout: 15_000,
  });
});
