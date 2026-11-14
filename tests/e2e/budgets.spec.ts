import { readFileSync } from 'node:fs';
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type TestInfo,
} from '@playwright/test';

/**
 * The venue's paint and layout budgets (docs/first-light.md §9), measured on a production build
 * the way a visitor's browser measures them.
 *
 * - **Largest Contentful Paint (LCP)** is when the largest image, video or block of text in the
 *   first screen finished painting. On this venue it must be the work itself, so the spec checks
 *   what was painted as well as when (README, "The art is the Largest Contentful Paint").
 * - **Cumulative Layout Shift (CLS)** measures how far visible things jumped while nobody touched
 *   the page. The field counts the largest burst: shifts less than a second apart, over at most
 *   five seconds.
 *
 * Both are read from PerformanceObserver, the same entries the field data comes from. Each page
 * is loaded three times, each in a fresh browser context with an empty cache, and the median must
 * meet its budget in scripts/budgets.json. The budgets are the Core Web Vitals lines for "good"
 * (LCP 2.5 s, CLS 0.1). On a laptop the art paints in under a second, and CI is slower and draws
 * without a GPU, so the lines leave CI room (ARCHITECTURE.md, "Performance budgets").
 *
 * Chromium only, because layout-shift entries are Chromium's. Production only, because `next dev`
 * serves unminified, uncached bundles, and its timings mean nothing. CI runs this file on its own
 * (`npm run test:budgets:paint`), one page at a time, so no other test competes for the CPU.
 */

const { paint: BUDGET } = JSON.parse(
  readFileSync(new URL('../../scripts/budgets.json', import.meta.url), 'utf8'),
) as { paint: { largestContentfulPaintMs: number; cumulativeLayoutShift: number } };

/** Loads per page; the median is held to the budget, so one slow load cannot fail it alone. */
const LOADS = 3;
/** A page stands still once nothing larger has painted and nothing has shifted for this long. */
const QUIET_MS = 3_000;

/** Every script the route loads before it can hydrate. */
const ROUTE_SCRIPT = /\/_next\/static\/chunks\/.+\.js(\?|$)/;

type Visit = { title: string; path: string; firstVisit: boolean; scriptDelayMs?: number };
const VISITS: Visit[] = [
  // The gate holds the head back while First Light performs; the day's plate must still be the
  // first paint, and the measurement lasts until the performance has given the page back.
  { title: 'the home on a first visit, through First Light', path: '/', firstVisit: true },
  { title: 'the home for a returning visitor', path: '/', firstVisit: false },
  { title: 'a work page, № 031', path: '/art/31', firstVisit: false },
  // A slow connection in the one respect loopback hides: the route's script arrives late, the
  // document and its images as they do. A still that has loaded shows without it
  // (src/lib/settle.ts), so neither the still nor the largest paint may wait for the script; the
  // delay is longer than the budget, and a still held back until the plate hydrates fails it.
  // The plate is asked to rest on its still: a film can only begin once the script has run, and
  // on a phone its first frame, a few pixels larger than the preview, would be counted instead.
  {
    title: 'a work page, № 031, at rest, its script three seconds late',
    path: '/art/31?view=still',
    firstVisit: false,
    scriptDelayMs: 3_000,
  },
];

type Paint = { time: number; size: number; art: boolean; element: string };
type Shift = { time: number; value: number; sources: string[] };
type Seen = { paints: Paint[]; shifts: Shift[]; lastAt: number; stillAt?: number };
type Watched = { __vitals: Seen };
/** The layout-shift entry, which the DOM's TypeScript types do not carry yet. */
type LayoutShift = PerformanceEntry & {
  value: number;
  hadRecentInput: boolean;
  sources: { node: Node | null }[];
};

/**
 * Runs in the page before any of its own scripts, and records every LCP candidate and every
 * layout shift, each with a short description of the element. A candidate counts as the art
 * when it lies in an artwork's media: its inline preview, its still or its film.
 *
 * A candidate can leave the page before its entry is read. A plate rendered again after hydration
 * puts new elements in place of the same media, and the entry's element is then null. So every
 * image and film taken out of an artwork's media is remembered by its source, and a removed
 * candidate counts as the art when its URL is one of them. An inline image's entry carries only
 * the first 100 characters of its data: URL.
 */
function observeVitals() {
  const fileOf = (source: string) =>
    source.startsWith('data:') ? 'inline' : source.split('/').pop();
  const describe = (node: Node | null | undefined) => {
    if (!(node instanceof Element)) return node ? node.nodeName : 'a removed element';
    const classes = [...node.classList]
      .slice(0, 2)
      .map((name) => `.${name}`)
      .join('');
    const source = (node as HTMLImageElement).currentSrc || (node as HTMLImageElement).src || '';
    const file = fileOf(source);
    return `${node.localName}${classes}${file ? ` (${file})` : ''}`;
  };
  const artSources = new Set<string>();
  new MutationObserver((records) => {
    for (const record of records)
      for (const node of record.removedNodes) {
        if (!(node instanceof Element)) continue;
        const fromArt = record.target instanceof Element && !!record.target.closest('.art-media');
        const media = node.matches('img, video')
          ? [node]
          : [...node.querySelectorAll('img, video')];
        for (const item of media as (HTMLImageElement | HTMLVideoElement)[])
          if (fromArt || item.closest('.art-media'))
            for (const source of [item.currentSrc, item.src, (item as HTMLVideoElement).poster])
              if (source) artSources.add(source);
      }
  }).observe(document, { childList: true, subtree: true });
  const wasArt = (url: string) =>
    !!url &&
    [...artSources].some(
      (source) => source === url || (url.startsWith('data:') && source.startsWith(url)),
    );
  const seen: Seen = { paints: [], shifts: [], lastAt: 0 };
  Object.defineProperty(window, '__vitals', { value: seen });
  // When the first screen's still began to show over its preview: the class that fades it in.
  const shown = new MutationObserver(() => {
    if (!document.querySelector('[data-layer-state="current"] img.art-still.is-settled')) return;
    seen.stillAt = performance.now();
    shown.disconnect();
  });
  shown.observe(document, {
    attributes: true,
    attributeFilter: ['class'],
    childList: true,
    subtree: true,
  });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as LargestContentfulPaint[])
      seen.paints.push({
        time: entry.startTime,
        size: entry.size,
        art: entry.element ? !!entry.element.closest('.art-media') : wasArt(entry.url),
        element: entry.element
          ? describe(entry.element)
          : `a removed element${entry.url ? ` (${fileOf(entry.url)})` : ''}`,
      });
    seen.lastAt = performance.now();
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as LayoutShift[])
      // A shift just after a press or a key is the visitor's doing, and is not counted.
      if (!entry.hadRecentInput)
        seen.shifts.push({
          time: entry.startTime,
          value: entry.value,
          sources: entry.sources.map((source) => describe(source.node)),
        });
    seen.lastAt = performance.now();
  }).observe({ type: 'layout-shift', buffered: true });
}

/** True once the page has loaded, the home's gate has lifted, and the page has been quiet. */
function standsStill(quietMs: number) {
  const seen = (window as unknown as Watched).__vitals;
  const [navigation] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
  if (!navigation || navigation.loadEventEnd === 0) return false;
  if (document.documentElement.hasAttribute('data-overture')) return false;
  return performance.now() - Math.max(seen.lastAt, navigation.loadEventEnd) >= quietMs;
}

/**
 * CLS as the field counts it (web-vitals): shifts join a burst while each comes less than a
 * second after the last and the burst is under five seconds long; the score is the largest burst.
 */
function cumulativeLayoutShift(shifts: Pick<Shift, 'time' | 'value'>[]) {
  let largest = 0;
  let burst = 0;
  let first = 0;
  let last = 0;
  for (const { time, value } of shifts) {
    if (burst > 0 && time - last < 1_000 && time - first < 5_000) burst += value;
    else [burst, first] = [value, time];
    last = time;
    largest = Math.max(largest, burst);
  }
  return largest;
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1];

/**
 * Whether the server is a production build. Next serves a build's hashed chunks as immutable;
 * `next dev` serves its chunks to be revalidated on every load. The request also warms the
 * server, so the first measured load does not pay for a route's cold start.
 */
async function servesProduction(request: APIRequestContext, path: string) {
  const html = await (await request.get(path)).text();
  const chunk = html.match(/\/_next\/static\/chunks\/[\w.-]+\.js/)?.[0];
  if (!chunk) return false;
  return /\bimmutable\b/.test((await request.head(chunk)).headers()['cache-control'] ?? '');
}

/** One load in a fresh context: the project's own device, with a first visit's empty storage. */
async function measure(browser: Browser, info: TestInfo, visit: Visit) {
  const { baseURL, viewport, isMobile, hasTouch, reducedMotion, deviceScaleFactor, storageState } =
    info.project.use;
  const context = await browser.newContext({
    baseURL,
    viewport,
    isMobile,
    hasTouch,
    reducedMotion,
    deviceScaleFactor,
    storageState: visit.firstVisit ? undefined : storageState,
  });
  try {
    await context.addInitScript(observeVitals);
    const { scriptDelayMs } = visit;
    if (scriptDelayMs)
      await context.route(ROUTE_SCRIPT, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, scriptDelayMs));
        // A script still on its way when the measurement ends has no page left to answer.
        await route.continue().catch(() => {});
      });
    const page = await context.newPage();
    await page.goto(visit.path, { waitUntil: 'load' });
    await page.waitForFunction(standsStill, QUIET_MS, { polling: 250, timeout: 60_000 });
    const { paints, shifts, stillAt } = await page.evaluate(
      () => (window as unknown as Watched).__vitals,
    );
    return { lcp: paints.at(-1), cls: cumulativeLayoutShift(shifts), shifts, stillAt };
  } finally {
    await context.unrouteAll({ behavior: 'ignoreErrors' });
    await context.close();
  }
}

// A trace's screencast and a video both spend the CPU this file measures.
test.use({ trace: 'off', video: 'off' });

test.describe('paint and layout budgets', { tag: '@budget' }, () => {
  test('CLS is the largest burst of shifts, counted as the field counts it', () => {
    expect(cumulativeLayoutShift([])).toBe(0);
    // Shifts under a second apart join one burst; a gap of a second starts the next.
    const bursts = [
      { time: 100, value: 0.02 },
      { time: 900, value: 0.03 },
      { time: 1_900, value: 0.04 },
    ];
    expect(cumulativeLayoutShift(bursts)).toBeCloseTo(0.05);
    // A burst closes at five seconds, however close its shifts come.
    const steady = [0, 900, 1_800, 2_700, 3_600, 4_500, 5_400].map((time) => ({
      time,
      value: 0.01,
    }));
    expect(cumulativeLayoutShift(steady)).toBeCloseTo(0.06);
  });

  for (const visit of VISITS)
    test(`${visit.title}: the art is the LCP, within budget, and nothing jumps`, async ({
      browser,
      browserName,
      request,
    }, info) => {
      test.skip(browserName !== 'chromium', 'Layout-shift entries are Chromium’s.');
      // Three loads; a first visit's lasts through the performance, about fifteen seconds.
      test.setTimeout(visit.firstVisit ? 240_000 : 120_000);
      const production = await servesProduction(request, visit.path);
      test.skip(
        !production && !process.env.CI,
        'Budgets are measured on a production build: `npm run build`, then `npm run start`.',
      );
      expect(production, 'CI measures a production server (`npm run start`).').toBe(true);

      const loads = [];
      for (let load = 0; load < LOADS; load += 1) loads.push(await measure(browser, info, visit));
      const lcp = median(loads.map((load) => load.lcp?.time ?? Infinity));
      const cls = median(loads.map((load) => load.cls));
      const summary =
        `${info.project.name}, ${visit.title}: LCP ${loads.map((l) => Math.round(l.lcp?.time ?? -1)).join(' / ')} ms ` +
        `(median ${Math.round(lcp)}, budget ${BUDGET.largestContentfulPaintMs}), ${[...new Set(loads.map((l) => l.lcp?.element))].join(' or ')}; ` +
        `the still shown from ${loads.map((l) => Math.round(l.stillAt ?? -1)).join(' / ')} ms; ` +
        `CLS ${loads.map((l) => l.cls.toFixed(4)).join(' / ')} (budget ${BUDGET.cumulativeLayoutShift})`;
      info.annotations.push({ type: 'budget', description: summary });
      console.log(summary);

      for (const { lcp: paint, shifts } of loads) {
        expect(paint, 'The page painted no LCP candidate.').toBeDefined();
        expect(
          paint!.art,
          `The LCP was ${paint!.element}, not the art. The first screen's largest paint must be ` +
            'the work: its inline preview, its still or its film.',
        ).toBe(true);
        if (shifts.length)
          info.annotations.push({
            type: 'layout shifts',
            description: shifts
              .map(
                (shift) =>
                  `${Math.round(shift.time)} ms ${shift.value.toFixed(4)} ${shift.sources.join(', ')}`,
              )
              .join('; '),
          });
      }
      expect(lcp, summary).toBeLessThanOrEqual(BUDGET.largestContentfulPaintMs);
      // On a phone the still is no larger than its preview and is never the LCP; it is held to
      // the same line there by the moment it began to show.
      if (visit.scriptDelayMs)
        expect(
          median(loads.map((load) => load.stillAt ?? Infinity)),
          `The still showed without waiting for the route's script. ${summary}`,
        ).toBeLessThanOrEqual(BUDGET.largestContentfulPaintMs);
      expect(cls, summary).toBeLessThanOrEqual(BUDGET.cumulativeLayoutShift);
    });
});
