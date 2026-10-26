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
const roomSelector = '[data-testid="artwork-room"]';
const light = archive.find((work) => work.id === 31)!.media.find((media) => media.id === 'light')!;
const ink = archive.find((work) => work.id === 31)!.media.find((media) => media.id === 'ink')!;
// Fault injection is limited to this real work's two authenticated delivery locations.
const isLightStill = (url: URL) => url.pathname === light.still || url.href === light.sourceUrl;
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
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Signature 31');
  const stage = page.locator(pageStage);
  await expect(stage).toHaveAttribute('data-expression', 'ink');
  await imageReady(stage.locator('img.art-still'));
  // The motion preference provides an observable hydration boundary before clicking controls.
  const paused = await page.evaluate(() => {
    const saved = sessionStorage.getItem('cosmic-art-motion-v1');
    return saved ? saved === 'paused' : matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  await expect(page.locator('.motion-toggle')).toHaveAttribute('aria-pressed', String(paused));
  return page.getByRole('region', { name: t.ways, exact: true });
}

function expressionControl(scope: Locator, expression: 'Ink' | 'Light') {
  return scope.getByRole('button', { name: new RegExp(`^(?:0[12] )?${expression}$`) });
}

async function cinematicObserver(page: Page) {
  await page.addInitScript(() => {
    const state = {
      attempted: 0,
      ready: 0,
      animations: [] as { name: string; duration: number | string | undefined }[],
    };
    Object.assign(window, { __expressionTransitions: state });
    if (typeof document.startViewTransition !== 'function') return;
    const original = document.startViewTransition.bind(document);
    document.startViewTransition = (...args) => {
      state.attempted += 1;
      const transition = original(...args);
      void transition.ready.then(
        () => {
          state.ready += 1;
          state.animations = [];
          for (const animation of document.getAnimations()) {
            if ('animationName' in animation)
              state.animations.push({
                name: String(animation.animationName),
                duration: Number(animation.effect?.getTiming().duration),
              });
          }
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

async function readyTransitions(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { __expressionTransitions: { ready: number } }).__expressionTransitions
        .ready,
  );
}

async function observedAnimations(page: Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __expressionTransitions: {
            animations: { name: string; duration: number | string | undefined }[];
          };
        }
      ).__expressionTransitions.animations,
  );
}

async function noOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    width: document.documentElement.scrollWidth,
  }));
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport + 1);
}

test('the plate is painted from an inline preview before any full still arrives', async ({
  page,
}) => {
  await page.goto('/art/31?view=still');
  const preview = page.locator(`${pageStage} img.art-preview`);
  await expect(preview).toHaveAttribute('src', /^data:image\/webp;base64,/);
  await expect(preview).toBeInViewport();
  expect(
    await preview.evaluate((element) => {
      const image = element as HTMLImageElement;
      return image.complete && image.naturalWidth > 0;
    }),
  ).toBe(true);
  const plate = page.locator(`${pageStage} .art-media`);
  await expect(plate).toHaveAttribute('data-arrival', /^(?:arriving|settled)$/);
  const still = page.locator(`${pageStage} img.art-still`);
  await imageReady(still);
  await expect(still).toHaveClass(/is-settled/);
  await expect(plate).toHaveAttribute('data-arrival', 'settled');
  await expect(page.locator('.work-transport [data-film-state]')).toHaveAttribute(
    'data-film-state',
    'still',
  );
});

test('Ink and Light move between genuine expressions while preserving the artwork identity', async ({
  page,
}) => {
  await cinematicObserver(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const room = await artworkReady(page);
  const stage = page.locator(pageStage);
  const originalSize = await stage.boundingBox();
  const supported = await page.evaluate(() => typeof document.startViewTransition === 'function');
  const beforeLight = await readyTransitions(page);
  await expressionControl(room, 'Light').click();
  await expect(stage).toHaveAttribute('data-expression', 'light');
  await imageReady(stage.locator('img.art-still'));
  await expect(stage.locator('img.art-still')).toHaveAttribute('alt', 'Signature 31 · Light');
  expect(
    [light.still, light.sourceUrl].map((source) => new URL(source, page.url()).href),
  ).toContain(
    await stage.locator('img.art-still').evaluate((image) => (image as HTMLImageElement).src),
  );
  if (supported) {
    await expect.poll(() => readyTransitions(page)).toBeGreaterThan(beforeLight);
    const animations = await observedAnimations(page);
    expect(animations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: expect.stringMatching(/revealLight/), duration: 650 }),
        expect.objectContaining({ name: expect.stringMatching(/departure/), duration: 650 }),
      ]),
    );
    await test.info().attach('Ink-to-Light-native-animations', {
      body: JSON.stringify(animations),
      contentType: 'application/json',
    });
  }
  await expect(expressionControl(room, 'Light')).toHaveAttribute('aria-pressed', 'true');
  const beforeInk = await readyTransitions(page);
  await expressionControl(room, 'Ink').click();
  await expect(stage).toHaveAttribute('data-expression', 'ink');
  await imageReady(stage.locator('img.art-still'));
  expect([ink.still, ink.sourceUrl].map((source) => new URL(source, page.url()).href)).toContain(
    await stage.locator('img.art-still').evaluate((image) => (image as HTMLImageElement).src),
  );
  if (supported) {
    await expect.poll(() => readyTransitions(page)).toBeGreaterThan(beforeInk);
    const animations = await observedAnimations(page);
    expect(animations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: expect.stringMatching(/revealInk/), duration: 650 }),
        expect.objectContaining({ name: expect.stringMatching(/departure/), duration: 650 }),
      ]),
    );
    await test.info().attach('Light-to-Ink-native-animations', {
      body: JSON.stringify(animations),
      contentType: 'application/json',
    });
  }
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Signature 31');
  const restoredSize = await stage.boundingBox();
  expect(restoredSize!.width).toBeCloseTo(originalSize!.width, 0);
  expect(restoredSize!.height).toBeCloseTo(originalSize!.height, 0);
  await noOverflow(page);
});

test('a slower expression keeps the current work visible and the latest choice wins', async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let released!: () => void;
  const releasedRequest = new Promise<void>((resolve) => {
    released = resolve;
  });
  let intercepted = 0;
  await page.route(isLightStill, async (route) => {
    intercepted += 1;
    await held;
    try {
      await route.continue();
    } finally {
      released();
    }
  });
  const room = await artworkReady(page);
  const stage = page.locator(pageStage);
  const original = await stage.locator('img.art-still').getAttribute('src');
  await expressionControl(room, 'Light').click();
  await expect(page.getByText(t.preparingExpression, { exact: true })).toBeVisible();
  await expect(stage).toHaveAttribute('data-expression', 'ink');
  await imageReady(stage.locator('img.art-still'));
  await expect(stage.locator('img.art-still')).toHaveAttribute('src', original!);
  await expressionControl(room, 'Ink').click();
  await expect(page.getByText(t.preparingExpression, { exact: true })).toHaveCount(0);
  release();
  await releasedRequest;
  expect(intercepted).toBeGreaterThan(0);
  await expect(stage).toHaveAttribute('data-expression', 'ink');
  // Re-selecting Light proves the abandoned request did not corrupt the following commit.
  await expressionControl(room, 'Light').click();
  await expect(stage).toHaveAttribute('data-expression', 'light');
  await imageReady(stage.locator('img.art-still'));
  await expressionControl(room, 'Ink').click();
  await expect(stage).toHaveAttribute('data-expression', 'ink');
});

test('a failed expression keeps the current artwork and offers a successful retry', async ({
  page,
}) => {
  await page.route(isLightStill, (route) => route.abort('failed'));
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const room = await artworkReady(page);
  const stage = page.locator(pageStage);
  const original = await stage.locator('img.art-still').getAttribute('src');
  await expressionControl(room, 'Light').click();
  await expect(page.getByText(t.expressionFailed, { exact: true })).toBeVisible();
  await expect(stage).toHaveAttribute('data-expression', 'ink');
  await expect(stage.locator('img.art-still')).toHaveAttribute('src', original!);
  await imageReady(stage.locator('img.art-still'));
  await page.unroute(isLightStill);
  await expressionControl(room, 'Light').click();
  await expect(stage).toHaveAttribute('data-expression', 'light');
  await imageReady(stage.locator('img.art-still'));
  await expect(page.getByText(t.expressionFailed, { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const preference of ['reduced motion', 'paused motion'] as const) {
  test(`${preference} changes expression without a cinematic animation or ambient film request`, async ({
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
    const room = await artworkReady(page);
    await expressionControl(room, 'Light').click();
    await expect(page.locator(pageStage)).toHaveAttribute('data-expression', 'light');
    await expressionControl(room, 'Ink').click();
    await expect(page.locator(pageStage)).toHaveAttribute('data-expression', 'ink');
    expect(await transitionCount(page)).toBe(0);
    expect(filmRequests).toEqual([]);
  });
}

test('the viewing room opens a contained still, releases ambient playback and restores focus', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const originals: string[] = [];
  page.on('request', (request) => {
    if (originalFilm(request.url())) originals.push(request.url());
  });
  await artworkReady(page, '/art/31');
  const inline = page.locator(`${pageStage} video`);
  await expect(inline).toHaveAttribute('src', /\/art\/31-ink-preview\.mp4$/);
  await expect
    .poll(() => inline.evaluate((element) => !(element as HTMLVideoElement).paused))
    .toBe(true);
  const overflowBefore = await page.evaluate(() => document.body.style.overflow);
  const open = page.getByRole('button', { name: t.enlarge, exact: true });
  await open.focus();
  await open.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleName(`Signature 31 · ${t.viewingRoom}`);
  const still = dialog.locator('img');
  await imageReady(still);
  await expect(still).toHaveAttribute('alt', 'Signature 31 · Ink');
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

test('full films are explicit, native-controlled and only the selected version is attached', async ({
  page,
}) => {
  const originals: string[] = [];
  page.on('request', (request) => {
    if (originalFilm(request.url())) originals.push(request.url());
  });
  const room = await artworkReady(page);
  expect(originals).toEqual([]);
  const complete = room.getByRole('button', { name: t.completeFilm, exact: true });
  await complete.click();
  const dialog = page.getByRole('dialog');
  const film = dialog.locator('video');
  await expect(film).toHaveAttribute('controls', '');
  await expect(film).toHaveAttribute('playsinline', '');
  await expect(film).toHaveAttribute(
    'src',
    /(?:\/art\/31-ink-preview\.mp4|\/videos\/web\/ember\.mp4)$/,
  );
  expect(originals.every((url) => !/ember_(medium|slow)/.test(url))).toBe(true);
  const versions = dialog.getByRole('combobox', { name: t.completeFilm, exact: true });
  await expect(versions).toBeVisible();
  for (const [label, suffix] of [
    [t.longStudy, 'ember_medium'],
    [t.extendedStudy, 'ember_slow'],
  ] as const) {
    const oldFilm = await film.elementHandle();
    await versions.selectOption({ label });
    await expect(dialog.locator('video[src]')).toHaveCount(1);
    await expect(film).toHaveAttribute('src', new RegExp(`/videos/web/${suffix}\\.mp4$`));
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
  await expect(complete).toBeFocused();
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
  await page.getByRole('button', { name: t.enlarge, exact: true }).click();
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
  await page.getByRole('button', { name: t.enlarge, exact: true }).click();
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

test('expression changes stay contained and keyboard navigation cannot reach background controls', async ({
  page,
}) => {
  await artworkReady(page);
  const open = page.getByRole('button', { name: t.enlarge, exact: true });
  await open.click();
  const dialog = page.getByRole('dialog');
  const controls = dialog.getByRole('group', { name: t.ways, exact: true });
  await expressionControl(controls, 'Light').click();
  await expect(dialog.locator('[data-artwork-stage="room"]')).toHaveAttribute(
    'data-expression',
    'light',
  );
  await expect(dialog.locator('img')).toHaveAttribute('alt', 'Signature 31 · Light');
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
  await noOverflow(page);
});

test('the viewing room remains accessible and translated in every gallery language', async ({
  page,
}) => {
  test.setTimeout(180_000);
  for (const locale of locales) {
    const messages = catalogs[locale];
    await page.goto(`${localizedPath(locale, '/art/31')}?view=still`);
    const open = page.getByRole('button', { name: messages.enlarge, exact: true });
    await expect(open).toBeVisible();
    await open.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveAccessibleName(`${messages.signature} 31 · ${messages.viewingRoom}`);
    await imageReady(dialog.locator('img'));
    await expect(
      dialog.getByRole('button', { name: messages.close, exact: true }),
    ).toBeInViewport();
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
