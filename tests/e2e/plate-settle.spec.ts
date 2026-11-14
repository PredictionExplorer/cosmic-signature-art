import { expect, test, type Page, type Route } from './fixtures';

/*
  The still shows when it has loaded, not when script has run (src/lib/settle.ts).

  The server sends each plate's full still clear over its inline preview, and the class that
  fades it in used to come only from React, once the plate had hydrated: after the route's
  script had downloaded, compiled and run. On a slow connection the visitor looked at the
  640 px preview, enlarged, for seconds; had a script failed, for good. Here every script the
  route loads is held back unanswered, which is that connection at its worst, and the still must
  be shown all the same. Then the scripts arrive, and the plate must hydrate around the still as
  it found it: its class never taken away and, frame by frame, the still never dimmed. A phone's
  plate changes its film once it knows its screen, which mounts its media again; the still that
  takes the first one's place must be shown in the same frame, not faded in a second time.
*/

/** Every script the route loads before it can hydrate. */
const ROUTE_SCRIPT = /\/_next\/static\/chunks\/.+\.js(\?|$)/;
const stage = '[data-artwork-stage="page"]:visible';
const current = `${stage} [data-layer-state="current"]`;
const twin = `${stage} [data-layer-state="twin"]`;

type Watched = { __unsettled: string[]; __dimmed: number[] };
/** The fade over the preview, and a little more: long enough to see a second one begin. */
const WATCH_MS = 700;

/** Holds the route's scripts back, unanswered, until they are let through. */
async function holdScripts(page: Page) {
  const held: Route[] = [];
  let through = false;
  await page.route(ROUTE_SCRIPT, (route) => {
    if (through) return route.continue();
    held.push(route);
  });
  return {
    held: () => held.length,
    release: async () => {
      through = true;
      await Promise.all(held.splice(0).map((route) => route.continue()));
    },
  };
}

/**
 * Runs in the page before its own scripts. It names every still that loses `is-settled`, and
 * notes every frame on which the plate's still, once at full strength, is anything less.
 */
function watchTheStill() {
  const unsettled: string[] = [];
  const dimmed: number[] = [];
  Object.defineProperties(window, {
    __unsettled: { value: unsettled },
    __dimmed: { value: dimmed },
  });
  let shown = false;
  const frame = () => {
    const still = [
      ...document.querySelectorAll<HTMLImageElement>(
        '[data-artwork-stage="page"] [data-layer-state="current"] img.art-still',
      ),
    ].find((image) => image.getClientRects().length);
    if (still) {
      if (getComputedStyle(still).opacity === '1') shown = true;
      else if (shown) dimmed.push(Math.round(performance.now()));
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  new MutationObserver((records) => {
    for (const { target, oldValue } of records)
      if (
        target instanceof HTMLImageElement &&
        target.classList.contains('art-still') &&
        /\bis-settled\b/.test(oldValue ?? '') &&
        !target.classList.contains('is-settled')
      )
        unsettled.push(target.alt);
  }).observe(document, {
    attributes: true,
    attributeFilter: ['class'],
    attributeOldValue: true,
    subtree: true,
  });
}

for (const [name, path] of [
  ['a work page', '/art/31'],
  ['the home', '/'],
] as const)
  test(`${name}: a still that has loaded is shown while every script is still on its way`, async ({
    page,
  }) => {
    await page.addInitScript(watchTheStill);
    const scripts = await holdScripts(page);
    // Neither `load` nor DOMContentLoaded is promised while the scripts are held.
    await page.goto(path, { waitUntil: 'commit' });
    const html = page.locator('html');
    const plate = page.locator(`${current} .art-media`);
    const still = page.locator(`${current} img.art-still`);

    // The sharp still, at full strength over its preview, with no script of the route's run.
    await expect(still).toHaveCSS('opacity', '1');
    await expect(still).toHaveClass('art-still is-settled');
    expect(
      await still.evaluate((element) => {
        const image = element as HTMLImageElement;
        return image.complete && image.naturalWidth > 0 && new URL(image.currentSrc).pathname;
      }),
      'The still is a rung of the published still, never the preview.',
    ).toMatch(/^\/art\/(stills\/)?\d+-ink[-.]/);
    expect(scripts.held()).toBeGreaterThan(0);
    await expect(html).not.toHaveAttribute('data-keys', 'ready');
    // Nothing else of the arrival has moved: the plate has not hydrated, so it reads as
    // arriving and mounts no film, and the twin lies behind the seam, clipped whole.
    await expect(plate).toHaveAttribute('data-arrival', 'arriving');
    await expect(page.locator(`${stage} video`)).toHaveCount(0);
    expect(
      await page.locator(twin).evaluate((layer) => {
        const inset = /^inset\((.*)\)$/.exec(getComputedStyle(layer).clipPath)?.[1];
        return inset?.trim().split(/\s+/).at(-1);
      }),
    ).toBe('100%');

    // The scripts arrive. The plate hydrates around the still as it found it, and settles itself.
    await scripts.release();
    await expect(html).toHaveAttribute('data-keys', 'ready');
    await expect(plate).toHaveAttribute('data-arrival', 'settled');
    await expect(still).toHaveClass('art-still is-settled');
    await expect(still).toHaveCSS('opacity', '1');
    // Long enough for a still mounted again to have begun fading in, had it been left to.
    await page.waitForTimeout(WATCH_MS);
    const { unsettled, dimmed } = await page.evaluate(() => {
      const watched = window as unknown as Watched;
      return { unsettled: watched.__unsettled, dimmed: watched.__dimmed };
    });
    expect(unsettled, 'No still lost its class, at hydration or after.').toEqual([]);
    expect(
      dimmed,
      'Once shown, the still stayed at full strength on every frame through hydration (ms).',
    ).toEqual([]);
  });
