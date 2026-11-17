import { expect, test, type Page } from './fixtures';
import ladder from '../../src/lib/art/still-ladder.json' with { type: 'json' };
import { ART_MEDIA_ORIGINS } from '../../src/lib/art/constants';
import { artworkImageSource, noHorizontalOverflow } from './helpers';

/*
  The publisher's host out of the browser's reach. The published stills, their 640 px previews
  and the films are the publisher's files, on the host the indexer answers from. The venue holds
  1,280 and 1,920 px rungs of every still, and for the curated works the whole still too.

  № 017 is outside the curated registry, as 57 of the 72 works are: its 3,456 px still and its
  preview are the publisher's alone. A desk at two or three pixels to a point asks for more than
  the widest rung, so it asks the publisher, and with the publisher refused it showed an empty
  plate and a broken image where the preview lay. It must show the widest rung instead: the
  published still at a smaller size, below that screen's own resolution, and never altered.
*/

const stage = '[data-artwork-stage="page"]:visible';
const current = `${stage} [data-layer-state="current"]`;
const refused = (url: URL) => (ART_MEDIA_ORIGINS as readonly string[]).includes(url.origin);
const rungOf = (id: number) =>
  new RegExp(`^/art/stills/${id}-(ink|light)-(1280|1920)-[a-f0-9]{16}\\.webp$`);

/**
 * Playwright's Firefox loses the density it emulates when a page sends
 * Cross-Origin-Opener-Policy: the header moves the page to a browsing context of its own, the
 * emulation is not set on it again, and from then on every page in that tab reads one pixel to a
 * point, whatever the test asked for. Chromium and WebKit keep theirs. The venue has sent that
 * header on every response since its Content-Security-Policy went in
 * (src/lib/security-headers.ts). A real Firefox reads its screen, which no header changes, and
 * the header has no say in which still a plate asks for. So where a test needs a dense screen,
 * Firefox is handed the venue's documents without that one header, and every test here checks
 * the density its page reads (`readsDensity`): neither this nor the engine's fault can go stale
 * unseen.
 */
async function keepTheDensity(context: ReturnType<Page['context']>, browserName: string) {
  if (browserName !== 'firefox') return;
  await context.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback();
    const response = await route.fetch();
    const headers = Object.fromEntries(
      Object.entries(response.headers()).filter(([name]) => name !== 'cross-origin-opener-policy'),
    );
    return route.fulfill({ response, headers });
  });
}

/** The page reads the density its test asked for: what the test goes on to say is of that screen. */
async function readsDensity(page: Page, density: number) {
  expect(await page.evaluate(() => window.devicePixelRatio), 'the density the page reads').toBe(
    density,
  );
}

type Sample = { rect: string; still: 'none' | 'publisher' | 'venue' };
declare global {
  interface Window {
    __plateSeen?: Sample[];
    __stillsLost?: ('publisher' | 'venue')[];
  }
}

/**
 * Watches the current plate from the first frame, in the page: its box, and whose file its
 * still is asking for. A new entry is written only when either changes, so the list is the
 * plate's history: one box throughout means it never moved.
 */
async function watchThePlate(page: Page) {
  await page.addInitScript(
    (selector) => {
      const seen: Sample[] = [];
      window.__plateSeen = seen;
      const look = () => {
        const box = document.querySelector(selector);
        // A streamed plate has no box until the page reveals it: nothing has been shown to move.
        if (box && box.getBoundingClientRect().width > 0) {
          const { x, y, width, height } = box.getBoundingClientRect();
          const rect = [x, y, width, height].map((n) => Math.round(n * 100) / 100).join(' ');
          const image = box.querySelector<HTMLImageElement>('img.art-still');
          const asked = image?.currentSrc;
          const still = !asked
            ? 'none'
            : new URL(asked).origin === location.origin
              ? 'venue'
              : 'publisher';
          const last = seen[seen.length - 1];
          if (!last || last.rect !== rect || last.still !== still) seen.push({ rect, still });
        }
        requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
      // Whose file a plate's still was asking for each time one could not be loaded, heard as
      // it happens: before the plate has hydrated, and whether or not a frame was drawn then.
      const lost: ('publisher' | 'venue')[] = [];
      window.__stillsLost = lost;
      document.addEventListener(
        'error',
        ({ target }) => {
          if (target instanceof HTMLImageElement && target.matches('img.art-still'))
            lost.push(
              new URL(target.currentSrc).origin === location.origin ? 'venue' : 'publisher',
            );
        },
        true,
      );
    },
    `${current.replace(':visible', '')} .art-media`,
  );
}

/** What the current plate holds: each image, whose it is, and whether it has a pixel to show. */
const plateHolds = (page: Page) =>
  page
    .locator(`${current} .art-media`)
    .first()
    .evaluate((box) => ({
      arrival: box.getAttribute('data-arrival'),
      images: [...box.querySelectorAll('img')].map((image) => {
        const address = new URL(image.currentSrc || image.src, location.href);
        return {
          layer: image.className,
          // A curated work's preview arrives inside the page itself.
          ours: address.origin === location.origin || address.protocol === 'data:',
          path: address.pathname,
          loaded: image.complete && image.naturalWidth > 0,
          opacity: getComputedStyle(image).opacity,
        };
      }),
    }));

/**
 * The plate has settled on a still of the venue's own, and holds nothing that failed. Read in
 * one look and asked again until it holds: a phone's plate takes its still over into a new
 * element once it knows its screen, and for a moment that element is shown and still decoding.
 */
async function showsItsOwnRung(page: Page, id: number, rung: 1280 | 1920) {
  let path = '';
  await expect
    .poll(async () => {
      const { arrival, images } = await plateHolds(page);
      path = images[0]?.path ?? '';
      return {
        arrival,
        images: images.map(
          ({ layer, opacity, ours, loaded }) =>
            `${layer}, opacity ${opacity}, ${ours ? 'the venue’s' : 'the publisher’s'}, ${loaded ? 'loaded' : 'not loaded'}`,
        ),
      };
    })
    .toEqual({
      arrival: 'settled',
      images: ['art-still is-settled, opacity 1, the venue’s, loaded'],
    });
  expect(path).toMatch(rungOf(id));
  expect(path).toContain(`-${rung}-`);
  return path;
}

for (const density of [1, 2, 3])
  test.describe(`at ${density} pixel${density > 1 ? 's' : ''} to a point, the publisher refused`, () => {
    test.use({ deviceScaleFactor: density });
    test.beforeEach(async ({ context, browserName }) => {
      await context.route(refused, (route) => route.abort('connectionrefused'));
      if (density > 1) await keepTheDensity(context, browserName);
    });

    test('a work outside the registry shows its still from the venue’s own rungs', async ({
      page,
      isMobile,
    }) => {
      await watchThePlate(page);
      await page.goto('/art/17');
      await expect(page).toHaveTitle(/№\s017/);
      await readsDensity(page, density);
      // A phone's plate is 390 points wide and rests on the 1280 rung at any density. A desk's
      // is about 1,386: the 1920 rung fills it at one pixel to a point, and at two or three is
      // the widest file the venue holds, shown below the screen's own resolution.
      await showsItsOwnRung(page, 17, isMobile ? 1280 : 1920);
      // No image in the plates is broken: nothing of the publisher's is left asking.
      await expect
        .poll(() =>
          page
            .locator(`${stage} .art-media img`)
            .evaluateAll((images) =>
              (images as HTMLImageElement[])
                .filter((image) => image.complete && image.naturalWidth === 0)
                .map((image) => image.className),
            ),
        )
        .toEqual([]);
      // The plate's box never moved, from the first frame to the rung.
      const seen = (await page.evaluate(() => window.__plateSeen))!;
      expect([...new Set(seen.map(({ rect }) => rect))]).toHaveLength(1);
      expect(seen.at(-1)!.still).toBe('venue');
      // The moment itself was met: a desk above one pixel to a point asked the publisher for
      // its still, as the server's markup has it, and was refused. No other screen asked the
      // publisher, and no file of the venue's own failed.
      const lost = (await page.evaluate(() => window.__stillsLost))!;
      if (!isMobile && density > 1) expect(lost).toContain('publisher');
      else expect(lost).toEqual([]);
      expect(lost).not.toContain('venue');
      const box = (await page.locator(`${current} .art-media`).first().boundingBox())!;
      expect(Math.abs(box.width / box.height - 3456 / 2234)).toBeLessThan(0.02);
      await noHorizontalOverflow(page);
    });

    test('the Turn readies the twin’s rung and lands on it', async ({ page, isMobile }) => {
      await page.goto('/art/17');
      await readsDensity(page, density);
      await showsItsOwnRung(page, 17, isMobile ? 1280 : 1920);
      const opened = await page.locator(stage).getAttribute('data-expression');
      const twin = opened === 'ink' ? 'light' : 'ink';
      await page.locator(`${current} [data-turn="${twin}"]`).click();
      await expect(page.locator(stage)).toHaveAttribute('data-expression', twin, {
        timeout: 20_000,
      });
      expect(await showsItsOwnRung(page, 17, isMobile ? 1280 : 1920)).toContain(`/17-${twin}-`);
      await expect(page.locator(`${current} [data-turn="${opened}"]`)).toBeVisible();
    });

    test('a curated work is shown as it was: the venue holds its whole still', async ({
      page,
      isMobile,
    }) => {
      await page.goto('/art/31');
      await readsDensity(page, density);
      const expression = (await page.locator(stage).getAttribute('data-expression')) as
        'ink' | 'light';
      await expect(page.locator(`${current} .art-media`).first()).toHaveAttribute(
        'data-arrival',
        'settled',
      );
      const { images } = await plateHolds(page);
      // Both layers are the venue's and both loaded: the preview stays under its still.
      expect(images.map(({ layer }) => layer)).toEqual(['art-preview', 'art-still is-settled']);
      expect(images.map(({ ours, loaded }) => ours && loaded)).toEqual([true, true]);
      // The ladder as it always was, and the rung each screen asks for from it.
      await artworkImageSource(page.locator(`${current} img.art-still`).first(), 31, expression);
      expect(images[1].path).toMatch(
        isMobile
          ? /-1280-[a-f0-9]{16}\.webp$/
          : density === 1
            ? /-1920-[a-f0-9]{16}\.webp$/
            : new RegExp(`^/art/31-${expression}\\.webp$`),
      );
      await noHorizontalOverflow(page);
    });
  });

test('at 320 points the plate shows its rung and nothing overflows', async ({ page, context }) => {
  await context.route(refused, (route) => route.abort('connectionrefused'));
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/art/17');
  await showsItsOwnRung(page, 17, 1280);
  await noHorizontalOverflow(page);
});

test.describe('with the publisher answering, at two pixels to a point', () => {
  test.use({ deviceScaleFactor: 2 });

  test('the plate keeps the candidate it chose, and its preview', async ({
    page,
    context,
    browserName,
    isMobile,
  }) => {
    await keepTheDensity(context, browserName);
    // The publisher's weather is not this test's subject: every image of its is answered here,
    // by a file that can be decoded (the venue's own rung of № 017), and nothing else of its is.
    const standIn = ladder.rungs.find(
      (rung) => rung.id === 17 && rung.expression === 'ink' && rung.width === 1920,
    )!;
    const asked: string[] = [];
    await context.route(refused, (route) => {
      if (route.request().resourceType() !== 'image') return route.abort('connectionrefused');
      asked.push(new URL(route.request().url()).pathname);
      return route.fulfill({ path: `public${standIn.src}`, contentType: 'image/webp' });
    });
    await page.goto('/art/17');
    await readsDensity(page, 2);
    await expect(page.locator(`${current} .art-media`).first()).toHaveAttribute(
      'data-arrival',
      'settled',
    );
    const { images } = await plateHolds(page);
    expect(images.map(({ layer }) => layer)).toEqual(['art-preview', 'art-still is-settled']);
    expect(images.map(({ loaded }) => loaded)).toEqual([true, true]);
    // The preview is the publisher's. So is a desk's still at this density, the 3,456 px file;
    // a phone's is the 1280 rung, as it is with the publisher refused.
    expect(images[0].ours).toBe(false);
    expect(images[1].ours).toBe(isMobile);
    if (isMobile) expect(images[1].path).toMatch(rungOf(17));
    else expect(asked).toContain(images[1].path);
  });
});
