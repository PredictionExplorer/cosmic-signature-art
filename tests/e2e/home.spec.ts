import { expect, test } from '@playwright/test';
import { catalogs } from '../../src/lib/i18n/messages';
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
        `№ ${folio} · ${t.ink}`,
      );
      if (!isMobile) {
        await expect(page.locator(current).getByText(t.statementLine)).toBeVisible();
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
  test.skip(
    test.info().project.name === 'webkit-reduced-motion',
    "Headless WebKit under reduced-motion emulation fires no requestAnimationFrame before load, so React's streamed Suspense reveal waits for the held still; the preview-first contract is proved by every other project.",
  );
  // Hold the hero's full still in flight: the preview alone must carry the first paint.
  const inkSource = archivedMedia
    .find((work) => work.id === today)!
    .media.find((media) => media.id === 'ink')!.sourceUrl;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let intercepted = 0;
  await page.route(
    (url) => url.pathname === `/art/${today}-ink.webp` || url.href === inkSource,
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
}, testInfo) => {
  await page.goto('/');
  const reduced = testInfo.project.name.includes('reduced-motion');
  const toggle = page.locator('button.motion-toggle');
  await expect(toggle).toHaveAttribute('aria-pressed', reduced ? 'true' : 'false');
  const film = page.locator(`${current} video`);
  if (reduced) {
    await expect(film).toHaveCount(0);
    await toggle.click();
  }
  await expect(film).toHaveAttribute('src', new RegExp(`/art/${today}-ink-preview\\.mp4$`));
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
  await expect(page.locator('.time-line')).toBeVisible();
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
  await expect(page.locator(`${current} video`)).toHaveAttribute(
    'src',
    new RegExp(`/art/${today}-ink-preview\\.mp4$`),
  );
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
