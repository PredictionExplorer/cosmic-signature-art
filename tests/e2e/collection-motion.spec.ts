import { expect, test, type Locator, type Page } from '@playwright/test';

const previewSelector = '#works [data-collection-preview]';
const filmSelector = `${previewSelector} video[src]`;
/** On a desk the lease plays the settling clip, the film's own ending; a phone's budget keeps the 8 s excerpt. */
const leaseFilm = (isMobile: boolean, id = '[0-9]+') =>
  isMobile
    ? new RegExp(`/art/previews/${id}-[a-f0-9]+\\.mp4$`)
    : new RegExp(`/art/clips/${id}-ink-settling-[a-f0-9]{16}\\.mp4$`);

async function collectionReady(page: Page, path = '/collection?q=31') {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#works .collection-skeleton')).toHaveCount(0, { timeout: 30_000 });
  const cards = page.locator('#works a[data-preview-id]');
  await expect(cards.first()).toBeVisible();
  await cards.first().scrollIntoViewIfNeeded();
  const paused = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  await expect(page.locator('button.motion-toggle')).toHaveAttribute(
    'aria-pressed',
    String(paused),
  );
  return cards;
}

async function imageReady(image: Locator) {
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((element) => {
        const image = element as HTMLImageElement;
        return image.complete && image.naturalWidth > 0;
      }),
    )
    .toBe(true);
}

async function allowMotion(page: Page) {
  const control = page.locator('button.motion-toggle');
  if ((await control.getAttribute('aria-pressed')) === 'true') await control.click();
  await expect(control).toHaveAttribute('aria-pressed', 'false');
}

async function settleFrames(page: Page) {
  // Let effects and the debounced viewport selector run; no network deadline is hidden here.
  await page.waitForTimeout(600);
}

test('the collection plays the genuine Ink film in place without replacing the token image', async ({
  page,
  isMobile,
}) => {
  await collectionReady(page);
  const work = page.locator('#works a[data-preview-id="31"]');
  await expect(work).toHaveAttribute('href', '/art/31');
  const still = work.locator('img');
  await imageReady(still);
  const original = await still.getAttribute('src');
  await allowMotion(page);
  await work.scrollIntoViewIfNeeded();
  await work.focus();
  const film = work.locator('video[src]');
  await expect(film).toHaveAttribute('src', leaseFilm(isMobile, '31'));
  await expect
    .poll(() =>
      film.evaluate((element) => {
        const video = element as HTMLVideoElement;
        return !video.paused && video.readyState >= 2 && video.currentTime > 0;
      }),
    )
    .toBe(true);
  await expect(page.locator(filmSelector)).toHaveCount(1);
  await expect(still).toHaveAttribute('src', original!);
  await expect(work).toHaveAttribute('data-motion', 'active');
  expect(await film.evaluate((element) => (element as HTMLVideoElement).muted)).toBe(true);
  await expect(film).toHaveAttribute('playsinline', '');
  const delivery = await film.evaluate((element) => {
    const video = element as HTMLVideoElement;
    return { seconds: video.duration, width: video.videoWidth, height: video.videoHeight };
  });
  expect(delivery.seconds).toBeGreaterThanOrEqual(7.9);
  expect(delivery.seconds).toBeLessThanOrEqual(8.1);
  // Chromium reports the 1280 × 828 clip as 1281 wide from its display aspect ratio.
  expect(delivery.width).toBeLessThanOrEqual(isMobile ? 640 : 1282);
  expect(delivery.height).toBeGreaterThan(0);
  // The image remains the accessible artwork; the decorative film adds no duplicate label.
  await expect(film).toHaveAttribute('aria-hidden', 'true');
});

test('the first collection plate paints from the publisher’s own preview', async ({ page }) => {
  const cards = await collectionReady(page, '/collection');
  const image = cards.first().locator('img');
  await expect(image).toHaveAttribute(
    'src',
    /(?:-640\.webp|\/images\/web\/(?:ember_)?preview\.webp)(?:\?|$)/,
  );
  await expect(image).toBeInViewport();
  await imageReady(image);
});

test('focus and scrolling transfer the single film budget across the catalogue', async ({
  page,
  isMobile,
}) => {
  const cards = await collectionReady(page, '/collection');
  await allowMotion(page);
  await expect(cards).toHaveCount(18);
  await page.evaluate((selector) => {
    const state = { peak: 0, leases: [] as { source: string; id: string | null }[] };
    Object.assign(window, { __collectionFilmBudget: state });
    const measure = () => {
      const films = [...document.querySelectorAll<HTMLVideoElement>(selector)];
      state.peak = Math.max(state.peak, films.length);
      for (const film of films) {
        const source = film.getAttribute('src');
        if (source && !state.leases.some((lease) => lease.source === source)) {
          state.leases.push({
            source,
            id: film.closest('[data-preview-id]')?.getAttribute('data-preview-id') ?? null,
          });
        }
      }
    };
    new MutationObserver(measure).observe(document.querySelector('#works')!, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['src'],
    });
    measure();
  }, filmSelector);
  const inkCards = page.locator('#works a[data-preview-available="true"]');
  expect(await inkCards.count()).toBeGreaterThan(1);
  const first = inkCards.first();
  const second = inkCards.nth(1);
  await first.scrollIntoViewIfNeeded();
  await first.focus();
  await expect(first.locator('video[src]')).toHaveCount(1);
  const previous = await first.getAttribute('data-preview-id');
  await second.scrollIntoViewIfNeeded();
  await second.focus();
  await expect(second.locator('video[src]')).toHaveCount(1);
  await expect(first.locator('video')).toHaveCount(0);
  await expect(page.locator(filmSelector)).toHaveCount(1);
  await cards.last().scrollIntoViewIfNeeded();
  await settleFrames(page);
  await expect(first.locator('video')).toHaveCount(0);
  await expect(second.locator('video')).toHaveCount(0);
  const budget = await page.evaluate(() => {
    return (
      window as unknown as {
        __collectionFilmBudget: { peak: number; leases: { source: string; id: string | null }[] };
      }
    ).__collectionFilmBudget;
  });
  expect(budget.peak).toBe(1);
  expect(budget.leases.length).toBeGreaterThanOrEqual(2);
  for (const { source, id } of budget.leases) {
    expect(id).toMatch(/^\d+$/);
    expect(source).toMatch(leaseFilm(isMobile, id!));
  }
  expect(previous).not.toBe(await second.getAttribute('data-preview-id'));
});

for (const connection of [
  { label: 'data-saving', saveData: true, effectiveType: '4g' },
  { label: 'slow', saveData: false, effectiveType: '2g' },
] as const) {
  test(`${connection.label} connections keep catalogue browsing still without film requests`, async ({
    page,
  }) => {
    await page.addInitScript((state) => {
      Object.defineProperty(navigator, 'connection', {
        configurable: true,
        value: Object.assign(new EventTarget(), state),
      });
    }, connection);
    const films: string[] = [];
    page.on('request', (request) => {
      if (/\.mp4(?:\?|$)/.test(request.url())) films.push(request.url());
    });
    const cards = await collectionReady(page);
    await allowMotion(page);
    await cards.first().focus();
    await settleFrames(page);
    await expect(page.locator(filmSelector)).toHaveCount(0);
    await imageReady(cards.first().locator('img'));
    expect(films).toEqual([]);
    await cards.first().click();
    await expect(page).toHaveURL(/\/art\/31$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Signature 031/);
  });
}

test('reduced motion starts with no collection film download and can be explicitly resumed', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const films: string[] = [];
  page.on('request', (request) => {
    if (/\.mp4(?:\?|$)/.test(request.url())) films.push(request.url());
  });
  const cards = await collectionReady(page);
  await cards.first().focus();
  await settleFrames(page);
  await expect(page.locator(filmSelector)).toHaveCount(0);
  expect(films).toEqual([]);
  await page.locator('button.motion-toggle').click();
  await cards.first().scrollIntoViewIfNeeded();
  await cards.first().focus();
  await expect(page.locator(filmSelector)).toHaveCount(1);
});

test('pausing releases the collection film and persists without downloading it again', async ({
  page,
}) => {
  const cards = await collectionReady(page);
  await allowMotion(page);
  await cards.first().scrollIntoViewIfNeeded();
  await cards.first().focus();
  await expect(page.locator(filmSelector)).toHaveCount(1);
  await page.locator('button.motion-toggle').click();
  await expect(page.locator('button.motion-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(`${previewSelector} video`)).toHaveCount(0);
  const newFilmRequests: string[] = [];
  page.on('request', (request) => {
    if (/\.mp4(?:\?|$)/.test(request.url())) newFilmRequests.push(request.url());
  });
  await page.reload();
  await expect(page.locator('#works a[data-preview-id="31"]')).toBeVisible();
  await expect(page.locator('button.motion-toggle')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#works a[data-preview-id="31"]').focus();
  await settleFrames(page);
  await expect(page.locator(filmSelector)).toHaveCount(0);
  expect(newFilmRequests).toEqual([]);
});

test('Light releases Ink previews and opens the same expression in the viewing room', async ({
  page,
  isMobile,
}) => {
  const cards = await collectionReady(page);
  await allowMotion(page);
  await cards.first().focus();
  await expect(page.locator(filmSelector)).toHaveCount(1);
  // The orderings and the other expression live in the header on wide screens and in the bottom bar on phones.
  await (
    isMobile
      ? page.getByRole('navigation', { name: 'Collection controls' })
      : page.locator('main header').getByRole('navigation', { name: 'Ordering' })
  )
    .getByRole('link', { name: 'Light', exact: true })
    .click();
  await expect(page).toHaveURL(/\/collection\?expression=light&q=31$/);
  await expect(page.locator(`${previewSelector} video`)).toHaveCount(0);
  const work = page.locator('#works a[data-preview-id="31"]');
  await expect(work).toHaveAttribute('href', '/art/31?expression=light');
  await expect(work.locator('[data-material]')).toHaveAttribute('data-material', 'light');
  await work.click();
  await expect(page).toHaveURL(/\/art\/31\?expression=light$/);
  await expect(page.locator('.viewer-plate .art-media')).toHaveAttribute('data-material', 'light');
});

test('an unavailable preview leaves the authentic image and usable artwork link', async ({
  page,
}) => {
  let rejectedRequests = 0;
  await page.route(/\/(?:previews|clips)\/31-[a-z0-9-]+\.mp4(?:\?|$)/, async (route) => {
    rejectedRequests += 1;
    await route.abort('failed');
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const cards = await collectionReady(page);
  const work = cards.first();
  const image = work.locator('img');
  await imageReady(image);
  const source = await image.getAttribute('src');
  await allowMotion(page);
  await work.focus();
  await expect.poll(() => rejectedRequests).toBeGreaterThan(0);
  await expect(work.locator('video')).toHaveCount(0);
  // WebKit may retry a failed range internally. Once the player is released,
  // the gallery must not start another attempt or rotate through failed sources.
  const requestsAtRelease = rejectedRequests;
  await settleFrames(page);
  await expect(image).toHaveAttribute('src', source!);
  await imageReady(image);
  expect(rejectedRequests).toBe(requestsAtRelease);
  await work.click();
  await expect(page).toHaveURL(/\/art\/31$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Signature 031/);
  expect(errors).toEqual([]);
});

test('artwork navigation and browser Back work without native view-transition support', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: undefined,
    });
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const cards = await collectionReady(page);
  await cards.first().click();
  await expect(page).toHaveURL(/\/art\/31$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Signature 031/);
  await expect(page.locator('.viewer-plate .art-media')).toHaveAttribute('data-material', 'ink');
  await page.goBack();
  await expect(page).toHaveURL(/\/collection\?q=31$/);
  await expect(page.locator('#works a[data-preview-id="31"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('native artwork transitions complete without delaying navigation or breaking browser Back', async ({
  page,
  context,
  isMobile,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    const state = {
      documentId: crypto.randomUUID(),
      supported: typeof document.startViewTransition === 'function',
      attempted: 0,
      ready: 0,
      rejected: [] as string[],
    };
    Object.assign(window, { __artworkTransitions: state });
    if (!state.supported) return;
    const native = document.startViewTransition.bind(document);
    document.startViewTransition = (...args) => {
      state.attempted += 1;
      const transition = native(...args);
      void transition.ready.then(
        () => {
          state.ready += 1;
        },
        (error: unknown) => {
          // Native transitions may legitimately be superseded; the next ready one must work.
          state.rejected.push(error instanceof Error ? error.message : String(error));
        },
      );
      return transition;
    };
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // The morph needs the destination in the router before the click: the active card
  // prefetches its route, and a click that beats that response on a slow runner arrives
  // through the loading boundary instead, where no shared element exists to animate.
  const prefetched = page.waitForResponse(
    (response) =>
      /\/art\/31\?_rsc=/.test(response.url()) &&
      !!response.request().headers()['next-router-prefetch'],
    { timeout: 30_000 },
  );
  const cards = await collectionReady(page);
  // A live frame is an observable guarantee that this streamed client boundary
  // has hydrated. Earlier clicks must still work, but can use the native anchor fallback.
  await expect(cards.first().locator('video[src]')).toHaveClass(/has-frame/);
  await prefetched;
  const before = await page.evaluate(
    () =>
      (
        window as unknown as {
          __artworkTransitions: { documentId: string; supported: boolean; ready: number };
        }
      ).__artworkTransitions,
  );
  await cards.first().click();
  await expect(page).toHaveURL(/\/art\/31$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Signature 031/);
  await expect(page.locator('.viewer-plate .art-media')).toHaveAttribute('data-material', 'ink');
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __artworkTransitions: { documentId: string } }).__artworkTransitions
          .documentId,
    ),
  ).toBe(before.documentId);
  const readyCount = () =>
    page.evaluate(
      () =>
        (window as unknown as { __artworkTransitions: { ready: number } }).__artworkTransitions
          .ready,
    );
  if (before.supported) {
    await test.info().attach('native-transition-before-ready', {
      body: JSON.stringify(
        await page.evaluate(
          () => (window as unknown as { __artworkTransitions: object }).__artworkTransitions,
        ),
      ),
      contentType: 'application/json',
    });
    // A slow runner can still arrive through the loading boundary, where there is no shared
    // surface to morph; the vision allows that. The morph itself is proved from a router that
    // holds the destination: walk back and click once more if the first walk did not morph.
    let ready = await readyCount();
    if (ready <= before.ready) {
      await page.waitForTimeout(1500);
      ready = await readyCount();
    }
    if (ready <= before.ready) {
      await page.goBack();
      await expect(page).toHaveURL(/\/collection\?q=31$/);
      const again = page.locator('#works a[data-preview-id="31"]');
      await expect(again).toBeVisible();
      await expect(again.locator('video[src]')).toHaveClass(/has-frame/);
      await again.click();
      await expect(page).toHaveURL(/\/art\/31$/);
      await expect(page.locator('.viewer-plate .art-media')).toHaveAttribute(
        'data-material',
        'ink',
      );
    }
    await expect.poll(readyCount).toBeGreaterThan(before.ready);
  }
  await page.goBack();
  await expect(page).toHaveURL(/\/collection\?q=31$/);
  await expect(page.locator('#works a[data-preview-id="31"]')).toBeVisible();
  if (!isMobile) {
    const popupPromise = context.waitForEvent('page');
    await page.locator('#works a[data-preview-id="31"]').click({ modifiers: ['ControlOrMeta'] });
    const popup = await popupPromise;
    await expect(popup).toHaveURL(/\/art\/31$/);
    await expect(page).toHaveURL(/\/collection\?q=31$/);
    await popup.close();
  }
  expect(errors).toEqual([]);
});
