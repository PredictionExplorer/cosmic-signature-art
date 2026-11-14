import { expect, test } from './fixtures';
import sharp from 'sharp';
import { catalogs } from '../../src/lib/i18n/messages';
import { localizedPath } from '../../src/lib/i18n/routing';
import {
  artworkImageSource,
  noHorizontalOverflow,
  pauseAmbientMotion,
  playAmbientMotion,
} from './helpers';

const current = '[data-artwork-stage="page"]:visible [data-layer-state="current"]';
/** № 031's line (src/lib/art/fate-line.ts): its record dates no ejection, and its energy held. */
const TOGETHER = 'Three bodies, together for all 1,000,000 steps this work records.';
const STILL_BOUND =
  'They are still bound to one another at step 8,000,000, where the record stops looking.';
test('the plate, the room and the keys preserve identity; Escape returns focus', async ({
  page,
  isMobile,
}) => {
  await page.goto('/art/31');
  await pauseAmbientMotion(page);
  await expect(page).toHaveTitle(/№\s031/);
  const plate = page.locator(current);
  await artworkImageSource(plate.locator('img.art-still'), 31, 'ink', true);
  // The strip: the folio, the line under the still, and the words.
  await expect(plate.locator('.hanging-numeral')).toHaveText('031');
  // The work is never cropped: the media box fits the plate by height on a desk, and on a phone
  // the plate itself is 100 vw by the work's own proportion, the first pixel under the masthead.
  const plateBox = (await plate.locator('.plate').boundingBox())!;
  const mediaBox = (await plate.locator('.art-media').boundingBox())!;
  expect(mediaBox.height).toBeLessThanOrEqual(plateBox.height + 1);
  expect(mediaBox.width).toBeLessThanOrEqual(plateBox.width + 1);
  expect(Math.abs(mediaBox.width / mediaBox.height - 3456 / 2234)).toBeLessThan(0.02);
  if (isMobile) {
    const viewport = page.viewportSize()!;
    expect(Math.abs(plateBox.width - viewport.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(plateBox.height - (viewport.width * 2234) / 3456)).toBeLessThanOrEqual(2);
  }
  // The line under the still stands where the label line stood, on a phone as on a desk: what
  // the record says of № 031, in two sentences. The generator's vocabulary is the entry's.
  const line = plate.locator('.strip p');
  await expect(line).toBeVisible();
  await expect(line).toHaveText(`${TOGETHER} ${STILL_BOUND}`);
  await expect(plate.locator('.strip')).not.toContainText('Orbit Ribbons');
  await expect(page.locator('#record')).toContainText('Orbit Ribbons');
  const options = plate.getByRole('button', { name: catalogs.en.ways, exact: true });
  await expect(plate.getByRole('button', { name: 'Study', exact: true })).toHaveCount(0);
  await options.click();
  const study = plate.getByRole('button', { name: 'Study', exact: true });
  await study.focus();
  await study.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleName(`№ 031 · ${catalogs.en.viewingRoom}`);
  await artworkImageSource(dialog.locator('img'), 31, 'ink', true);
  await expect(dialog.locator('video')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(options).toBeFocused();
  await expect(options).toHaveAttribute('aria-expanded', 'false');
  // F opens the film in the room; Z the still.
  await page.keyboard.press('f');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('video')).toHaveAttribute(
    'src',
    /(?:\/art\/31-ink-preview.mp4|\/videos\/web\/ember.mp4)$/,
  );
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await plate.getByRole('button', { name: /^Light$/ }).click();
  await expect(page.locator(current).locator('.art-media')).toHaveAttribute(
    'data-material',
    'light',
  );
  await artworkImageSource(page.locator(current).locator('img.art-still'), 31, 'light', true);
  await noHorizontalOverflow(page);
});

test('Film from a still starts the intended film with one explicit word', async ({ page }) => {
  await page.goto('/art/31?view=still');
  await pauseAmbientMotion(page);
  const plate = page.locator(current);
  await expect(plate.locator('[data-film-state]')).toHaveAttribute('data-film-state', 'still');
  await plate.getByRole('button', { name: 'Film', exact: true }).click();
  await expect(plate.locator('video')).toHaveAttribute('src', /\/art\/31-ink-preview\.mp4$/);
  await expect
    .poll(() => plate.locator('video').evaluate((element) => (element as HTMLVideoElement).paused))
    .toBe(false);
  await expect(plate.getByRole('button', { name: 'Still', exact: true })).toBeVisible();
  // The one transport runs along the plate's foot, the viewport's on a desk, while it plays: the
  // Ink film's score, on its verified clock, once the orbit is measured.
  await expect(plate.locator('[data-film-score="ink"]')).toBeVisible({ timeout: 30_000 });
  await plate.getByRole('button', { name: 'Still', exact: true }).click();
  await expect(plate.getByRole('button', { name: 'Film', exact: true })).toBeVisible();
});

test('the plate settles in place: its strip keeps its height and nothing beneath it moves', async ({
  page,
}) => {
  // The still decodes only when the test lets it, as late as a starved runner decodes it; a
  // collapsing strip once moved a link from under a click that began before the still settled.
  await page.addInitScript(() => {
    const decode = HTMLImageElement.prototype.decode;
    let settle = () => {};
    const settled = new Promise<void>((resolve) => (settle = resolve));
    Object.assign(window, { __settlePlate: () => settle() });
    HTMLImageElement.prototype.decode = function (this: HTMLImageElement) {
      return settled.then(() => decode.call(this));
    };
  });
  await page.goto('/art/31?view=still');
  await pauseAmbientMotion(page);
  const plate = page.locator(current);
  const state = plate.locator('[data-film-state]');
  await expect(state).toHaveAttribute('data-film-state', 'arriving');
  // The state still shows while the plate arrives; it is set beneath the words, not hidden.
  expect((await state.boundingBox())!.height).toBeGreaterThan(1);
  const record = page.getByRole('main').locator('#record');
  await expect(record).toBeVisible();
  const layout = async () => {
    const strip = (await plate.locator('.strip').boundingBox())!;
    const below = (await record.boundingBox())!;
    return { strip: strip.height, below: below.y - strip.y };
  };
  const arriving = await layout();
  await page.evaluate(() => (window as unknown as { __settlePlate: () => void }).__settlePlate());
  await expect(state).toHaveAttribute('data-film-state', 'still');
  expect(await layout()).toEqual(arriving);
});

/**
 * The line under the still (docs/after-the-frame.md §8.2). While a film plays, its readout joins
 * the words beside the line, and at its end two more words do. The strip's centre stays wider
 * than the widest sentence whatever stands beside it, so each sentence keeps a line of its own,
 * the strip keeps its height, nothing under the picture wraps again, and the second line stays
 * clear of the film's score. Measured at the suite's desk, and where the room is least: the
 * narrowest desk that sets the line inside the strip, in Vietnamese, whose second sentence for
 * a work that parts stands closest to the words beside it (588 px of the centre's 649).
 */
for (const { locale, work, viewport, label } of [
  { locale: 'en', work: 31, viewport: null, label: 'at the desk' },
  {
    locale: 'vi',
    work: 25,
    viewport: { width: 1280, height: 720 },
    label: 'in Vietnamese at 1280 px',
  },
] as const) {
  test(`the line under the still holds its two lines while the film plays and after it ends, ${label}`, async ({
    page,
    isMobile,
  }, testInfo) => {
    test.skip(isMobile, 'A phone sets the line on rows of its own, beneath the words.');
    test.skip(
      testInfo.project.name.includes('reduced-motion'),
      'No ambient film under reduced motion; the still’s strip is measured in polish-responsive.',
    );
    test.slow();
    if (viewport) await page.setViewportSize(viewport);
    await page.goto(`${localizedPath(locale, `/art/${work}`)}?expression=light`);
    await playAmbientMotion(page);
    const plate = page.locator(current);
    const strip = plate.locator('.strip');
    const sentences = strip.locator('p em > span');
    await expect(sentences).toHaveCount(2);
    if (locale === 'en') await expect(sentences).toHaveText([TOGETHER, STILL_BOUND]);
    const measure = async () => ({
      strip: (await strip.boundingBox())!.height,
      lines: await sentences.evaluateAll((spans) =>
        spans.map((span) => {
          const { x, y, height } = span.getBoundingClientRect();
          return { x, y, height };
        }),
      ),
    });
    // While it plays, the readout stands beside the line.
    await expect(plate.locator('[data-film-physics]')).toBeVisible({ timeout: 60_000 });
    const playing = await measure();
    expect(playing.strip).toBe(56);
    const [first, second] = playing.lines;
    // One sentence to a line: neither is wrapped, and the second stands under the first.
    for (const line of playing.lines) expect(line.height).toBeLessThan(24);
    expect(second!.x).toBe(first!.x);
    expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height - 1);
    // Clear of the score along the strip's foot, and beside the words, not under them.
    const band = (await plate.locator('[data-film-score]').boundingBox())!;
    expect(second!.y + second!.height).toBeLessThanOrEqual(band.y);
    const words = (await strip.locator('.strip-words').boundingBox())!;
    const line = (await strip.locator('p').boundingBox())!;
    expect(line.x + line.width).toBeLessThanOrEqual(words.x);
    // When it ends, Again and After the frame join the words, and the line has not moved.
    await expect(plate.locator('[data-after-the-frame]')).toBeVisible({ timeout: 30_000 });
    expect(await measure()).toEqual(playing);
  });
}

test('the neighbours carry the visitor on by number and by wavelength, in the expression on view', async ({
  page,
}) => {
  await page.goto('/art/31?view=still');
  await pauseAmbientMotion(page);
  // The suite's day opens the plate in Ink; each step carries it to the next work.
  const next = page.locator('[data-neighbour="next"]');
  await expect(next).toHaveAttribute('href', '/art/32?expression=ink');
  await expect(page.locator('[data-neighbour="previous"]')).toHaveAttribute(
    'href',
    '/art/30?expression=ink',
  );
  const star = page.locator('[data-neighbour="spectral"]');
  // Separators hold to the phrase before them, № and a unit to their figures (no-break spaces).
  await expect(star).toHaveText(/Next by wavelength\s· №\s\d{3}\s· \d+\snm (?:redder|bluer)/);
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/\/art\/32\?expression=ink$/);
  await expect(page).toHaveTitle(/№\s032/);
  await expect(page.locator(current).locator('img.art-still')).toHaveAttribute(
    'alt',
    '№\u00a0032 · Ink',
  );
});

test('language switching preserves the current artwork route', async ({ page, isMobile }) => {
  test.skip(
    isMobile,
    'On phones the languages live in the Index sheet, built in the collection workstream.',
  );
  await page.goto('/art/31?view=still');
  await page.locator('.language-menu button').click();
  await page.locator('.language-menu a[hreflang="ja"]').click();
  await expect(page).toHaveURL(/\/ja\/art\/31\?view=still$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page).toHaveTitle(/№\s031/);
  await expect(page.locator(current).locator('img.art-still')).toHaveAttribute(
    'alt',
    `№\u00a0031 · ${catalogs.ja.ink}`,
  );
});

test('a work without a local film wakes into its settling clip, keeps the film’s own clock, and fades into its still', async ({
  page,
  isMobile,
}, testInfo) => {
  test.skip(
    testInfo.project.name.includes('reduced-motion'),
    'No ambient film under reduced motion; the settling plate is proved in the unit suite.',
  );
  await page.goto('/art/40');
  await playAmbientMotion(page);
  const plate = page.locator(current);
  const film = plate.locator('video');
  if (isMobile) {
    // A phone's plate rests with the eight-second excerpt as its one ambient motion, labelled;
    // the settling clip answers the word alone, never unbidden over a phone's connection.
    await expect(film).toHaveAttribute('src', /\/art\/previews\/40-[a-f0-9]{16}\.mp4$/, {
      timeout: 15_000,
    });
    await expect
      .poll(
        () =>
          film.evaluate((element) => {
            const video = element as HTMLVideoElement;
            return !video.paused && video.currentTime > 0;
          }),
        { timeout: 20_000 },
      )
      .toBe(true);
    await expect(plate.locator('[data-film-state]')).toHaveText(/excerpt 00:06–00:14/i);
    await expect(plate.locator('.strip')).not.toContainText(/00:\d\d \/ 00:\d\d/);
    await plate.getByRole('button', { name: 'Still', exact: true }).click();
    const word = plate.getByRole('button', { name: 'Film', exact: true });
    await expect(word).not.toHaveAttribute('title');
    await word.click();
    await expect(plate.locator('video')).toHaveAttribute(
      'src',
      /\/art\/clips\/40-ink-settling-[a-f0-9]{16}\.mp4$/,
      { timeout: 15_000 },
    );
    await expect(page.getByRole('dialog')).toHaveCount(0);
    return;
  }
  // The plate's film is the settling clip: the film's final eight seconds, which end on the still.
  await expect(film).toHaveAttribute('src', /\/art\/clips\/40-ink-settling-[a-f0-9]{16}\.mp4$/, {
    timeout: 15_000,
  });
  await expect
    .poll(
      () =>
        film.evaluate((element) => {
          const video = element as HTMLVideoElement;
          return !video.paused && video.currentTime > 0;
        }),
      { timeout: 20_000 },
    )
    .toBe(true);
  await expect(plate.locator('[data-film-state]')).toHaveAttribute('data-film-state', 'film');
  // The clock is the film's own: the clip runs from 00:22 to 00:30.
  await plate.getByRole('button', { name: catalogs.en.ways, exact: true }).click();
  await expect(plate.locator('.strip')).toContainText(/00:2[2-9] \/ 00:30/);
  await expect(plate.locator('[data-film-state]')).toHaveAttribute('data-film-state', 'still', {
    timeout: 15_000,
  });
  // The last frame is the still: held, then faded into the still beneath, so nothing jumps.
  await expect(film).toHaveClass(/has-ended/);
  await expect(film).not.toHaveClass(/has-frame/, { timeout: 5000 });
  // Film is the complete film, which opens in the room.
  const word = plate.getByRole('button', { name: 'Film', exact: true });
  await expect(word).toHaveAttribute('title', catalogs.en.filmInRoom);
  await word.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('video')).toHaveAttribute('src', /\/videos\/web\/ember\.mp4$/);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});

test('an edge plate keeps its hairline on both sides, above whatever plays on it', async ({
  page,
}) => {
  await page.goto('/art/31?expression=ink');
  await pauseAmbientMotion(page);
  // № 031's ink reaches its border, so its sheet hangs with a deliberate hairline.
  const media = page.locator(`${current} .art-media[data-edge="true"]`);
  await expect(media).toBeVisible();
  // A film's layer stands in: opaque, composited and across the whole plate, as a playing film
  // is. A line drawn beneath it was covered on one side, wherever the layer met the pixel.
  await media.evaluate((plate) => {
    const film = document.createElement('div');
    film.style.cssText = 'position:absolute;inset:0;background:#efe9dd;will-change:transform';
    plate.append(film);
  });
  const box = (await media.boundingBox())!;
  // The whole row of the screen through the plate's middle: an engine may round a clip's edge.
  const { width } = page.viewportSize()!;
  const row = await page.screenshot({
    clip: { x: 0, y: box.y + box.height / 2, width, height: 1 },
  });
  const { data, info } = await sharp(row).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const red = (x: number) => data[Math.min(info.width - 1, Math.max(0, x)) * info.channels]!;
  /** The darkest pixel within two of x: a line at a fractional edge falls across two. */
  const darkest = (x: number) => Math.min(...[-2, -1, 0, 1, 2].map((d) => red(Math.floor(x) + d)));
  const ground = red(Math.floor(box.x + box.width / 2));
  // The hairline is a tenth of the type over the sheet: about twenty levels below it.
  expect(darkest(box.x)).toBeLessThanOrEqual(ground - 12);
  expect(darkest(box.x + box.width - 1)).toBeLessThanOrEqual(ground - 12);
});

/*
  The layer that leaves goes inert, and the word that was pressed with it: without a hand-over
  the focus falls to the page (WCAG 2.2, 2.4.3). Every other Turn in this suite is a click.
*/
const pageStage = '[data-artwork-stage="page"]';
/** What has the focus: the strip's word by its mark and its layer, or the element's name. */
const focused = () => {
  const active = document.activeElement;
  if (!active || active === document.body) return 'the page';
  const layer = active.closest('[data-layer]');
  const mark = ['data-turn', 'data-film-word', 'data-viewing-options'].find((name) =>
    active.hasAttribute(name),
  );
  return layer && mark
    ? `${mark} of the ${layer.getAttribute('data-layer-state')} layer`
    : active.tagName.toLowerCase();
};

test('a Turn made from the keyboard hands the focus to the word of the layer now on view', async ({
  page,
  browserName,
  isMobile,
}) => {
  test.slow();
  // Safari's Tab passes buttons by unless Option is held, and Playwright's WebKit keeps that.
  const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  await page.goto('/art/31');
  await expect(page.locator('html')).toHaveAttribute('data-keys', 'ready');
  const stage = page.locator(pageStage);
  await expect(stage).toHaveAttribute('data-expression', 'ink');
  const turned = async (to: 'ink' | 'light') => {
    await expect(stage).toHaveAttribute('data-expression', to, { timeout: 20_000 });
    await expect(page.locator('html')).not.toHaveAttribute('data-turning', /./);
  };
  const turnWord = (to: 'ink' | 'light') => page.locator(`${current} [data-turn="${to}"]`);
  const filmWord = page.locator(`${current} [data-film-word]`);

  // The word, by Enter.
  await turnWord('light').focus();
  const scrolled = await page.evaluate(() => scrollY);
  await page.keyboard.press('Enter');
  await turned('light');
  await expect(turnWord('ink')).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBe(scrolled);
  // The keyboard goes on from there: the next word is the same strip's.
  await page.keyboard.press(tab);
  await expect(filmWord).toBeFocused();

  // The key, with the focus on another word of the strip: its match takes it.
  await page.keyboard.press('i');
  await turned('ink');
  await expect(filmWord).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBe(scrolled);

  // The word again, by Space, and back at once by Enter on the word that took the focus.
  await turnWord('light').focus();
  await page.keyboard.press('Space');
  await turned('light');
  await expect(turnWord('ink')).toBeFocused();
  await page.keyboard.press('Enter');
  await turned('ink');
  await expect(turnWord('light')).toBeFocused();

  // A pointer's Turn moves no focus: the word of the layer that arrives is not given it.
  if (isMobile) await turnWord('light').tap();
  else await turnWord('light').click();
  await turned('light');
  expect(await page.evaluate(focused)).not.toBe('data-turn of the current layer');
});

test('a Turn made in the room keeps the focus there, and the room returns it to the matching word', async ({
  page,
}) => {
  test.slow();
  await page.goto('/art/31');
  await expect(page.locator('html')).toHaveAttribute('data-keys', 'ready');
  const stage = page.locator(pageStage);
  await expect(stage).toHaveAttribute('data-expression', 'ink');
  // Z opens the room from wherever the focus stands: here, the Turn's word.
  await page.locator(`${current} [data-turn="light"]`).focus();
  await page.keyboard.press('z');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // The room's two words both stay, so the one pressed keeps the focus and says it is pressed.
  const light = dialog
    .getByRole('group', { name: catalogs.en.ways })
    .getByRole('button', { name: catalogs.en.light, exact: true });
  await light.focus();
  await page.keyboard.press('Enter');
  await expect(stage).toHaveAttribute('data-expression', 'light', { timeout: 20_000 });
  await expect(light).toBeFocused();
  await expect(light).toHaveAttribute('aria-pressed', 'true');
  // The plate turned behind the room, and the word that opened it left with its layer.
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(`${current} [data-turn="ink"]`)).toBeFocused();
});
