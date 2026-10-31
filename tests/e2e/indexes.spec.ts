import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { fill } from '../../src/lib/i18n/format';
import { catalogs } from '../../src/lib/i18n/messages';
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

  test('is one exposure of every Light still, stated as a derived view, never a sharing card', async ({
    page,
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
      await expect(readout(page)).toHaveText(/^Through this point · № \d{3}( · № \d{3})*$/);
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
    await expect(readout(page)).toHaveText(t.allTheLightPoint);
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
