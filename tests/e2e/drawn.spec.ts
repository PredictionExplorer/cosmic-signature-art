import { expect, test, type Page } from './fixtures';
import { catalogs } from '../../src/lib/i18n/messages';
import { localizedPath, type Locale } from '../../src/lib/i18n/routing';
import { cutOnScreen, shrunkOnScreen, smallTargets, stands } from './helpers';

/**
 * The venue's rules for small screens, each read from what is drawn.
 *
 * Three of the rules every change keeps (docs/north-star.md) can be kept in the stylesheet and
 * broken on the screen, and a check that reads the stylesheet's answer passes all the same:
 *
 * - **Nothing runs off a 320 px screen.** The venue's frame clips its overflow, so the page's
 *   width stays 320 px while a line too wide for it is cut off at the glass.
 * - **No type under 12 px.** A label that asks for small capitals of a face without them is
 *   computed at 12 px and drawn at 70 % of that.
 * - **Targets of 44 px.** The rule was tested on the viewing controls alone.
 *
 * So each is measured here in the page: the boxes of the words themselves, the width a
 * character is drawn at, the box of every control. The readers are in ./helpers.ts.
 */

/** Every kind of page the venue has, by one address each. */
const ROUTES = [
  '/',
  '/collection',
  '/collection/all-the-light',
  '/collection/orrery',
  '/art/31',
  '/process',
  '/auctions',
  '/statement',
  '/exhibitions',
  '/exhibitions/a-hang',
  '/verify/orbit',
  '/verify/orbit/31',
  '/privacy',
];

async function visit(page: Page, locale: Locale, route: string) {
  // No film is needed to read type and boxes, and their host is shared by every run: held back.
  // A film that never answers can hold a page's `load` back for good (WebKit), so the page is
  // waited for by what it shows, not by that event.
  await page.route(/\.mp4(?:\?|$)/, () => {});
  await page.goto(localizedPath(locale, route), { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('main')).toBeVisible();
  await stands(page);
}

test.describe('on a 320 px screen', () => {
  test.use({ viewport: { width: 320, height: 640 } });
  // English, the language with the longest words, and one that sets no spaces to break at.
  for (const locale of ['en', 'uk', 'ja'] as const)
    for (const route of ROUTES)
      test(`every word and every control is whole from side to side: ${locale} ${route}`, async ({
        page,
      }, info) => {
        test.skip(
          /^(chromium|webkit)-desktop$/.test(info.project.name),
          'At 320 px these two engines are met as phones; Firefox has the one project.',
        );
        await visit(page, locale, route);
        expect(await cutOnScreen(page)).toEqual([]);
      });

  // A display word that cannot part may run past its column and still stop short of the glass,
  // where nothing cuts it. The Ukrainian sale's title did, by 13 px; and where an engine draws
  // the face without its optical size (WebKit on Linux) the same word is wider and was cut.
  for (const locale of Object.keys(catalogs) as Locale[])
    test(`the sale’s title ends inside its column: ${locale}`, async ({ page }, info) => {
      test.skip(
        /^(chromium|webkit)-desktop$/.test(info.project.name),
        'At 320 px these two engines are met as phones; Firefox has the one project.',
      );
      await visit(page, locale, '/auctions');
      const { ends, column } = await page.getByRole('heading', { level: 1 }).evaluate((title) => {
        const lines = document.createRange();
        lines.selectNodeContents(title);
        const spread = title.closest('section')!;
        return {
          ends: [...lines.getClientRects()].map((line) => Math.round(line.right * 10) / 10),
          column:
            spread.getBoundingClientRect().right -
            parseFloat(getComputedStyle(spread).paddingInlineEnd),
        };
      });
      expect(ends.length).toBeGreaterThan(0);
      for (const end of ends) expect(end).toBeLessThanOrEqual(column + 0.5);
    });
});

test.describe('in Chinese, Japanese and Korean', () => {
  // Where the labels are: the plate's strip, the collection's range and captions, a work's
  // record, and the proof's seed and title.
  const pages = ['/', '/collection', '/art/31', '/verify/orbit/31'];
  for (const locale of ['ja', 'ko', 'zh', 'zh-TW', 'zh-HK'] as const)
    for (const route of pages)
      test(`every ideograph is drawn at the size it is set, 12 px or more: ${locale} ${route}`, async ({
        page,
      }) => {
        await visit(page, locale, route);
        // The proof prints its record once the window is measured: its checks are labels too.
        // A desk measures it in a second; CI's two cores are given two minutes.
        if (route.startsWith('/verify/')) {
          test.setTimeout(150_000);
          await expect(page.locator('[data-key]').first()).toBeVisible({ timeout: 120_000 });
        }
        expect(await shrunkOnScreen(page)).toEqual([]);
      });
});

test.describe('on a work’s page', () => {
  for (const locale of ['en', 'uk', 'ja'] as const)
    test(`every control is a 44 px target, its disclosures opened: ${locale}`, async ({ page }) => {
      await visit(page, locale, '/art/31');
      // What a disclosure holds is the page's too: Verify on chain, Verify a download.
      await page.evaluate(() =>
        document.querySelectorAll('details').forEach((details) => (details.open = true)),
      );
      expect(await smallTargets(page)).toEqual([]);
      // Opened, the disclosures still stand whole on the screen.
      expect(await cutOnScreen(page)).toEqual([]);
    });
});

test.describe('the orbit’s proof in a narrow column', () => {
  // The languages whose names for the measurements are longest, and one that sets no spaces.
  for (const locale of ['vi', 'uk', 'ja'] as const)
    for (const width of [320, 390])
      test(`is whole while it checks and after, and no row is set again: ${locale} at ${width} px`, async ({
        page,
      }, info) => {
        test.skip(
          /^(chromium|webkit)-desktop$/.test(info.project.name),
          'A narrow column is met as a phone; Firefox has the one project.',
        );
        // № 054's fate is reached soonest: a desk checks it in a second, CI is given two minutes.
        test.setTimeout(150_000);
        const words = catalogs[locale];
        await page.setViewportSize({ width, height: 700 });
        // The worker is asked only when the test says so: until then every row stands unchecked.
        await page.addInitScript(() => {
          const Native = window.Worker;
          let begin!: () => void;
          const begun = new Promise<void>((resolve) => (begin = resolve));
          Object.defineProperty(window, '__beginChecking', { value: begin });
          window.Worker = class extends Native {
            override postMessage(
              message: unknown,
              transfer?: Transferable[] | StructuredSerializeOptions,
            ) {
              void begun.then(() => super.postMessage(message, transfer as Transferable[]));
            }
          };
        });
        await visit(page, locale, '/art/54');
        const table = page.getByRole('table', { name: words.orbitTableCaption });
        // The orbit is derived once its section is near the screen.
        await table.evaluate((element) =>
          element.scrollIntoView({ block: 'center', behavior: 'instant' }),
        );
        await expect(
          table.getByRole('cell', { name: words.orbitPending, exact: true }),
        ).toHaveCount(11);

        /** Each row's name, value and check, placed from the table's own corner. */
        const rows = () =>
          table.evaluate((element) => {
            const corner = element.getBoundingClientRect();
            const half = (value: number) => Math.round(value * 2) / 2;
            return [...element.querySelectorAll('tbody tr')].map((row) =>
              [...row.children].map((cell) => {
                const box = cell.getBoundingClientRect();
                return [box.left - corner.left, box.top - corner.top, box.width, box.height].map(
                  half,
                );
              }),
            );
          });
        const unchecked = await rows();
        expect(await cutOnScreen(page)).toEqual([]);
        // The value has the row's whole width beneath its name: three columns left it 7 px here,
        // a character to a line.
        const wide = (await table.boundingBox())!.width;
        for (const [, value] of unchecked) expect(value[2]).toBeGreaterThanOrEqual(wide - 1);

        await page.evaluate(() =>
          (window as unknown as { __beginChecking: () => void }).__beginChecking(),
        );
        await expect(table.getByRole('cell', { name: words.orbitExact, exact: true })).toHaveCount(
          11,
          { timeout: 120_000 },
        );
        // The check's word is another, and a shorter one: the cell kept room for the wider, so
        // each name, value and check is where it was and as large.
        expect(await rows()).toEqual(unchecked);
        expect(await cutOnScreen(page)).toEqual([]);
      });
});
