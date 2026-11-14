import { expect, test, type Locator, type Page } from './fixtures';
import { catalogs } from '../../src/lib/i18n/messages';
import { pauseAmbientMotion } from './helpers';

/*
  Changing language keeps the reader's place (src/components/reading-place.tsx): the same mark is
  put back at the reading line in the other language, never the top of the page. On a desk the
  running head's menu changes it; on a phone, the Index sheet.
*/

/** The work page's marks in reading order, as the venue counts them: those holding no others. */
const MARKS = 'h1, h2, h3, h4, p, li, dt, dd, figure, table, blockquote, pre';

/**
 * Brings a paragraph of the work's entry, one with no id of its own, to the reading line, and
 * says which mark it is: the place is found again by its place among the marks.
 */
async function readDeep(page: Page) {
  const at = await page.evaluate((selector) => {
    const marks = [...document.querySelectorAll<HTMLElement>(`main :is(${selector})`)].filter(
      (mark) => !mark.querySelector(selector) && mark.getClientRects().length > 0,
    );
    const entry = marks.findIndex((mark) => mark.id === 'entry-title');
    const index = marks.findIndex((mark, i) => i > entry && mark.tagName === 'P' && !mark.id);
    const line =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--head')) + 16;
    const top = marks[index].getBoundingClientRect().top;
    window.scrollTo({ top: window.scrollY + top - line, behavior: 'instant' });
    return index;
  }, MARKS);
  // The page's own scroll has been heard before anything is opened over it.
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
  return at;
}

/**
 * A press where the element stands, as a hand makes it. Playwright's own click first scrolls its
 * target into view, and for a control in the sticky running head that moves the page behind it:
 * the very place this spec keeps.
 */
async function press(page: Page, target: Locator, touch: boolean) {
  await expect(target).toBeVisible();
  const box = (await target.boundingBox())!;
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

/** Where that mark now stands against the reading line; null until the page holds it. */
async function standing(page: Page, index: number) {
  return page.evaluate(
    ({ selector, index }) => {
      const marks = [...document.querySelectorAll<HTMLElement>(`main :is(${selector})`)].filter(
        (mark) => !mark.querySelector(selector) && mark.getClientRects().length > 0,
      );
      if (!marks[index]) return null;
      const line =
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--head')) + 16;
      return {
        offset: Math.round(marks[index].getBoundingClientRect().top - line),
        scrolled: Math.round(window.scrollY),
      };
    },
    { selector: MARKS, index },
  );
}

test('changing language keeps the reader’s place on the page', async ({ page, isMobile }) => {
  await page.goto('/art/31');
  await pauseAmbientMotion(page);
  await expect(page.locator('html')).toHaveAttribute('data-keys', 'ready');
  const index = await readDeep(page);
  const before = await page.evaluate(() => window.scrollY);
  if (isMobile) {
    // On a phone the languages are in the Index sheet, which is also its menu.
    await press(
      page,
      page.locator('.site-header').getByRole('button', { name: catalogs.en.index }),
      true,
    );
    const japanese = page
      .getByRole('dialog', { name: catalogs.en.indexSheet })
      .getByRole('navigation', { name: catalogs.en.language })
      .getByRole('link', { name: '日本語' });
    // The languages close the sheet's own scrolling panel: it is scrolled to them, not the page.
    await japanese.evaluate((link) => {
      let panel = link.parentElement;
      while (panel && panel.scrollHeight <= panel.clientHeight) panel = panel.parentElement;
      panel?.scrollTo({ top: panel.scrollHeight, behavior: 'instant' });
    });
    await press(page, japanese, true);
  } else {
    await press(page, page.locator('.language-menu button'), false);
    await press(page, page.locator('.language-menu a[hreflang="ja"]'), false);
  }
  await expect(page).toHaveURL(/\/ja\/art\/31$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  // The same heading stands at the reading line in Japanese, once the page has settled.
  await expect
    .poll(async () => Math.abs((await standing(page, index))?.offset ?? Infinity), {
      timeout: 10_000,
    })
    .toBeLessThan(24);
  expect((await standing(page, index))?.scrolled).toBeGreaterThan(before / 2);
});
