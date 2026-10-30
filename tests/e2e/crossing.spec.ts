import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { catalogs } from '../../src/lib/i18n/messages';
import { pauseAmbientMotion, playAmbientMotion } from './helpers';

/*
  The crossing in the order the work was made (docs/third-physics-phase-b.md). Every frame of
  a crossing is the two published stills and nothing else: each pixel is one of them, or, on
  the soft front, a mix of the two. The running head and the strip follow the same front, and
  the straight seam remains wherever the crossing cannot be painted or motion is still.
*/

const t = catalogs.en;
const pageStage = '[data-artwork-stage="page"]:visible';
const current = `${pageStage} [data-layer-state="current"]`;
const arrivalMaps = JSON.parse(
  readFileSync(new URL('../../src/lib/art/arrival-maps.json', import.meta.url), 'utf8'),
) as { maps: { id: number; expression: 'ink' | 'light'; src: string }[] };

/** The crossing runs here, unless this project proves the still Turn or has no WebGL. */
async function crossingOffered(page: Page) {
  test.skip(
    test.info().project.name.endsWith('reduced-motion'),
    'The reduced-motion projects prove the one-frame Turn below.',
  );
  test.skip(
    !(await page.evaluate(() => !!document.createElement('canvas').getContext('webgl'))),
    'This browser offers no WebGL; the straight seam is its Turn, proved below.',
  );
  await expect(page.locator('html')).toHaveAttribute('data-crossing', 'arrival', {
    timeout: 15_000,
  });
}

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
 * A screenshot at an eighth of its size. The page re-rasterises a still's finest lines as its
 * decode settles, which moves single pixels along every edge; averaged, those vanish, while
 * any region of the night that stayed behind does not.
 */
async function coarse(png: Buffer): Promise<Pixels> {
  const { width = 8 } = await sharp(png).metadata();
  return pixels(
    await sharp(png)
      .resize(Math.max(1, Math.round(width / 8)))
      .png()
      .toBuffer(),
  );
}

/** A work's arrival map at the size its work is painted: one 0–255 time per pixel. */
async function arrivalMap(id: number, expression: 'ink' | 'light', width: number, height: number) {
  const entry = arrivalMaps.maps.find((map) => map.id === id && map.expression === expression)!;
  const path = new URL(`../../public${entry.src}`, import.meta.url);
  return sharp(readFileSync(path))
    .extractChannel(0)
    .resize(width, height, { kernel: 'linear', fit: 'fill' })
    .raw()
    .toBuffer();
}

/** The work's own box inside a screenshot of the plate, in the screenshot's pixels. */
async function workBox(page: Page, clip: { x: number; y: number; width: number }, frame: Pixels) {
  const media = (await page.locator(`${current} .art-media`).boundingBox())!;
  const scale = frame.width / clip.width;
  return {
    x: Math.round((media.x - clip.x) * scale),
    y: Math.round((media.y - clip.y) * scale),
    width: Math.round(media.width * scale),
    height: Math.round(media.height * scale),
  };
}

/**
 * Whether a frame follows the arriving expression's map. Among the pixels where the stills
 * clearly differ and the frame shows one of them untouched, those already showing the arriving
 * still must lie earlier in the map's order than those still showing the departing one. A
 * straight wipe, the other expression's map or a reversed reveal all fail this.
 */
function followsMap(
  frame: Pixels,
  from: Pixels,
  to: Pixels,
  map: Buffer,
  box: { x: number; y: number; width: number; height: number },
  tolerance = 24,
) {
  const arrived: number[] = [];
  const waiting: number[] = [];
  for (let y = 0; y < box.height; y++) {
    for (let x = 0; x < box.width; x++) {
      const i = ((box.y + y) * frame.width + box.x + x) * 3;
      let apart = 0;
      let toFrom = 0;
      let toTo = 0;
      for (let c = 0; c < 3; c++) {
        apart = Math.max(apart, Math.abs(from.data[i + c] - to.data[i + c]));
        toFrom = Math.max(toFrom, Math.abs(frame.data[i + c] - from.data[i + c]));
        toTo = Math.max(toTo, Math.abs(frame.data[i + c] - to.data[i + c]));
      }
      if (apart < 96) continue;
      const time = map[y * box.width + x];
      if (toTo <= tolerance) arrived.push(time);
      else if (toFrom <= tolerance) waiting.push(time);
    }
  }
  const at = (values: number[], share: number) =>
    values.sort((a, b) => a - b)[Math.floor(share * (values.length - 1))];
  return {
    arrived: arrived.length,
    waiting: waiting.length,
    latestArrived: at(arrived, 0.9),
    earliestWaiting: at(waiting, 0.1),
  };
}

/** The share of the plate's pixels that no longer show the Ink still. */
function changed(frame: Pixels, ink: Pixels, tolerance = 24) {
  let moved = 0;
  for (let i = 0; i < frame.data.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      if (Math.abs(frame.data[i + c] - ink.data[i + c]) > tolerance) {
        moved += 1;
        break;
      }
    }
  }
  return moved / (frame.data.length / 3);
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
    // Two slowed crossings, sampled frame by frame, on runners whose screenshots are slow.
    test.slow();
    await watchCanvas(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await workReady(page, id);
    await crossingOffered(page);
    const stage = page.locator(pageStage);
    const plate = page.locator(`${current} .plate`);
    const clip = (await plate.boundingBox())!;
    const shot = async () => pixels(await page.screenshot({ clip }));
    const inkStill = await shot();
    // The crossing is slowed to six seconds here, through its own token, so that a runner whose
    // screenshots take most of a second still samples the middle of the order.
    const slow = await page.addStyleTag({ content: ':root { --t-cross: 6000ms; }' });

    const frames: Pixels[] = [];
    await page.locator(`${current} [data-turn="light"]`).click();
    const started = Date.now();
    while (Date.now() - started < 6300) frames.push(await shot());
    await expect(stage).toHaveAttribute('data-expression', 'light', { timeout: 9000 });
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

    const made = frames.map((frame) => ({ frame, ...composition(frame, inkStill, lightStill) }));
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

    // Mid-way, Light stands where its film drew first, Ink where it has yet to.
    const box = await workBox(page, clip, inkStill);
    const lightMap = await arrivalMap(id, 'light', box.width, box.height);
    const toNight = followsMap(mixed.frame, inkStill, lightStill, lightMap, box);
    expect(toNight.arrived).toBeGreaterThan(200);
    expect(toNight.waiting).toBeGreaterThan(200);
    expect(toNight.latestArrived).toBeLessThanOrEqual(toNight.earliestWaiting + 16);

    // And back to Ink, in the order the current came to rest, at the work's own pace.
    const back: Pixels[] = [];
    await page.locator(`${current} [data-turn="ink"]`).click();
    const returning = Date.now();
    while (Date.now() - returning < 6300) back.push(await shot());
    await expect(stage).toHaveAttribute('data-expression', 'ink', { timeout: 9000 });
    await expect(page.locator('html')).not.toHaveAttribute('data-turning', /./);
    await expect(page.locator(`${pageStage} canvas[data-active]`)).toHaveCount(0);
    await slow.evaluate((node) => (node as HTMLElement).remove());
    const returned = back
      .map((frame) => ({ frame, ...composition(frame, inkStill, lightStill) }))
      .reduce((best, frame) =>
        Math.min(frame.ink, frame.light) > Math.min(best.ink, best.light) ? frame : best,
      );
    for (const frame of back)
      expect(composition(frame, inkStill, lightStill).outside).toBeLessThan(0.04);
    const inkMap = await arrivalMap(id, 'ink', box.width, box.height);
    const toPaper = followsMap(returned.frame, lightStill, inkStill, inkMap, box);
    expect(toPaper.arrived).toBeGreaterThan(200);
    expect(toPaper.waiting).toBeGreaterThan(200);
    expect(toPaper.latestArrived).toBeLessThanOrEqual(toPaper.earliestWaiting + 16);
  });
}

test('a peek released mid-way returns from where it is, never from the far side', async ({
  page,
}) => {
  test.slow();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await workReady(page, 31);
  await crossingOffered(page);
  const clip = (await page.locator(`${current} .plate`).boundingBox())!;
  const shot = async () => coarse(await page.screenshot({ clip }));
  const ink = await shot();
  // Slowed to twelve seconds, so a runner's slow screenshots still see the release itself.
  await page.addStyleTag({ content: ':root { --t-cross: 12000ms; }' });
  // Hold L a while: the night comes in its own order, part of the way along the eased curve.
  await page.keyboard.down('l');
  await expect(page.locator('html')).toHaveAttribute('data-turning', 'time');
  await page.waitForTimeout(4000);
  const held = changed(await shot(), ink);
  expect(held).toBeGreaterThan(0.02);
  await page.keyboard.up('l');
  const after: number[] = [];
  const released = Date.now();
  while (Date.now() - released < 3000) after.push(changed(await shot(), ink));
  // The first frame after the key is let go is near where the night was, not the far side,
  // and from there the night only recedes.
  expect(after[0]).toBeLessThan(held + 0.3);
  for (let i = 1; i < after.length; i++) expect(after[i]).toBeLessThanOrEqual(after[i - 1] + 0.03);
  await expect(page.locator('html')).not.toHaveAttribute('data-turning', /./, { timeout: 12_000 });
  await expect(page.locator(`${pageStage} canvas[data-active]`)).toHaveCount(0);
  expect(changed(await shot(), ink)).toBeLessThan(0.01);
  await expect(page.locator(pageStage)).toHaveAttribute('data-expression', 'ink');
});

test('the crossing comes back after Pause and Play', async ({ page }) => {
  await watchCanvas(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await workReady(page, 31);
  await crossingOffered(page);
  await pauseAmbientMotion(page);
  await expect(page.locator('html')).not.toHaveAttribute('data-crossing', /./);
  await playAmbientMotion(page);
  await expect(page.locator('html')).toHaveAttribute('data-crossing', 'arrival', {
    timeout: 15_000,
  });
  await page.locator(`${current} [data-turn="light"]`).click();
  await expect(page.locator(pageStage)).toHaveAttribute('data-expression', 'light', {
    timeout: 6000,
  });
  expect((await crossingState(page)).painted).toBeGreaterThan(5);
});

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
