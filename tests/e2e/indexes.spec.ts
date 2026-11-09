import AxeBuilder from '@axe-core/playwright';
import sharp from 'sharp';
import { expect, test, type Page } from '@playwright/test';
import { fill } from '../../src/lib/i18n/format';
import { catalogs } from '../../src/lib/i18n/messages';
import { locales, localizedPath } from '../../src/lib/i18n/routing';
import {
  imageLoaded,
  noHorizontalOverflow,
  pauseAmbientMotion,
  playAmbientMotion,
} from './helpers';

/*
  The collection's two other indexes (docs/third-physics-phase-c.md): All the light, every Light
  still added as light adds, and the Orrery, every orbit performed at once. Both are reached
  from the Index sheet, both are night from the top, and neither is offered where a work is
  for sale.
*/

const t = catalogs.en;
const night = 'rgb(0, 0, 0)';

/** An sRGB pixel in OKLCh (Björn Ottosson's OKLab), its hue in degrees. */
function oklch(red: number, green: number, blue: number) {
  const linear = (value: number) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [linear(red), linear(green), linear(blue)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return {
    lightness,
    chroma: Math.hypot(a, bb),
    hue: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360,
  };
}

async function ready(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-keys', 'ready');
}
const headTone = (page: Page) =>
  page.locator('.site-header').evaluate((header) => getComputedStyle(header).backgroundColor);

test.describe('All the light', () => {
  const sky = (page: Page) => page.locator('figure img[data-shown]');
  const frame = (page: Page) => page.locator('figure > div').first();
  const readout = (page: Page) => page.locator('figure figcaption');
  /** The naming line's invitation: a pointer's on a desk, a finger's on a phone. */
  const invites = (page: Page, isMobile: boolean) =>
    expect(readout(page)).toHaveText(isMobile ? t.allTheLightHold : t.allTheLightPoint, {
      useInnerText: true,
    });

  test('is one exposure of every Light still, stated as a derived view, never a sharing card', async ({
    page,
    isMobile,
  }) => {
    await ready(page, '/collection/all-the-light');
    await imageLoaded(sky(page));
    await expect(page.getByRole('heading', { level: 1, name: t.allTheLight })).toBeVisible();
    const span = fill(t.cyclesSpan, { first: 0, last: 2 });
    await expect(sky(page)).toHaveAttribute('alt', fill(t.allTheLightAlt, { span, count: '72' }));
    await expect(page.getByText(/A derived view, not a work/)).toBeVisible();
    await expect.poll(() => headTone(page)).toBe(night);
    // The card a share carries is a published still, never the sky.
    const card = await page.locator('meta[property="og:image"]').first().getAttribute('content');
    expect(card).not.toMatch(/\/art\/light\/|all-the-light/);
    await noHorizontalOverflow(page);
    // The sky, the line that names its orbits and the index all stand in the first view on a
    // wide screen; the index lies beneath the sky on a phone.
    const box = (await frame(page).boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    await expect(readout(page)).toBeInViewport();
    if (viewport.width >= 1100)
      await expect(page.getByRole('button', { name: 'Show № 031 alone' })).toBeInViewport();
    await invites(page, isMobile);
    const line = (await readout(page).boundingBox())!;
    if (isMobile) {
      // A phone's sky hangs edge to edge, and its naming line keeps the gutter.
      expect(box.x).toBe(0);
      expect(Math.abs(box.width - viewport.width)).toBeLessThanOrEqual(1);
      const words = (await readout(page).getByText(t.allTheLightHold).boundingBox())!;
      expect(words.x).toBeGreaterThanOrEqual(16);
      // The line stands above the sky, where the hand that holds the sky does not cover it.
      expect(line.y + line.height).toBeLessThanOrEqual(box.y);
    } else expect(line.y).toBeGreaterThanOrEqual(box.y + box.height);
  });

  test('names the orbits under a point, leaves one alone, and walks to its page', async ({
    page,
    isMobile,
  }) => {
    await ready(page, '/collection/all-the-light');
    await imageLoaded(sky(page));
    const box = (await frame(page).boundingBox())!;
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    if (!isMobile) {
      // Pointing dims the sky and lights the orbits that pass there, brightest first.
      await page.mouse.move(centre.x, centre.y);
      await page.mouse.move(centre.x + 3, centre.y + 2);
      await expect(readout(page)).toHaveText(/^Through this point · №\s\d{3}(\s· №\s\d{3})*$/);
      // The stills are lit once the pointer rests.
      await expect(frame(page)).toHaveAttribute('data-naming', '');
      await expect.poll(() => frame(page).locator('img').count()).toBeGreaterThan(1);
    }
    // Choosing leaves the brightest of them alone, as its own untouched still.
    await frame(page).click({ position: { x: box.width / 2, y: box.height / 2 } });
    const alone = page.getByRole('img', { name: /^№ \d{3} · Light$/ });
    await expect(alone).toBeVisible();
    await imageLoaded(alone);
    const numeral = (await alone.getAttribute('alt'))!.replace(' · Light', '');
    await expect(readout(page)).toHaveText(`${numeral} alone, as its own untouched still`);
    // Escape gives the whole sky back; the numeral's own button chooses it again.
    await page.keyboard.press('Escape');
    await expect(alone).toHaveCount(0);
    await invites(page, isMobile);
    // A finger taps; a pointer clicks. Either chooses at once.
    const fromIndex = page.getByRole('button', { name: `Show ${numeral} alone` });
    if (isMobile) await fromIndex.tap();
    else await fromIndex.click();
    await expect(page.getByRole('img', { name: `${numeral} · Light` })).toBeInViewport();
    await page.getByRole('link', { name: `Go to ${numeral} →` }).click();
    await expect(page).toHaveURL(
      new RegExp(`/art/${Number(numeral.slice(2))}\\?expression=light$`),
    );
    await expect(page.locator('[data-artwork-stage="page"]:visible')).toHaveAttribute(
      'data-expression',
      'light',
    );
  });

  test('a finger held on the sky names what lies beneath it as it moves, and lifting it chooses', async ({
    page,
    isMobile,
    browserName,
  }) => {
    test.skip(!isMobile, 'A pointer names as it hovers, proved above.');
    await ready(page, '/collection/all-the-light');
    await imageLoaded(sky(page));
    const box = (await frame(page).boundingBox())!;
    const at = (x: number, y: number) => ({ x: box.x + box.width * x, y: box.y + box.height * y });
    const named = /^Through this point · (№\s\d{3})(\s· №\s\d{3})*$/;
    const brightest = async () => named.exec(await readout(page).innerText())![1];
    const scrolled = () => page.evaluate(() => window.scrollY);
    // A tap still chooses at once.
    await frame(page).tap({ position: { x: box.width * 0.55, y: box.height * 0.5 } });
    await expect(page.getByRole('img', { name: /^№\s\d{3} · Light$/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await invites(page, true);
    type Point = { x: number; y: number };
    let finger: {
      down(p: Point): Promise<unknown>;
      move(p: Point): Promise<unknown>;
      up(p: Point): Promise<unknown>;
    };
    if (browserName === 'chromium') {
      // A real touch: the browser makes the pointer events, and scrolls the page where it may.
      const session = await page.context().newCDPSession(page);
      const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: Point[]) =>
        session.send('Input.dispatchTouchEvent', { type, touchPoints: points });
      finger = {
        down: (p) => send('touchStart', [p]),
        move: (p) => send('touchMove', [p]),
        up: () => send('touchEnd', []),
      };
    } else {
      // WebKit cannot synthesise a moving touch; the pointer events a finger makes are sent.
      const touch = ({ x, y }: Point) => ({
        pointerId: 7,
        pointerType: 'touch',
        isPrimary: true,
        button: 0,
        clientX: x,
        clientY: y,
      });
      finger = {
        down: (p) => frame(page).dispatchEvent('pointerdown', touch(p)),
        move: (p) => frame(page).dispatchEvent('pointermove', touch(p)),
        up: (p) => frame(page).dispatchEvent('pointerup', touch(p)),
      };
    }
    const before = await scrolled();
    const from = at(0.3, 0.3);
    const to = at(0.6, 0.6);
    await finger.down(from);
    // Once it has rested, the finger names what lies beneath it and lights it on the dimmed sky.
    await expect(readout(page)).toHaveText(named);
    await expect(frame(page)).toHaveAttribute('data-naming', '');
    const first = await readout(page).innerText();
    for (let step = 1; step <= 10; step += 1)
      await finger.move({
        x: from.x + ((to.x - from.x) * step) / 10,
        y: from.y + ((to.y - from.y) * step) / 10,
      });
    // It names as it moves, and the page stays where it was beneath it.
    await expect(readout(page)).toHaveText(named);
    await expect(readout(page)).not.toHaveText(first);
    expect(await scrolled()).toBe(before);
    const chosen = await brightest();
    await finger.up(to);
    // Lifting it leaves the brightest beneath it alone; nothing the lift brings undoes that.
    const alone = page.getByRole('img', { name: `${chosen} · Light` });
    await expect(alone).toBeVisible();
    await expect(readout(page)).toHaveText(`${chosen} alone, as its own untouched still`);
    await page.waitForTimeout(600);
    await expect(alone).toBeVisible();
    // The way back, tapped, gives the whole sky back where the finger is, its orbit unnamed.
    const place = await scrolled();
    await page.getByRole('button', { name: t.allTheLightReturn }).tap();
    await invites(page, true);
    await expect(frame(page)).not.toHaveAttribute('data-naming');
    await expect(frame(page)).toBeInViewport();
    expect(await scrolled()).toBe(place);
    if (browserName !== 'chromium') return;
    // A finger that moves at once is scrolling: the page moves, and nothing is named or chosen.
    const resting = await scrolled();
    const start = at(0.5, 0.85);
    await finger.down(start);
    for (let step = 1; step <= 8; step += 1)
      await finger.move({ x: start.x, y: start.y - step * 24 });
    await finger.up(start);
    await expect.poll(scrolled).toBeGreaterThan(resting);
    await invites(page, true);
    await expect(frame(page)).not.toHaveAttribute('data-naming');
    await expect(page.getByRole('img', { name: /^№\s\d{3} · Light$/ })).toHaveCount(0);
  });

  test('in every language the sky stays where it is under a held finger', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'Under a pointer the naming line stands below the sky.');
    test.slow();
    const touch = (x: number, y: number) => ({
      pointerId: 9,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      clientX: x,
      clientY: y,
    });
    for (const locale of locales) {
      await ready(page, localizedPath(locale, '/collection/all-the-light'));
      await imageLoaded(sky(page));
      // The finger's invitation is the longest the line says: three lines in some languages.
      await expect(readout(page)).toHaveText(catalogs[locale].allTheLightHold, {
        useInnerText: true,
      });
      const box = (await frame(page).boundingBox())!;
      const [x, y] = [box.x + box.width * 0.3, box.y + box.height * 0.3];
      // Held, five names stand where the invitation stood; lifted, one stands alone.
      await frame(page).dispatchEvent('pointerdown', touch(x, y));
      await expect(frame(page)).toHaveAttribute('data-naming', '');
      expect((await frame(page).boundingBox())!.y, locale).toBe(box.y);
      await frame(page).dispatchEvent('pointerup', touch(x, y));
      await expect(frame(page)).toHaveAttribute('data-alone', '');
      expect((await frame(page).boundingBox())!.y, locale).toBe(box.y);
    }
  });

  test('the index lights its orbit from the keyboard, and the cycles fill the sky', async ({
    page,
  }) => {
    await ready(page, '/collection/all-the-light');
    await imageLoaded(sky(page));
    const numeral = page.getByRole('button', { name: 'Show № 031 alone' });
    await numeral.focus();
    await expect(readout(page)).toHaveText('№ 031');
    await expect(frame(page)).toHaveAttribute('data-naming', '');
    await page.keyboard.press('Enter');
    await expect(numeral).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('img', { name: '№ 031 · Light' })).toBeVisible();
    await page.getByRole('button', { name: t.allTheLightReturn }).click();
    // The first cycle's sky, with the cycles still to come dimmed in the index.
    await page.getByRole('button', { name: 'Cycle 0', exact: true }).click();
    await expect(sky(page)).toHaveAttribute('src', /\/art\/light\/sky-0-/);
    await imageLoaded(sky(page));
    await expect(page.getByRole('button', { name: 'Show № 030 alone' })).toHaveAttribute(
      'data-outside',
      '',
    );
    await expect(page.getByRole('button', { name: 'Show № 004 alone' })).not.toHaveAttribute(
      'data-outside',
    );
    // The dimmed numerals are still read: the first cycle's sky passes the same scan.
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations.map(({ id, nodes }) => ({ id, count: nodes.length }))).toEqual([]);
  });

  test('replays the sky cycle by cycle only while motion plays', async ({ page }, testInfo) => {
    await ready(page, '/collection/all-the-light');
    await imageLoaded(sky(page));
    const replay = page.getByRole('button', { name: t.allTheLightReplay });
    if (testInfo.project.name.endsWith('reduced-motion')) {
      await expect(replay).toHaveCount(0);
      return;
    }
    await playAmbientMotion(page);
    await replay.click();
    await expect(sky(page)).toHaveAttribute('src', /\/art\/light\/sky-0-/);
    await expect(sky(page)).toHaveAttribute('src', /\/art\/light\/sky-1-/, { timeout: 6000 });
    // Pause stops a replay where it stands.
    await pauseAmbientMotion(page);
    const standing = await sky(page).getAttribute('src');
    await page.waitForTimeout(3000);
    await expect(sky(page)).toHaveAttribute('src', standing!);
    await expect(replay).toHaveCount(0);
  });
});

test.describe('The Orrery', () => {
  const orrery = (page: Page) => page.locator('section[data-mode]');
  const status = (page: Page) => orrery(page).getByRole('status');

  test('performs every orbit at once, hung by cycle, each leading to its work', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name.endsWith('reduced-motion'),
      'A still preference draws each orbit whole, proved below.',
    );
    await ready(page, '/collection/orrery');
    await playAmbientMotion(page);
    await expect(orrery(page)).toHaveAttribute('data-mode', /^(performing|plates)$/);
    test.skip(
      (await orrery(page).getAttribute('data-mode')) === 'plates',
      'This browser cannot hand a canvas to a worker; its plates are proved below.',
    );
    await expect(page.getByRole('heading', { level: 1, name: t.orreryTitle })).toBeVisible();
    await expect.poll(() => headTone(page)).toBe(night);
    for (const cycle of [0, 1, 2])
      await expect(
        page.getByRole('region', { name: new RegExp(`^Cycle ${cycle} · `) }).getByRole('link'),
      ).toHaveCount(24);
    await expect(page.locator('[data-stage] canvas')).toHaveCount(72);
    // A cell in view moves: the orbit is performed, not shown. Between performances an orbit
    // holds still for three seconds, so the cell is watched a little longer than that.
    const cell = page.locator('[data-stage]').first();
    const before = await cell.screenshot();
    await expect
      .poll(async () => (await cell.screenshot()).equals(before), { timeout: 8000 })
      .toBe(false);
    await expect(status(page)).toHaveText('');
    const work = page.getByRole('link', { name: '№ 031 · its orbit, performed' });
    await expect(work).toHaveAttribute('href', '/art/31');
    await noHorizontalOverflow(page);
  });

  test('under a still preference each orbit is drawn whole, once', async ({ page }) => {
    await ready(page, '/collection/orrery');
    await pauseAmbientMotion(page);
    await expect(orrery(page)).toHaveAttribute('data-mode', /^(performing|plates)$/);
    test.skip(
      (await orrery(page).getAttribute('data-mode')) === 'plates',
      'This browser cannot hand a canvas to a worker; its plates are proved below.',
    );
    await expect(status(page)).toHaveText(t.orreryStill);
    const cell = page.locator('[data-stage]').first();
    await expect(cell).toHaveAttribute('data-drawn', '', { timeout: 15_000 });
    const drawn = await cell.screenshot();
    await page.waitForTimeout(800);
    expect((await cell.screenshot()).equals(drawn)).toBe(true);
  });

  test('draws each body in its own published hue, as light, never in grey', async ({ page }) => {
    await ready(page, '/collection/orrery');
    // Drawn whole and still, so the picture is the same whenever it is read.
    await pauseAmbientMotion(page);
    await expect(orrery(page)).toHaveAttribute('data-mode', /^(performing|plates)$/);
    test.skip(
      (await orrery(page).getAttribute('data-mode')) === 'plates',
      'This browser cannot hand a canvas to a worker; its plates are proved below.',
    );
    // № 002's three bodies are a green, a magenta and a blue (orbit-records.json).
    const hues = [128.9, 308.9, 232.7];
    const cell = page.locator('[data-stage="2"]');
    await cell.scrollIntoViewIfNeeded();
    await expect(cell).toHaveAttribute('data-drawn', '', { timeout: 15_000 });
    const { data, info } = await sharp(await cell.screenshot())
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const chromas: number[] = [];
    let coloured = 0;
    const near = [0, 0, 0];
    for (let k = 0; k < data.length; k += info.channels) {
      const { lightness, chroma, hue } = oklch(data[k], data[k + 1], data[k + 2]);
      if (lightness < 0.35) continue;
      chromas.push(chroma);
      if (chroma < 0.04) continue;
      coloured += 1;
      hues.forEach((body, index) => {
        if (Math.abs(((hue - body + 540) % 360) - 180) <= 25) near[index] += 1;
      });
    }
    // The orbit is drawn as light: a desk's cell lights some 4,400 pixels, a phone's about half.
    // (Drawn at a fifth of the light in grey-tinted strokes, it lit about 160 on a desk.)
    expect(chromas.length).toBeGreaterThan(1000);
    // And in colour: its median light is a hue (it was 0.03, nearly grey), and most of it.
    chromas.sort((a, b) => a - b);
    expect(chromas[Math.floor(chromas.length / 2)]).toBeGreaterThan(0.045);
    expect(coloured / chromas.length).toBeGreaterThan(0.75);
    // That colour lies near the work's own three hues, and each body shows its own.
    expect(near.reduce((sum, count) => sum + count, 0) / coloured).toBeGreaterThan(0.75);
    for (const count of near) expect(count / coloured).toBeGreaterThan(0.08);
  });

  test('a desk hangs the orbits large, four to a row at 1440', async ({ page, isMobile }) => {
    test.skip(isMobile, 'A phone hangs two to a row, proved below.');
    await ready(page, '/collection/orrery');
    const cells = page.getByRole('region', { name: /^Cycle 0 · / }).locator('[data-stage]');
    await expect(cells).toHaveCount(24);
    const boxes = await Promise.all(
      [0, 1, 2, 3, 4].map(async (k) => (await cells.nth(k).boundingBox())!),
    );
    for (const box of boxes.slice(1, 4)) expect(box.y).toBe(boxes[0].y);
    expect(boxes[4].y).toBeGreaterThan(boxes[0].y + boxes[0].height);
    expect(boxes[4].x).toBe(boxes[0].x);
    for (const box of boxes) expect(box.width).toBeGreaterThanOrEqual(260);
    await noHorizontalOverflow(page);
  });

  test('pointing at a work shows its own Light still in the cell', async ({ page, isMobile }) => {
    test.skip(isMobile, 'A finger enters the work; there is no pointing.');
    await ready(page, '/collection/orrery');
    const link = page.getByRole('link', { name: '№ 031 · its orbit, performed' });
    await link.scrollIntoViewIfNeeded();
    await expect(link.locator('img')).toHaveCount(0);
    await link.hover();
    await imageLoaded(link.locator('img'));
    await expect(link.locator('img')).toHaveAttribute('src', /preview/);
  });

  test('a tap enters a work at once, where there is no pointing', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'A pointer shows the plate first, proved above.');
    await ready(page, '/collection/orrery');
    const link = page.getByRole('link', { name: '№ 031 · its orbit, performed' });
    await link.scrollIntoViewIfNeeded();
    await link.tap();
    await expect(page).toHaveURL(/\/art\/31$/);
  });

  test('a phone hangs two orbits to a row, each wide enough to read', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'A desk hangs as many to a row as its width holds.');
    await ready(page, '/collection/orrery');
    const cells = page.getByRole('region', { name: /^Cycle 0 · / }).locator('[data-stage]');
    await expect(cells).toHaveCount(24);
    const [first, second, third] = await Promise.all(
      [0, 1, 2].map(async (k) => (await cells.nth(k).boundingBox())!),
    );
    expect(second.y).toBe(first.y);
    expect(second.x).toBeGreaterThan(first.x + first.width);
    expect(third.y).toBeGreaterThan(first.y + first.height);
    expect(third.x).toBe(first.x);
    expect(first.width).toBeGreaterThanOrEqual(150);
    await noHorizontalOverflow(page);
  });

  test.describe('on a phone of three pixels to a point', () => {
    test.use({ deviceScaleFactor: 3 });
    // Decided before a page is made: a desk's density is its own, proved in the unit tests.
    test.skip(({ isMobile }) => !isMobile, 'A phone’s density.');
    test('draws each orbit at the phone’s own density', async ({ page }) => {
      await ready(page, '/collection/orrery');
      // Drawn whole and still, so each canvas is committed once.
      await pauseAmbientMotion(page);
      await expect(orrery(page)).toHaveAttribute('data-mode', /^(performing|plates)$/);
      test.skip(
        (await orrery(page).getAttribute('data-mode')) === 'plates',
        'This browser cannot hand a canvas to a worker; its plates are proved below.',
      );
      const cell = page.locator('[data-stage]').first();
      await expect(cell).toHaveAttribute('data-drawn', '', { timeout: 15_000 });
      const { width, height } = (await cell.boundingBox())!;
      const canvas = await cell
        .locator('canvas')
        .evaluate((element) => [
          (element as HTMLCanvasElement).width,
          (element as HTMLCanvasElement).height,
        ]);
      expect(canvas).toEqual([Math.round(width * 3), Math.round(height * 3)]);
      expect(await page.evaluate(() => window.devicePixelRatio)).toBe(3);
    });
  });

  test('where the orbits cannot be performed, every work’s Light still stands in', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Reflect.deleteProperty(HTMLCanvasElement.prototype, 'transferControlToOffscreen');
    });
    await ready(page, '/collection/orrery');
    await expect(orrery(page)).toHaveAttribute('data-mode', 'plates');
    await expect(status(page)).toHaveText(t.orreryFallback);
    await expect(page.locator('[data-stage] canvas')).toHaveCount(0);
    await expect(page.locator('[data-stage] img')).toHaveCount(72);
    await imageLoaded(page.locator('[data-stage] img').first());
  });
});

test.describe('the Index sheet', () => {
  test('leads to both indexes, and marks the one on view', async ({ page }) => {
    await ready(page, '/collection/orrery');
    await page.getByRole('button', { name: t.index, exact: true }).first().click();
    const views = page.getByRole('navigation', { name: t.collectionViews });
    await expect(views.getByRole('link', { name: t.orrery })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await views.getByRole('link', { name: t.allTheLight }).click();
    await expect(page).toHaveURL(/\/collection\/all-the-light$/);
    await expect(page.getByRole('heading', { level: 1, name: t.allTheLight })).toBeVisible();
  });

  test('never offers the derived views where a work is for sale', async ({ page }) => {
    await ready(page, '/auctions');
    await page.getByRole('button', { name: t.index, exact: true }).first().click();
    await expect(page.getByRole('navigation', { name: t.ordering })).toBeVisible();
    await expect(page.getByRole('navigation', { name: t.collectionViews })).toHaveCount(0);
  });
});
