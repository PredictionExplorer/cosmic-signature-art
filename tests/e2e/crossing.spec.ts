import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { catalogs } from '../../src/lib/i18n/messages';
import { pauseAmbientMotion, playAmbientMotion } from './helpers';

/*
  The Turn in the order the work was made (docs/third-physics-phase-b.md; docs/first-light.md,
  "The Turn as a change of material, as built").

  A Turn by time between the two whole stills changes material. The ground warms or cools as
  one, never as a front; the light drains or rises and the ink blooms or lifts, each in the
  work's own order; and the running head and the strip take the ground's colour on the same
  frame. At either end the plate is the published still. A finger's Turn keeps the crossing
  pixel by pixel: every frame is the two stills, each pixel one of them or, on the soft front, a
  mix. The straight seam remains wherever the crossing cannot be painted or motion is still.
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
 * Count, from the first script on, every frame on which the crossing's canvas is painted and
 * how it treats the room: by a front (the head's and the strip's clips are polygons) or by the
 * ground (the head's overlay and the night's words shown by a share, unclipped).
 */
async function watchCanvas(page: Page) {
  await page.addInitScript(() => {
    const state = { painted: 0, headFront: 0, stripFront: 0, headGround: 0, stripGround: 0 };
    Object.assign(window, { __crossing: state });
    const share = (value: string) => value !== '' && Number(value) > 0 && Number(value) < 1;
    const look = () => {
      if (document.querySelector('canvas[data-active]')) state.painted += 1;
      const head = document.querySelector<HTMLElement>('.head-overlay');
      const night = document.querySelector<HTMLElement>(
        '[data-artwork-stage="page"] [data-layer="light"]',
      );
      if (head?.style.clipPath.startsWith('polygon')) state.headFront += 1;
      if (night?.style.clipPath.startsWith('polygon')) state.stripFront += 1;
      if (head?.style.clipPath === 'none' && share(head.style.opacity)) state.headGround += 1;
      if (night?.style.clipPath === 'none' && night.style.opacity !== '') state.stripGround += 1;
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
          __crossing: {
            painted: number;
            headFront: number;
            stripFront: number;
            headGround: number;
            stripGround: number;
          };
        }
      ).__crossing,
  );
}

/** Whatever the crossing set on the page's own elements and has not given back. */
function leftOver(page: Page) {
  return page.evaluate(() =>
    [
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
  );
}

/**
 * How far the walls lay toward the paper, 0 the night and 1 the sheet: now, on each frame, and
 * when a key was let go.
 */
type Walls = { share: number; frames: [number, number][]; released: [number, number] | null };

/**
 * Read the walls in the page itself, on every frame, and where they lay when a key was let go.
 * The crossing lays the room's ground on the same frame as the plate's, and the page reads it at
 * once, where a screenshot takes seconds on a runner without a GPU.
 */
async function watchWalls(page: Page, paper: Rgb) {
  await page
    .locator(`${pageStage} [data-layer="ink"] [data-plate-ground]`)
    .evaluate((wall, sheet) => {
      const luma = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const share = () =>
        luma(
          getComputedStyle(wall)
            .backgroundColor.match(/[\d.]+/g)!
            .slice(0, 3)
            .map(Number),
        ) / luma(sheet);
      const walls: Walls = { share: share(), frames: [], released: null };
      Object.assign(window, { __walls: walls });
      const letGo = () => {
        walls.released ??= [performance.now(), share()];
      };
      addEventListener('keyup', letGo, { capture: true });
      const look = (now: number) => {
        walls.share = share();
        walls.frames.push([now, walls.share]);
        requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    }, paper);
}

function wallsOf(page: Page) {
  return page.evaluate(() => (window as unknown as { __walls: Walls }).__walls);
}

type Pixels = { data: Buffer; width: number; height: number };
type Box = { x: number; y: number; width: number; height: number };
type Rgb = [number, number, number];

/** One frame of a Turn: the plate's pixels, and the ground the running head and the strip wore. */
type Frame = { plate: Pixels; bands: Rgb[] };

/** A frame as the page keeps it: how far its walls lay toward the paper, and its canvas, copied. */
type Kept = { ground: number; plate: HTMLCanvasElement; bands: Rgb[] };

/**
 * Keep a Turn's frames in the page itself, as the crossing paints them: its canvas, which is the
 * plate while a Turn travels, and the ground the running head and the strip wear, each composed
 * from the styles that frame laid. A frame is kept every `every` milliseconds, and whenever the
 * ground has moved a quarter of its way, so the record holds the ground's passage however a
 * runner's frames fall. A screenshot takes over a second where WebGL draws without a GPU, longer
 * than a slowed Turn's ground lies mid-way; the page's own record misses nothing it painted.
 * The walls are read by `watchWalls`, which is begun first.
 */
async function keepFrames(page: Page, every: number) {
  await page.locator(pageStage).evaluate(
    (stage, { painting, every }) => {
      const kept: Kept[] = [];
      Object.assign(window, { __kept: kept });
      const walls = (window as unknown as { __walls: Walls }).__walls;
      const styleOf = (selector: string, within: ParentNode = stage) =>
        getComputedStyle(within.querySelector(selector)!);
      const ground = (style: CSSStyleDeclaration) =>
        style.backgroundColor
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number);
      /** One ground with another laid over it by a share; a clipped one is a front, and no ground. */
      const laid = (beneath: number[], over: number[], cover: CSSStyleDeclaration) =>
        (cover.display === 'none' || cover.clipPath !== 'none'
          ? beneath
          : beneath.map(
              (channel, c) => channel + (over[c] - channel) * Number(cover.opacity),
            )) as Rgb;
      // The head's overlay lies over the head, and the night layer, strip and all, over the paper's.
      const head = () => {
        const overlay = styleOf('.head-overlay', document);
        return laid(ground(styleOf('.site-header', document)), ground(overlay), overlay);
      };
      const strip = () =>
        laid(
          ground(styleOf('[data-layer="ink"] [data-plate-ground]')),
          ground(styleOf('[data-layer="light"] [data-plate-ground]')),
          styleOf('[data-layer="light"]'),
        );
      let last = { at: -Infinity, ground: walls.share };
      const look = (now: number) => {
        const canvas = stage.querySelector<HTMLCanvasElement>(painting);
        // Between its first frame and the Turn's end the canvas holds the frame the styles were
        // laid with: the crossing paints and lays them in one callback.
        const turning = canvas && document.documentElement.hasAttribute('data-turning');
        const due = now - last.at >= every || Math.abs(walls.share - last.ground) >= 0.25;
        if (turning && due) {
          last = { at: now, ground: walls.share };
          const plate = document.createElement('canvas');
          plate.width = canvas.width;
          plate.height = canvas.height;
          plate.getContext('2d')!.drawImage(canvas, 0, 0);
          kept.push({ ground: walls.share, plate, bands: [head(), strip()] });
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

/** A frame of one colour throughout, the size of another. */
function flat(like: Pixels, colour: Rgb): Pixels {
  const data = Buffer.alloc(like.width * like.height * 3);
  for (let i = 0; i < data.length; i += 3) data.set(colour.map(Math.round), i);
  return { data, width: like.width, height: like.height };
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
 * The room around the plate as one screenshot: the running head above it, the plate with its
 * walls and the work, and the strip below it, each as a box inside the shot (in CSS pixels),
 * with the sheet's own tone the plate is hung on.
 */
async function roomOf(page: Page) {
  const box = async (selector: string) => (await page.locator(selector).first().boundingBox())!;
  const head = await box('.site-header');
  const plate = await box(`${current} .plate`);
  const strip = await box(`${current} .strip`);
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
  const top = Math.max(0, Math.min(head.y, plate.y));
  const bottom = Math.min(viewport.height, strip.y + strip.height);
  const clip = { x: 0, y: top, width: viewport.width, height: bottom - top };
  const inside = (part: Box) => ({ ...part, x: part.x - clip.x, y: part.y - clip.y });
  return {
    clip,
    head: inside(head),
    plate: inside(plate),
    strip: strip.y + strip.height <= bottom ? inside(strip) : null,
    work: inside(work),
    paper,
  };
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
 * How far a frame's ground lies toward the paper, 0 the night and 1 the sheet: the median over
 * the bare ground of the frame against the Ink still, and the spread between its quartiles. A
 * change of material lays one ground; a front lays the two, so its spread is wide.
 */
function groundOf(frame: Pixels, ink: Pixels, bare: number[]) {
  const shares = bare
    .map((i) => lum(frame.data, i) / Math.max(1, lum(ink.data, i)))
    .sort((a, b) => a - b);
  const at = (share: number) => shares[Math.floor(share * (shares.length - 1))];
  return { share: at(0.5), spread: at(0.75) - at(0.25) };
}

/** The colour most of a band shows, channel by channel: its ground, beneath its words. */
function bandColour(frame: Pixels, band: Box): Rgb {
  const channels: number[][] = [[], [], []];
  for (let y = 0; y < band.height; y += 2) {
    for (let x = 0; x < band.width; x += 2) {
      const i = ((band.y + y) * frame.width + band.x + x) * 3;
      for (let c = 0; c < 3; c++) channels[c].push(frame.data[i + c]);
    }
  }
  return channels.map((values) => values.sort((a, b) => a - b)[values.length >> 1]) as Rgb;
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

/** A canvas's picture, from its data URL, at the plate's size in a frame. */
async function pictured(url: string, size: Size) {
  return pixels(
    await sharp(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'))
      .resize(size.width, size.height, { fit: 'fill' })
      .png()
      .toBuffer(),
  );
}

/**
 * The last frame the crossing's canvas painted, at the plate's size in a frame. The canvas
 * keeps its drawing buffer, so after a Turn it still holds the frame it ended on.
 */
async function lastPainted(page: Page, size: Size) {
  const url = await page
    .locator(crossingCanvas)
    .evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL('image/png'));
  return pictured(url, size);
}

/** The frames the page has kept, each at the plate's size in a frame; it holds none of them after. */
async function framesKept(page: Page, size: Size) {
  const frames: Frame[] = [];
  const count = await page.evaluate(() => (window as unknown as { __kept: Kept[] }).__kept.length);
  // One at a time: each is a picture the size of the plate.
  for (let i = 0; i < count; i++) {
    const { url, bands } = await page.evaluate((index) => {
      const { plate, bands } = (window as unknown as { __kept: Kept[] }).__kept[index];
      return { url: plate.toDataURL('image/png'), bands };
    }, i);
    frames.push({ plate: await pictured(url, size), bands });
  }
  await page.evaluate(() => {
    (window as unknown as { __kept: Kept[] }).__kept.length = 0;
  });
  return frames;
}

/**
 * Turn by the word. The Turn's frames are the ones the page kept (`keepFrames`); the room is
 * also seen from outside, by as many screenshots as the runner makes once the page has kept a
 * frame whose ground is a quarter of its way. None is asked for sooner: a screenshot holds a
 * page without a GPU still for about a second, and by then the record holds the ground mid-way.
 */
async function turnBy(
  page: Page,
  word: 'ink' | 'light',
  cross: number,
  plate: Size,
  seen: () => Promise<Frame>,
) {
  const shots: Frame[] = [];
  await page.locator(`${current} [data-turn="${word}"]`).click();
  const started = Date.now();
  await page.waitForFunction(
    (night) =>
      (window as unknown as { __kept: Kept[] }).__kept.some(({ ground }) =>
        night ? ground <= 0.75 : ground >= 0.25,
      ),
    word === 'light',
    { polling: 'raf', timeout: cross + 3000 },
  );
  while (Date.now() - started < cross + 300) shots.push(await seen());
  await expect(page.locator(pageStage)).toHaveAttribute('data-expression', word, {
    timeout: cross + 3000,
  });
  await expect(page.locator('html')).not.toHaveAttribute('data-turning', /./);
  // The canvas rests, and the room is the seam's own again.
  await expect(page.locator(`${pageStage} canvas[data-active]`)).toHaveCount(0);
  expect(await leftOver(page)).toEqual([]);
  return { kept: await framesKept(page, plate), shots };
}

for (const id of [31, 23, 35]) {
  test(`№ ${String(id).padStart(3, '0')} changes its material in its own order, and the room with it`, async ({
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
    const room = await roomOf(page);
    const shot = async () => pixels(await page.screenshot({ clip: room.clip }));
    const inkShot = await settled(page, shot);
    const scale = inkShot.width / room.clip.width;
    const plate = scaled(room.plate, scale);
    const inkStill = crop(inkShot, plate);
    // The work on its plate, and the bands a screenshot shows beside the plate.
    const work = scaled(room.work, scale);
    const box = { ...work, x: work.x - plate.x, y: work.y - plate.y };
    const bands = [room.head, room.strip].flatMap((band) => (band ? [scaled(band, scale)] : []));
    /** The room from outside, as one frame: its plate, and the ground beneath each band's words. */
    const seen = async (): Promise<Frame> => {
      const frame = await shot();
      return { plate: crop(frame, plate), bands: bands.map((band) => bandColour(frame, band)) };
    };
    // The Turn is slowed through its own token to six seconds, so its ground lies between a
    // fifth and four fifths of its way for over a second: many frames of the slowest runner. The
    // page keeps sixteen of the Turn's frames, and the steps of the ground's change besides.
    const cross = 6000;
    const slow = await page.addStyleTag({ content: `:root { --t-cross: ${cross}ms; }` });
    await watchWalls(page, room.paper);
    await keepFrames(page, cross / 16);

    /** The ground's colour at a share of the way from the night to the sheet. */
    const tone = (share: number) => room.paper.map((channel) => channel * share) as Rgb;
    /** A ground mid-way between night and paper. */
    const midway = (ground: { share: number }) => ground.share > 0.2 && ground.share < 0.8;

    /**
     * The checks every frame of a change of material passes, in either direction: the ground is
     * one, never a front, and moves one way only, and the head and the strip wear it on the same
     * frame. Each frame's ground, for the checks that follow.
     */
    const changed = (frames: Frame[], bare: number[], toward: 'night' | 'paper') => {
      const grounds = frames.map((frame) => groundOf(frame.plate, inkStill, bare));
      for (const ground of grounds) {
        expect(ground.share).toBeGreaterThan(-0.03);
        expect(ground.share).toBeLessThan(1.03);
      }
      for (let i = 1; i < grounds.length; i++) {
        if (toward === 'night')
          expect(grounds[i].share).toBeLessThanOrEqual(grounds[i - 1].share + 0.03);
        else expect(grounds[i].share).toBeGreaterThanOrEqual(grounds[i - 1].share - 0.03);
      }
      // Between night and paper the ground is one ground and not a front.
      for (const ground of grounds.filter(midway)) expect(ground.spread).toBeLessThan(0.12);
      // The running head and the strip wear it on the same frame.
      frames.forEach((frame, i) => {
        const share = grounds[i].share;
        if (share < 0.15 || share > 0.85) return;
        for (const colour of frame.bands)
          colour.forEach((value, c) =>
            expect(Math.abs(value - room.paper[c] * share)).toBeLessThan(14),
          );
      });
      return grounds;
    };

    // Toward night: the ink lifts, the ground cools, the light rises in its own order.
    const toNight = await turnBy(page, 'light', cross, plate, seen);
    const lightStill = crop(await settled(page, shot), plate);
    const bare = bareGround(inkStill, lightStill, { ...plate, x: 0, y: 0 }, room.paper);
    expect(bare.length).toBeGreaterThan(500);
    const cooled = changed(toNight.kept, bare, 'night');
    // Mid-Turn the ground lay between night and paper, in the page's own frames; and whichever
    // of them the screenshots caught, the room composed as it is shown, pass the same checks.
    expect(cooled.filter(midway).length).toBeGreaterThan(0);
    changed(toNight.shots, bare, 'night');
    const lightMap = await arrivalMap(id, 'light', box.width, box.height);
    // Where the light has yet to rise, a pixel shows the ground, cooled by then nearly to night.
    const rising = bestOf(
      toNight.kept.flatMap(({ plate: frame }, i) =>
        cooled[i].share < 0.2
          ? [followsMap(frame, flat(frame, tone(cooled[i].share)), lightStill, lightMap, box)]
          : [],
      ),
    );
    expect(rising.arrived).toBeGreaterThan(200);
    expect(rising.waiting).toBeGreaterThan(200);
    expect(rising.latestArrived).toBeLessThanOrEqual(rising.earliestWaiting + 16);
    // At rest the plate is the Light still: the canvas ended on it, as faithfully as it paints.
    const endedNight = await lastPainted(page, plate);
    expect(distance(endedNight, lightStill)).toBeLessThan(3);
    expect(distance(endedNight, inkStill)).toBeGreaterThan(30);

    // Toward paper, from the Light still at rest (its film, held back, never came): the ground
    // warms, the light drains, and the ink blooms in the order it came to rest.
    await expect(page.locator(`${current} video.has-frame`)).toHaveCount(0);
    const toPaper = await turnBy(page, 'ink', cross, plate, seen);
    await slow.evaluate((node) => (node as HTMLElement).remove());
    const warmed = changed(toPaper.kept, bare, 'paper');
    expect(warmed.filter(midway).length).toBeGreaterThan(0);
    changed(toPaper.shots, bare, 'paper');
    const inkMap = await arrivalMap(id, 'ink', box.width, box.height);
    // Where the ink has yet to bloom, a pixel shows the ground, warmed by then nearly to paper.
    const blooming = bestOf(
      toPaper.kept.flatMap(({ plate: frame }, i) =>
        warmed[i].share > 0.85
          ? [followsMap(frame, flat(frame, tone(warmed[i].share)), inkStill, inkMap, box)]
          : [],
      ),
    );
    expect(blooming.arrived).toBeGreaterThan(200);
    expect(blooming.waiting).toBeGreaterThan(200);
    expect(blooming.latestArrived).toBeLessThanOrEqual(blooming.earliestWaiting + 16);
    const endedPaper = await lastPainted(page, plate);
    expect(distance(endedPaper, inkStill)).toBeLessThan(3);
    expect(distance(endedPaper, lightStill)).toBeGreaterThan(30);
    // And the page itself is the Ink still again, as it was before either Turn. (A ground or a
    // layer left part-way would lie several levels off; a still moved to its original, under one.)
    const again = crop(await settled(page, shot), plate);
    expect(distance(shrink(again), shrink(inkStill))).toBeLessThan(1.5);

    // Every frame was painted by the canvas and the room was the ground's, never a front's.
    const painted = await crossingState(page);
    expect(painted.painted).toBeGreaterThan(5);
    expect(painted.headGround).toBeGreaterThan(0);
    expect(painted.stripGround).toBeGreaterThan(0);
    expect(painted.headFront).toBe(0);
    expect(painted.stripFront).toBe(0);
  });
}

test('a finger’s Turn keeps the crossing pixel by pixel, from the two stills and nothing else', async ({
  page,
  isMobile,
}) => {
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
  const seen = await crossingState(page);
  expect(seen.stripFront).toBeGreaterThan(0);
  expect(seen.headGround).toBe(0);
  expect(seen.stripGround).toBe(0);
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
  const paper = (
    await page
      .locator(`${pageStage} [data-layer="ink"] [data-plate-ground]`)
      .evaluate((element) => getComputedStyle(element).backgroundColor)
  )
    .match(/[\d.]+/g)!
    .slice(0, 3)
    .map(Number) as Rgb;
  const bare = bareGround(ink, null, { x: 0, y: 0, width: ink.width, height: ink.height }, paper);
  // Slowed to twelve seconds, so the ground takes seconds to cool and the key is let go well
  // inside that change.
  await page.addStyleTag({ content: ':root { --t-cross: 12000ms; }' });
  await watchWalls(page, paper);
  // Hold L until the walls show the ground has begun to cool: by then most of the ink has lifted.
  // The page says when. A screenshot first would take seconds on a runner without a GPU, and the
  // Turn would run on toward the night before the key was let go.
  await page.keyboard.down('l');
  await expect(page.locator('html')).toHaveAttribute('data-turning', 'time');
  await page.waitForFunction(
    () => (window as unknown as { __walls: Walls }).__walls.share < 0.9,
    null,
    { polling: 'raf' },
  );
  await page.keyboard.up('l');
  const first = await shot();
  const after = [distance(first, ink)];
  const released = Date.now();
  while (Date.now() - released < 3000) after.push(distance(await shot(), ink));
  // The first frame after the key is let go keeps the change where it had come: its ground is
  // still nearer the paper than the night, which a change jumped to the far side would show.
  expect(groundOf(first, ink, bare).share).toBeGreaterThan(0.4);
  // And from there it only goes back.
  for (let i = 1; i < after.length; i++) expect(after[i]).toBeLessThanOrEqual(after[i - 1] + 0.75);
  await expect(page.locator('html')).not.toHaveAttribute('data-turning', /./, { timeout: 12_000 });
  // Frame by frame, from the moment the key was let go: the walls went no further toward the
  // night than a frame or two of a slow runner's change, and came back to the paper.
  const walls = await wallsOf(page);
  const [letGo, there] = walls.released!;
  const back = walls.frames.filter(([time]) => time > letGo).map(([, share]) => share);
  expect(there).toBeLessThan(0.9);
  expect(Math.min(...back)).toBeGreaterThan(there - 0.1);
  expect(back.at(-1)).toBeGreaterThan(0.98);
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
