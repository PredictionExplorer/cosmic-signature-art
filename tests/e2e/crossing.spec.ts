import { readFileSync } from 'node:fs';
import { expect, syntheticFinger, test, type Page } from './fixtures';
import sharp from 'sharp';
import { catalogs } from '../../src/lib/i18n/messages';
import { pauseAmbientMotion, playAmbientMotion } from './helpers';
import { recordSheet, sheetRecorded, sheetTurned } from './sheet-record';

/*
  The Turn in the order the work was made (docs/turn-one-sheet.md).

  Every Turn is one sheet turned by one front: by the word and the keys, by a finger, by a key
  held and let go. The front leaves the work's own first marks and crosses the whole first
  screen; ahead of it the plate is the still it leaves and behind it the still it brings, on
  that still's own ground, and the two grounds are mixed nowhere but across the front's few
  pixels. At either end the plate is the published still. The straight seam remains wherever the
  sheet cannot be painted, and a still preference makes the Turn one frame.

  These tests look at the pixels: the order the front follows against the work's own arrival
  map, and what each frame is made of. That the head, the strip and the page take the same front
  is held in turn-sheet.spec.ts, read back in the page itself.
*/

const t = catalogs.en;
const pageStage = '[data-artwork-stage="page"]:visible';
const current = `${pageStage} [data-layer-state="current"]`;
// The crossing's own canvas: the plate also holds the canvas its still is run back on.
const crossing = 'canvas[class*="crossing"]';
const crossingCanvas = `${pageStage} ${crossing}`;
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
  // The plate's own keys are heard by the plate, which is hydrated after the page's head.
  await expect(page.locator('html')).toHaveAttribute('data-plate-keys', 'ready');
}

/**
 * Hold every film back, unanswered, so each plate rests on its still. Where a film plays, the
 * page fades it in over the still once a Turn has landed, and the next Turn leaves from its
 * frame; a film that never arrives is never shown, and never reported as failed.
 */
async function holdFilmsBack(page: Page) {
  await page.route('**/*.mp4', () => {});
}

/**
 * Count, from the first script on, every frame on which the sheet's canvas is painted, and
 * every frame on which the room was shaped the old ways: a layer or the head's overlay clipped
 * to a front of its own, or faded by a share. The sheet does neither: its canvas is the ground.
 */
async function watchCanvas(page: Page) {
  await page.addInitScript(() => {
    const state = { painted: 0, shaped: 0 };
    Object.assign(window, { __crossing: state });
    const look = () => {
      if (document.querySelector('[data-artwork-stage="page"] canvas[data-active]'))
        state.painted += 1;
      const shaped = [
        document.querySelector<HTMLElement>('.head-overlay'),
        ...document.querySelectorAll<HTMLElement>('[data-artwork-stage="page"] [data-layer]'),
      ].some(
        (element) =>
          !!element &&
          (element.style.clipPath !== '' ||
            element.style.opacity !== '' ||
            element.style.backgroundColor !== ''),
      );
      if (shaped) state.shaped += 1;
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
}

function crossingState(page: Page) {
  return page.evaluate(
    () => (window as unknown as { __crossing: { painted: number; shaped: number } }).__crossing,
  );
}

/** Whatever the sheet set on the page and has not given back. */
function leftOver(page: Page) {
  return page.evaluate(() => [
    ...[
      ...document.querySelectorAll<HTMLElement>(
        '.head-overlay, [data-artwork-stage="page"] [data-layer], [data-artwork-stage="page"] [data-plate-ground]',
      ),
    ]
      .flatMap((element) =>
        ['clip-path', 'opacity', 'background-color', 'transition'].map((name) =>
          element.style.getPropertyValue(name),
        ),
      )
      .filter(Boolean),
    ...[
      ...document.querySelectorAll(
        '[data-sheet], [data-sheet-out], [data-sheet-fill], [data-sheet-unlined], [data-sheet-active]',
      ),
    ].map((element) => `${element.tagName.toLowerCase()} still worn`),
  ]);
}

type Pixels = { data: Buffer; width: number; height: number };
type Box = { x: number; y: number; width: number; height: number };
type Rgb = [number, number, number];

/**
 * Keep a Turn's frames in the page itself, as the sheet paints them: its canvas, which is the
 * whole stage while a Turn travels, copied every `every` milliseconds. A screenshot takes over a
 * second where WebGL draws without a GPU; the page's own record misses nothing it painted.
 */
async function keepFrames(page: Page, every: number) {
  await page.locator(pageStage).evaluate(
    (stage, { painting, every }) => {
      const kept: HTMLCanvasElement[] = [];
      Object.assign(window, { __kept: kept });
      let last = -Infinity;
      const look = (now: number) => {
        const canvas = stage.querySelector<HTMLCanvasElement>(painting);
        // Between its first frame and the Turn's end the canvas holds the frame last painted.
        const turning = canvas && document.documentElement.hasAttribute('data-turning');
        if (turning && now - last >= every) {
          last = now;
          const copy = document.createElement('canvas');
          copy.width = canvas.width;
          copy.height = canvas.height;
          copy.getContext('2d')!.drawImage(canvas, 0, 0);
          kept.push(copy);
        }
        requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    },
    { painting: `${crossing}[data-active]`, every },
  );
}

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

/** One region of a frame, as a frame of its own. */
function crop(frame: Pixels, box: Box): Pixels {
  const data = Buffer.alloc(box.width * box.height * 3);
  for (let y = 0; y < box.height; y++)
    frame.data.copy(
      data,
      y * box.width * 3,
      ((box.y + y) * frame.width + box.x) * 3,
      ((box.y + y) * frame.width + box.x + box.width) * 3,
    );
  return { data, width: box.width, height: box.height };
}

/**
 * A frame at an eighth of its size, block by block. After a Turn the page may move a still from
 * the work's rung to its original, which resamples every fine line; averaged, those vanish.
 */
function shrink(frame: Pixels, factor = 8): Pixels {
  const width = Math.floor(frame.width / factor);
  const height = Math.floor(frame.height / factor);
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let dy = 0; dy < factor; dy++)
          for (let dx = 0; dx < factor; dx++)
            sum += frame.data[((y * factor + dy) * frame.width + x * factor + dx) * 3 + c];
        data[(y * width + x) * 3 + c] = Math.round(sum / (factor * factor));
      }
    }
  }
  return { data, width, height };
}

/** How far apart two frames of one size are: the mean difference of their channels, in levels. */
function distance(a: Pixels, b: Pixels) {
  let sum = 0;
  for (let i = 0; i < a.data.length; i++) sum += Math.abs(a.data[i] - b.data[i]);
  return sum / a.data.length;
}

/**
 * A shot once the page has settled its still: it eases from its preview to the work's own rung
 * and re-rasterises the finest lines as the decode settles, for some seconds after it loads. Two
 * shots in a row that agree are the still at rest.
 */
async function settled(page: Page, shot: () => Promise<Pixels>, within = 12_000) {
  let last = await shot();
  const started = Date.now();
  while (Date.now() - started < within) {
    await page.waitForTimeout(300);
    const next = await shot();
    if (distance(next, last) < 0.2) return next;
    last = next;
  }
  return last;
}

const lum = (data: Buffer, i: number) =>
  0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];

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

/**
 * The stage as one screenshot: everything the sheet's canvas covers (the plate, its walls and
 * the strip) as far as the screen shows it, with the plate and the work as boxes inside the
 * shot (in CSS pixels) and the sheet's own tone.
 */
async function stageOf(page: Page) {
  const box = async (selector: string) => (await page.locator(selector).first().boundingBox())!;
  const stage = await page.locator(crossingCanvas).evaluate((canvas) => {
    const rect = canvas.parentElement!.getBoundingClientRect();
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  });
  const plate = await box(`${current} .plate`);
  const work = await box(`${current} .art-media`);
  const paper = (
    await page
      .locator(`${pageStage} [data-layer="ink"] [data-plate-ground]`)
      .evaluate((element) => getComputedStyle(element).backgroundColor)
  )
    .match(/[\d.]+/g)!
    .slice(0, 3)
    .map(Number) as Rgb;
  const viewport = page.viewportSize()!;
  const clip = {
    x: stage.x,
    y: stage.y,
    width: stage.width,
    height: Math.min(viewport.height, stage.y + stage.height) - stage.y,
  };
  const inside = (part: Box) => ({ ...part, x: part.x - clip.x, y: part.y - clip.y });
  return { clip, stage, plate: inside(plate), work: inside(work), paper };
}

/** A box in CSS pixels, in a frame's own pixels. */
function scaled(box: Box, scale: number): Box {
  return {
    x: Math.round(box.x * scale),
    y: Math.round(box.y * scale),
    width: Math.round(box.width * scale),
    height: Math.round(box.height * scale),
  };
}

/**
 * The pixels of a region where the ground lies bare: the sheet in the Ink still and, where the
 * Light still is given, its black there too. Every third pixel each way is enough.
 */
function bareGround(ink: Pixels, light: Pixels | null, region: Box, paper: Rgb) {
  const sheet = 0.2126 * paper[0] + 0.7152 * paper[1] + 0.0722 * paper[2];
  const found: number[] = [];
  for (let y = 0; y < region.height; y += 3) {
    for (let x = 0; x < region.width; x += 3) {
      const i = ((region.y + y) * ink.width + region.x + x) * 3;
      if (lum(ink.data, i) < 0.92 * sheet) continue;
      if (light && Math.max(light.data[i], light.data[i + 1], light.data[i + 2]) > 10) continue;
      found.push(i);
    }
  }
  return found;
}

/**
 * What a frame's bare ground is made of: the shares of it that are the sheet, the night, and
 * anything between. A front leaves a few pixels in a hundred between, across its edge; a ground
 * faded as one is all between.
 */
function groundsOf(frame: Pixels, bare: number[], paper: Rgb) {
  const sheet = 0.2126 * paper[0] + 0.7152 * paper[1] + 0.0722 * paper[2];
  let onPaper = 0;
  let onNight = 0;
  for (const i of bare) {
    const share = lum(frame.data, i) / sheet;
    if (share > 0.8) onPaper += 1;
    else if (share < 0.2) onNight += 1;
  }
  const count = Math.max(1, bare.length);
  return {
    paper: onPaper / count,
    night: onNight / count,
    between: (bare.length - onPaper - onNight) / count,
  };
}

/**
 * Whether a frame follows an order's map. Among the pixels where `from` and `to` clearly differ
 * and the frame shows one of them untouched, those already showing `to` must lie earlier in the
 * map's order than those still showing `from`. A straight wipe, the other expression's map or a
 * reversed reveal all fail this.
 */
function followsMap(
  frame: Pixels,
  from: Pixels,
  to: Pixels,
  map: Buffer,
  box: Box,
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

/** The frame among some that shows most of both sides of an order: its arrived and its waiting. */
function bestOf<T extends { arrived: number; waiting: number }>(found: T[]) {
  return found.reduce((best, next) =>
    Math.min(next.arrived, next.waiting) > Math.min(best.arrived, best.waiting) ? next : best,
  );
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

type Size = { width: number; height: number };

/** A canvas's picture, from its data URL, at the stage's size in a frame. */
async function pictured(url: string, size: Size) {
  return pixels(
    await sharp(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'))
      .resize(size.width, size.height, { fit: 'fill' })
      .png()
      .toBuffer(),
  );
}

/**
 * The last frame the sheet's canvas painted, at the stage's size in a frame. The canvas keeps
 * its drawing buffer, so after a Turn it still holds the frame it ended on.
 */
async function lastPainted(page: Page, size: Size) {
  const url = await page
    .locator(crossingCanvas)
    .evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL('image/png'));
  return pictured(url, size);
}

/** The frames the page has kept, each at the stage's size, cut to what the screen shows of it. */
async function framesKept(page: Page, size: Size, seen: Box) {
  const frames: Pixels[] = [];
  const count = await page.evaluate(
    () => (window as unknown as { __kept: HTMLCanvasElement[] }).__kept.length,
  );
  // One at a time: each is a picture the size of the stage.
  for (let i = 0; i < count; i++) {
    const url = await page.evaluate(
      (index) =>
        (window as unknown as { __kept: HTMLCanvasElement[] }).__kept[index].toDataURL('image/png'),
      i,
    );
    frames.push(crop(await pictured(url, size), seen));
  }
  await page.evaluate(() => {
    (window as unknown as { __kept: HTMLCanvasElement[] }).__kept.length = 0;
  });
  return frames;
}

/**
 * Turn by the word. The Turn's frames are the ones the page kept (`keepFrames`); the stage is
 * also seen from outside, by as many screenshots as the runner makes once the page has kept a
 * few. None is asked for sooner: a screenshot holds a page without a GPU still for about a
 * second, and by then the record holds the front on its way.
 */
async function turnBy(
  page: Page,
  word: 'ink' | 'light',
  cross: number,
  stage: Size,
  seen: Box,
  shot: () => Promise<Pixels>,
) {
  const shots: Pixels[] = [];
  await page.locator(`${current} [data-turn="${word}"]`).click();
  const started = Date.now();
  await page.waitForFunction(
    () => (window as unknown as { __kept: HTMLCanvasElement[] }).__kept.length >= 4,
    null,
    { polling: 'raf', timeout: cross + 3000 },
  );
  while (Date.now() - started < cross - 500) shots.push(await shot());
  await expect(page.locator(pageStage)).toHaveAttribute('data-expression', word, {
    timeout: cross + 3000,
  });
  await expect(page.locator('html')).not.toHaveAttribute('data-turning', /./);
  // The canvas rests, and the page is its own again.
  await expect(page.locator(`${pageStage} canvas[data-active]`)).toHaveCount(0);
  expect(await leftOver(page)).toEqual([]);
  return { kept: await framesKept(page, stage, seen), shots };
}

for (const id of [31, 23, 35]) {
  test(`№ ${String(id).padStart(3, '0')} turns in its own order, from one still to the other, with no ground between`, async ({
    page,
  }) => {
    // Two slowed Turns, and every frame the page kept of them brought back as a picture.
    test.slow();
    await watchCanvas(page);
    // Both Turns leave a still at rest; one that leaves a playing film is the canvas's own test.
    await holdFilmsBack(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await workReady(page, id);
    await crossingOffered(page);
    const room = await stageOf(page);
    const shot = async () => pixels(await page.screenshot({ clip: room.clip }));
    const inkStill = await settled(page, shot);
    const scale = inkStill.width / room.clip.width;
    // The whole stage in a frame's pixels, what the screen shows of it, the plate and the work.
    const stage = {
      width: Math.round(room.stage.width * scale),
      height: Math.round(room.stage.height * scale),
    };
    const seen = { x: 0, y: 0, width: inkStill.width, height: inkStill.height };
    const plate = scaled(room.plate, scale);
    const box = scaled(room.work, scale);
    // The Turn is slowed through its own token to six seconds, and the page keeps sixteen of its
    // frames: many of them with the front part-way, on the slowest runner.
    const cross = 6000;
    const slow = await page.addStyleTag({ content: `:root { --t-cross: ${cross}ms; }` });
    await keepFrames(page, cross / 16);

    /**
     * The checks every frame of a Turn passes, in either direction, whether the page kept it or
     * a screenshot caught it: it is made of the two stills and nothing else, and its bare ground
     * is the sheet here and the night there, never a ground between them.
     */
    const turned = (frames: Pixels[], ink: Pixels, light: Pixels, bare: number[]) => {
      // On the plate: the strip's words are the page's own, set over the canvas, so a frame the
      // page kept of its canvas has bare ground where a still has a word.
      for (const frame of frames)
        expect(
          composition(crop(frame, plate), crop(ink, plate), crop(light, plate)).outside,
        ).toBeLessThan(0.04);
      const grounds = frames.map((frame) => groundsOf(frame, bare, room.paper));
      for (const ground of grounds) expect(ground.between).toBeLessThan(0.12);
      return grounds;
    };
    /** Frames on which both grounds stood at once: a front on its way. */
    const fronts = (grounds: { paper: number; night: number }[]) =>
      grounds.filter((ground) => ground.paper > 0.1 && ground.night > 0.1).length;

    // Toward night: the front leaves the first marks the Light film drew.
    const toNight = await turnBy(page, 'light', cross, stage, seen, shot);
    const lightStill = await settled(page, shot);
    const bare = bareGround(inkStill, lightStill, seen, room.paper);
    expect(bare.length).toBeGreaterThan(500);
    expect(fronts(turned(toNight.kept, inkStill, lightStill, bare))).toBeGreaterThan(1);
    turned(toNight.shots, inkStill, lightStill, bare);
    const lightMap = await arrivalMap(id, 'light', box.width, box.height);
    // Where the Light still shows untouched lies earlier in its order than where Ink's still does.
    const rising = bestOf(
      toNight.kept.map((frame) => followsMap(frame, inkStill, lightStill, lightMap, box)),
    );
    expect(rising.arrived).toBeGreaterThan(200);
    expect(rising.waiting).toBeGreaterThan(200);
    expect(rising.latestArrived).toBeLessThanOrEqual(rising.earliestWaiting + 16);
    // At rest the plate is the Light still: the canvas ended on it, as faithfully as it paints.
    // (The plate alone: the strip's words are the page's, set over the canvas.)
    const endedNight = crop(crop(await lastPainted(page, stage), seen), plate);
    expect(distance(endedNight, crop(lightStill, plate))).toBeLessThan(3);
    expect(distance(endedNight, crop(inkStill, plate))).toBeGreaterThan(30);

    // Toward paper, from the Light still at rest (its film, held back, never came): the front
    // leaves where the ink first came to rest.
    await expect(page.locator(`${current} video.has-frame`)).toHaveCount(0);
    const toPaper = await turnBy(page, 'ink', cross, stage, seen, shot);
    await slow.evaluate((node) => (node as HTMLElement).remove());
    expect(fronts(turned(toPaper.kept, inkStill, lightStill, bare))).toBeGreaterThan(1);
    turned(toPaper.shots, inkStill, lightStill, bare);
    const inkMap = await arrivalMap(id, 'ink', box.width, box.height);
    const blooming = bestOf(
      toPaper.kept.map((frame) => followsMap(frame, lightStill, inkStill, inkMap, box)),
    );
    expect(blooming.arrived).toBeGreaterThan(200);
    expect(blooming.waiting).toBeGreaterThan(200);
    expect(blooming.latestArrived).toBeLessThanOrEqual(blooming.earliestWaiting + 16);
    const endedPaper = crop(crop(await lastPainted(page, stage), seen), plate);
    expect(distance(endedPaper, crop(inkStill, plate))).toBeLessThan(3);
    expect(distance(endedPaper, crop(lightStill, plate))).toBeGreaterThan(30);
    // And the page itself is the Ink still again, as it was before either Turn. (A layer left
    // part-way would lie several levels off; a still moved to its original, under one.)
    const again = await settled(page, shot);
    expect(distance(shrink(again), shrink(inkStill))).toBeLessThan(1.5);

    // Every frame was painted by the canvas, and the room was never shaped another way.
    const painted = await crossingState(page);
    expect(painted.painted).toBeGreaterThan(5);
    expect(painted.shaped).toBe(0);
  });
}

test('a finger’s Turn keeps the crossing pixel by pixel, from the two stills and nothing else', async ({
  page,
  isMobile,
  faults,
}) => {
  faults.allow(syntheticFinger);
  test.skip(!isMobile, 'Drag-to-Turn answers touch only.');
  test.slow();
  await watchCanvas(page);
  await holdFilmsBack(page);
  await workReady(page, 31);
  const stage = page.locator(pageStage);
  const clip = (await page.locator(`${current} .plate`).boundingBox())!;
  const shot = async () => pixels(await page.screenshot({ clip }));
  // Both stills at rest, by Turns that are one frame under a still preference.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const inkStill = await settled(page, shot);
  await page.locator(`${current} [data-turn="light"]`).click();
  await expect(stage).toHaveAttribute('data-expression', 'light');
  await expect(page.locator('html')).not.toHaveAttribute('data-turning', /./);
  const lightStill = await settled(page, shot);
  await page.locator(`${current} [data-turn="ink"]`).click();
  await expect(stage).toHaveAttribute('data-expression', 'ink');
  await expect(page.locator('html')).not.toHaveAttribute('data-turning', /./);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await crossingOffered(page);
  // A finger carries the seam a third of the way across and holds it there.
  const finger = (type: string, x: number) =>
    page.locator(current).evaluate(
      (element, [kind, share]) => {
        const turn = element.closest('[data-expression]')!;
        const rect = turn.getBoundingClientRect();
        turn.dispatchEvent(
          new PointerEvent(kind as string, {
            bubbles: true,
            pointerId: 7,
            pointerType: 'touch',
            isPrimary: true,
            clientX: rect.left + rect.width * (share as number),
            clientY: rect.top + rect.height / 2,
          }),
        );
      },
      [type, x] as const,
    );
  await finger('pointerdown', 0.95);
  for (let step = 1; step <= 6; step += 1) await finger('pointermove', 0.95 - (0.33 * step) / 6);
  await expect(page.locator('html')).toHaveAttribute('data-turning', 'drag');
  await expect(page.locator(`${pageStage} canvas[data-active]`)).toHaveCount(1);
  const held = [await shot(), await shot()];
  // Every pixel is one still or the other, or a mix across the soft front; both show, untouched.
  for (const frame of held)
    expect(composition(frame, inkStill, lightStill).outside).toBeLessThan(0.04);
  const made = composition(held[1], inkStill, lightStill);
  expect(made.ink).toBeGreaterThan(0.005);
  expect(made.light).toBeGreaterThan(0.005);
  // In Light's own order, as the night the finger brings arrives.
  const media = (await page.locator(`${current} .art-media`).boundingBox())!;
  const scale = held[1].width / clip.width;
  const box = scaled({ ...media, x: media.x - clip.x, y: media.y - clip.y }, scale);
  const order = followsMap(
    held[1],
    inkStill,
    lightStill,
    await arrivalMap(31, 'light', box.width, box.height),
    box,
  );
  expect(order.arrived).toBeGreaterThan(200);
  expect(order.waiting).toBeGreaterThan(200);
  expect(order.latestArrived).toBeLessThanOrEqual(order.earliestWaiting + 16);
  // Let go short of the Turn, the seam springs back to the Ink still.
  await finger('pointerup', 0.62);
  await expect(page.locator('html')).not.toHaveAttribute('data-turning', /./, { timeout: 6000 });
  await expect(stage).toHaveAttribute('data-expression', 'ink');
  // Painted by the sheet throughout, and never shaped another way.
  const seen = await crossingState(page);
  expect(seen.painted).toBeGreaterThan(0);
  expect(seen.shaped).toBe(0);
});

test('a peek released mid-way returns from where it is, never from the far side', async ({
  page,
}) => {
  test.slow();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await workReady(page, 31);
  await crossingOffered(page);
  const clip = (await page.locator(`${current} .plate`).boundingBox())!;
  const shot = async () => coarse(await page.screenshot({ clip }));
  const ink = await settled(page, shot);
  // Slowed to twelve seconds, so the key is let go well inside the front's travel.
  await page.addStyleTag({ content: ':root { --t-cross: 12000ms; }' });
  // The page keeps the front's course itself, frame by frame, and says when a key was let go:
  // a screenshot first would take seconds on a runner without a GPU, and the front would run on.
  await recordSheet(page, { scope: 'page', toward: 'night', every: 0 });
  await page.keyboard.down('l');
  await expect(page.locator('html')).toHaveAttribute('data-turning', 'time');
  // Hold L until the front has passed a fifth of the bare ground the screen shows.
  await expect.poll(() => sheetTurned(page), { timeout: 20_000 }).toBeGreaterThan(0.2);
  await page.keyboard.up('l');
  await expect(page.locator('html')).not.toHaveAttribute('data-turning', /./, { timeout: 20_000 });
  const record = await sheetRecorded(page);
  const letGo = record.released!;
  const there = record.course.filter(([time]) => time <= letGo).at(-1)![1];
  const back = record.course.filter(([time]) => time > letGo).map(([, share]) => share);
  expect(there).toBeGreaterThan(0.2);
  // From where it stood the front only went back: no further on than a frame or two of a slow
  // runner's travel, never to the far side, and all the way to where it began.
  expect(Math.max(...back)).toBeLessThan(there + 0.1);
  for (let i = 1; i < back.length; i++) expect(back[i]).toBeLessThanOrEqual(back[i - 1] + 0.02);
  expect(back.at(-1)).toBeLessThan(0.02);
  expect(record.left).toEqual([]);
  await expect(page.locator(`${pageStage} canvas[data-active]`)).toHaveCount(0);
  expect(distance(await shot(), ink)).toBeLessThan(1);
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
  await expect(dialog.getByRole('status')).toHaveText(`${t.analysisNotWork} · ${t.whenInk}`);
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
