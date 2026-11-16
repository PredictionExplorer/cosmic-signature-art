import { expect, test, type Page } from './fixtures';
import { performs } from './helpers';
import { recordSheet, sheetRecorded } from './sheet-record';

/*
  The Turn as one sheet (docs/turn-one-sheet.md).

  One field says where the front stands, and the plate, the running head, the strip and the page
  beneath are all drawn from it on the same frame. These tests read the Turn back in the page
  itself (sheet-record.ts): the head's ground and the stage's meet on one line to the pixel;
  every glyph wears the ink of the ground the canvas shows beneath it, and none is two colours;
  no frame is one flat grey; and nothing the sheet set is left behind. The same holds in the
  viewing room, whose strip is one height in both expressions, so the work never moves.
*/

const pageStage = '[data-artwork-stage="page"]:visible';
const current = `${pageStage} [data-layer-state="current"]`;
const sheet = `${pageStage} canvas[class*="crossing"]`;
/** A length as the tests compare it: to a thousandth of a pixel, never bare. */
const thousandth = (value: number) => Math.round(value * 1000) / 1000;
/** Some lengths in a line, for a failure to say: how many, their middle, and their largest. */
function spread(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (share: number) => thousandth(sorted[Math.floor(share * (sorted.length - 1))] ?? 0);
  return `${sorted.length} read: median ${at(0.5)}, 95th in a hundred ${at(0.95)}, largest ${at(1)}`;
}

/** The sheet is drawn here, unless this project proves the one-frame Turn or has no WebGL. */
async function sheetOffered(page: Page) {
  test.skip(
    test.info().project.name.endsWith('reduced-motion'),
    'The reduced-motion projects prove the one-frame Turn.',
  );
  test.skip(
    !(await page.evaluate(() => !!document.createElement('canvas').getContext('webgl'))),
    'This browser offers no WebGL; the straight seam is its Turn.',
  );
}

async function workReady(page: Page, id: number, locale = '') {
  await page.goto(`${locale}/art/${id}?view=still`, { waitUntil: 'domcontentloaded' });
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
  // At rest: every face the page asks for has come. A word still set in a fallback face moves
  // the lines it stands in, by a fraction of a pixel, when its own face arrives, and these tests
  // hold the page still to a thousandth of one.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** Every film held back, unanswered, so each plate rests on its still. */
async function holdFilmsBack(page: Page) {
  await page.route('**/*.mp4', () => {});
}

/** Turn by the word, and wait until the Turn has landed and the sheet has gone. */
async function turnTo(page: Page, word: 'ink' | 'light', within: number) {
  await page.locator(`${current} [data-turn="${word}"]`).click();
  await expect(page.locator(pageStage)).toHaveAttribute('data-expression', word, {
    timeout: within,
  });
  await expect(page.locator('html')).not.toHaveAttribute('data-turning', /./);
  await expect(page.locator(`${sheet}[data-active]`)).toHaveCount(0);
}

for (const id of [31, 23]) {
  test(`№ ${String(id).padStart(3, '0')}: the plate, the head and the strip take one front, registered to the pixel`, async ({
    page,
    isMobile,
  }) => {
    test.slow();
    await holdFilmsBack(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await workReady(page, id);
    await sheetOffered(page);
    await expect(page.locator('html')).toHaveAttribute('data-crossing', 'arrival', {
      timeout: 15_000,
    });
    // Slowed through the Turn's own token, so the slowest runner keeps many of its frames, and
    // one starved by its neighbours still keeps enough of them.
    const cross = 8000;
    await page.addStyleTag({ content: `:root { --t-cross: ${cross}ms; }` });
    for (const [word, toward] of [
      ['light', 'night'],
      ['ink', 'paper'],
    ] as const) {
      await recordSheet(page, { scope: 'page', toward });
      await turnTo(page, word, cross + 6000);
      const record = await sheetRecorded(page);
      expect(record.frames).toBeGreaterThan(8);
      // Every glyph of the head and the strip wore the ink of the ground beneath it, and no
      // glyph was ever of two colours.
      expect(record.glyphs).toBeGreaterThan(200);
      expect(record.misinked).toEqual([]);
      expect(record.split).toEqual([]);
      // No word was ever set across a word of the other expression's strip.
      expect(record.shared).toEqual([]);
      // The head's ground and the stage's put the front on one line. (What was read is kept
      // with the test's result, for whoever reads a run.)
      test
        .info()
        .annotations.push(
          { type: `head and stage, toward ${toward}`, description: spread(record.seams) },
          { type: `page and stage, toward ${toward}`, description: spread(record.pageSeams) },
        );
      expect(record.seams.length).toBeGreaterThan(3);
      expect(thousandth(Math.max(...record.seams)), spread(record.seams)).toBeLessThanOrEqual(1);
      // On a phone the page shows beyond the stage, and turns from the same field. (Its ground
      // is painted four pixels to a cell: the front is found on it to about a pixel.)
      if (isMobile) expect(record.pageSeams.length).toBeGreaterThan(3);
      if (record.pageSeams.length)
        expect(
          thousandth(Math.max(...record.pageSeams)),
          spread(record.pageSeams),
        ).toBeLessThanOrEqual(1.5);
      // A front, never a ground faded as one.
      expect(record.fronts).toBeGreaterThan(2);
      expect(record.greyest).toBeLessThan(0.12);
      expect(record.left).toEqual([]);
    }
  });
}

test('a pressed Turn is two grounds and the front between them: no frame is one flat grey', async ({
  page,
}) => {
  await holdFilmsBack(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await workReady(page, 31);
  await sheetOffered(page);
  await expect(page.locator('html')).toHaveAttribute('data-crossing', 'arrival', {
    timeout: 15_000,
  });
  // At the Turn's own pace: every frame the page paints is kept.
  await recordSheet(page, { scope: 'page', toward: 'night', every: 0 });
  const pressed = Date.now();
  await turnTo(page, 'light', 10_000);
  const landed = Date.now() - pressed;
  const record = await sheetRecorded(page);
  expect(record.frames).toBeGreaterThan(5);
  // Mid-Turn the bare ground was paper here and night there: on no frame was more than a
  // tenth of it anything between, where a ground faded as one is nothing else.
  expect(record.fronts).toBeGreaterThan(1);
  expect(record.greyest).toBeLessThan(0.12);
  expect(record.misinked).toEqual([]);
  expect(record.left).toEqual([]);
  // The press was answered and the Turn landed in its own time, with nothing held behind it.
  expect(landed).toBeLessThan(8000);
});

/**
 * What follows the stage has stood in one place for a third of a second: the page has finished
 * arriving. (On a crowded machine a page still settles after its keys are ready, once by 0.4 px
 * before any Turn was asked for: that is the page's arrival, and not what this test holds.)
 */
async function pageAtRest(page: Page) {
  const follows = () =>
    page.evaluate(() => {
      const stage = document.querySelector<HTMLElement>('[data-artwork-stage="page"]')!;
      const below = stage.closest('section')!.nextElementSibling ?? stage.parentElement!;
      return Math.round(below.getBoundingClientRect().top * 1000) / 1000;
    });
  await expect
    .poll(async () => {
      const first = await follows();
      await page.waitForTimeout(330);
      return (await follows()) === first;
    })
    .toBe(true);
}

test('the page moves nothing as a Turn is asked for, travels and lands', async ({ page }) => {
  await holdFilmsBack(page);
  await workReady(page, 31);
  await pageAtRest(page);
  // The plate and its strip, and the room between them and whatever follows them on the page,
  // from the press to the landing.
  const second = await page.evaluate(() => {
    const turn = document.querySelector<HTMLElement>(
      '[data-artwork-stage="page"] canvas[class*="crossing"]',
    )!.parentElement!;
    const stage = document.querySelector<HTMLElement>('[data-artwork-stage="page"]')!;
    const below = stage.closest('section')!.nextElementSibling ?? stage.parentElement!;
    // The hard-edge wing's second screen, where one hangs beneath the plate.
    const screen = document.querySelector<HTMLElement>('[data-wing] > [data-ground]');
    const hung = !!screen && screen.getClientRects().length > 0;
    const places: string[] = [];
    Object.assign(window, { __places: places });
    const look = () => {
      const t = turn.getBoundingClientRect();
      const b = below.getBoundingClientRect();
      const place = [t.top, t.height, ...(hung ? [] : [b.top])]
        .map((value) => Math.round(value * 1000) / 1000)
        .join(' ');
      if (places.at(-1) !== place) places.push(place);
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
    return hung;
  });
  await page.locator(`${current} [data-turn="light"]`).click();
  await expect(page.locator(pageStage)).toHaveAttribute('data-expression', 'light', {
    timeout: 10_000,
  });
  await expect(page.locator('html')).not.toHaveAttribute('data-turning', /./);
  // Said, and set nowhere: the status of a Turn takes no room beneath the stage, and the plate
  // stands where it stood. (Where the hard-edge wing hangs a second screen beneath the plate, on
  // a desk with motion stilled or in a browser that cannot draw the wing by the scroll, that
  // screen leaves when the plate turns to its twin, as it did before the Turn was one sheet:
  // there the plate alone is held.)
  const places = await page.evaluate(() => (window as unknown as { __places: string[] }).__places);
  expect(
    places,
    second ? 'the plate, above a second screen' : 'the plate and the page',
  ).toHaveLength(1);
});

test('a phone hangs one plate: the stage’s own', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'A desk hangs the twin in the wing beside the plate.');
  await holdFilmsBack(page);
  await workReady(page, 31);
  const places = () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.viewing-room .plate')]
        .filter((plate) => plate.getClientRects().length > 0)
        .map((plate) => Math.round(plate.getBoundingClientRect().top + scrollY)),
    );
  // The two layers of the stage share one place; no second plate hangs beneath them.
  expect(new Set(await places()).size).toBe(1);
  await page.locator(`${current} [data-turn="light"]`).click();
  await expect(page.locator(pageStage)).toHaveAttribute('data-expression', 'light', {
    timeout: 10_000,
  });
  expect(new Set(await places()).size).toBe(1);
});

test.describe('First Light’s landing', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('holds the Light still, then crosses on one plate with whole words', async ({
    page,
    isMobile,
  }, info) => {
    test.skip(info.project.name.includes('reduced-motion'), 'Reduced motion opens on the plate.');
    test.slow();
    // From the first script on: what the landing shows, frame by frame.
    await page.addInitScript(() => {
      const seen = {
        landed: 0,
        crossing: 0,
        places: 0,
        clipped: [] as string[],
        painted: 0,
      };
      Object.assign(window, { __landing: seen });
      const look = (now: number) => {
        requestAnimationFrame(look);
        const root = document.documentElement;
        const phase = root.getAttribute('data-overture');
        if (phase !== 'landing' && phase !== 'dawn') return;
        if (!seen.landed) seen.landed = now;
        if (!seen.crossing && root.getAttribute('data-turning') === 'overture') seen.crossing = now;
        const room = document.querySelector('[data-presentation="home"]');
        if (!room) return;
        const tops = new Set(
          [...room.querySelectorAll<HTMLElement>('.plate')]
            .filter((plate) => plate.getClientRects().length > 0)
            .map((plate) => Math.round(plate.getBoundingClientRect().top + scrollY)),
        );
        seen.places = Math.max(seen.places, tops.size);
        if (!room.querySelector('canvas[data-active]')) return;
        seen.painted += 1;
        // While the words wear the sheet no layer of them is cut by a shape. (As the Turn lands
        // they are the page's own again, the layer that left clipped away, a frame before the
        // canvas goes.)
        if (!room.querySelector('[data-sheet-active]')) return;
        for (const layer of room.querySelectorAll('[data-layer]')) {
          const clip = getComputedStyle(layer).clipPath;
          if (clip !== 'none' && !seen.clipped.includes(clip)) seen.clipped.push(clip);
        }
      };
      requestAnimationFrame(look);
    });
    await page.goto('/');
    test.skip(!(await performs(page)), 'This browser cannot draw the light; the page stands.');
    const html = page.locator('html');
    // The light has given the still back: while it holds, begin keeping what the crossing
    // paints, glyph by glyph, as the tests of a pressed Turn do.
    await expect(html).toHaveAttribute('data-overture', 'landing', { timeout: 40_000 });
    await recordSheet(page, { scope: 'page', toward: 'paper' });
    await expect(html).toHaveAttribute('data-turning', 'overture', { timeout: 40_000 });
    await expect(html).not.toHaveAttribute('data-overture', { timeout: 30_000 });
    const record = await sheetRecorded(page);
    // Every word the crossing passed was whole, in the ink of the ground beneath each glyph.
    expect(record.frames).toBeGreaterThan(5);
    expect(record.glyphs).toBeGreaterThan(50);
    expect(record.misinked).toEqual([]);
    expect(record.split).toEqual([]);
    expect(record.shared).toEqual([]);
    expect(record.fronts).toBeGreaterThan(1);
    expect(record.greyest).toBeLessThan(0.12);
    const seen = await page.evaluate(
      () =>
        (
          window as unknown as {
            __landing: {
              landed: number;
              crossing: number;
              places: number;
              clipped: string[];
              painted: number;
            };
          }
        ).__landing,
    );
    // The light gave the still back, and it stood whole and alone before anything crossed:
    // --t-overture-hold, a moment longer on a slow runner and never the old tenth of a second.
    expect(seen.crossing - seen.landed).toBeGreaterThan(1500);
    expect(seen.crossing - seen.landed).toBeLessThan(6000);
    // The crossing was the sheet's, and cut no words.
    expect(seen.painted).toBeGreaterThan(3);
    expect(seen.clipped).toEqual([]);
    // On a phone one plate hangs through it all.
    if (isMobile) expect(seen.places).toBe(1);
  });
});

/* The viewing room. */

const room = (page: Page) => page.getByRole('dialog');
/**
 * The room open on the work's still, at rest: its opening has ended, and every face its words
 * ask for has come. (Words are compared to a thirty-second of a pixel below: a glyph still set in
 * a fallback face when the first of two measures is taken is wider or narrower than that.)
 */
async function roomOpen(page: Page) {
  await page.keyboard.press('z');
  const media = room(page).locator('[data-room-media]');
  await expect(media).toBeVisible();
  await expect.poll(() => media.evaluate((element) => element.getAnimations().length)).toBe(0);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe('loaded');
}
/** Where the room hangs the work, and how tall its strip stands. */
const hung = (page: Page) =>
  page.evaluate(() => {
    const frame = document.querySelector('dialog [data-material]')!;
    const box = (element: Element | null) => {
      const rect = element!.getBoundingClientRect();
      return [rect.left, rect.top, rect.width, rect.height].map((v) => Math.round(v * 1000) / 1000);
    };
    return {
      material: frame.getAttribute('data-material'),
      work: box(frame.querySelector('[data-room-media]')),
      strip: box(frame.querySelector('footer')),
    };
  });
/** Every word of a strip, where it lies: the strip in use, or the room held for the other. */
const words = (page: Page, held: boolean) =>
  page.evaluate((held) => {
    const strip = document.querySelector(`dialog ${held ? '[data-strip-room]' : '[data-strip]'}`);
    if (!strip) return [];
    return [...strip.querySelectorAll('[class*="number"], button, span[class*="word"]')].map(
      (word) => {
        const rect = word.getBoundingClientRect();
        return [rect.left, rect.top, rect.width, rect.height];
      },
    );
  }, held);

for (const locale of ['', '/uk', '/ja']) {
  test(`a Turn in the room leaves the work where it hangs (${locale || '/en'})`, async ({
    page,
  }) => {
    await holdFilmsBack(page);
    await workReady(page, 31, locale);
    await roomOpen(page);
    const ink = await hung(page);
    expect(ink.material).toBe('ink');
    const held = await words(page, true);
    await page.keyboard.press('l');
    await expect(room(page).locator('[data-material]')).toHaveAttribute('data-material', 'light', {
      timeout: 10_000,
    });
    await expect(room(page).locator('canvas[data-active]')).toHaveCount(0);
    const light = await hung(page);
    // The two expressions list different films and views: their strips are one height all the
    // same, and the work is one size in one place.
    expect(light.strip).toEqual(ink.strip);
    expect(light.work).toEqual(ink.work);
    // The room held for Light's strip was the room that strip took, word for word. (A control
    // and the span that holds its room are laid out to a sixty-fourth of a pixel of each other.)
    const set = await words(page, false);
    expect(set).toHaveLength(held.length);
    set.forEach((box, index) =>
      box.forEach((length, side) =>
        expect(Math.abs(length - held[index][side])).toBeLessThanOrEqual(1 / 32),
      ),
    );
    await page.keyboard.press('i');
    await expect(room(page).locator('[data-material]')).toHaveAttribute('data-material', 'ink', {
      timeout: 10_000,
    });
    await expect(room(page).locator('canvas[data-active]')).toHaveCount(0);
    expect(await hung(page)).toEqual(ink);
  });
}

test('in the room the Turn is the same sheet: one front over the ground, the work and the strip', async ({
  page,
}) => {
  test.slow();
  await holdFilmsBack(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await workReady(page, 31);
  await sheetOffered(page);
  await roomOpen(page);
  const before = await hung(page);
  const cross = 5000;
  await page.addStyleTag({ content: `:root { --t-cross: ${cross}ms; }` });
  for (const [key, material, toward] of [
    ['l', 'light', 'night'],
    ['i', 'ink', 'paper'],
  ] as const) {
    await recordSheet(page, { scope: 'room', toward });
    await page.keyboard.press(key);
    await expect(room(page).locator('canvas[data-active]')).toHaveCount(1);
    // The change is made when the front has crossed, and not before.
    await expect(room(page).locator('[data-material]')).toHaveAttribute('data-material', material, {
      timeout: cross + 6000,
    });
    await expect(room(page).locator('canvas[data-active]')).toHaveCount(0);
    const record = await sheetRecorded(page);
    expect(record.frames).toBeGreaterThan(8);
    expect(record.glyphs).toBeGreaterThan(40);
    expect(record.misinked).toEqual([]);
    expect(record.split).toEqual([]);
    // On a phone the two strips lay their words differently, a cluster of one across another of
    // the other: no word that arrives is ever set across one that has not gone.
    expect(record.shared).toEqual([]);
    expect(record.fronts).toBeGreaterThan(2);
    expect(record.greyest).toBeLessThan(0.12);
    expect(record.left).toEqual([]);
  }
  expect(await hung(page)).toEqual(before);
});

test('a Turn taken back in the room returns the way it came, and changes nothing', async ({
  page,
}) => {
  await holdFilmsBack(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await workReady(page, 31);
  await sheetOffered(page);
  await roomOpen(page);
  await page.keyboard.press('l');
  await expect(room(page).locator('canvas[data-active]')).toHaveCount(1);
  await page.waitForTimeout(500);
  await page.keyboard.press('i');
  await expect(room(page).locator('canvas[data-active]')).toHaveCount(0, { timeout: 6000 });
  await expect(room(page).locator('[data-material]')).toHaveAttribute('data-material', 'ink');
  await expect(page.locator(pageStage)).toHaveAttribute('data-expression', 'ink');
  expect(
    await page.evaluate(
      () => document.querySelectorAll('[data-sheet], [data-sheet-out], [data-sheet-active]').length,
    ),
  ).toBe(0);
  // And the room can be turned again.
  await page.keyboard.press('l');
  await expect(room(page).locator('[data-material]')).toHaveAttribute('data-material', 'light', {
    timeout: 10_000,
  });
});

test('in the loupe the change is made at once, and where WebGL is absent by the stage’s own way', async ({
  page,
}) => {
  await holdFilmsBack(page);
  await workReady(page, 31);
  await roomOpen(page);
  // Every frame on which the room's sheet was shown.
  await page.evaluate(() => {
    const shown = { frames: 0 };
    Object.assign(window, { __shown: shown });
    const look = () => {
      if (document.querySelector('dialog canvas[class*="sheet"][data-active]')) shown.frames += 1;
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
  await page.keyboard.press('z');
  await expect(room(page).locator('[data-loupe]').first()).toBeVisible();
  await page.keyboard.press('l');
  await expect(room(page).locator('[data-material]')).toHaveAttribute('data-material', 'light', {
    timeout: 3000,
  });
  expect(
    await page.evaluate(
      () => (window as unknown as { __shown: { frames: number } }).__shown.frames,
    ),
  ).toBe(0);
});

test('a room without WebGL still turns, by the stage’s snapshot', async ({ page }) => {
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
  await holdFilmsBack(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await workReady(page, 31);
  await roomOpen(page);
  const before = await hung(page);
  await page.keyboard.press('l');
  await expect(room(page).locator('[data-material]')).toHaveAttribute('data-material', 'light', {
    timeout: 10_000,
  });
  await expect(room(page).locator('canvas[data-active]')).toHaveCount(0);
  // The strip is one height here too: the work does not move.
  const after = await hung(page);
  expect(after.work).toEqual(before.work);
  expect(after.strip).toEqual(before.strip);
});
