import { expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

export async function noHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport + 1);
}

export async function imageLoaded(image: Locator) {
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

/**
 * Stands a local film in for a published one, answering the byte ranges a video asks for: the
 * published host does, and a film served whole cannot be sought before it has all arrived.
 */
export async function standInFilm(page: Page, url: RegExp, file: string) {
  const film = readFileSync(file);
  await page.route(url, (route) => {
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range ?? '');
    if (!range)
      return route.fulfill({
        body: film,
        contentType: 'video/mp4',
        headers: { 'accept-ranges': 'bytes' },
      });
    const start = Number(range[1]);
    const end = range[2] ? Math.min(Number(range[2]), film.length - 1) : film.length - 1;
    return route.fulfill({
      status: 206,
      body: film.subarray(start, end + 1),
      contentType: 'video/mp4',
      headers: {
        'accept-ranges': 'bytes',
        'content-range': `bytes ${start}-${end}/${film.length}`,
      },
    });
  });
}

export const archivedMedia = JSON.parse(
  readFileSync(new URL('../../src/lib/art/curated-media.json', import.meta.url), 'utf8'),
) as { id: number; media: { id: string; sourceUrl: string }[] }[];

export async function artworkImageSource(
  image: Locator,
  tokenId: number,
  expression: 'ink' | 'light',
  allowPublished = false,
) {
  const allowed = [new URL(`/art/${tokenId}-${expression}.webp`, image.page().url()).href];
  if (allowPublished) {
    const source = archivedMedia
      .find((work) => work.id === tokenId)
      ?.media.find((media) => media.id === expression)?.sourceUrl;
    if (!source) throw new Error(`Missing authentic source for ${tokenId} / ${expression}`);
    allowed.push(source);
  }
  await expect
    .poll(
      async () => {
        const source = await image.getAttribute('src');
        if (!source) return false;
        const url = new URL(source, image.page().url());
        // Vercel's deployment-routing query changes delivery, not artwork identity.
        // Preserve the exact expected origin/path and reject every other query or fragment.
        url.searchParams.delete('dpl');
        return allowed.includes(url.href);
      },
      {
        message: `Expected authentic ${expression} image for token ${tokenId}: ${allowed.join(' or ')}`,
      },
    )
    .toBe(true);
}

export async function collectionLoaded(page: Page, loadAllImages = false) {
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
    // Instantly, as the venue's smooth scroll can be given up when the layout moves beneath it.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  }
}

/**
 * The counterpart of pauseAmbientMotion. Server HTML begins paused, so the toggle is read only
 * once the client has attached its listeners and shows the browser's own preference; a click
 * before that would land on the server's state and could pause what had just begun to play.
 */
export async function playAmbientMotion(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('data-keys', 'ready');
  const control = page.locator('button.motion-toggle');
  const initiallyPaused = await page.evaluate(() => {
    const saved = sessionStorage.getItem('cosmic-art-motion-v1');
    return saved ? saved === 'paused' : matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  await expect(control).toHaveAttribute('aria-pressed', String(initiallyPaused));
  if (initiallyPaused) await control.click();
  await expect(control).toHaveAttribute('aria-pressed', 'false');
}

export async function pauseAmbientMotion(page: Page) {
  const control = page.locator('button.motion-toggle');
  // Server HTML begins paused. Wait for the actual browser preference before clicking.
  const initiallyPaused = await page.evaluate(() => {
    const saved = sessionStorage.getItem('cosmic-art-motion-v1');
    return saved ? saved === 'paused' : matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  await expect(control).toHaveAttribute('aria-pressed', String(initiallyPaused));
  if (!initiallyPaused) await control.click();
  await expect(control).toHaveAttribute('aria-pressed', 'true');
}

/** A key the page has stored, in this tab's session or this browser's local storage. */
export const stored = (page: Page, key: string, where: 'local' | 'session') =>
  page.evaluate(
    ([name, kind]) => (kind === 'local' ? localStorage : sessionStorage).getItem(name),
    [key, where] as const,
  );

/** Whether First Light performs here: it takes the plate, or the page stands at once. */
export async function performs(page: Page) {
  const html = page.locator('html');
  await expect
    .poll(async () => (await html.getAttribute('data-overture')) ?? 'stood', { timeout: 20_000 })
    .toMatch(/^(playing|landing|dawn|stood)$/);
  return (await html.getAttribute('data-overture')) !== null;
}

/**
 * Every value the gate takes, from the document's first moment: the room script sets it before
 * anything paints. A browser that cannot draw the light lifts it at once, often before the page
 * has loaded, so a poll after the load can miss it; this reads it back instead.
 */
export async function watchTheGate(page: Page) {
  await page.addInitScript(() => {
    const taken: (string | null)[] = [];
    Object.defineProperty(window, '__gate', { value: taken });
    new MutationObserver((records) => {
      // Each record holds the value before its change; the value after is the next one's, or now.
      records.forEach((_, i) =>
        taken.push(
          i + 1 < records.length
            ? records[i + 1].oldValue
            : document.documentElement.getAttribute('data-overture'),
        ),
      );
    }).observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-overture'],
      attributeOldValue: true,
    });
  });
  return () => page.evaluate(() => (window as unknown as { __gate: (string | null)[] }).__gate);
}
