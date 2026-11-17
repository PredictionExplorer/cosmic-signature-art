import { expect, failedToLoad, test, type Page } from './fixtures';
import { catalogs } from '../../src/lib/i18n/messages';
import { noHorizontalOverflow } from './helpers';

const t = catalogs.en;

async function pauseMotion(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem('cosmic-art-motion-v1', 'paused'));
}

/** A catalog line as a pattern reads it: every character its own. */
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('the exhibitions are a quiet list: the hang, four trails and every cycle, each dated and summarised', async ({
  page,
  isMobile,
}) => {
  await pauseMotion(page);
  await page.goto('/exhibitions');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.exhibitions);
  const rows = page.getByRole('main').getByRole('listitem').getByRole('link');
  await expect(rows).toHaveCount(8);
  // A row is named by what it shows, in the order it shows it: the kind and date, the title,
  // its one line. A name of the title alone kept the rest from a listener, and no longer held
  // the words a visitor reads on the row and may speak to press it (WCAG 2.5.3).
  await expect(rows.first()).toHaveAccessibleName(
    new RegExp(`^${literal(t.hang)} · .+\\s${literal(t.hangTitle)}\\s+3 works$`),
  );
  await expect(rows.first()).toHaveAttribute('href', '/exhibitions/a-hang');
  await expect(rows.nth(1)).toHaveAccessibleName(
    new RegExp(
      `^${literal(t.trail)} · .+\\s${literal(t.trailLongCurve)}\\s+${literal(t.trailLongCurveRule)}$`,
    ),
  );
  await expect(rows.nth(5)).toHaveAccessibleName(
    new RegExp(`^${literal(t.cycle)} · .+\\sCycle 0\\s+24 works$`),
  );
  // The running head carries the room; on a phone its words live in the Index sheet.
  if (!isMobile)
    await expect(
      page.locator('.site-header').getByRole('link', { name: t.exhibitions }).first(),
    ).toHaveAttribute('aria-current', 'page');
  await noHorizontalOverflow(page);
});

test('a trail states its rule, hangs its works in the plate sequence and prints the measure beside each', async ({
  page,
}) => {
  await pauseMotion(page);
  await page.goto('/exhibitions/the-long-curve');
  const main = page.getByRole('main');
  const spread = main.locator('header').first();
  await expect(main.getByRole('heading', { level: 1 })).toHaveText(t.trailLongCurve);
  await expect(spread.getByText(`${t.trail} · October 27, 2026`)).toBeVisible();
  await expect(spread.getByText('Hung by Cosmic Signature')).toBeVisible();
  await expect(spread.getByText(t.trailLongCurveRule)).toBeVisible();
  await expect(spread.getByText(t.trailLongCurveNote)).toBeVisible();
  // The trail was re-hung in November 2026 by the orbit's own length against its width; the
  // page keeps what it hung, and says when and what it followed before.
  await expect(spread.getByText(t.trailLongCurveCorrected)).toBeVisible();
  const measures = main.getByRole('list').last().getByRole('listitem');
  const count = await main.locator('ol').nth(0).getByRole('listitem').count();
  expect(count).toBeGreaterThanOrEqual(6);
  expect(count).toBeLessThanOrEqual(12);
  await expect(measures.first().getByRole('link')).toContainText('№ 051');
  await expect(measures.first().getByRole('link')).toContainText('2.01 times as long as wide');
  await expect(measures.first().getByRole('link')).toHaveAttribute('href', '/art/51');
  // The plates above are the works' own stills, numeral captions only, each work as its pair.
  const plates = main.locator('.work-grid .work-card');
  await expect(plates).toHaveCount(count * 2);
  await expect(plates.first()).toHaveAttribute('href', '/art/51?expression=ink');
  await expect(plates.first().locator('img').first()).toHaveAttribute(
    'src',
    /full|ember_full|\.webp/,
  );
  await noHorizontalOverflow(page);
});

test('the hang seeds three plates from local stills and grows the one under the hand', async ({
  page,
  isMobile,
}) => {
  await pauseMotion(page);
  await page.goto('/exhibitions/a-hang');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1 })).toHaveText(t.hangTitle);
  await expect(main.getByText(t.hangNote)).toBeVisible();
  // The suite's day is an Ink day: the leaves take turns from Ink, so the wall stands on both grounds.
  const leaves = main.getByRole('link', { name: /^№ 0(23|31|35) · (Ink|Light)$/ });
  await expect(leaves).toHaveCount(3);
  for (const [index, still] of ['23-ink', '31-light', '35-ink'].entries()) {
    await expect(leaves.nth(index).locator('img.art-still')).toHaveAttribute(
      'src',
      `/art/${still}.webp`,
    );
    await expect(leaves.nth(index)).toHaveAttribute('data-state', 'even');
  }
  if (!isMobile) {
    await leaves.nth(1).hover();
    await expect(leaves.nth(1)).toHaveAttribute('data-state', 'chosen');
    await expect(leaves.nth(0)).toHaveAttribute('data-state', 'other');
    const chosen = await leaves.nth(1).boundingBox();
    const other = await leaves.nth(0).boundingBox();
    await expect
      .poll(async () => (await leaves.nth(1).boundingBox())!.width)
      .toBeGreaterThan(other!.width * 1.8);
    expect(chosen).not.toBeNull();
    await leaves.nth(1).click();
    await expect(page).toHaveURL(/\/art\/31\?expression=light$/);
  } else {
    // On a phone the first tap chooses, the second enters.
    await leaves.nth(2).tap();
    await expect(leaves.nth(2)).toHaveAttribute('data-state', 'chosen');
    await expect(page).toHaveURL(/\/exhibitions\/a-hang$/);
    await leaves.nth(2).tap();
    await expect(page).toHaveURL(/\/art\/35\?expression=ink$/);
  }
});

test('the hang ends where the way onward begins: every link beneath it can be pressed', async ({
  page,
}) => {
  await pauseMotion(page);
  await page.goto('/exhibitions/a-hang');
  const main = page.getByRole('main');
  const leaves = main.getByRole('link', { name: /^№ 0(23|31|35) · (Ink|Light)$/ });
  await expect(leaves).toHaveCount(3);
  const onward = main.getByRole('navigation', { name: t.otherExhibitions }).getByRole('link');
  await expect(onward).toHaveCount(8);
  // On a phone the leaves stack. Held to the screen's height, the wall let its last leaf lie
  // over the first links onward: they were on the page and could be neither seen nor pressed.
  const wall = (await leaves.last().boundingBox())!;
  const first = (await onward.first().boundingBox())!;
  expect(wall.y + wall.height).toBeLessThanOrEqual(first.y);
  for (const link of await onward.all()) {
    await link.scrollIntoViewIfNeeded();
    // The link itself is what a finger at its middle meets.
    const met = await link.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const under = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return element.contains(under);
    });
    expect(met, (await link.getAttribute('href')) ?? '').toBe(true);
  }
});

test('a cycle keeps every work of the cycle with its count and imprint date', async ({ page }) => {
  await pauseMotion(page);
  await page.goto('/exhibitions/cycle-1');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1 })).toHaveText('Cycle 1');
  await expect(
    main.locator('header').first().getByText(`${t.cycle} · August 11, 2026`),
  ).toBeVisible();
  await expect(main.getByText('24 works').first()).toBeVisible();
  await expect(main.locator('.work-grid .work-card')).toHaveCount(48);
  await expect(main.getByText(t.results)).toHaveCount(0);
  await expect(
    main.getByRole('navigation', { name: t.otherExhibitions }).getByRole('link'),
  ).toHaveCount(8);
  await noHorizontalOverflow(page);
});

test('the sharing cards are drawn from the works’ own rungs for a work, the home and the collection', async ({
  page,
  request,
}, testInfo) => {
  for (const [name, path] of [
    ['work', '/art/31'],
    ['home', '/'],
    ['collection', '/collection'],
  ] as const) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    const href = await page.locator('meta[property="og:image"]').first().getAttribute('content');
    expect(href, `${path} has an og:image`).toMatch(/opengraph-image/);
    // The tag names the deployment's origin; the card itself is served by the server under test.
    const card = new URL(href!);
    const response = await request.get(`${card.pathname}${card.search}`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
    const body = await response.body();
    expect(body.length).toBeGreaterThan(20_000);
    const file = testInfo.outputPath(`card-${name}.png`);
    await (await import('node:fs/promises')).writeFile(file, body);
    await testInfo.attach(`card-${name}`, { path: file, contentType: 'image/png' });
  }
  const alt = await page
    .goto('/art/31')
    .then(() => page.locator('meta[property="og:image:alt"]').first().getAttribute('content'));
  expect(alt).toBe('№\u00a0031 · Ink · Light');
});

test('an unknown exhibition is not here, and the venue says which work is next door', async ({
  page,
  faults,
}) => {
  // Refused before its page can stream (src/lib/addresses.ts): a true 404, the venue's own.
  faults.allow(failedToLoad('/exhibitions/nowhere'));
  const response = await page.goto('/exhibitions/nowhere');
  expect(response?.status()).toBe(404);
  // An exhibition is a page, not a work: the page is what is not here.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.pageNotFound);
  await expect(page.getByRole('main')).toContainText(/next door/);
  await expect(page.getByRole('main')).not.toContainText(t.hangTitle);
});
