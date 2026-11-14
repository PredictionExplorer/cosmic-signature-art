import { expect, test } from './fixtures';

/**
 * A large Suspense boundary streams behind its fallback: React sends the content in a hidden
 * segment and reveals it on the next animation frame, which can come after the page has
 * hydrated (WebKit withholds frames during a navigation). If a context or prop above a boundary
 * still waiting for its reveal changes meanwhile, React gives up hydrating it, discards the
 * server's HTML and renders the content again on the client. Holding every reveal until the
 * shell has hydrated and settled forces that order in every browser; each page must still keep
 * the nodes it streamed and hydrate them in place.
 */
const SETTLE_MS = 1000;

/**
 * Runs in the page before any of its scripts. The streaming runtime is inline: $RC marks a
 * boundary's content as arrived and $RV reveals a batch of them, so both are hooked as setters
 * on window. The shell has hydrated once the keyboard vocabulary marks the document ready.
 */
function holdRevealsUntilHydrated(settleMs: number) {
  const streamed: Element[] = [];
  let hydratedAt: number | undefined;
  // The root element may not exist yet, so the document itself is watched.
  const ready = new MutationObserver(() => {
    if (document.documentElement.dataset.keys !== 'ready') return;
    hydratedAt = performance.now();
    ready.disconnect();
  });
  ready.observe(document, { attributes: true, attributeFilter: ['data-keys'], subtree: true });
  let complete: ((boundary: string, segment: string) => void) | undefined;
  let reveal: ((batch: unknown[]) => void) | undefined;
  Object.defineProperties(window, {
    __streamed: { value: streamed },
    $RC: {
      configurable: true,
      set: (value: typeof complete) => (complete = value),
      get: () =>
        complete &&
        ((boundary: string, segment: string) => {
          streamed.push(...(document.getElementById(segment)?.children ?? []));
          complete!(boundary, segment);
        }),
    },
    $RV: {
      configurable: true,
      set: (value: typeof reveal) => (reveal = value),
      get: () =>
        reveal &&
        ((batch: unknown[]) => {
          const release = () => {
            if (hydratedAt !== undefined && performance.now() - hydratedAt >= settleMs)
              reveal!(batch);
            else setTimeout(release, 20);
          };
          release();
        }),
    },
  });
}

/** Streamed nodes React has not adopted: still waiting, or discarded for a client render. */
function unhydratedStreamedNodes() {
  // React keeps its fiber on every DOM node it owns, hydrated or created.
  const owned = (node: Element) => Object.keys(node).some((key) => key.startsWith('__reactFiber$'));
  const streamed = (window as unknown as { __streamed: Element[] }).__streamed;
  return {
    streamed: streamed.length,
    unhydrated: streamed
      .filter((node) => !owned(node))
      .map(
        (node) =>
          `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}.${node.classList[0] ?? ''}` +
          (node.isConnected ? ' (not hydrated yet)' : ' (discarded)'),
      ),
  };
}

test.describe('streamed pages hydrate in place', () => {
  for (const [name, route] of [
    ['the home', '/en'],
    ['a work page', '/art/31'],
    ['the process essay', '/uk/process'],
  ] as const) {
    test(`${name} keeps the HTML it streamed when its reveal waits for hydration`, async ({
      page,
    }) => {
      await page.addInitScript(holdRevealsUntilHydrated, SETTLE_MS);
      await page.goto(route);
      await expect(page.locator('html')).toHaveAttribute('data-keys', 'ready');
      await expect
        .poll(() => page.evaluate(unhydratedStreamedNodes), { timeout: 20_000 })
        .toEqual({ streamed: expect.any(Number), unhydrated: [] });
      // Without a streamed boundary the page proves nothing; choose one that streams.
      expect((await page.evaluate(unhydratedStreamedNodes)).streamed).toBeGreaterThan(0);
      await expect(page.locator('main')).toHaveCount(1);
    });
  }
});
