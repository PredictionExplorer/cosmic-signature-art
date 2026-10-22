import { expect, test, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { catalogs } from '../../src/lib/i18n/messages';
import { locales, localizedPath } from '../../src/lib/i18n/routing';

async function noHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function imageLoaded(image: Locator) {
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((element) => {
        const img = element as HTMLImageElement;
        return img.complete && img.naturalWidth > 0;
      }),
    )
    .toBe(true);
}

async function collectionLoaded(page: Page, loadAllImages = false) {
  const section = page.getByRole('main').locator('#works');
  await expect(section.locator('.collection-skeleton:visible')).toHaveCount(0, { timeout: 30_000 });
  const cards = section.locator('.work-grid:not(.collection-skeleton) .work-card');
  await expect(cards.first()).toBeVisible({ timeout: 30_000 });
  await cards.first().scrollIntoViewIfNeeded();
  await imageLoaded(cards.first().locator('img'));
  if (loadAllImages) {
    const count = await cards.count();
    for (let index = 0; index < count; index += 3) {
      await cards.nth(index).scrollIntoViewIfNeeded();
    }
    await cards.last().scrollIntoViewIfNeeded();
    await expect(cards.locator('img')).toHaveCount(count);
    await expect
      .poll(async () =>
        cards
          .locator('img')
          .evaluateAll((elements) =>
            elements.every(
              (element) =>
                (element as HTMLImageElement).complete &&
                (element as HTMLImageElement).naturalWidth > 0,
            ),
          ),
      )
      .toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
  }
}

async function pauseAmbientMotion(page: Page) {
  const control = page.locator('.motion-toggle');
  // Server HTML begins paused. Wait for the actual browser preference before clicking.
  const initiallyPaused = await page.evaluate(() => {
    const saved = sessionStorage.getItem('cosmic-art-motion-v1');
    return saved ? saved === 'paused' : matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  await expect(control).toHaveAttribute('aria-pressed', String(initiallyPaused));
  if (!initiallyPaused) await control.click();
  await expect(control).toHaveAttribute('aria-pressed', 'true');
}

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
      await imageLoaded(page.locator('.passage:visible .passage-field img'));
      await expect(page.locator('.passage:visible .passage-field img')).toHaveAttribute(
        'src',
        /\/art\/23-ink\.webp$/,
      );
      await noHorizontalOverflow(page);
      await page
        .locator('.site-header nav')
        .getByRole('link', { name: t.collection, exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp(`${localizedPath(locale, '/collection')}$`));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.atlas);
      await expect(page.locator('.atlas:visible')).toBeVisible();
      await expect(
        page.locator('.atlas:visible .position-anchor .constellation-select'),
      ).toHaveAttribute('aria-label', `${t.signature} 31`);
      await imageLoaded(page.locator('.atlas:visible .position-anchor img'));
      await collectionLoaded(page);
      await noHorizontalOverflow(page);
      expect(errors).toEqual([]);
    });
  }
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
    await expect(page.locator('.passage:visible .passage-field img')).toHaveAttribute(
      'src',
      /\/art\/23-light\.webp$/,
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
  await expect(page.locator('.passage:visible .passage-field img')).toHaveAttribute(
    'src',
    /\/art\/23-light\.webp$/,
  );
  await expect(page.locator('.passage:visible .passage-field video')).toHaveCount(0);
  await imageLoaded(page.locator('.passage:visible .passage-field img'));
  await page.getByRole('button', { name: /Return to Ink/ }).click();
  await expect(page.locator('.passage:visible .passage-field img')).toHaveAttribute(
    'src',
    /\/art\/23-ink\.webp$/,
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

test('Atlas selection, rehanging and material changes lead to the selected token', async ({
  page,
}) => {
  await page.goto('/collection');
  await pauseAmbientMotion(page);
  const atlas = page.locator('.atlas:visible');
  await atlas.getByRole('button', { name: 'Signature 35', exact: true }).click();
  await expect(atlas.locator('.position-anchor .constellation-select')).toHaveAttribute(
    'aria-label',
    'Signature 35',
  );
  await expect(atlas.locator('.atlas-selection h2')).toHaveText('Signature 35');
  await atlas.getByRole('button', { name: 'Rehang the constellation', exact: true }).click();
  await expect(atlas.locator('.constellation')).toHaveClass(/rehung/);
  await atlas.getByRole('button', { name: 'Light', exact: true }).click();
  await expect(atlas.locator('.position-anchor img')).toHaveAttribute(
    'src',
    /\/art\/35-light\.webp$/,
  );
  await expect(atlas.locator('video')).toHaveCount(0);
  await noHorizontalOverflow(page);
  await atlas.getByRole('link', { name: 'Enter this work', exact: true }).click();
  await expect(page).toHaveURL(/\/art\/35$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Signature 35');
});

test('artwork comparison and enlarged viewer preserve identity and Escape returns focus', async ({
  page,
}) => {
  await page.goto('/art/31');
  await pauseAmbientMotion(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Signature 31');
  const room = page.getByRole('region', { name: 'Ways of seeing', exact: true });
  await expect(room.locator('.art-media img')).toHaveAttribute(
    'src',
    /(?:\/art\/31-ink.webp|ember_full.webp)$/,
  );
  await room.getByRole('button', { name: 'See both expressions', exact: true }).click();
  await expect(room.locator('.viewer-plate')).toHaveClass(/paired/);
  await expect(room.locator('.viewer-plate > img')).toHaveAttribute('alt', 'Signature 31 · Light');
  await room.getByRole('button', { name: 'Single expression', exact: true }).click();
  await expect(room.locator('.viewer-plate')).not.toHaveClass(/paired/);
  const enlarge = page.getByRole('button', { name: 'Open full artwork viewer', exact: true });
  await enlarge.focus();
  await enlarge.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleName('Signature 31');
  await expect(dialog.locator('img')).toHaveAttribute(
    'src',
    /(?:\/art\/31-ink.webp|ember_full.webp)$/,
  );
  await expect(dialog.locator('video')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(enlarge).toBeFocused();
  const completeFilm = room.getByRole('button', { name: 'The complete film', exact: true });
  await completeFilm.focus();
  await completeFilm.press('Enter');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('video')).toHaveAttribute(
    'src',
    /(?:\/art\/31-ink-preview.mp4|\/videos\/web\/ember.mp4)$/,
  );
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(completeFilm).toBeFocused();
  await room.getByRole('button', { name: /^01 Light$|^02 Light$/ }).click();
  await expect(room.locator('.art-media')).toHaveAttribute('data-material', 'light');
  await expect(room.locator('.art-media img')).not.toHaveAttribute('src', /(?:23|35)-/);
  await noHorizontalOverflow(page);
});

test('Play from a still starts the intended film with one explicit action', async ({ page }) => {
  await page.goto('/art/31?view=still');
  await pauseAmbientMotion(page);
  const room = page.getByRole('region', { name: 'Ways of seeing', exact: true });
  await expect(room.getByRole('button', { name: 'Still', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await room.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(room.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect(room.locator('video')).toHaveAttribute(
    'src',
    /(?:\/art\/31-ink-preview.mp4|\/videos\/web\/ember.mp4)$/,
  );
  await expect
    .poll(() => room.locator('video').evaluate((element) => (element as HTMLVideoElement).paused))
    .toBe(false);
});

test('language switching preserves the current artwork route', async ({ page }) => {
  await page.goto('/art/31?view=still');
  await page.locator('.language-menu summary').click();
  await page.locator('.language-menu a[hreflang="ja"]').click();
  await expect(page).toHaveURL(/\/ja\/art\/31$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${catalogs.ja.signature} 31`);
});

for (const locale of locales) {
  for (const route of ['/', '/collection', '/art/31', '/process', '/auctions']) {
    const title =
      locale === 'en'
        ? `accessibility and visual evidence: ${route}`
        : `accessibility: ${locale} ${route}`;
    test(title, async ({ page }, testInfo) => {
      await page.goto(localizedPath(locale, route));
      await pauseAmbientMotion(page);
      await expect(page.getByRole('main')).toBeVisible();
      if (route === '/collection') await collectionLoaded(page, locale === 'en');
      await noHorizontalOverflow(page);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(
        results.violations.map(({ id, impact, nodes }) => ({
          id,
          impact,
          targets: nodes.map((node) => node.target),
        })),
      ).toEqual([]);
      if (locale === 'en') {
        const name = route === '/' ? 'home' : route.replaceAll('/', '-').slice(1);
        const screenshot = testInfo.outputPath(`${name}.png`);
        await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' });
        await testInfo.attach(name, { path: screenshot, contentType: 'image/png' });
      }
    });
  }
}
