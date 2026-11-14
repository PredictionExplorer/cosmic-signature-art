import { expect, test as base, type BrowserContext, type ConsoleMessage } from '@playwright/test';

export { expect };
export type {
  APIRequestContext,
  APIResponse,
  Browser,
  Locator,
  Page,
  Response,
  TestInfo,
} from '@playwright/test';

/**
 * The suite's `test`. Every spec imports it from here, never from Playwright (eslint.config.mjs
 * holds them to it), because this one also listens while a test runs. A page that throws, says
 * an error on its console, or is answered a 5xx by the venue has met a fault, and a fault fails
 * the test that met it, whatever else that test was checking. An uncaught error is the cheapest
 * regression to catch and the commonest to miss.
 *
 * What counts, on any page in the test's own context:
 * - an uncaught error or an unhandled rejection;
 * - a console message of type `error`: the page's own (React reports through it), and the
 *   browser's line for a page or a file of the venue's that failed to load;
 * - a response of 500 or more from the venue.
 *
 * What does not, each for a reason given where it is decided below:
 * - warnings: a browser without a GPU fills them with its driver's remarks;
 * - a file that failed to load from another host;
 * - a request the browser itself gave up because the page was left;
 * - a 5xx that answered one of the router's prefetches.
 *
 * A test that provokes a fault on purpose says so, and only what it names is forgiven:
 *
 *     test('the venue’s 404 is its own page', async ({ page, faults }) => {
 *       faults.allow(failedToLoad('/uk/art/abc'));
 */
export type Faults = {
  /** This test provokes these on purpose: a fault whose line matches one of them is forgiven. */
  allow: (...expected: RegExp[]) => void;
  /** A context the test made for itself (another visitor, a first visit) is listened to as well. */
  watch: (context: BrowserContext) => void;
  /** Every fault met so far, forgiven or not: for the tests of this collector itself. */
  seen: () => readonly string[];
};

/**
 * For `faults.allow`: the browser's line for a page or a file of the venue's that did not load,
 * named by its path. A test that visits the 404, or cuts a file off to see what the page does
 * without it, expects exactly this line. Chromium and WebKit write it; Firefox writes none.
 */
export function failedToLoad(path: string | RegExp) {
  const where =
    typeof path === 'string' ? path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : path.source;
  return new RegExp(`^console error: Failed to load resource: .*: ${where}$`);
}

/**
 * For `faults.allow`, in a test whose finger is made of events (`new PointerEvent`) and is not a
 * pointer the browser holds. When the page takes hold of that finger (setPointerCapture), the
 * browser answers that it knows no such pointer, each engine in its own words. A real finger is
 * one it knows.
 */
export const syntheticFinger =
  /^page error: .*(?:setPointerCapture|The object can not be found here)/;

/**
 * WebKit's words for a request it gave up itself. When a page is left while its scripts or the
 * router's prefetches are still on their way, WebKit says of each "Fetch API cannot load
 * <address> due to access control checks.", or "Cannot load <address> …" for a script. No
 * access is checked for an address on the page's own origin, so there the words can only mean
 * a request cut short. Chromium calls the same thing an aborted request, and no error. For
 * another origin the words are a real refusal, and stay a fault.
 */
export function cutShort(words: string, pageUrl: string | undefined) {
  const address = /(?:https?:)?\/+(\S+) due to access control checks\.$/.exec(words)?.[1];
  if (!address || !pageUrl || !URL.canParse(pageUrl)) return false;
  return address.startsWith(`${new URL(pageUrl).host}/`);
}

/**
 * The other half of the same event. The promise behind a request cut short rejects, the
 * framework's loader does not catch it, and it arrives as an uncaught error with no address to
 * judge it by: "Load failed" in WebKit. It is let pass, because a load of the venue's own that
 * truly fails also writes the browser's "Failed to load resource" line, and a refusal elsewhere
 * its own console error, and both of those still count.
 *
 * Firefox words a fetch that failed "NetworkError when attempting to fetch resource." It is
 * listed on the same reasoning, but untried: this suite has met only WebKit's, on a machine
 * where Firefox does not launch. Chromium's ("Failed to fetch") is not listed. Chromium was
 * never seen to report a request it cut short, so there the words would be a fetch of the
 * page's own that failed and went uncaught.
 */
const CUT_SHORT_ECHOES = ['Load failed', 'NetworkError when attempting to fetch resource.'];

/** The browser's own line for a load that failed: it carries no arguments, and names the file. */
function failedLoad(message: ConsoleMessage) {
  return message.args().length === 0 && message.text().startsWith('Failed to load resource');
}

/** One test's faults: `listen` writes them down, and `faults.allow` forgives them by name. */
type FaultLog = { met: { fault: string; url?: string }[]; allowed: RegExp[]; guesses: Set<string> };

/** Writes down the faults of every page in a context. `venue` is the host the suite serves from. */
function listen(context: BrowserContext, log: FaultLog, venue: string) {
  /** Served by the venue on whichever port: the suite's server, or a spec's own. */
  const ours = (url: string) => URL.canParse(url) && new URL(url).hostname === venue;
  context.on('weberror', (webError) => {
    const { name, message } = webError.error();
    // Playwright splits WebKit's sentence at its first colon, which is the one in the address's
    // scheme: the name ends "cannot load http", and the message begins at the host.
    const refused = /cannot load https?$/i.test(name) && cutShort(message, webError.page()?.url());
    if (refused || CUT_SHORT_ECHOES.includes(message)) return;
    log.met.push({ fault: `page error: ${message}` });
  });
  context.on('console', (message) => {
    if (message.type() !== 'error') return;
    const { url } = message.location();
    if (cutShort(message.text(), message.page()?.url())) return;
    if (!failedLoad(message)) log.met.push({ fault: `console error: ${message.text()}` });
    // A file on another host is its host's to send. The published stills and films are on their
    // publisher's, whose weather is not the page's fault; a test that needs one waits for it.
    else if (ours(url))
      log.met.push({ fault: `console error: ${message.text()}: ${new URL(url).pathname}`, url });
  });
  context.on('response', (response) => {
    if (response.status() < 500 || !ours(response.url())) return;
    // A prefetch is the router's guess at where the visitor will go. If one fails, the
    // navigation asks again, and that answer is the one a visitor meets: it counts, this does
    // not. (Under `next start` on a loopback address every English address is fetched a second
    // time by the server from itself, and that hop now and then drops a connection.)
    if (response.request().headers()['next-router-prefetch']) log.guesses.add(response.url());
    else
      log.met.push({
        fault: `response: ${response.status()} from ${new URL(response.url()).pathname}`,
      });
  });
}

export const test = base.extend<{ faults: Faults; faultLog: FaultLog; venueHost: string }>({
  venueHost: async ({ baseURL }, use) => {
    await use(baseURL ? new URL(baseURL).hostname : '');
  },
  // Playwright reads a fixture's needs from its first parameter, which must be written as a
  // pattern even when it needs nothing.
  // eslint-disable-next-line no-empty-pattern
  faultLog: async ({}, use) => {
    const log: FaultLog = { met: [], allowed: [], guesses: new Set() };
    await use(log);
    // Read last, once every context has closed its pages: a fault met in closing counts.
    expect(
      log.met
        // The browser's line for a prefetch that failed goes with the prefetch.
        .filter(({ url }) => !url || !log.guesses.has(url))
        .map(({ fault }) => fault)
        .filter((fault) => !log.allowed.some((expected) => expected.test(fault))),
      'The page met faults this test did not expect (tests/e2e/fixtures.ts)',
    ).toEqual([]);
  },
  faults: async ({ faultLog, venueHost }, use) => {
    await use({
      allow: (...expected) => void faultLog.allowed.push(...expected),
      watch: (context) => listen(context, faultLog, venueHost),
      seen: () => faultLog.met.map(({ fault }) => fault),
    });
  },
  // Every page a test opens with `page` lives in this context, so the listening is done here.
  // A test that opens no page (one that only asks the server) builds no context, and pays nothing.
  context: async ({ context, faultLog, venueHost }, use) => {
    listen(context, faultLog, venueHost);
    await use(context);
  },
});
