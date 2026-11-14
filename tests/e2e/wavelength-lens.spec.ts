import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from './fixtures';
import AxeBuilder from '@axe-core/playwright';
import { catalogs } from '../../src/lib/i18n/messages';
import { fill } from '../../src/lib/i18n/format';
import { frameForNm, wavelengthRange } from '../../src/lib/art/spectral-sweep';
import { noHorizontalOverflow } from './helpers';

const t = catalogs.en;
const pageStage = '[data-artwork-stage="page"]:visible';
const current = `${pageStage} [data-layer-state="current"]`;
/** 031's sweep span as the registry measured it from the published bins. */
const span = (
  JSON.parse(
    readFileSync(new URL('../../src/lib/art/sweep-spans.json', import.meta.url), 'utf8'),
  ) as { spans: { id: number; start: number; end: number }[] }
).spans.find((entry) => entry.id === 31)!;
const { min, max } = wavelengthRange(span);
/** The published sweep is a 14 MB film from the publisher's origin; its first frame may take a while. */
const FIRST_FRAME_MS = 60_000;

async function workReady(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/№\s031/);
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
  // The keys' marker is set only once the client's listeners are attached.
  await expect(page.locator('html')).toHaveAttribute('data-keys', 'ready');
}

/** 031's room, turned to Light, where its sweep is one of the films. */
async function lightRoom(page: Page, path = '/art/31?view=still') {
  await workReady(page, path);
  await page.locator(current).getByRole('button', { name: t.ways, exact: true }).click();
  await page.locator(current).getByRole('button', { name: t.enlarge, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('img')).toBeVisible();
  await dialog.getByRole('button', { name: t.light, exact: true }).click();
  await expect(dialog.locator('> div').first()).toHaveAttribute('data-material', 'light');
  return dialog;
}

/** The frame on screen, or -1 while a seek is still decoding. */
function frameOnScreen(video: Locator) {
  return video.evaluate((element) => {
    const film = element as HTMLVideoElement;
    return film.seeking || film.readyState < 2 ? -1 : Math.floor(film.currentTime * 60);
  });
}

/** The readout, the slider and the film's own clock agree on one wavelength. */
async function heldAt(dialog: Locator, nm: number) {
  const slider = dialog.getByRole('slider', { name: t.wavelengthLens, exact: true });
  await expect(slider).toHaveAttribute('aria-valuenow', String(nm));
  await expect(slider).toHaveAttribute('aria-valuetext', fill(t.wavelengthValue, { n: nm }));
  await expect(slider).toContainText(`${nm} nm`);
  const video = dialog.locator('video');
  await expect
    .poll(() => frameOnScreen(video), { timeout: FIRST_FRAME_MS })
    .toBe(frameForNm(nm, span));
  await expect(video).toHaveAttribute('data-frame', String(frameForNm(nm, span)));
  await expect(video).toHaveAttribute('aria-label', new RegExp(`held at ${nm} nm`));
}

test('the Wavelength lens holds 031’s sweep where the keys choose: readout, slider and film agree', async ({
  page,
}) => {
  // Each held wavelength is a seek through full-size frames, decoded in software on CI.
  test.slow();
  // Every film the page asks to play, by its source: the sweep must never be among them.
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    const asked: string[] = [];
    Object.assign(window, { __playsAsked: asked });
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      asked.push(this.currentSrc || this.getAttribute('src') || '');
      return play.call(this);
    };
  });
  const sweeps: string[] = [];
  page.on('request', (request) => {
    if (/\/videos\/web\/spectral_sweep\.mp4$/.test(new URL(request.url()).pathname))
      sweeps.push(request.url());
  });
  const dialog = await lightRoom(page);
  const word = dialog.getByRole('button', { name: t.wavelengthLens, exact: true });
  await expect(word).toHaveAttribute('aria-pressed', 'false');
  // The sweep is several megabytes: nothing of it is fetched until the lens is asked for.
  expect(sweeps).toEqual([]);
  await page.keyboard.press('n');
  await expect(word).toHaveAttribute('aria-pressed', 'true');
  const video = dialog.locator('video');
  await expect(video).toHaveAttribute('src', /\/videos\/web\/spectral_sweep\.mp4$/);
  const slider = dialog.getByRole('slider', { name: t.wavelengthLens, exact: true });
  await expect(slider).toHaveAttribute('aria-valuemin', String(min));
  await expect(slider).toHaveAttribute('aria-valuemax', String(max));
  // It opens on the work's own dominant wavelength, ticked on the rule.
  await heldAt(dialog, 632);
  await expect(dialog.getByRole('status')).toHaveText(
    `${t.analysisNotWork} · ${t.wavelengthCaption}`,
  );
  expect(sweeps.length).toBeGreaterThan(0);
  // On the rule: one nanometre an arrow, ten with Shift.
  await slider.focus();
  for (let step = 0; step < 2; step += 1) await page.keyboard.press('ArrowLeft');
  for (let step = 0; step < 3; step += 1) await page.keyboard.press('Shift+ArrowLeft');
  await heldAt(dialog, 600);
  // From anywhere in the room the arrows, Home and End move it too.
  await word.focus();
  await page.keyboard.press('Home');
  await heldAt(dialog, min);
  await page.keyboard.press('Shift+ArrowRight');
  await heldAt(dialog, min + 10);
  await page.keyboard.press('End');
  await heldAt(dialog, max);
  // It held frames; it never played one after another. The page never asked the sweep to play.
  // (Its played ranges are no witness: WebKit on Linux counts a frame sought while paused.)
  expect(await video.evaluate((element) => (element as HTMLVideoElement).paused)).toBe(true);
  expect(
    await page.evaluate(() =>
      (window as unknown as { __playsAsked: string[] }).__playsAsked.filter((source) =>
        /\/videos\/web\/spectral_sweep\.mp4$/.test(source),
      ),
    ),
  ).toEqual([]);
  await page.keyboard.press('?');
  await expect(dialog.getByLabel(t.roomKeys)).toContainText(t.keyWavelength);
  await page.keyboard.press('?');
  // N returns to the still and releases the film.
  await page.keyboard.press('n');
  await expect(word).toHaveAttribute('aria-pressed', 'false');
  await expect(dialog.locator('video')).toHaveCount(0);
  await expect(dialog.locator('img')).toBeVisible();
});

test('the rule follows a drag along it, a finger on a phone', async ({
  page,
  browserName,
  isMobile,
}) => {
  test.slow();
  const dialog = await lightRoom(page);
  await dialog.getByRole('button', { name: t.wavelengthLens, exact: true }).click();
  await heldAt(dialog, 632);
  const slider = dialog.getByRole('slider', { name: t.wavelengthLens, exact: true });
  const line = (await slider.locator('i').boundingBox())!;
  const grip = (await slider.boundingBox())!;
  const viewport = page.viewportSize()!;
  // A hand-sized band: the whole rule answers, well past the 44 px a finger needs.
  expect(grip.height).toBeGreaterThanOrEqual(44);
  expect(line.width).toBeGreaterThanOrEqual(isMobile ? 200 : 400);
  expect(grip.x).toBeGreaterThanOrEqual(0);
  expect(grip.x + grip.width).toBeLessThanOrEqual(viewport.width);
  const at = (nm: number) => line.x + ((nm - 380) / 320) * line.width;
  const y = line.y + line.height / 2;
  const target = 520;
  if (isMobile && browserName === 'chromium') {
    // A real touch: the browser makes the pointer events, and the rule must not scroll the room.
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: at(632), y }],
    });
    for (let step = 1; step <= 8; step += 1)
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: at(632) + ((at(target) - at(632)) * step) / 8, y }],
      });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else if (isMobile) {
    // WebKit cannot synthesise a moving touch; the same pointer events a finger makes are sent.
    const touch = (x: number) => ({
      pointerId: 7,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      clientX: x,
      clientY: y,
    });
    await slider.dispatchEvent('pointerdown', touch(at(632)));
    for (let step = 1; step <= 8; step += 1)
      await slider.dispatchEvent(
        'pointermove',
        touch(at(632) + ((at(target) - at(632)) * step) / 8),
      );
    await slider.dispatchEvent('pointerup', touch(at(target)));
  } else {
    await page.mouse.move(at(632), y);
    await page.mouse.down();
    await page.mouse.move(at(target), y, { steps: 8 });
    await page.mouse.up();
  }
  // Within a pixel's worth of the target, wherever the drag let go.
  const held = Number(await slider.getAttribute('aria-valuenow'));
  expect(Math.abs(held - target)).toBeLessThanOrEqual(Math.ceil(320 / line.width) + 1);
  await heldAt(dialog, held);
  await expect(slider).toBeFocused();
  await noHorizontalOverflow(page);
  // The lens is analysis beside the work; the room stays accessible with it on.
  const results = await new AxeBuilder({ page })
    .include('[data-testid="artwork-room"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) })),
  ).toEqual([]);
});

test('a sale surface shows the work alone: no Wavelength lens, by word or by key', async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem('cosmic-art-motion-v1', 'paused'));
  const dialog = await lightRoom(page, '/auctions/31');
  await expect(dialog.getByRole('button', { name: t.wavelengthLens, exact: true })).toHaveCount(0);
  await page.keyboard.press('n');
  await expect(dialog.getByRole('slider', { name: t.wavelengthLens })).toHaveCount(0);
  await expect(dialog.locator('video')).toHaveCount(0);
});
