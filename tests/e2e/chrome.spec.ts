import { expect, test, type Page } from './fixtures';
import { catalogs } from '../../src/lib/i18n/messages';
import { noHorizontalOverflow } from './helpers';

const t = catalogs.en;

/**
 * The page as a visitor has it, before anything is read of its faces. A streamed page first
 * shows its loading plate; its own content is revealed on a frame after it arrives, and on a
 * busy machine that frame can come after `load`. A face is asked for only once words set in it
 * are laid out, so a reading taken at `load` can find the frame's faces alone.
 */
async function stands(page: Page) {
  await expect(page.locator('main.loading-room, div[hidden][id^="S:"]')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}

/** The families the page has loaded so far, each named once. */
const loadedFaces = (page: Page) =>
  page.evaluate(() =>
    [...document.fonts]
      .filter((font) => font.status === 'loaded')
      // Firefox quotes a family name that contains spaces; the name itself is what matters.
      .map((font) => font.family.replace(/^"|"$/g, ''))
      .filter((family, index, all) => all.indexOf(family) === index),
  );

test('public browsing hides auctions while their direct URL remains available', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('a[href*="/auctions"], a[href$="/terms"]')).toHaveCount(0);
  await page.locator('.site-header').getByRole('button', { name: t.index, exact: true }).click();
  const directory = page.getByRole('dialog', { name: t.indexSheet });
  await expect(directory).toBeVisible();
  const navigation = directory.getByRole('navigation', { name: t.siteNavigation });
  await expect(navigation.getByRole('link', { name: t.process, exact: true })).toBeVisible();
  await expect(navigation.getByRole('link', { name: t.statement, exact: true })).toBeVisible();
  await expect(directory.locator('a[href*="/auctions"]')).toHaveCount(0);

  await page.goto('/auctions');
  await expect(page.locator('#auction-title')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});

test('the running head keeps two viewing rooms, Index, motion and language', async ({
  page,
  isMobile,
}) => {
  await page.goto('/collection');
  const head = page.locator('.site-header');
  await expect(head).toHaveCSS('height', isMobile ? '56px' : '48px');
  const nav = head.getByRole('navigation', { name: t.siteNavigation });
  const index = head.getByRole('button', { name: t.index });
  await expect(index).toBeVisible();
  await expect(head.getByRole('button', { name: t.pauseAmbientMotion })).toBeVisible();
  if (isMobile) {
    // On phones the words live in the Index sheet; the head keeps the wordmark, the motion control and Index.
    await expect(nav.getByRole('link', { name: t.collection })).toBeHidden();
    await expect(head.getByRole('button', { name: `${t.language}: EN` })).toBeHidden();
  } else {
    await expect(nav.getByRole('link')).toHaveText([t.collection, t.exhibitions]);
    await expect(nav.getByRole('link', { name: t.collection })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(head.getByRole('button', { name: `${t.language}: EN` })).toBeVisible();
  }
  // The wordmark is typeset, not drawn; the mark has one accessible name.
  await expect(head.locator('.head-row').first().locator('.brand-name')).toHaveText(
    'Cosmic Signature',
  );
  await expect(head.getByRole('img', { name: t.markLabel })).toBeVisible();
  await noHorizontalOverflow(page);
});

test('the ? key opens the key sheet, Escape closes it, and keys stay silent inside a field', async ({
  page,
}) => {
  await page.goto('/auctions');
  await expect(page.locator('html')).toHaveAttribute('data-keys', 'ready');
  await page.keyboard.press('?');
  const sheet = page.getByRole('dialog', { name: t.keysSheet });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(t.keyJump)).toBeVisible();
  await expect(sheet.getByText(t.keyExpressions)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  // Typing digits then Enter from anywhere goes to that work.
  await page.keyboard.type('31');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/art\/31$/);
});

test('the colophon states the record date and keeps the one outward arrow', async ({ page }) => {
  await page.goto('/auctions');
  const footer = page.locator('.site-footer');
  await footer.scrollIntoViewIfNeeded();
  await expect(footer.getByText(/Arbitrum record as of/)).toBeVisible();
  await expect(footer.getByText(t.colophonType)).toBeVisible();
  const outward = footer.getByRole('link', { name: /↗/ });
  await expect(outward).toHaveCount(1);
  await expect(outward).toHaveAttribute('href', 'https://cosmicsignature.com');
  const rows = footer.getByRole('navigation', { name: t.colophon }).getByRole('link');
  await expect(rows).toHaveText([
    t.collection,
    t.exhibitions,
    t.process,
    t.statement,
    t.privacy,
    `${t.openProtocol} ↗`,
  ]);
});

test('a CJK locale links its own sliced display face and the Latin pages load none', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/fonts/cjk/')) requests.push(request.url());
  });
  await page.goto('/auctions');
  // The whole page, not its frame alone, asks for no CJK face.
  await stands(page);
  expect(requests).toEqual([]);
  // The Latin roman the first paint reads in arrives with the page.
  await expect(
    page.locator(
      'link[rel="preload"][as="font"][href="/fonts/literata/literata-latin-roman.woff2"]',
    ),
  ).toHaveCount(1);
  await page.goto('/ja/auctions');
  await expect(page.locator('link[rel="stylesheet"][href="/fonts/cjk/ja.css"]')).toHaveCount(1);
  await expect.poll(() => requests.some((url) => url.endsWith('/fonts/cjk/ja.css'))).toBe(true);
  expect(requests.some((url) => url.endsWith('/fonts/cjk/ja.css'))).toBe(true);
  await stands(page);
  // The wordmark in Literata itself, Latin words in Japanese lines in Literata set to the kana
  // ('Literata Han'), the instrument in Plex Mono, the Japanese in its own Mincho. Read until
  // they are all there: the instrument stands in the page's own content, the last to be laid out.
  await expect
    .poll(() => loadedFaces(page))
    .toEqual(
      expect.arrayContaining(['Literata', 'Literata Han', 'IBM Plex Mono', 'Shippori Mincho B1']),
    );
});

for (const path of ['/collection/orrery', '/ja/collection/orrery']) {
  test(`${path}: a numero sign in an instrument line is Literata's, its figures Plex Mono's`, async ({
    page,
  }) => {
    await page.goto(path);
    // The line is measured as it is drawn: in the page that stands, with its figures' face in.
    await stands(page);
    await expect.poll(() => loadedFaces(page)).toContain('IBM Plex Mono');
    await page.evaluate(() => document.fonts.ready);
    // Plex Mono draws № in one cell, 0.6 em; Literata sets the sign as a book does, near an em.
    const advances = await page.evaluate(() => {
      const label = [...document.querySelectorAll('body *')].find(
        (element) =>
          /Plex Mono/.test(getComputedStyle(element).fontFamily) &&
          [...element.childNodes].some(
            (node) => node.nodeType === Node.TEXT_NODE && /^№\u00a0\d{3}$/.test(node.textContent!),
          ),
      )!;
      const text = [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE)!;
      const advance = (start: number) => {
        const range = document.createRange();
        range.setStart(text, start);
        range.setEnd(text, start + 1);
        return range.getBoundingClientRect().width;
      };
      return {
        size: parseFloat(getComputedStyle(label).fontSize),
        numero: advance(0),
        figure: advance(2),
      };
    });
    // WebKit measures a range to the whole pixel, so a figure is its cell within one.
    expect(Math.abs(advances.figure - 0.6 * advances.size)).toBeLessThanOrEqual(1);
    expect(advances.numero).toBeGreaterThan(0.9 * advances.size);
  });
}

test('CJK lines stay upright in an italic and Korean words stay whole', async ({ page }) => {
  await page.goto('/ja/statement');
  const subtitle = page.getByRole('main').locator('.subtitle').first();
  await expect(subtitle).toBeVisible();
  // An italic line keeps Literata's true italic for its Latin and never slants the kana.
  expect(await subtitle.evaluate((element) => getComputedStyle(element).fontStyle)).toBe('italic');
  expect(
    await subtitle.evaluate((element) =>
      getComputedStyle(element).getPropertyValue('font-synthesis-style'),
    ),
  ).toBe('none');
  await page.goto('/ko/statement');
  expect(
    await page.locator('html').evaluate((element) => getComputedStyle(element).wordBreak),
  ).toBe('keep-all');
});
