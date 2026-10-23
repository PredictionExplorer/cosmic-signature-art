import { expect, test, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { catalogs } from '../../src/lib/i18n/messages';
import { locales, localizedPath } from '../../src/lib/i18n/routing';
import { readFileSync } from 'node:fs';

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
  await page.goto('/collection?view=atlas');
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

test('the complete catalogue can be traversed to the first token and searched by token zero', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/collection');
  await pauseAmbientMotion(page);
  const main = page.getByRole('main');
  const seen = new Set<string>();
  let pages = 0;
  while (true) {
    await collectionLoaded(page);
    const cards = main.locator('#works .work-grid:not(.collection-skeleton) .work-card');
    const links = await cards.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('href')),
    );
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toMatch(/^\/art\/\d+(?:\?expression=light)?$/);
      const identity = new URL(link!, page.url()).pathname;
      expect(seen.has(identity)).toBe(false);
      seen.add(identity);
    }
    pages += 1;
    const earlier = main.locator('.pagination').getByRole('link', { name: /Earlier works/ });
    if (!(await earlier.count())) break;
    await earlier.click();
    await expect(page).toHaveURL(/\/collection\?offset=\d+#works$/);
    // The URL can update before the streamed catalogue replaces the preceding page.
    await expect(cards.first()).not.toHaveAttribute('href', links[0]!, { timeout: 30_000 });
  }
  expect(pages).toBeGreaterThan(1);
  expect(seen.has('/art/0')).toBe(true);
  const newer = main.locator('.pagination').getByRole('link', { name: /Later works/ });
  await expect(newer).toBeVisible();
  const lastPageFirst = await main.locator('#works .work-card').first().getAttribute('href');
  await newer.click();
  await expect(main.locator('#works .work-card').first()).not.toHaveAttribute(
    'href',
    lastPageFirst!,
    { timeout: 30_000 },
  );
  await collectionLoaded(page);
  await page.getByRole('textbox', { name: catalogs.en.search }).fill('0');
  await page.getByRole('button', { name: /Find work/ }).click();
  await expect(page).toHaveURL(/\/collection\?q=0$/);
  const result = main.locator('#works .work-grid .work-card');
  await expect(result).toHaveCount(1);
  await expect(result).toHaveAttribute('href', '/art/0?expression=light');
  await collectionLoaded(page);
  await result.click();
  await expect(page).toHaveURL(/\/art\/0\?expression=light$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Signature 0');
  await expect(main).toHaveCount(1);
  await expect(main.locator('.viewer-plate .art-media')).toHaveAttribute('data-material', 'light');
  await expect(main.locator('#record')).toContainText(catalogs.en.cycle);
  await noHorizontalOverflow(page);
});

test('an artwork exposes genuine custody history, composition, and original published files', async ({
  page,
}) => {
  await page.goto('/art/31?view=still#record');
  await pauseAmbientMotion(page);
  const main = page.getByRole('main');
  await expect(main).toHaveCount(1);
  const record = main.locator('#record');
  await expect(record.getByRole('heading', { name: catalogs.en.provenanceTitle })).toBeVisible();
  const archive = JSON.parse(
    readFileSync(new URL('../../src/lib/art/curated-records.json', import.meta.url), 'utf8'),
  ) as { records: { id: number; transactionHash: string; seed: string }[] };
  const identity = archive.records.find((entry) => entry.id === 31)!;
  await expect(record.getByRole('link', { name: /Transaction/ })).toHaveAttribute(
    'href',
    `https://arbiscan.io/tx/${identity.transactionHash}`,
  );
  await expect(record).toContainText(identity.seed);
  const custody = main.getByRole('region', { name: catalogs.en.ownershipHistory });
  await expect(
    custody.getByRole('heading', { name: catalogs.en.eventMint, exact: true }),
  ).toBeVisible();
  await expect(custody.getByRole('link', { name: /Transaction/ }).first()).toHaveAttribute(
    'href',
    /^https:\/\/arbiscan\.io\/tx\/0x[\da-f]{64}$/i,
  );
  await expect(main.getByText(catalogs.en.historyNote)).toBeVisible();
  await expect(custody.getByText(/^(Sold|Sale price|ETH)$/i)).toHaveCount(0);
  const composition = main.getByRole('region', { name: catalogs.en.composition });
  await expect(composition).toBeVisible();
  await expect(composition).toContainText(catalogs.en.structure);
  await expect(composition).toContainText(catalogs.en.syzygies);
  const sources = main.getByRole('region', { name: catalogs.en.sources });
  await expect(sources.getByRole('link', { name: /Published film/ }).first()).toHaveAttribute(
    'href',
    new RegExp(`/${identity.seed}/videos/web/`),
  );
  await sources.locator('summary').click();
  await expect(sources.getByRole('link', { name: /Token metadata/ })).toHaveAttribute(
    'href',
    'https://a1.cosmicsignature.com/metadata/31',
  );
  await noHorizontalOverflow(page);
});

test('invalid history cursors show an honest recovery path without losing the still view', async ({
  page,
}) => {
  await page.goto('/art/31?view=still&transfers=bad%2Fcursor#history');
  await pauseAmbientMotion(page);
  const history = page.locator('#history');
  await expect(history.getByText(catalogs.en.historyUnavailable)).toBeVisible();
  const reset = history.getByRole('link', { name: /Latest events/ });
  await expect(reset).toHaveAttribute('href', '/art/31?view=still#history');
  await reset.click();
  await expect(page).toHaveURL(/\/art\/31\?view=still#history$/);
  await expect(page.getByRole('region', { name: catalogs.en.ownershipHistory })).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: catalogs.en.ways })
      .getByRole('button', { name: catalogs.en.still, exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
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
  await expect(dialog).toHaveAccessibleName(`Signature 31 · ${catalogs.en.viewingRoom}`);
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
  await expect(room.locator('video')).toHaveAttribute('src', /\/art\/previews\/31-[a-f\d]+\.mp4$/);
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

test('Process moves from a seamless Light room into matching Ink paper and restores gallery chrome', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/process');
  await pauseAmbientMotion(page);
  const header = page.locator('.site-header');
  const lightRoom = page.getByRole('region', { name: catalogs.en.processTitle });
  const light = page.locator('#light .art-media:visible');
  await light.scrollIntoViewIfNeeded();
  await imageLoaded(light.locator('img'));
  await expect(header).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(lightRoom).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(light).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(light.locator('img')).toHaveAttribute('alt', 'Signature 31 · Light');
  const archive = JSON.parse(
    readFileSync(new URL('../../src/lib/art/curated-records.json', import.meta.url), 'utf8'),
  ) as { records: { id: number; seed: string }[] };
  const seed = archive.records.find((item) => item.id === 31)!.seed;
  await expect(light.locator('img')).toHaveAttribute(
    'src',
    new RegExp(`(?:/art/31-light\\.webp$|/${seed}/images/)`),
  );
  if (await light.locator('video').count()) {
    expect(await light.locator('video').getAttribute('src')).toContain(
      `/${seed}/videos/web/main.mp4`,
    );
  }
  await page
    .getByRole('navigation', { name: catalogs.en.ways })
    .getByRole('link', { name: /02/ })
    .click();
  await expect(page).toHaveURL(/\/process#ink$/);
  await expect(page.locator('#ink-title')).toBeInViewport();
  const ink = page.locator('#ink .art-media');
  await ink.scrollIntoViewIfNeeded();
  await imageLoaded(ink.locator('img'));
  await expect(page.locator('#ink')).toHaveCSS('background-color', 'rgb(241, 235, 223)');
  await expect(ink).toHaveCSS('background-color', 'rgb(241, 235, 223)');
  await expect(ink.locator('img')).toHaveAttribute('src', /\/art\/31-ink.webp$/);
  // Sample the authentic local still's paper, not an invented CSS approximation.
  const paperPixel = await ink.locator('img').evaluate((element) => {
    const image = element as HTMLImageElement;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0, 16, 16, 0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
  });
  expect(
    paperPixel.every((channel, index) => Math.abs(channel - [241, 235, 223][index]) <= 8),
  ).toBe(true);
  await noHorizontalOverflow(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(header).toBeInViewport();
  await page.getByRole('heading', { level: 1 }).click();
  const screenshot = testInfo.outputPath('process-redesign.png');
  await page.screenshot({
    path: screenshot,
    fullPage: true,
    animations: 'disabled',
    style: 'nextjs-portal { visibility: hidden; }',
  });
  await testInfo.attach('process-redesign', { path: screenshot, contentType: 'image/png' });
  await header.getByRole('link', { name: catalogs.en.collection, exact: true }).click();
  await expect(page).toHaveURL(/\/collection$/);
  await expect(page.locator('.process-page:visible')).toHaveCount(0);
  await expect(header).not.toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(header).toHaveCSS('color', 'rgb(34, 35, 31)');
  expect(errors).toEqual([]);
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
