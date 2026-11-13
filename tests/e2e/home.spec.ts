import { expect, test } from '@playwright/test';
import { catalogs } from '../../src/lib/i18n/messages';
import { fill } from '../../src/lib/i18n/format';
import { locales, localizedPath } from '../../src/lib/i18n/routing';
import { workOfTheDay } from '../../src/lib/art/work-of-the-day';
import {
  archivedMedia,
  artworkImageSource,
  imageLoaded,
  noHorizontalOverflow,
  pauseAmbientMotion,
} from './helpers';

const stage = '.home [data-artwork-stage="page"]:visible';
const current = `${stage} [data-layer-state="current"]`;
const nightLayer = `${stage} [data-layer="light"]`;
/** The home opens on the day's work: deterministic per UTC date, drawn from the curated pool. */
const today = workOfTheDay();
const folio = String(today).padStart(3, '0');

test('the day’s cycle hangs two to a leaf on a desk and one on a phone, each work readable', async ({
  page,
  isMobile,
}) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await pauseAmbientMotion(page);
  const cycle = page.getByRole('region', { name: /^Cycle \d+$/ });
  await cycle.scrollIntoViewIfNeeded();
  for (const leaf of [catalogs.en.ink, catalogs.en.light]) {
    const row = cycle.getByRole('list', { name: leaf, exact: true });
    const boxes = await row.getByRole('listitem').evaluateAll((items) =>
      items.slice(0, 3).map((item) => {
        const { x, y, width } = item.getBoundingClientRect();
        return { x: Math.round(x), y: Math.round(y), width };
      }),
    );
    expect(boxes).toHaveLength(3);
    if (isMobile) {
      // One work a line, its Ink beside its Light.
      expect(boxes[1].y).toBeGreaterThan(boxes[0].y);
      expect(boxes[1].x).toBe(boxes[0].x);
      expect(boxes[0].width).toBeGreaterThanOrEqual(150);
    } else {
      // Two to a leaf at 1440: the second beside the first, the third beneath them.
      expect(boxes[1].y).toBe(boxes[0].y);
      expect(boxes[2].y).toBeGreaterThan(boxes[0].y);
      expect(boxes[2].x).toBe(boxes[0].x);
      expect(boxes[0].width).toBeGreaterThanOrEqual(280);
    }
  }
  await noHorizontalOverflow(page);
});

test('the spread hangs each numeral in sight, on the gutter, and lays each plate on its own ground', async ({
  page,
  isMobile,
}) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await pauseAmbientMotion(page);
  // The hero's numeral stands on the page's gutter; the spread's hang from the same line.
  const hero = (await page.locator(`${current} .hanging-numeral`).boundingBox())!;
  const spread = page.getByRole('region', { name: catalogs.en.selectedWorks });
  await spread.scrollIntoViewIfNeeded();
  const leaves = await spread.locator('figure').evaluateAll((figures) =>
    figures.map((figure) => {
      const numeral = figure.querySelector('.hanging-numeral')!.getBoundingClientRect();
      const plate = figure.querySelector('a')!.getBoundingClientRect();
      const side = figure.parentElement!;
      const hit = document.elementFromPoint(
        numeral.x + numeral.width / 2,
        numeral.y + numeral.height / 2,
      );
      const hex = side.style.getPropertyValue('--plate-ground');
      return {
        seen: !!hit?.closest('.hanging-numeral'),
        numeral: {
          left: numeral.left,
          right: numeral.right,
          top: numeral.top,
          bottom: numeral.bottom,
        },
        plate: { left: plate.left, right: plate.right, top: plate.top },
        width: innerWidth,
        tone: `rgb(${[1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(', ')})`,
        side: getComputedStyle(side).backgroundColor,
        leaf: getComputedStyle(figure).backgroundColor,
      };
    }),
  );
  expect(leaves).toHaveLength(2);
  const [ink, light] = leaves as [(typeof leaves)[0], (typeof leaves)[0]];
  for (const leaf of leaves) {
    // Nothing covers a numeral; each half and its leaf are the work's own measured ground.
    expect(leaf.seen).toBe(true);
    expect(leaf.side).toBe(leaf.tone);
    expect(leaf.leaf).toBe(leaf.tone);
  }
  expect(light.tone).toBe('rgb(0, 0, 0)');
  if (isMobile) {
    for (const leaf of leaves) expect(leaf.numeral.bottom).toBeLessThanOrEqual(leaf.plate.top + 1);
  } else {
    // In the outer margins, level with the plates' heads and clear of them, on the gutter.
    expect(Math.abs(ink.numeral.left - hero.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(light.width - light.numeral.right - hero.x)).toBeLessThanOrEqual(1);
    expect(ink.numeral.right + 9).toBeLessThanOrEqual(ink.plate.left + 1);
    expect(light.numeral.left).toBeGreaterThanOrEqual(light.plate.right + 9 - 1);
    for (const leaf of leaves)
      expect(Math.abs(leaf.numeral.top - leaf.plate.top)).toBeLessThanOrEqual(1);
  }
});

test.describe('localized home', () => {
  for (const locale of locales) {
    test(`${locale} opens on the day's work in Ink with the one line and translated navigation`, async ({
      page,
      isMobile,
    }) => {
      const t = catalogs[locale];
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(localizedPath(locale));
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator(stage)).toHaveAttribute('data-expression', 'ink');
      await imageLoaded(page.locator(`${current} img.art-still`));
      await artworkImageSource(page.locator(`${current} img.art-still`), today, 'ink');
      await expect(page.locator(`${current} .hanging-numeral`)).toHaveText(folio);
      await expect(page.locator(`${current} img.art-still`)).toHaveAttribute(
        'alt',
        `№\u00a0${folio} · ${t.ink}`,
      );
      // The line under the still, on a phone as on a desk: what the picture is, in two
      // sentences, the second this material's own. The day's work draws the bodies where they
      // were (src/lib/art/fate-line.ts homeLine), so both are said.
      const line = page.locator(`${current} .strip p`);
      await expect(line).toBeVisible();
      await expect(line).toHaveText(
        fill(t.sentences, { first: t.homeLine, second: t.homeLineInk }),
      );
      // Light is told in its own sentence, one Turn away under the same plate.
      const lightLine = fill(t.sentences, { first: t.homeLine, second: t.homeLineLight });
      await expect(page.locator(`${nightLayer} .strip p`)).toHaveText(lightLine);
      // Where the twin hangs on a screen of its own (a phone), it says its line there too.
      if (isMobile) {
        const twin = page.locator('.home [data-wing] > [data-ground="night"] .strip p');
        await expect(twin).toHaveText(lightLine);
        await twin.scrollIntoViewIfNeeded();
        await expect(twin).toBeVisible();
      }
      // No headline, no kicker, no portal on the wall: the page's one h1 is the statement
      // screen's wordmark, below the plate.
      const heading = page.locator('main h1');
      await expect(heading).toHaveCount(1);
      await expect(heading).toHaveText('Cosmic Signature');
      expect(await page.locator(`${stage} h1`).count()).toBe(0);
      await noHorizontalOverflow(page);
      // On phones the words live in the Index sheet, built in the collection workstream.
      if (!isMobile) {
        await page
          .locator('.site-header nav')
          .getByRole('link', { name: t.collection, exact: true })
          .click();
        await expect(page).toHaveURL(new RegExp(`${localizedPath(locale, '/collection')}$`));
      }
      expect(errors).toEqual([]);
    });
  }
});

test("the home paints the day's work from an inline preview before the full still arrives", async ({
  page,
}) => {
  // Hold the hero's full still in flight: the preview alone must carry the first paint.
  const inkSource = archivedMedia
    .find((work) => work.id === today)!
    .media.find((media) => media.id === 'ink')!.sourceUrl;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let intercepted = 0;
  // The still may arrive as one of its ladder's rungs; every candidate is held.
  const stillCandidate = new RegExp(
    `^/art/(?:stills/)?${today}-ink(?:-\\d+-[a-f0-9]{16})?\\.webp$`,
  );
  await page.route(
    (url) => stillCandidate.test(url.pathname) || url.href === inkSource,
    async (route) => {
      intercepted += 1;
      await held;
      await route.continue();
    },
  );
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const preview = page.locator(`${current} img.art-preview`);
  const still = page.locator(`${current} img.art-still`);
  const plate = page.locator(`${current} .art-media`);
  await expect(preview).toHaveAttribute('src', /^data:image\/webp;base64,/);
  await expect(preview).toBeInViewport();
  await expect
    .poll(() =>
      preview.evaluate((element) => {
        const image = element as HTMLImageElement;
        return image.complete && image.naturalWidth > 0;
      }),
    )
    .toBe(true);
  await expect(preview).toHaveCSS('opacity', '1');
  await expect.poll(() => intercepted).toBeGreaterThan(0);
  await expect(plate).toHaveAttribute('data-arrival', 'arriving');
  await expect(still).not.toHaveClass(/is-settled/);
  await expect(still).toHaveCSS('opacity', '0');
  release();
  await imageLoaded(still);
  await expect(still).toHaveClass(/is-settled/);
  await expect(still).toHaveCSS('opacity', '1');
  await expect(plate).toHaveAttribute('data-arrival', 'settled');
  await artworkImageSource(still, today, 'ink');
});

test('Ink and Light preserve token identity and genuine media; motion is controllable', async ({
  page,
  isMobile,
}, testInfo) => {
  await page.goto('/');
  const reduced = testInfo.project.name.includes('reduced-motion');
  const toggle = page.locator('button.motion-toggle');
  await expect(toggle).toHaveAttribute('aria-pressed', reduced ? 'true' : 'false');
  const films = page.locator(`${current} video`);
  const film = films.first();
  if (reduced) {
    await expect(films).toHaveCount(0);
    await toggle.click();
  }
  // A phone's home rests with the eight-second excerpt as its ambient motion, labelled, and
  // fetches neither the opening clip nor the complete film behind it unbidden.
  const arrival = isMobile
    ? new RegExp(`/art/previews/${today}-[a-f0-9]{16}\\.mp4$`)
    : new RegExp(`/art/clips/${today}-ink-opening-[a-f0-9]{16}\\.mp4$`);
  await expect(film).toHaveAttribute('src', arrival);
  await expect
    .poll(() => film.evaluate((element) => (element as HTMLVideoElement).readyState), {
      timeout: 15_000,
    })
    .toBeGreaterThanOrEqual(2);
  await expect
    .poll(() => film.evaluate((element) => (element as HTMLVideoElement).paused), {
      timeout: 15_000,
    })
    .toBe(false);
  await expect(film).toHaveClass(/has-frame/);
  if (isMobile) {
    await expect(page.locator(`${current} [data-film-state]`)).toHaveText(/excerpt 00:06–00:14/i);
    await expect(page.locator(`${current} video[data-relay]`)).toHaveCount(0);
  } else {
    // The transport: the Ink film's score on its verified clock, once the orbit is measured.
    await expect(page.locator(`${current} [data-film-score="ink"]`)).toBeVisible({
      timeout: 30_000,
    });
    // The complete film is fetched behind the clip and takes over at the same frame.
    await expect(page.locator(`${current} .art-media`)).toHaveAttribute('data-handover', 'film', {
      timeout: 30_000,
    });
    const relay = page.locator(`${current} video[data-relay]`);
    await expect(relay).toHaveAttribute('src', new RegExp(`/art/${today}-ink-preview\\.mp4$`));
    await expect(relay).toHaveClass(/has-frame/);
    // The clip has handed over: only the complete film remains on the plate.
    await expect(page.locator(`${current} video:not([data-relay])`)).toHaveCount(0);
  }
  if (!reduced) {
    // The Turn: Light arrives from the right; the strip's words follow the ground.
    await page
      .locator(current)
      .getByRole('button', { name: /^Light$/ })
      .click();
    await expect(page.locator('html')).toHaveAttribute('data-turning', 'time');
    await expect(page.locator(stage)).toHaveAttribute('data-expression', 'light', {
      timeout: 5000,
    });
    await expect(page.locator('html')).toHaveAttribute('data-room', 'night');
    await artworkImageSource(page.locator(`${current} img.art-still`), today, 'light');
    await expect(
      page.locator(current).getByRole('link', { name: /Through the spectrum/ }),
    ).toHaveAttribute('href', '/collection?order=spectrum');
    await page.locator(current).getByRole('button', { name: /^Ink$/ }).click();
    await expect(page.locator(stage)).toHaveAttribute('data-expression', 'ink', {
      timeout: 5000,
    });
    await expect(page.locator('html')).toHaveAttribute('data-room', 'paper');
    await expect(page.locator(nightLayer)).toHaveAttribute('inert', '');
  }
  await pauseAmbientMotion(page);
  await expect
    .poll(async () =>
      (await film.count())
        ? film.evaluate((element) => (element as HTMLVideoElement).paused)
        : true,
    )
    .toBe(true);
  await page
    .locator(current)
    .getByRole('button', { name: /^Light$/ })
    .click();
  await expect(page.locator(stage)).toHaveAttribute('data-expression', 'light');
  await expect(page.locator('html')).not.toHaveAttribute('data-turning', /./);
  await artworkImageSource(page.locator(`${current} img.art-still`), today, 'light');
  await expect(page.locator(`${current} video`)).toHaveCount(0);
  await imageLoaded(page.locator(`${current} img.art-still`));
  await page.locator(current).getByRole('button', { name: /^Ink$/ }).click();
  await artworkImageSource(page.locator(`${current} img.art-still`), today, 'ink');
  await expect(page.locator(`${current} video`)).toHaveCount(0);
  await toggle.click();
  await expect(page.locator(`${current} video`).first()).toHaveAttribute('src', arrival);
  await pauseAmbientMotion(page);
  await page.reload();
  await expect(page.locator('button.motion-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(`${current} video`)).toHaveCount(0);
});

test('Sit fades the strip and the time line; any input brings them back', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => sessionStorage.setItem('cosmic-art-motion-v1', 'playing'));
  await page.goto('/');
  const plate = page.locator(current);
  await expect(plate.locator('video')).toHaveClass(/has-frame/, { timeout: 15_000 });
  await plate.getByRole('button', { name: catalogs.en.ways, exact: true }).click();
  await plate.getByRole('button', { name: 'Sit', exact: true }).click();
  await expect(page.locator('.home .viewing-room')).toHaveAttribute('data-sit', '');
  await expect(page.locator('html')).toHaveAttribute('data-sit', '');
  await expect(plate.locator('.strip')).toHaveCSS('opacity', '0', { timeout: 5000 });
  await page.waitForTimeout(700);
  await page.mouse.move(200, 200);
  await page.mouse.move(260, 240);
  await expect(page.locator('.home .viewing-room')).not.toHaveAttribute('data-sit', /.*/);
  await expect(page.locator('html')).not.toHaveAttribute('data-sit', /.*/);
  await expect(plate.locator('.strip')).toHaveCSS('opacity', '1', { timeout: 5000 });
  // Sit, then a Turn: the commit stands every piece of chrome up again, the running head included.
  await page.keyboard.press('s');
  await expect(page.locator('html')).toHaveAttribute('data-sit', '');
  await expect(page.locator('.site-header')).toHaveCSS('opacity', '0', { timeout: 5000 });
  await page.keyboard.down('l');
  await page.keyboard.up('l');
  await expect(page.locator('.home .viewing-room')).toHaveAttribute('data-expression', 'light', {
    timeout: 5000,
  });
  await expect(page.locator('html')).not.toHaveAttribute('data-sit', /.*/);
  await expect(page.locator('.site-header')).toHaveCSS('opacity', '1', { timeout: 5000 });
  await expect(page.locator('.site-header')).toHaveCSS('pointer-events', 'auto');
});

test('Sit never hides the control a keyboard stands on', async ({ page, browserName }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => sessionStorage.setItem('cosmic-art-motion-v1', 'playing'));
  await page.goto('/');
  const plate = page.locator(current);
  await expect(plate.locator('video')).toHaveClass(/has-frame/, { timeout: 15_000 });
  const head = page.locator('.site-header');
  const inHead = () => head.evaluate((node) => node.contains(document.activeElement));
  // The keyboard walks into the running head, and Sit is pressed from there. (WebKit, as
  // Safari is set by default, stops at buttons and links only with Option held.)
  const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  for (let presses = 0; presses < 8 && !(await inHead()); presses++) await page.keyboard.press(tab);
  expect(await inHead()).toBe(true);
  await page.keyboard.press('s');
  await expect(page.locator('html')).toHaveAttribute('data-sit', '');
  // The strip rests, as it does for anyone. The head stays: the focus is in it.
  await expect(plate.locator('.strip')).toHaveCSS('opacity', '0', { timeout: 5000 });
  await expect(head).toHaveCSS('opacity', '1');
  await expect(head).toHaveCSS('pointer-events', 'auto');
});
