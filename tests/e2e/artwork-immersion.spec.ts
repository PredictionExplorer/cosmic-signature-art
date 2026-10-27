import { expect, test, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { catalogs } from '../../src/lib/i18n/messages';
import { locales, localizedPath } from '../../src/lib/i18n/routing';

const archive = JSON.parse(
  readFileSync(new URL('../../src/lib/art/curated-media.json', import.meta.url), 'utf8'),
) as { id: number; media: { id: string; still: string; sourceUrl: string }[] }[];
const t = catalogs.en;
// React can temporarily hold a second server fragment in a hidden streaming container.
// Keep the live (including inert modal-background) stage, not that unpainted copy.
const pageStage = '[data-artwork-stage="page"]:visible';
const current = `${pageStage} [data-layer-state="current"]`;
const nightLayer = `${pageStage} [data-layer="light"]`;
const roomSelector = '[data-testid="artwork-room"]';
const light = archive.find((work) => work.id === 31)!.media.find((media) => media.id === 'light')!;
const ink = archive.find((work) => work.id === 31)!.media.find((media) => media.id === 'ink')!;
// Fault injection is limited to this real work's authenticated delivery locations.
const isLightStill = (url: URL) => url.pathname === light.still || url.href === light.sourceUrl;
const isInkStill = (url: URL) => url.pathname === ink.still || url.href === ink.sourceUrl;
// Only a complete published original counts; the hash-verified local film plays inline.
const originalFilm = (url: string) => /\/videos\/web\/[^/]+\.mp4(?:\?|$)/.test(url);

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

async function artworkReady(page: Page, path = '/art/31?view=still') {
  // Both grounds paint eagerly, so a held still would hold `load`; readiness is asserted below.
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/№ 031/);
  const stage = page.locator(pageStage);
  await expect(stage).toHaveAttribute('data-expression', 'ink');
  await imageReady(page.locator(`${current} img.art-still`));
  // The motion preference provides an observable hydration boundary before clicking controls.
  const paused = await page.evaluate(() => {
    const saved = sessionStorage.getItem('cosmic-art-motion-v1');
    return saved ? saved === 'paused' : matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  await expect(page.locator('button.motion-toggle')).toHaveAttribute(
    'aria-pressed',
    String(paused),
  );
  // Under a still preference the server and the client agree on the toggle, so it cannot
  // prove hydration; the keys' marker is set only once the client's listeners are attached.
  await expect(page.locator('html')).toHaveAttribute('data-keys', 'ready');
  return page.getByRole('region', { name: t.ways, exact: true });
}

/** The strip's Turn word on the committed layer; the twin's copy is inert. */
function turnWord(page: Page, to: 'light' | 'ink') {
  return page.locator(`${current} [data-turn="${to}"]`);
}

/**
 * The seam as the night layer paints it: the left inset of its clip, in percent, rounded to
 * the pixel. Engines serialise the inset in percent, in pixels, or as an unresolved min()
 * inside the wing; every form reduces to one number here.
 */
async function seamInset(page: Page) {
  return page.locator(nightLayer).evaluate((element) => {
    const clip = getComputedStyle(element).clipPath;
    if (clip === 'none') return 0;
    const width = element.getBoundingClientRect().width;
    const toPercent = (value: string, unit: string) =>
      unit === '%' ? Number(value) : (Number(value) / width) * 100;
    const inset = /inset\((.*)\)$/.exec(clip)?.[1];
    if (!inset) return null;
    const parts = inset.trim().split(/\s+(?![^(]*\))/);
    const left = parts[3] ?? parts[1] ?? parts[0];
    const values = [...left.matchAll(/([\d.]+)(%|px)/g)].map(([, value, unit]) =>
      toPercent(value, unit),
    );
    if (!values.length) return null;
    return Math.round(Math.min(...values) * 10) / 10;
  });
}

async function cinematicObserver(page: Page) {
  await page.addInitScript(() => {
    const state = { attempted: 0, ready: 0 };
    Object.assign(window, { __expressionTransitions: state });
    if (typeof document.startViewTransition !== 'function') return;
    const original = document.startViewTransition.bind(document);
    document.startViewTransition = (...args) => {
      state.attempted += 1;
      const transition = original(...args);
      void transition.ready.then(
        () => {
          state.ready += 1;
        },
        () => {
          /* Superseded transitions are valid; the selected work must remain correct. */
        },
      );
      return transition;
    };
  });
}

async function transitionCount(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { __expressionTransitions: { attempted: number } })
        .__expressionTransitions.attempted,
  );
}

async function noOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    width: document.documentElement.scrollWidth,
  }));
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport + 1);
}

test('the plate is painted from an inline preview before the full still arrives', async ({
  page,
}) => {
  test.skip(
    test.info().project.name === 'webkit-reduced-motion',
    "Headless WebKit under reduced-motion emulation fires no requestAnimationFrame before load, so React's streamed Suspense reveal waits for the held still; the preview-first contract is proved by every other project.",
  );
  // Hold the full still in flight: the ladder must stand on its first rung meanwhile.
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let intercepted = 0;
  await page.route(isInkStill, async (route) => {
    intercepted += 1;
    await held;
    await route.continue();
  });
  // The eager hero <img> delays `load`, so only DOMContentLoaded can be awaited here.
  await page.goto('/art/31?view=still', { waitUntil: 'domcontentloaded' });
  const preview = page.locator(`${current} img.art-preview`);
  const still = page.locator(`${current} img.art-still`);
  const plate = page.locator(`${current} .art-media`);
  await expect(preview).toHaveAttribute('src', /^data:image\/webp;base64,/);
  await expect(preview).toBeInViewport();
  await expect
    .poll(() =>
      preview.evaluate((element) => {
        const image = element as HTMLImageElement;
        return image.complete && image.naturalWidth > 0;
      }),
    )
    .toBe(true);
  await expect(preview).toHaveCSS('opacity', '1');
  await expect.poll(() => intercepted).toBeGreaterThan(0);
  await expect(plate).toHaveAttribute('data-arrival', 'arriving');
  await expect(still).not.toHaveClass(/is-settled/);
  await expect(still).toHaveCSS('opacity', '0');
  await expect(page.locator(`${current} [data-film-state]`)).toHaveAttribute(
    'data-film-state',
    'arriving',
  );
  // The twin ground is painted from the HTML too, ready for the Turn.
  await expect(page.locator(`${nightLayer} img.art-preview`)).toHaveAttribute(
    'src',
    /^data:image\/webp;base64,/,
  );
  release();
  await imageReady(still);
  await expect(still).toHaveClass(/is-settled/);
  await expect(still).toHaveCSS('opacity', '1');
  await expect(plate).toHaveAttribute('data-arrival', 'settled');
  await expect(page.locator(`${current} [data-film-state]`)).toHaveAttribute(
    'data-film-state',
    'still',
  );
  await expect(still).toHaveAttribute('alt', '№ 031 · Ink');
});

test('the Turn carries Light in from the right and Ink back from the left, and remembers the choice', async ({
  page,
}) => {
  await cinematicObserver(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await artworkReady(page);
  const stage = page.locator(pageStage);
  expect(await seamInset(page)).toBe(100);
  await turnWord(page, 'light').click();
  // One straight seam travels the whole frame: the night layer's inset shrinks from the left.
  await expect(page.locator('html')).toHaveAttribute('data-turning', 'time');
  const first = await expect
    .poll(() => seamInset(page), { timeout: 2000 })
    .toBeLessThan(100)
    .then(() => seamInset(page));
  const second = await expect
    .poll(() => seamInset(page), { timeout: 2000 })
    .toBeLessThan((first ?? 100) - 0.5)
    .then(() => seamInset(page));
  expect(second).not.toBeNull();
  await expect(stage).toHaveAttribute('data-expression', 'light', { timeout: 5000 });
  await expect(page.locator('html')).not.toHaveAttribute('data-turning', /./);
  await expect(page.locator('html')).toHaveAttribute('data-room', 'night');
  expect(await seamInset(page)).toBe(0);
  const lightStill = page.locator(`${current} img.art-still`);
  await imageReady(lightStill);
  await expect(lightStill).toHaveAttribute('alt', '№ 031 · Light');
  expect(
    [light.still, light.sourceUrl].map((source) => new URL(source, page.url()).href),
  ).toContain(await lightStill.evaluate((image) => (image as HTMLImageElement).src));
  expect(await page.evaluate(() => sessionStorage.getItem('cosmic-art-expression-v1'))).toBe(
    'light',
  );
  // The page never used a native view transition for the crossing: the seam is the Turn.
  expect(await transitionCount(page)).toBe(0);
  // Ink returns from the left: the inset grows.
  await turnWord(page, 'ink').click();
  await expect(page.locator('html')).toHaveAttribute('data-turning', 'time');
  await expect.poll(() => seamInset(page), { timeout: 2000 }).toBeGreaterThan(0);
  await expect(stage).toHaveAttribute('data-expression', 'ink', { timeout: 5000 });
  await expect(page.locator('html')).toHaveAttribute('data-room', 'paper');
  expect(await seamInset(page)).toBe(100);
  await expect(page.locator(`${current} img.art-still`)).toHaveAttribute('alt', '№ 031 · Ink');
  await noOverflow(page);
});

test('holding L peeks at Light and lets go; a tap completes the Turn', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await artworkReady(page);
  const stage = page.locator(pageStage);
  await page.keyboard.down('l');
  await expect(page.locator('html')).toHaveAttribute('data-turning', 'time');
  await expect.poll(() => seamInset(page), { timeout: 2000 }).toBeLessThan(50);
  await page.waitForTimeout(1200);
  await expect(stage).toHaveAttribute('data-expression', 'ink');
  await page.keyboard.up('l');
  await expect.poll(() => seamInset(page), { timeout: 3000 }).toBe(100);
  await expect(page.locator('html')).not.toHaveAttribute('data-turning', /./);
  await expect(stage).toHaveAttribute('data-expression', 'ink');
  await page.keyboard.press('l');
  await expect(stage).toHaveAttribute('data-expression', 'light', { timeout: 5000 });
  await page.keyboard.press('i');
  await expect(stage).toHaveAttribute('data-expression', 'ink', { timeout: 5000 });
});

test('keys are silent while focus is in a field, and the remembered expression follows the visit', async ({
  page,
  context,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await artworkReady(page);
  await page.evaluate(() => {
    const field = document.createElement('input');
    field.id = 'probe-field';
    document.body.append(field);
    field.focus();
  });
  await page.keyboard.press('l');
  await page.waitForTimeout(400);
  await expect(page.locator(pageStage)).toHaveAttribute('data-expression', 'ink');
  await expect(page.locator('html')).not.toHaveAttribute('data-turning', /./);
  await page.evaluate(() => document.getElementById('probe-field')?.remove());
  await turnWord(page, 'light').click();
  await expect(page.locator(pageStage)).toHaveAttribute('data-expression', 'light', {
    timeout: 5000,
  });
  // The next work of the visit opens on the remembered expression, without a Turn.
  await page.goto('/art/35?view=still');
  await expect(page.locator(pageStage)).toHaveAttribute('data-expression', 'light');
  await expect(page.locator(`${current} img.art-still`)).toHaveAttribute('alt', '№ 035 · Light');
  // A new visit always opens on Ink.
  const fresh = await context.browser()!.newContext();
  const next = await fresh.newPage();
  await next.goto(`${new URL(page.url()).origin}/art/35?view=still`);
  await expect(next.locator(pageStage)).toHaveAttribute('data-expression', 'ink');
  await fresh.close();
});

test('the night wing is drawn by the hand where the browser can, and is a hard edge elsewhere', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await artworkReady(page);
  const wing = page.locator('[data-night-wing]:visible');
  await expect(wing).toHaveAttribute('data-mode', 'scroll');
  const scrollDriven = await page.evaluate(() => CSS.supports('animation-timeline: view()'));
  const { top, height, stage } = await wing.evaluate((element) => ({
    top: element.getBoundingClientRect().top + window.scrollY,
    height: element.getBoundingClientRect().height,
    stage: element.firstElementChild!.getBoundingClientRect().height,
  }));
  if (scrollDriven) {
    expect(height).toBeGreaterThan(stage * 1.9);
    await page.evaluate(
      (y) => window.scrollTo({ top: y, behavior: 'instant' }),
      top + height - stage,
    );
    await expect.poll(() => seamInset(page), { timeout: 3000 }).toBeLessThan(1);
    await expect(page.locator('html')).toHaveAttribute('data-room', 'night');
    await expect(page.locator(pageStage)).toHaveAttribute('data-expression', 'ink');
    // The head is the night too: the Ink plate still under the hand lends it no paper.
    await expect(page.locator('.site-header')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    await expect(page.locator('.site-header')).toHaveCSS('color', 'rgb(241, 235, 223)');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expect.poll(() => seamInset(page), { timeout: 3000 }).toBe(100);
    await expect(page.locator('html')).toHaveAttribute('data-room', 'paper');
  } else {
    // The hard edge: a second screen in black with the same Light plate.
    const fallback = wing.locator('> div').nth(1);
    await expect(fallback).toBeVisible();
    await expect(fallback.locator('img.art-still')).toHaveAttribute('alt', '№ 031 · Light');
    await fallback.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy({ top: 10, behavior: 'instant' }));
    await expect(page.locator('html')).toHaveAttribute('data-room', 'night');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expect(page.locator('html')).toHaveAttribute('data-room', 'paper');
  }
});

test('a finger carries the seam: past 40 % the Turn completes, short of it the seam springs back', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Drag-to-Turn answers touch only.');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await artworkReady(page);
  const stage = page.locator(pageStage);
  const drag = async (fromX: number, toX: number) => {
    await page.locator(current).evaluate(
      (element, [from, to]) => {
        const turn = element.closest('[data-expression]')!;
        const rect = turn.getBoundingClientRect();
        const y = rect.top + rect.height / 2;
        const pointer = (type: string, x: number) =>
          turn.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              pointerId: 7,
              pointerType: 'touch',
              isPrimary: true,
              clientX: rect.left + rect.width * x,
              clientY: y,
            }),
          );
        pointer('pointerdown', from);
        for (let step = 1; step <= 6; step += 1)
          pointer('pointermove', from + ((to - from) * step) / 6);
        pointer('pointerup', to);
      },
      [fromX, toX] as const,
    );
  };
  await drag(0.95, 0.8);
  await expect.poll(() => seamInset(page), { timeout: 3000 }).toBe(100);
  await expect(stage).toHaveAttribute('data-expression', 'ink');
  await drag(0.95, 0.4);
  await expect(stage).toHaveAttribute('data-expression', 'light', { timeout: 5000 });
  await expect(page.locator('html')).not.toHaveAttribute('data-turning', /./);
});

test('a slower expression keeps the current work visible and the latest choice wins', async ({
  page,
}) => {
  test.skip(
    test.info().project.name === 'webkit-reduced-motion',
    "The held Light still now also holds the twin layer's eager image and so the page's load; headless WebKit under reduced-motion emulation reveals the streamed page only after load. Every other project proves the contract.",
  );
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let intercepted = 0;
  await page.route(isLightStill, async (route) => {
    intercepted += 1;
    await held;
    await route.continue();
  });
  await artworkReady(page);
  const stage = page.locator(pageStage);
  const original = await page.locator(`${current} img.art-still`).getAttribute('src');
  await turnWord(page, 'light').click();
  await expect(page.getByText(t.preparingExpression, { exact: true })).toBeVisible();
  await expect(stage).toHaveAttribute('data-expression', 'ink');
  await expect(page.locator(`${current} img.art-still`)).toHaveAttribute('src', original!);
  await turnWord(page, 'light').click();
  await expect(page.getByText(t.preparingExpression, { exact: true })).toBeVisible();
  // Choosing Ink again cancels the preparation; nothing commits when the bytes arrive.
  await page.keyboard.press('i');
  await expect(page.getByText(t.preparingExpression, { exact: true })).toHaveCount(0);
  release();
  expect(intercepted).toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  await expect(stage).toHaveAttribute('data-expression', 'ink');
  await turnWord(page, 'light').click();
  await expect(stage).toHaveAttribute('data-expression', 'light', { timeout: 5000 });
});

test('a failed expression keeps the current artwork and offers a successful retry', async ({
  page,
}) => {
  await page.route(isLightStill, (route) => route.abort('failed'));
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await artworkReady(page);
  const stage = page.locator(pageStage);
  const original = await page.locator(`${current} img.art-still`).getAttribute('src');
  await turnWord(page, 'light').click();
  await expect(page.getByText(t.expressionFailed, { exact: true })).toBeVisible();
  await expect(stage).toHaveAttribute('data-expression', 'ink');
  await expect(page.locator(`${current} img.art-still`)).toHaveAttribute('src', original!);
  await page.unroute(isLightStill);
  await turnWord(page, 'light').click();
  await expect(stage).toHaveAttribute('data-expression', 'light', { timeout: 5000 });
  await imageReady(page.locator(`${current} img.art-still`));
  await expect(page.getByText(t.expressionFailed, { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const preference of ['reduced motion', 'paused motion'] as const) {
  test(`${preference} crosses in one frame, without a seam, a native transition or an ambient film request`, async ({
    page,
  }) => {
    await cinematicObserver(page);
    await page.emulateMedia({
      reducedMotion: preference === 'reduced motion' ? 'reduce' : 'no-preference',
    });
    if (preference === 'paused motion') {
      await page.addInitScript(() => sessionStorage.setItem('cosmic-art-motion-v1', 'paused'));
    }
    const filmRequests: string[] = [];
    page.on('request', (request) => {
      if (/\.mp4(?:\?|$)/.test(request.url())) filmRequests.push(request.url());
    });
    await artworkReady(page);
    await expect(page.locator('[data-night-wing]:visible')).toHaveAttribute('data-mode', 'hard');
    await turnWord(page, 'light').click();
    await expect(page.locator(pageStage)).toHaveAttribute('data-expression', 'light');
    await expect(page.locator('html')).not.toHaveAttribute('data-turning', /./);
    await turnWord(page, 'ink').click();
    await expect(page.locator(pageStage)).toHaveAttribute('data-expression', 'ink');
    expect(await transitionCount(page)).toBe(0);
    expect(filmRequests).toEqual([]);
  });
}

test('Study opens a contained still, releases ambient playback and restores focus', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const originals: string[] = [];
  page.on('request', (request) => {
    if (originalFilm(request.url())) originals.push(request.url());
  });
  await artworkReady(page, '/art/31');
  const inline = page.locator(`${current} video`);
  await expect(inline).toHaveAttribute('src', /\/art\/31-ink-preview\.mp4$/);
  await expect
    .poll(() => inline.evaluate((element) => !(element as HTMLVideoElement).paused), {
      timeout: 10_000,
    })
    .toBe(true);
  const overflowBefore = await page.evaluate(() => document.body.style.overflow);
  const open = page.locator(current).getByRole('button', { name: t.enlarge, exact: true });
  await open.focus();
  await open.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleName(`№ 031 · ${t.viewingRoom}`);
  const still = dialog.locator('img');
  await imageReady(still);
  await expect(still).toHaveAttribute('alt', '№ 031 · Ink');
  await expect(dialog.locator('video')).toHaveCount(0);
  await expect
    .poll(async () =>
      (await inline.count())
        ? inline.evaluate((element) => (element as HTMLVideoElement).paused)
        : true,
    )
    .toBe(true);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  const layout = await still.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      fit: getComputedStyle(element).objectFit,
      width: bounds.width,
      height: bounds.height,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    };
  });
  expect(layout.fit).toBe('contain');
  expect(layout.width).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.height).toBeLessThanOrEqual(layout.viewportHeight);
  await expect(dialog.getByRole('button', { name: t.close, exact: true })).toBeInViewport();
  expect(originals).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(open).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe(overflowBefore);
  await expect(page.locator(roomSelector)).toHaveCount(0);
});

test('full films are explicit, on the room’s own transport, and only the selected version is attached', async ({
  page,
}) => {
  const originals: string[] = [];
  page.on('request', (request) => {
    if (originalFilm(request.url())) originals.push(request.url());
  });
  await artworkReady(page);
  expect(originals).toEqual([]);
  // F opens the film in the room; nothing was requested before that key.
  await page.keyboard.press('f');
  const dialog = page.getByRole('dialog');
  const film = dialog.locator('video');
  await expect(film).toHaveAttribute('playsinline', '');
  // The room drives the film from its own one-pixel transport, never the native controls.
  await expect(film).not.toHaveAttribute('controls');
  await expect(dialog.getByRole('slider', { name: t.filmPosition, exact: true })).toBeVisible();
  await expect(film).toHaveAttribute(
    'src',
    /(?:\/art\/31-ink-preview\.mp4|\/videos\/web\/ember\.mp4)$/,
  );
  expect(originals.every((url) => !/ember_(medium|slow)/.test(url))).toBe(true);
  const frame = page.locator(`${roomSelector} > div`).first();
  await expect(frame).not.toHaveAttribute('data-slow', '');
  // The long studies are words on the strip, each with its length; they open the Slow room.
  for (const [label, suffix] of [
    [t.longStudy, 'ember_medium'],
    [t.extendedStudy, 'ember_slow'],
  ] as const) {
    const oldFilm = await film.elementHandle();
    await dialog.getByRole('button', { name: new RegExp(`^${label} · \\d+ s$`) }).click();
    await expect(dialog.locator('video[src]')).toHaveCount(1);
    await expect(film).toHaveAttribute('src', new RegExp(`/videos/web/${suffix}\\.mp4$`));
    await expect(frame).toHaveAttribute('data-slow', '');
    expect(await oldFilm!.evaluate((element) => (element as HTMLVideoElement).paused)).toBe(true);
    expect(await oldFilm!.getAttribute('src')).toBeNull();
    await oldFilm!.dispose();
  }
  const lastFilm = await film.elementHandle();
  await dialog.getByRole('button', { name: t.still, exact: true }).click();
  await expect(dialog.locator('video')).toHaveCount(0);
  expect(await lastFilm!.evaluate((element) => (element as HTMLVideoElement).paused)).toBe(true);
  expect(await lastFilm!.getAttribute('src')).toBeNull();
  await lastFilm!.dispose();
  await imageReady(dialog.locator('img'));
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});

test('a rejected native fullscreen request preserves the complete viewing room', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = { attempts: 0 };
    Object.assign(window, { __fullscreen: state });
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
    Object.defineProperty(Element.prototype, 'requestFullscreen', {
      configurable: true,
      value() {
        state.attempts += 1;
        return Promise.reject(
          new DOMException('Fullscreen denied by browser policy', 'NotAllowedError'),
        );
      },
    });
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await artworkReady(page);
  await page.locator(current).getByRole('button', { name: t.enlarge, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: t.fullScreen, exact: true }).click();
  await expect(dialog.getByText(t.fullScreenUnavailable, { exact: true })).toBeVisible();
  await expect(dialog).toBeVisible();
  await imageReady(dialog.locator('img'));
  expect(
    await page.evaluate(
      () => (window as unknown as { __fullscreen: { attempts: number } }).__fullscreen.attempts,
    ),
  ).toBe(1);
  await dialog.getByRole('button', { name: t.close, exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('native fullscreen enters when supported and returns to the same work', async ({ page }) => {
  await artworkReady(page);
  await page.locator(current).getByRole('button', { name: t.enlarge, exact: true }).click();
  const dialog = page.getByRole('dialog');
  const enter = dialog.getByRole('button', { name: t.fullScreen, exact: true });
  if (await enter.count()) {
    await enter.click();
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => !!document.fullscreenElement)) ||
          (await dialog.getByText(t.fullScreenUnavailable, { exact: true }).isVisible()),
      )
      .toBe(true);
    if (await page.evaluate(() => !!document.fullscreenElement)) {
      await expect(page.locator(roomSelector)).toBeVisible();
      await dialog.getByRole('button', { name: t.exitFullScreen, exact: true }).click();
      await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    }
  }
  await expect(dialog).toBeVisible();
  await imageReady(dialog.locator('img'));
  await dialog.getByRole('button', { name: t.close, exact: true }).click();
  await expect(dialog).not.toBeVisible();
});

test('expression changes in the room stay contained, commit to the plate, and keep focus inside', async ({
  page,
}) => {
  await artworkReady(page);
  const open = page.locator(current).getByRole('button', { name: t.enlarge, exact: true });
  await open.click();
  const dialog = page.getByRole('dialog');
  const controls = dialog.getByRole('group', { name: t.ways, exact: true });
  await controls.getByRole('button', { name: /^Light$/ }).click();
  await expect(dialog.locator('[data-artwork-stage="room"]')).toHaveAttribute(
    'data-expression',
    'light',
  );
  await expect(dialog.locator('img')).toHaveAttribute('alt', '№ 031 · Light');
  await imageReady(dialog.locator('img'));
  await expect(dialog.locator('video')).toHaveCount(0);
  for (let index = 0; index < 10; index += 1) {
    await page.keyboard.press('Tab');
    // Native dialogs still permit focus to enter the browser chrome. Background
    // page controls must remain inert; body is the document's focus placeholder.
    const focus = await dialog.evaluate((element) => ({
      inside: element.contains(document.activeElement),
      browserChrome: document.activeElement === document.body,
      active: document.activeElement?.outerHTML.slice(0, 200),
    }));
    expect(focus.inside || focus.browserChrome, focus.active).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(open).toBeFocused();
  await expect(page.locator(pageStage)).toHaveAttribute('data-expression', 'light');
  await expect(page.locator('html')).not.toHaveAttribute('data-turning', /./);
  await noOverflow(page);
});

test('the viewing room remains accessible and translated in every gallery language', async ({
  page,
}) => {
  test.setTimeout(180_000);
  for (const locale of locales) {
    const messages = catalogs[locale];
    await page.goto(`${localizedPath(locale, '/art/31')}?view=still`);
    const open = page.locator(current).getByRole('button', { name: messages.enlarge, exact: true });
    await expect(open).toBeVisible();
    await open.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveAccessibleName(`№ 031 · ${messages.viewingRoom}`);
    await imageReady(dialog.locator('img'));
    await expect(
      dialog.getByRole('button', { name: messages.close, exact: true }),
    ).toBeInViewport();
    // The Expansion fades the ground in; contrast is judged on the settled room.
    await page.waitForFunction(
      () =>
        !document
          .getAnimations()
          .some((animation) =>
            (animation.effect as KeyframeEffect | null)?.target?.closest(
              '[data-testid="artwork-room"]',
            ),
          ),
    );
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      results.violations.map(({ id, impact, nodes }) => ({
        id,
        impact,
        targets: nodes.map((node) => node.target),
      })),
      locale,
    ).toEqual([]);
    await noOverflow(page);
    await page.keyboard.press('Escape');
    await expect(open).toBeFocused();
  }
});
