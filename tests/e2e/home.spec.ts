import { expect, test } from '@playwright/test';
import { catalogs } from '../../src/lib/i18n/messages';
import { locales, localizedPath } from '../../src/lib/i18n/routing';
import {
  archivedMedia,
  artworkImageSource,
  collectionLoaded,
  imageLoaded,
  noHorizontalOverflow,
  pauseAmbientMotion,
} from './helpers';

test.describe('localized public gallery', () => {
  for (const locale of locales) {
    test(`${locale} keeps genuine art and translated navigation on home and collection`, async ({
      page,
    }) => {
      const t = catalogs[locale];
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(localizedPath(locale));
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(t.shape);
      await imageLoaded(page.locator('.passage:visible .passage-field img.art-still'));
      await artworkImageSource(
        page.locator('.passage:visible .passage-field img.art-still'),
        23,
        'ink',
      );
      await noHorizontalOverflow(page);
      await page
        .locator('.site-header nav')
        .getByRole('link', { name: t.collection, exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp(`${localizedPath(locale, '/collection')}$`));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.collectionIntro);
      await expect(page.locator('.atlas:visible')).toHaveCount(0);
      await collectionLoaded(page);
      const collectionViews = page.locator('main > nav');
      await expect(
        collectionViews.getByRole('link', { name: new RegExp(t.catalogue) }),
      ).toHaveAttribute('aria-current', 'page');
      await collectionViews.getByRole('link', { name: new RegExp(t.atlasView) }).click();
      await expect(page).toHaveURL(
        new RegExp(`${localizedPath(locale, '/collection')}\\?view=atlas$`),
      );
      await expect(page.locator('.atlas:visible')).toBeVisible();
      await expect(
        page.locator('.atlas:visible .position-anchor .constellation-select'),
      ).toHaveAttribute('aria-label', `${t.signature} 31`);
      await imageLoaded(page.locator('.atlas:visible .position-anchor img.art-still'));
      await collectionLoaded(page);
      await noHorizontalOverflow(page);
      expect(errors).toEqual([]);
    });
  }
});

test('the home paints Signature 023 from an inline preview before the full still arrives', async ({
  page,
}) => {
  test.skip(
    test.info().project.name === 'webkit-reduced-motion',
    "Headless WebKit under reduced-motion emulation fires no requestAnimationFrame before load, so React's streamed Suspense reveal waits for the held still; the preview-first contract is proved by every other project.",
  );
  // Hold the hero's full still in flight: the preview alone must carry the first paint.
  const inkSource = archivedMedia
    .find((work) => work.id === 23)!
    .media.find((media) => media.id === 'ink')!.sourceUrl;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let intercepted = 0;
  await page.route(
    (url) => url.pathname === '/art/23-ink.webp' || url.href === inkSource,
    async (route) => {
      intercepted += 1;
      await held;
      await route.continue();
    },
  );
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const preview = page.locator('.passage:visible .passage-field img.art-preview');
  const still = page.locator('.passage:visible .passage-field img.art-still');
  const plate = page.locator('.passage:visible .passage-field .art-media');
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
  await artworkImageSource(still, 23, 'ink');
});

test('Ink and Light preserve token identity and genuine media; motion is controllable', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const reduced = testInfo.project.name.includes('reduced-motion');
  const toggle = page.locator('.motion-toggle');
  await expect(toggle).toHaveAttribute('aria-pressed', reduced ? 'true' : 'false');
  const film = page.locator('.passage:visible .passage-field video');
  if (reduced) {
    await expect(film).toHaveCount(0);
    await toggle.click();
  }
  await expect(film).toHaveAttribute('src', /\/art\/23-ink-preview\.mp4$/);
  await expect
    .poll(() => film.evaluate((element) => (element as HTMLVideoElement).readyState))
    .toBeGreaterThanOrEqual(2);
  await expect
    .poll(() => film.evaluate((element) => (element as HTMLVideoElement).paused))
    .toBe(false);
  await expect(film).toHaveClass(/has-frame/);
  if (!reduced) {
    await page.getByRole('button', { name: /Cross into Light/ }).click();
    await expect(page.locator('.passage:visible .material-curtain')).toHaveCount(1);
    await expect(page.locator('.passage:visible .material-portal')).toBeDisabled();
    await expect(page.locator('.passage:visible')).toHaveClass(/material-light/);
    await expect(page.locator('.passage:visible .material-curtain')).toHaveCount(0, {
      timeout: 5_000,
    });
    await expect(page.locator('.passage:visible .material-portal')).toBeEnabled();
    await artworkImageSource(
      page.locator('.passage:visible .passage-field img.art-still'),
      23,
      'light',
    );
    await page.getByRole('button', { name: /Return to Ink/ }).click();
    await expect(page.locator('.passage:visible')).toHaveClass(/material-ink/);
    await expect(page.locator('.passage:visible .material-curtain')).toHaveCount(0, {
      timeout: 5_000,
    });
    await page.locator('.passage:visible .passage-field').scrollIntoViewIfNeeded();
    await expect(film).toHaveClass(/has-frame/);
  }
  await pauseAmbientMotion(page);
  await expect
    .poll(() => film.evaluate((element) => (element as HTMLVideoElement).paused))
    .toBe(true);
  await page.getByRole('button', { name: /Cross into Light/ }).click();
  await expect(page.locator('.passage:visible')).toHaveClass(/material-light/);
  await artworkImageSource(
    page.locator('.passage:visible .passage-field img.art-still'),
    23,
    'light',
  );
  await expect(page.locator('.passage:visible .passage-field video')).toHaveCount(0);
  await imageLoaded(page.locator('.passage:visible .passage-field img.art-still'));
  await page.getByRole('button', { name: /Return to Ink/ }).click();
  await artworkImageSource(
    page.locator('.passage:visible .passage-field img.art-still'),
    23,
    'ink',
  );
  await expect(film).toHaveCount(0);
  await toggle.click();
  await expect(page.locator('.passage:visible .passage-field video')).toHaveAttribute(
    'src',
    /\/art\/23-ink-preview\.mp4$/,
  );
  await expect(film).toHaveClass(/has-frame/);
  await pauseAmbientMotion(page);
  await page.reload();
  await expect(page.locator('.motion-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.passage:visible .passage-field video')).toHaveCount(0);
});
