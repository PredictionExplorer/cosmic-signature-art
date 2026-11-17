import { createHash } from 'node:crypto';
import { expect, policyReports, test, type TestInfo } from './fixtures';
import { REPORT_GROUP, contentSecurityPolicy } from '../../src/lib/security-headers';

/**
 * The venue's Content-Security-Policy, held where it acts: in the browser. The policy's text is
 * held by a unit test (src/lib/security-headers.test.ts). Whether any page breaks it is held by
 * the whole suite: a page that breaks either policy fails the test that met it
 * (tests/e2e/fixtures.ts). Here the headers are read as they are sent, and the policy is made
 * to refuse what it is there to refuse.
 *
 * Two policies travel (src/lib/security-headers.ts). The enforced one goes with every response.
 * A page rendered for each request carries a second, report-only, whose scripts run by nonce or
 * by hash: the browser reports to the page what it would have refused, and sends nothing.
 */
const PRERENDERED = [
  '/',
  '/process',
  '/statement',
  '/privacy',
  '/terms',
  '/exhibitions',
  '/auctions',
  '/verify/orbit',
  '/collection/all-the-light',
  '/collection/orrery',
  '/ja',
  '/uk/process',
];
const ON_REQUEST = [
  '/collection',
  '/collection?order=spectrum',
  '/art/31',
  '/art/50',
  '/zh-HK/art/31',
  '/verify/orbit/31',
  '/first-light/31',
  '/exhibitions/cycle-2',
  '/auctions/31',
];

/** An address answers alike in every engine, so one project asks. */
function oneProjectAsks(info: TestInfo) {
  test.skip(info.project.name !== 'chromium-desktop', 'A header is sent alike to every engine.');
}

const REPORT_ONLY = 'content-security-policy-report-only';

test('every response carries the policy, and shares its window with no other site', async ({
  request,
}, info) => {
  oneProjectAsks(info);
  for (const path of [
    ...PRERENDERED,
    ...ON_REQUEST,
    '/art/9999',
    '/api/art/31',
    '/art/31-ink.webp',
    '/robots.txt',
  ]) {
    const response = await request.get(path);
    const headers = response.headers();
    expect(headers['content-security-policy'], path).toBe(contentSecurityPolicy());
    expect(headers['cross-origin-opener-policy'], path).toBe('same-origin');
    expect(headers['x-frame-options'], path).toBe('DENY');
    expect(headers['x-content-type-options'], path).toBe('nosniff');
  }
});

/**
 * The scripts of a document as it was sent: each one's nonce, and its text. Read by the
 * browser's own parser with nothing run, and with data blocks (JSON-LD) left out: a policy
 * governs what executes.
 */
function scriptsAsSent(html: string) {
  const sent = new DOMParser().parseFromString(html, 'text/html');
  return [...sent.querySelectorAll('script')]
    .filter((script) => !script.type || /javascript|module/.test(script.type))
    .map((script) => ({
      nonce: script.getAttribute('nonce'),
      external: script.hasAttribute('src'),
      text: script.text,
    }));
}
/** A script's hash as a policy writes it. */
const hashOf = (text: string) =>
  `sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}`;

test('a page rendered on request names each of its scripts by nonce or by hash', async ({
  page,
  request,
}, info) => {
  oneProjectAsks(info);
  const nonces = new Set<string>();
  for (const path of ON_REQUEST) {
    const response = await request.get(path);
    const policy = response.headers()[REPORT_ONLY];
    expect(policy, path).toBeDefined();
    const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
    expect(nonce, path).toBeTruthy();
    nonces.add(nonce!);
    const hashes = [...policy.matchAll(/'(sha256-[^']+)'/g)].map((match) => match[1]);
    expect(policy, path).toContain("'strict-dynamic'");
    expect(policy, path).toContain(`report-to ${REPORT_GROUP}`);
    expect(response.headers()['reporting-endpoints'], path).toBeUndefined();
    const scripts = await page.evaluate(scriptsAsSent, await response.text());
    expect(scripts.length, path).toBeGreaterThan(5);
    // Every script that will run carries this response's nonce, or is one the policy names.
    const unnamed = scripts
      .filter(
        (script) =>
          script.nonce !== nonce && (script.external || !hashes.includes(hashOf(script.text))),
      )
      .map((script) => script.text.slice(0, 80));
    expect(unnamed, path).toEqual([]);
    // The venue's own three are among them: the hashes are not there for show.
    expect(
      scripts.filter((script) => !script.external && hashes.includes(hashOf(script.text))).length,
      path,
    ).toBe(hashes.length);
  }
  // A nonce is for one response.
  expect(nonces.size).toBe(ON_REQUEST.length);
});

test('a prerendered page is a file, and is sent the enforced policy alone', async ({
  request,
}, info) => {
  oneProjectAsks(info);
  for (const path of PRERENDERED) {
    const response = await request.get(path);
    // Written before any request: a nonce sent with it would name no script in it.
    // (On a loopback host Next fetches a rewritten address from itself, and says so twice.)
    expect(response.headers()['x-nextjs-prerender'], path).toMatch(/^1(, 1)?$/);
    expect(response.headers()[REPORT_ONLY], path).toBeUndefined();
  }
  for (const path of ON_REQUEST)
    expect((await request.get(path)).headers()['x-nextjs-prerender'], path).toBeUndefined();
});

test.describe('the policy refuses what it is there to refuse', () => {
  test('a script, a picture and a request from another host, and a string run as code', async ({
    page,
    faults,
  }) => {
    faults.allow(policyReports);
    await page.goto('/statement');
    const outcome = await page.evaluate(async () => {
      const loaded = (tag: 'script' | 'img') =>
        new Promise<boolean>((resolve) => {
          const element = document.createElement(tag);
          element.onload = () => resolve(true);
          element.onerror = () => resolve(false);
          element.src = `https://example.com/elsewhere.${tag === 'script' ? 'js' : 'png'}`;
          document.head.append(element);
        });
      // Asked in a later task: what the test evaluates directly is the browser's debugger
      // speaking, which the policy lets evaluate; a task of the page's own it does not.
      const evaluated = await new Promise<boolean>((resolve) =>
        setTimeout(() => {
          try {
            resolve(new Function('return 1')() === 1);
          } catch {
            resolve(false);
          }
        }),
      );
      const fetched = await fetch('https://example.com/').then(
        () => true,
        () => false,
      );
      return {
        script: await loaded('script'),
        image: await loaded('img'),
        evaluated,
        fetched,
      };
    });
    expect(outcome).toEqual({ script: false, image: false, evaluated: false, fetched: false });
    for (const directive of ['script-src-elem', 'img-src', 'connect-src'])
      await expect
        .poll(() => faults.seen())
        .toContainEqual(expect.stringMatching(new RegExp(`^policy: enforce ${directive} `)));
  });

  test('a frame around the venue', async ({ page, baseURL, browserName, faults }) => {
    // The browser's line for the frame it refused, in each engine's words.
    faults.allow(/frame|Content Security Policy|X-Frame-Options|Refused to/i);
    // Each engine says so on the console, and names the directive that refused it.
    const refused = page.waitForEvent('console', (message) =>
      /frame-ancestors/.test(message.text()),
    );
    await page.setContent(`<iframe src="${baseURL}/statement" width="600" height="400"></iframe>`);
    await refused;
    // Nothing of the venue is drawn inside another page. Chromium and WebKit give the refused
    // frame an empty document, which can be read. Firefox gives it none at all: a question put
    // inside that frame waits for a document for ever, so there the frame is asked only whether
    // it ever came to hold a page.
    if (browserName === 'firefox') {
      const [frame] = page.frames().filter((candidate) => candidate !== page.mainFrame());
      expect(frame?.url() ?? '').not.toMatch(/^https?:/);
    } else {
      await expect(page.frameLocator('iframe').locator('main')).toHaveCount(0);
    }
  });

  test('a handler written into a page rendered on request is reported, and nothing is sent', async ({
    page,
    faults,
  }) => {
    faults.allow(policyReports, /Failed to load resource/);
    // Anything the browser sends that is not a plain read: a report would be one.
    const sent: string[] = [];
    page.on('request', (request) => {
      if (request.method() !== 'GET') sent.push(`${request.method()} ${request.url()}`);
    });
    await page.goto('/art/31');
    await expect(page.locator('html')).toHaveAttribute('data-keys', 'ready');
    // The classic injection: markup with a handler in an attribute, set as HTML.
    await page.evaluate(() => {
      const injected = document.createElement('div');
      injected.innerHTML = '<img src="/no-such-picture" onerror="window.__injected = true">';
      document.body.append(injected);
    });
    // Today it runs: the enforced policy allows inline script. The second policy says so to the
    // page, and is the one that will refuse it once it is enforced.
    await expect.poll(() => page.evaluate(() => '__injected' in window)).toBe(true);
    // Chromium, WebKit and Firefox were each watched making this report to the page.
    await expect.poll(() => faults.seen()).toContain('policy: report script-src-attr inline');
    // The report stays in the browser: its group has no address (REPORT_GROUP).
    expect(sent).toEqual([]);
  });
});
