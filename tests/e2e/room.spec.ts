import { expect, test, type Page } from './fixtures';
import { catalogs } from '../../src/lib/i18n/messages';
import { noHorizontalOverflow } from './helpers';

const t = catalogs.en;
/** The languages the notice is measured in: the two longest, the Latin default and a CJK one. */
const noticeLocales = ['en', 'uk', 'vi', 'ja'] as const;
/** A phone, and the narrowest screen the venue promises. */
const noticeScreens = [
  { width: 390, height: 844 },
  { width: 320, height: 568 },
];
const pageStage = '[data-artwork-stage="page"]:visible';
const current = `${pageStage} [data-layer-state="current"]`;
const roomSelector = '[data-testid="artwork-room"]';
const frameSelector = `${roomSelector} > div`;

async function artworkReady(page: Page, path = '/art/31?view=still') {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/№\s031/);
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
  await page.locator(current).getByRole('button', { name: t.ways, exact: true }).click();
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
  await page.locator(current).getByRole('button', { name: t.ways, exact: true }).click();
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
  await page.locator(current).getByRole('button', { name: t.ways, exact: true }).click();
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
  await expect(plates.nth(0)).toHaveAttribute('alt', '№\u00a0031 · Ink');
  await expect(plates.nth(1)).toHaveAttribute('alt', '№\u00a0031 · Light');
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

test('the spread shows both plates whole at once: side by side on a desk, stacked on a phone', async ({
  page,
  isMobile,
}) => {
  await artworkReady(page);
  const gatefold = page.getByRole('region', { name: /^Plate 031, in ink and in light/ });
  const spread = gatefold.getByRole('group', { name: t.gatefoldSpread, exact: true });
  await spread.evaluate((node) => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const [ink, light] = [spread.getByRole('img').nth(0), spread.getByRole('img').nth(1)];
  await expect(ink).toHaveAttribute('alt', '№ 031 · Ink');
  await expect(light).toHaveAttribute('alt', '№ 031 · Light');
  // Nothing lies out of view: both plates are wholly on screen together (to a pixel's rounding).
  await expect(ink).toBeInViewport({ ratio: 0.99 });
  await expect(light).toBeInViewport({ ratio: 0.99 });
  // The spread is no scroll region, so it is neither a tab stop nor anything a key could turn.
  expect(
    await spread.evaluate((node) => ({
      overflow: node.scrollWidth - node.clientWidth,
      tabIndex: node.getAttribute('tabindex'),
      focusable: node.querySelectorAll('a, button, input, [tabindex]').length,
    })),
  ).toEqual({ overflow: 0, tabIndex: null, focusable: 0 });
  const [inkBox, lightBox] = [(await ink.boundingBox())!, (await light.boundingBox())!];
  const width = page.viewportSize()!.width;
  expect(Math.abs(inkBox.width - lightBox.width)).toBeLessThanOrEqual(1);
  if (isMobile) {
    // A vertical diptych: Ink above, Light below, each the phone's width.
    expect(lightBox.y).toBeGreaterThanOrEqual(inkBox.y + inkBox.height);
    expect(Math.abs(inkBox.width - width)).toBeLessThanOrEqual(1);
  } else {
    // Side by side on one line, Ink to the left, a hairline of wall between them, and the pair
    // hung in the middle of the wall within the page's gutters.
    expect(Math.abs(inkBox.y - lightBox.y)).toBeLessThanOrEqual(1);
    expect(lightBox.x - (inkBox.x + inkBox.width)).toBeGreaterThanOrEqual(0.5);
    expect(lightBox.x - (inkBox.x + inkBox.width)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(inkBox.x - (width - lightBox.x - lightBox.width))).toBeLessThanOrEqual(1);
    expect(inkBox.width).toBeGreaterThan(width * 0.4);
  }
  await noHorizontalOverflow(page);
});

/**
 * Every word the room's notice shows, by the rectangles its glyphs are laid out in, and whether
 * each lies inside the screen and inside every ancestor that would cut it. An ellipsis leaves
 * the cut words in the page, so reading the text proves nothing: the geometry does.
 */
function noticeWords(page: Page) {
  return page.locator(`${roomSelector} footer`).evaluate((footer) => {
    const words: { text: string; cut: string | null }[] = [];
    const walker = document.createTreeWalker(footer.lastElementChild!, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const holder = node.parentElement!;
      if (!node.textContent?.trim() || getComputedStyle(holder).visibility === 'hidden') continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      let cut: string | null = null;
      for (const rect of range.getClientRects()) {
        if (rect.left < -0.5 || rect.right > innerWidth + 0.5 || rect.bottom > innerHeight + 0.5)
          cut = 'the screen';
        for (let box: Element | null = holder; box && box !== footer; box = box.parentElement) {
          const style = getComputedStyle(box);
          if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
          const bounds = box.getBoundingClientRect();
          if (rect.right > bounds.right + 0.5 || rect.bottom > bounds.bottom + 0.5)
            cut = `its ${box.tagName.toLowerCase()}`;
        }
      }
      words.push({ text: node.textContent.replace(/\s+/g, ' ').trim(), cut });
    }
    return words;
  });
}

for (const locale of noticeLocales)
  for (const screen of noticeScreens) {
    const words = catalogs[locale];
    test(`a lens’s label is shown whole on a phone, first on its line, and the work keeps its place (${locale}, ${screen.width} px)`, async ({
      page,
    }) => {
      // The sweep is 14 MB and the lens says what it is while it loads: no film is needed here.
      await page.route(/\.mp4(?:\?|$)/, () => {});
      await page.setViewportSize(screen);
      await artworkReady(page, `${locale === 'en' ? '' : `/${locale}`}/art/31?view=still`);
      await page.locator(current).getByRole('button', { name: words.ways, exact: true }).click();
      await page.locator(current).getByRole('button', { name: words.enlarge, exact: true }).click();
      const dialog = page.getByRole('dialog');
      const still = dialog.locator('img');
      await expect(still).toBeVisible();
      // The room opens with the Expansion; the still is measured where it comes to rest.
      await expect.poll(() => still.evaluate((image) => image.getAnimations().length)).toBe(0);
      const strip = dialog.locator('footer');
      const rested = { still: (await still.boundingBox())!, strip: (await strip.boundingBox())! };

      // The When lens: its label first, every word of the line and of the ramp on screen.
      await page.keyboard.press('t');
      const drawn = dialog.locator('canvas[data-room-media]');
      await expect(drawn).toHaveAttribute('data-when', 'painted', { timeout: 15_000 });
      await expect(dialog.getByRole('status')).toHaveText(
        `${words.analysisNotWork} · ${words.whenInk}`,
      );
      const when = await noticeWords(page);
      expect(when.map((word) => word.text)).toEqual([
        `${words.analysisNotWork} · ${words.whenInk}`,
        words.whenFirst,
        words.whenLast,
      ]);
      expect(when.filter((word) => word.cut)).toEqual([]);
      // The room for the line was there before the lens was: the lens lies where the still lay.
      const lens = (await drawn.boundingBox())!;
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        expect(Math.abs(lens[key] - rested.still[key])).toBeLessThan(1.5);
        expect(Math.abs((await strip.boundingBox())![key] - rested.strip[key])).toBeLessThan(0.5);
      }
      await noHorizontalOverflow(page);
      await page.keyboard.press('t');
      await expect(still).toBeVisible();

      // Light, and the Wavelength lens as it loads: the same label, whole, on a strip that
      // stands where Light's stood.
      await page.keyboard.press('l');
      await expect(page.locator(frameSelector).first()).toHaveAttribute('data-material', 'light');
      await expect(still).toBeVisible();
      // The sweep's word joins the strip with the work's live record; the strip is measured then.
      await expect(
        dialog.getByRole('button', { name: words.wavelengthLens, exact: true }),
      ).toBeVisible();
      const light = (await strip.boundingBox())!;
      await page.keyboard.press('n');
      await expect(dialog.getByRole('status')).toHaveText(
        `${words.analysisNotWork} · ${words.wavelengthLoading}`,
      );
      const wavelength = await noticeWords(page);
      expect(wavelength.filter((word) => word.cut)).toEqual([]);
      for (const key of ['x', 'y', 'width', 'height'] as const)
        expect(Math.abs((await strip.boundingBox())![key] - light[key])).toBeLessThan(0.5);
      await noHorizontalOverflow(page);
    });
  }
