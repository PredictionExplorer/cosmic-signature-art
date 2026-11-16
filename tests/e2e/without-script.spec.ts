import { expect, test, type Page, type TestInfo } from './fixtures';
import { catalogs } from '../../src/lib/i18n/messages';
import { workNumber } from '../../src/lib/art/number';
import { localizedPath, type Locale } from '../../src/lib/i18n/routing';
import { withoutScriptStyles } from '../../src/lib/without-script';

/**
 * The venue with no script: switched off, refused, or never run at all, as by a text browser,
 * an archive or a crawler that is not a search engine's. Until 15 November 2026 the home, every
 * work, the collection and Process were then a loading plate. The locale's loading file wrapped
 * each page in a Suspense boundary, and React sets the content of a large boundary aside in a
 * `<div hidden id="S:…">` that only its inline script moves into place.
 *
 * Two readings hold it now. The first reads each page as it is sent, before any browser: the
 * work's still and the page's words must be in `<main>`, and in nothing hidden. The second
 * opens each page in a browser with script off and looks: the still must be there at full
 * strength, which the stylesheet alone cannot promise from the HTML (it is sent clear over its
 * preview, for script to settle; src/lib/without-script.ts shows it).
 */
type Words = (typeof catalogs)['en'];
type Sheet = {
  name: string;
  path: string;
  locale: Locale;
  /** The still a reader came for, by its alternative text; absent where the page hangs many. */
  still?: (t: Words) => string;
  /** How many stills the page must set, at the least. */
  stills: number;
  /** Words of the page's own that must stand in `<main>`. */
  words: (t: Words) => string[];
};

const sheet = (
  name: string,
  path: string,
  page: Omit<Sheet, 'name' | 'path' | 'locale'>,
  locale: Locale = 'en',
): Sheet => ({ name, path: localizedPath(locale, path), locale, ...page });

const home = {
  // The suite's day is an Ink day whose work is 023 (tests/e2e/venue-day.ts).
  still: (t: Words) => `${workNumber(23)} · ${t.ink}`,
  stills: 1,
  words: (t: Words) => [t.shapeOfMotion, t.statementLine],
};
const work = (id: number) => ({
  still: (t: Words) => `${workNumber(id)} · ${t.ink}`,
  stills: 2,
  // The entry's heading, its first glossary note, and the heading of its files.
  words: (t: Words) => [
    `${t.signature} ${String(id).padStart(3, '0')}`,
    t.glossarySignature,
    t.sources,
  ],
});

const SHEETS: Sheet[] = [
  sheet('the home', '/', home),
  sheet('the home in Japanese', '/', home, 'ja'),
  // In the registry: its plate opens from the venue's own identity-verified copy.
  sheet('a work the registry holds', '/art/31', work(31)),
  sheet('a work the registry holds, in Ukrainian', '/art/31', work(31), 'uk'),
  // In the index alone, as 57 of the 72 works are: its plate opens from the index.
  sheet('a work the index holds', '/art/50', work(50)),
  sheet('the collection', '/collection', { stills: 18, words: (t) => [t.collection] }),
  sheet('Process', '/process', { stills: 2, words: (t) => [t.processTitle, t.processIntro] }),
];

/** An address answers alike in every engine, so one project asks. */
function oneProjectAsks(info: TestInfo) {
  test.skip(info.project.name !== 'chromium-desktop', 'A page is sent alike to every engine.');
}

/**
 * A document as it was sent, read by the browser's own parser with no script run and nothing
 * loaded: what is in `<main>`, and what is set aside where only script would find it.
 */
function readAsSent(html: string) {
  const sent = new DOMParser().parseFromString(html, 'text/html');
  const standing = (root: ParentNode, selector: string) =>
    [...root.querySelectorAll(selector)].filter((element) => !element.closest('[hidden]'));
  const mains = standing(sent, 'main');
  const main = mains[0];
  const read = main?.cloneNode(true) as Element | undefined;
  read?.querySelectorAll('[hidden], script, template').forEach((element) => element.remove());
  return {
    mains: mains.map((element) => ({
      className: element.className,
      waits: element.hasAttribute('aria-busy') || element.hasAttribute('data-awaits-stream'),
    })),
    stills: main
      ? standing(main, 'img.art-still').map((image) => ({
          alt: image.getAttribute('alt'),
          src: image.getAttribute('src'),
        }))
      : [],
    text: (read?.textContent ?? '').replace(/\s+/g, ' '),
    headings: standing(sent, 'main h1').length,
    withoutScript: sent.head.querySelector('noscript')?.textContent ?? '',
  };
}

test.describe('each page is sent whole', () => {
  for (const { name, path, locale, still, stills, words } of SHEETS) {
    test(`${name} has its work and its words in main, in nothing hidden`, async ({
      page,
      request,
    }, info) => {
      oneProjectAsks(info);
      const t = catalogs[locale];
      const response = await request.get(path);
      expect(response.status()).toBe(200);
      const sent = await page.evaluate(readAsSent, await response.text());

      // One main, and it is the page: not a plate that waits for it.
      expect(sent.mains).toHaveLength(1);
      expect(sent.mains[0].className).not.toContain('loading-room');
      expect(sent.mains[0].waits).toBe(false);

      // The work's still, in main.
      expect(sent.stills.length).toBeGreaterThanOrEqual(stills);
      if (still) expect(sent.stills.map((image) => image.alt)).toContain(still(t));
      for (const image of sent.stills) expect(image.src).toBeTruthy();

      // The page's words, in main. What is set aside in a hidden segment is no part of it.
      for (const sentence of words(t)) expect(sent.text).toContain(sentence.replace(/\s+/g, ' '));

      // One heading names the page, where a reader with no script can read it.
      expect(sent.headings).toBe(1);
      // The stylesheet for a reader with no script travels in the head.
      expect(sent.withoutScript).toContain(withoutScriptStyles);
    });
  }
});

/** The opacity an element is painted at: its own, through every ancestor's. */
const paintedOpacity = (element: Element) => {
  let opacity = 1;
  for (let node: Element | null = element; node; node = node.parentElement)
    opacity *= Number(getComputedStyle(node).opacity);
  return opacity;
};

/**
 * A browser that runs no script. It is given no stored state either: nothing on such a page
 * reads the browser's storage, and Playwright restores stored state by running a script in the
 * page, which its Firefox waits on for ever when the page may run none and the venue answers at
 * a loopback address, as it does on CI. (The suite's stored state only says that First Light
 * has been seen.)
 */
const SCRIPT_OFF = { javaScriptEnabled: false, storageState: { cookies: [], origins: [] } };

test.describe('each page with script off', () => {
  test.use(SCRIPT_OFF);

  for (const { name, path, locale, still, words } of SHEETS) {
    test(`${name} shows its work at full strength, and its words`, async ({ page }) => {
      const t = catalogs[locale];
      await page.goto(path);
      const main = page.locator('main');
      await expect(main).toHaveCount(1);
      await expect(main).toBeVisible();

      // The still: there, loaded, and painted at full strength over its preview.
      const image = still
        ? main.locator(`img.art-still[alt="${still(t)}"]`).first()
        : main.locator('img.art-still').first();
      await expect(image).toBeVisible();
      await expect
        .poll(() =>
          image.evaluate((element) => {
            const loaded = element as HTMLImageElement;
            return loaded.complete && loaded.naturalWidth > 0;
          }),
        )
        .toBe(true);
      expect(await image.evaluate(paintedOpacity)).toBe(1);

      // The words, where a reader can see them.
      for (const sentence of words(t))
        await expect(main.getByText(sentence, { exact: false }).first()).toBeVisible();

      // Nothing on the page still says that it is waiting for something to arrive.
      await expect(page.locator('[aria-busy="true"]').filter({ visible: true })).toHaveCount(0);
      await expect(page.locator('[data-awaits-stream]').filter({ visible: true })).toHaveCount(0);
    });
  }
});

/**
 * What the stylesheet does with a streamed part, on a page made for the purpose: the venue's
 * own pages stream only what the live indexer answers late, which no test can arrange. The
 * markup is React's (src/lib/without-script.test.tsx holds the stylesheet to it).
 */
async function streamedPage(page: Page) {
  await page.setContent(`<!doctype html>
    <html><head><noscript><style>${withoutScriptStyles}</style></noscript></head>
    <body>
      <div class="site">
        <header>The running head</header>
        <main data-awaits-stream>A plate that waits</main>
        <footer class="site-footer">The colophon</footer>
      </div>
      <div hidden id="S:0"><main data-streamed>The page the stream brought</main></div>
      <div hidden id="S:1"><article>An entry whose stand-in is already on the page</article></div>
    </body></html>`);
}

test.describe('a streamed part with script off', () => {
  test.use(SCRIPT_OFF);

  test('is shown between the page and the colophon, and what waited for it is taken away', async ({
    page,
  }, info) => {
    // Firefox learned :has() in 121; the stylesheet says what an older one keeps hidden.
    test.skip(info.project.name.startsWith('firefox') && !(await supportsHas(page)), 'No :has().');
    await streamedPage(page);
    await expect(page.getByText('A plate that waits')).toBeHidden();
    const arrived = page.getByText('The page the stream brought');
    await expect(arrived).toBeVisible();
    const top = async (text: string) => (await page.getByText(text).boundingBox())!.y;
    expect(await top('The running head')).toBeLessThan(await top('The page the stream brought'));
    expect(await top('The page the stream brought')).toBeLessThan(await top('The colophon'));
    // A part whose stand-in holds its words stays set aside: the stand-in is the page.
    await expect(page.getByText('An entry whose stand-in is already on the page')).toBeHidden();
  });
});

test('with script on, the stylesheet for a reader without it changes nothing', async ({ page }) => {
  await streamedPage(page);
  await expect(page.getByText('A plate that waits')).toBeVisible();
  await expect(page.getByText('The page the stream brought')).toBeHidden();
  expect(await page.evaluate(() => getComputedStyle(document.body).display)).toBe('block');
});

function supportsHas(page: Page) {
  return page.evaluate(() => CSS.supports('selector(:has(*))'));
}
