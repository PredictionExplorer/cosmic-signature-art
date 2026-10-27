import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { catalogs } from '../../src/lib/i18n/messages';
import { collectionLoaded, imageLoaded, noHorizontalOverflow, pauseAmbientMotion } from './helpers';

const t = catalogs.en;
const index = JSON.parse(
  readFileSync(new URL('../../src/lib/art/collection-index.json', import.meta.url), 'utf8'),
) as {
  total: number;
  works: { id: number; cycle: number; wavelengthNm?: number; traits: Record<string, string> }[];
};
const folio = (id: number) => String(id).padStart(3, '0');

test('the first screen of the collection is a plate in the sequence’s rhythm, under the range', async ({
  page,
  isMobile,
}) => {
  await page.goto('/collection', { waitUntil: 'domcontentloaded' });
  await pauseAmbientMotion(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    `${t.collection} · ${folio(index.total - 1)}–${folio(index.total - 18)}`,
  );
  await collectionLoaded(page);
  const cards = page.locator('#works .work-card');
  await expect(cards).toHaveCount(18);
  const first = cards.first();
  await expect(first).toHaveAttribute('href', `/art/${index.total - 1}`);
  await expect(first).toHaveAttribute('aria-label', `№ ${folio(index.total - 1)} · ${t.ink}`);
  await expect(first).toContainText(folio(index.total - 1));
  await expect(first).not.toContainText('Signature');
  const rows = page.locator('#works [data-shape]');
  await expect(rows).toHaveCount(10);
  expect(
    await rows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-shape'))),
  ).toEqual(['1', '2', '3', '1', '2', '1', '3', '1', '2', '2']);
  if (!isMobile) {
    // The plate is fitted by height to the first screen: the head, the page's running line and the strip taken out.
    const plate = await rows.first().locator('.art-media').boundingBox();
    const viewport = page.viewportSize()!;
    expect(Math.abs(plate!.height - (viewport.height - 152))).toBeLessThanOrEqual(2);
  }
  // Rows of three are stills only; they never take the lease.
  await expect(rows.nth(2).locator('[data-preview-available="true"]')).toHaveCount(0);
  await expect(rows.nth(2).locator('[data-collection-preview]')).toHaveCount(0);
  // The first page is one cycle, so no chapter strip interrupts it.
  await expect(page.locator('#works h2[data-cycle]')).toHaveCount(0);
  await noHorizontalOverflow(page);
});

test('the number ordering walks the whole collection to token zero with chapter strips at the seams', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/collection', { waitUntil: 'domcontentloaded' });
  await pauseAmbientMotion(page);
  const main = page.getByRole('main');
  const seen = new Set<string>();
  let pages = 0;
  const strips: string[] = [];
  while (true) {
    await collectionLoaded(page);
    const cards = main.locator('#works .work-card');
    const links = await cards.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('href')),
    );
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toMatch(/^\/art\/\d+$/);
      expect(seen.has(link!)).toBe(false);
      seen.add(link!);
    }
    strips.push(
      ...(await main
        .locator('#works h2[data-cycle]')
        .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ''))),
    );
    pages += 1;
    const earlier = main.locator('.pagination').getByRole('link', { name: /Earlier works/ });
    if (!(await earlier.count())) break;
    await earlier.click();
    await expect(page).toHaveURL(/\/collection\?offset=\d+#works$/);
    await expect(cards.first()).not.toHaveAttribute('href', links[0]!, { timeout: 30_000 });
  }
  expect(pages).toBe(Math.ceil(index.total / 18));
  expect(seen.size).toBe(index.total);
  expect(seen.has('/art/0')).toBe(true);
  // Three cycles meet twice inside the pages; each seam has its strip, with the count and the date.
  expect(strips).toHaveLength(2);
  expect(strips[0]).toContain(`${t.cycle} 1`);
  expect(strips[0]).toContain('24 works');
  expect(strips[0]).toContain('August 11, 2026');
  expect(strips[1]).toContain(`${t.cycle} 0`);
  expect(strips[1]).toContain('June 15, 2026');
  await main
    .locator('.pagination')
    .getByRole('link', { name: /Later works/ })
    .click();
  await expect(page).toHaveURL(/\/collection\?offset=36#works$/);
});

test('the cycle ordering opens every cycle with its strip; the Light view is a night section', async ({
  page,
  isMobile,
}) => {
  await page.goto('/collection?order=cycle', { waitUntil: 'domcontentloaded' });
  await pauseAmbientMotion(page);
  await collectionLoaded(page);
  const strips = page.locator('#works h2[data-cycle]');
  await expect(strips).toHaveCount(3);
  await expect(strips.nth(0)).toContainText(`${t.cycle} 0`);
  await expect(strips.nth(2)).toContainText(`${t.cycle} 2`);
  await expect(page.locator('#works .work-card')).toHaveCount(index.total);
  await expect(page.locator('html')).toHaveAttribute('data-room', 'paper');
  const orderings = isMobile
    ? page.getByRole('navigation', { name: t.collectionControls })
    : page.locator('main header').getByRole('navigation', { name: t.ordering });
  await expect(orderings.getByRole('link', { name: t.orderCycle })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await orderings.getByRole('link', { name: t.light, exact: true }).click();
  await expect(page).toHaveURL(/\/collection\?order=cycle&expression=light$/);
  await expect(page.locator('html')).toHaveAttribute('data-room', 'night');
  await expect(page.getByRole('main')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await collectionLoaded(page);
  const first = page.locator('#works .work-card').first();
  await expect(first).toHaveAttribute('href', /\/art\/\d+\?expression=light$/);
  await expect(first.locator('[data-material]')).toHaveAttribute('data-material', 'light');
  await expect(page.locator('#works video')).toHaveCount(0);
  await noHorizontalOverflow(page);
});

test('the Spectrum wall hangs every Light preview on black along the nanometre rule', async ({
  page,
  isMobile,
}) => {
  await page.goto('/collection?order=spectrum', { waitUntil: 'domcontentloaded' });
  await pauseAmbientMotion(page);
  await expect(page.locator('html')).toHaveAttribute('data-room', 'night');
  await expect(page.getByRole('main')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('380–700 nm');
  const wall = page.locator('[data-spectrum-wall]');
  await expect(wall.getByRole('heading', { name: t.spectrumWall })).toBeVisible();
  const measured = index.works.filter((work) => work.wavelengthNm !== undefined);
  const hangs = wall.locator('a[data-work]');
  await expect(hangs).toHaveCount(measured.length);
  const violet = measured.filter((work) => work.wavelengthNm === 380).sort((a, b) => a.id - b.id);
  await expect(hangs.first()).toHaveAttribute('href', `/art/${violet[0].id}?expression=light`);
  await expect(hangs.first()).toHaveAttribute(
    'aria-label',
    `№ ${folio(violet[0].id)} · ${t.light} · 380 nm`,
  );
  const red = measured.filter((work) => work.wavelengthNm === 700).sort((a, b) => a.id - b.id);
  await expect(hangs.last()).toHaveAttribute('href', `/art/${red.at(-1)!.id}?expression=light`);
  await hangs.first().scrollIntoViewIfNeeded();
  await imageLoaded(hangs.first().locator('img'));
  if (!isMobile) {
    // Columns at different nanometres never cross, and the same nanometre stacks.
    const boxes = await wall.locator('li[data-count]').evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          x: rect.left,
          y: rect.top,
          w: rect.width,
          h: rect.height,
          n: node.getAttribute('data-count'),
        };
      }),
    );
    for (let a = 0; a < boxes.length; a += 1)
      for (let b = a + 1; b < boxes.length; b += 1) {
        const i = boxes[a];
        const j = boxes[b];
        const apart =
          i.x + i.w <= j.x + 1 ||
          j.x + j.w <= i.x + 1 ||
          i.y + i.h <= j.y + 1 ||
          j.y + j.h <= i.y + 1;
        expect(apart).toBe(true);
      }
    expect(boxes.some((box) => Number(box.n) > 1)).toBe(true);
    // The rule's ticks sit on the columns they label: 380 nm on the first, 700 nm on the last.
    const columns = wall.locator('li[data-count]');
    const ticks = wall.locator('div[aria-hidden="true"] > span').filter({ hasText: /^(380|700)$/ });
    const centre = async (index: number) => {
      const box = (await columns.nth(index).boundingBox())!;
      return box.x + box.width / 2;
    };
    const tickX = async (label: string) => {
      const box = (await ticks.filter({ hasText: label }).first().boundingBox())!;
      return box.x + box.width / 2;
    };
    expect(Math.abs((await tickX('380')) - (await centre(0)))).toBeLessThanOrEqual(2);
    expect(
      Math.abs((await tickX('700')) - (await centre((await columns.count()) - 1))),
    ).toBeLessThanOrEqual(2);
  }
  await expect(page.getByText(t.unmeasured)).toHaveCount(0);
  await noHorizontalOverflow(page);
  await hangs.first().click();
  await expect(page).toHaveURL(new RegExp(`/art/${violet[0].id}\\?expression=light$`));
});

test('filter chips narrow the collection through the published traits and can be cleared', async ({
  page,
}) => {
  const expected = index.works.filter(
    (work) => work.cycle === 2 && work.traits.fate === 'Ejection',
  );
  await page.goto('/collection?cycle=2&fate=Ejection', { waitUntil: 'domcontentloaded' });
  await pauseAmbientMotion(page);
  await collectionLoaded(page);
  await expect(page.locator('#works .work-card')).toHaveCount(expected.length);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(`${expected.length} works`);
  const filters = page.getByRole('navigation', { name: t.filters });
  await expect(filters.getByRole('link', { name: `${t.cycle} 2` })).toHaveAttribute(
    'href',
    '/collection?fate=Ejection',
  );
  await expect(filters.getByRole('link', { name: `${t.fate} · Ejection` })).toHaveAttribute(
    'href',
    '/collection?cycle=2',
  );
  await filters.getByRole('link', { name: t.clearFilters }).click();
  await expect(page).toHaveURL(/\/collection$/);
  await collectionLoaded(page);
  await expect(page.locator('#works .work-card')).toHaveCount(18);
});

test('the Index of numbers opens from the head and the slash key, hangs the work under the hand, and enters it', async ({
  page,
  isMobile,
  browserName,
}) => {
  await page.goto('/collection', { waitUntil: 'domcontentloaded' });
  await pauseAmbientMotion(page);
  const indexWord = page
    .locator('.site-header')
    .getByRole('button', { name: t.index, exact: true });
  await indexWord.click();
  const sheet = page.getByRole('dialog', { name: t.indexSheet });
  await expect(sheet).toBeVisible();
  const numerals = sheet.getByRole('list', { name: t.index });
  await expect(numerals.getByRole('link')).toHaveCount(index.total);
  await expect(numerals.locator('> li')).toHaveCount(3);
  const thirtyOne = sheet.getByRole('link', { name: '№ 031', exact: true });
  await expect(thirtyOne).toHaveText('031');
  await expect(thirtyOne).toHaveAttribute('href', '/art/31');
  const wall = sheet.locator('[data-material]');
  await expect(wall.locator('img')).toHaveCount(0);
  if (isMobile) {
    // The first tap hangs the work on the wall; the second enters it.
    await thirtyOne.tap();
    await expect(wall.locator('img')).toHaveAttribute('data-work', '31');
    await expect(sheet).toBeVisible();
    await thirtyOne.tap();
  } else {
    await thirtyOne.hover();
    await expect(wall.locator('img')).toHaveAttribute('data-work', '31');
    await expect(wall.locator('img')).toHaveAttribute('src', /ember_preview\.webp$/);
    await sheet.getByRole('link', { name: '№ 035', exact: true }).focus();
    await expect(wall.locator('img')).toHaveAttribute('data-work', '35');
    await page.keyboard.press('Escape');
    await expect(sheet).not.toBeVisible();
    // WebKit does not focus a button on click, so there is nothing for the dialog to return to there.
    if (browserName === 'chromium') await expect(indexWord).toBeFocused();
    // The slash key opens it from anywhere; digits then Enter go straight to a work.
    await page.keyboard.press('/');
    await expect(sheet).toBeVisible();
    await page.keyboard.press('3');
    await page.keyboard.press('5');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/art\/35$/);
    await expect(sheet).not.toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/collection$/);
    await pauseAmbientMotion(page);
    await page.keyboard.press('/');
    await sheet.getByRole('link', { name: '№ 031', exact: true }).focus();
    await page.keyboard.press('Enter');
  }
  await expect(page).toHaveURL(/\/art\/31$/);
  await expect(sheet).not.toBeVisible();
});

test('the Index sheet searches by number and the Light view follows the result', async ({
  page,
  isMobile,
}) => {
  await page.goto('/collection', { waitUntil: 'domcontentloaded' });
  await pauseAmbientMotion(page);
  await page.locator('.site-header').getByRole('button', { name: t.index, exact: true }).click();
  const sheet = page.getByRole('dialog', { name: t.indexSheet });
  await sheet.getByRole('textbox', { name: t.search }).fill('0');
  await sheet.getByRole('button', { name: t.find, exact: true }).click();
  await expect(page).toHaveURL(/\/collection\?q=0$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('“0”');
  await collectionLoaded(page);
  const result = page.locator('#works .work-card');
  await expect(result).toHaveCount(1);
  await expect(result).toHaveAttribute('href', '/art/0');
  // Published works can gain new expressions; choose Light explicitly.
  await (
    isMobile
      ? page.getByRole('navigation', { name: t.collectionControls })
      : page.locator('main header').getByRole('navigation', { name: t.ordering })
  )
    .getByRole('link', { name: t.light, exact: true })
    .click();
  await expect(page).toHaveURL(/\/collection\?expression=light&q=0$/);
  await collectionLoaded(page);
  await expect(result).toHaveAttribute('href', '/art/0?expression=light');
  await result.click();
  await expect(page).toHaveURL(/\/art\/0\?expression=light$/);
  await expect(page.getByRole('main').locator('.viewer-plate .art-media')).toHaveAttribute(
    'data-material',
    'light',
  );
  await noHorizontalOverflow(page);
});

test('on a phone the collection carries a bottom bar and the Index sheet is the menu', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'The pocket edition only');
  await page.goto('/collection', { waitUntil: 'domcontentloaded' });
  await pauseAmbientMotion(page);
  const bar = page.getByRole('navigation', { name: t.collectionControls });
  await expect(bar).toBeVisible();
  await expect(bar.getByRole('link', { name: t.orderSpectrum })).toHaveAttribute(
    'href',
    '/collection?order=spectrum',
  );
  await expect(bar.getByRole('link', { name: t.light, exact: true })).toHaveAttribute(
    'href',
    '/collection?expression=light',
  );
  await expect(bar.getByRole('link', { name: t.older })).toHaveAttribute(
    'href',
    '/collection?offset=18#works',
  );
  const indexButton = bar.getByRole('button', { name: t.index });
  await expect(indexButton).toHaveAttribute('aria-expanded', 'false');
  await expect(indexButton).toHaveAttribute('aria-controls', 'index-sheet');
  await indexButton.click();
  const sheet = page.getByRole('dialog', { name: t.indexSheet });
  await expect(sheet).toBeVisible();
  await expect(indexButton).toHaveAttribute('aria-expanded', 'true');
  const menu = sheet.getByRole('navigation', { name: t.siteNavigation });
  await expect(menu.getByRole('link')).toHaveText([
    t.auctions,
    t.collection,
    t.process,
    t.statement,
  ]);
  await expect(menu.getByRole('button', { name: t.pauseAmbientMotion })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(sheet.getByRole('navigation', { name: t.language }).getByRole('link')).toHaveCount(
    8,
  );
  await noHorizontalOverflow(page);
});

test('an unprintable search is no search, a repeated key reads once, and an ordering leaves the search', async ({
  page,
  isMobile,
}) => {
  // A tab in the query is not a search: the page is the number ordering, not the error page.
  await page.goto('/collection?q=a%09b', { waitUntil: 'domcontentloaded' });
  await pauseAmbientMotion(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('071');
  await expect(page.getByText(t.errorTitle)).toHaveCount(0);
  await collectionLoaded(page);
  await expect(page.locator('#works .work-card')).toHaveCount(18);
  // A repeated key counts once, so the page and the room agree.
  await page.goto('/collection?expression=light&expression=light', {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByRole('main')).toHaveAttribute('data-expression', 'light');
  await expect(page.locator('html')).toHaveAttribute('data-room', 'night');
  // Choosing an ordering from the Index sheet leaves a search behind, as the page's own words do.
  await page.goto('/collection?q=0', { waitUntil: 'domcontentloaded' });
  await pauseAmbientMotion(page);
  await (
    isMobile
      ? page.getByRole('navigation', { name: t.collectionControls })
      : page.locator('.site-header')
  )
    .getByRole('button', { name: t.index, exact: true })
    .click();
  const sheet = page.getByRole('dialog', { name: t.indexSheet });
  await expect(sheet).toBeVisible();
  await expect(
    sheet.getByRole('navigation', { name: t.ordering }).getByRole('link', { name: t.orderCycle }),
  ).toHaveAttribute('href', '/collection?order=cycle');
});
