import { cutShort, expect, failedToLoad, test } from './fixtures';

/**
 * The suite's own `test` (fixtures.ts) fails a test whose page met a fault. These prove it: each
 * of the first four provokes one fault and is marked `test.fail()`, so it passes only because
 * the fault failed it. With Playwright's plain `test` every one of them would pass its body and
 * be reported as a failure that did not happen.
 */
const QUIET_PAGE = '/statement';

test.describe('a fault the test did not expect fails it', () => {
  test('an error nothing caught', async ({ page, faults }) => {
    test.fail();
    await page.goto(QUIET_PAGE);
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error('thrown on purpose');
      });
    });
    await expect.poll(() => faults.seen()).toEqual(['page error: thrown on purpose']);
  });

  test('a rejection nothing handled', async ({ page, faults }) => {
    test.fail();
    await page.goto(QUIET_PAGE);
    await page.evaluate(() => {
      void Promise.reject(new Error('rejected on purpose'));
    });
    // Engines word the message differently: WebKit names the error's type before it.
    await expect
      .poll(() => faults.seen())
      .toEqual([expect.stringMatching(/^page error: (Error: )?rejected on purpose$/)]);
  });

  test('an error said on the console', async ({ page, faults }) => {
    test.fail();
    await page.goto(QUIET_PAGE);
    await page.evaluate(() => console.error('said on purpose', 7));
    await expect.poll(() => faults.seen()).toEqual(['console error: said on purpose 7']);
  });

  test('a 5xx from the venue', async ({ page, faults }) => {
    test.fail();
    await page.route('**/api/art/31', (route) => route.fulfill({ status: 503, body: 'down' }));
    await page.goto(QUIET_PAGE);
    expect(await page.evaluate(() => fetch('/api/art/31').then((answer) => answer.status))).toBe(
      503,
    );
    await expect.poll(() => faults.seen()).toContain('response: 503 from /api/art/31');
  });
});

test.describe('what is no fault of the test', () => {
  test('a quiet page, and a page that only warns', async ({ page, faults }) => {
    await page.goto(QUIET_PAGE);
    await expect(page.locator('html')).toHaveAttribute('data-keys', 'ready');
    await page.evaluate(() => console.warn('a warning is not an error'));
    expect(faults.seen()).toEqual([]);
  });

  test('a fault the test names as its own, and only that one', async ({ page, faults }) => {
    faults.allow(/^page error: thrown on purpose$/, failedToLoad('/art/no-such-still.webp'));
    await page.goto(QUIET_PAGE);
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error('thrown on purpose');
      });
    });
    // A file of the venue's that is not there. Chromium and WebKit say so on the console.
    const answered = page.waitForResponse('**/art/no-such-still.webp');
    await page.evaluate(() => {
      new Image().src = '/art/no-such-still.webp';
    });
    expect((await answered).status()).toBe(404);
    await expect.poll(() => faults.seen()).toContain('page error: thrown on purpose');
  });

  test('a file another host failed to send', async ({ page, faults }) => {
    // The publisher's host, which the venue does not run: its failures are not the page's.
    const elsewhere = 'https://a1.cosmicsignature.com/images/no-such-still.webp';
    await page.route(elsewhere, (route) => route.fulfill({ status: 404 }));
    await page.goto(QUIET_PAGE);
    const answered = page.waitForResponse(elsewhere);
    await page.evaluate((url) => {
      new Image().src = url;
    }, elsewhere);
    expect((await answered).status()).toBe(404);
    await page.evaluate(() => new Promise((seen) => requestAnimationFrame(seen)));
    expect(faults.seen()).toEqual([]);
  });

  test('a test that opens no page builds no context to listen in', async ({ request }) => {
    expect((await request.get('/robots.txt')).status()).toBe(200);
  });
});

test.describe('what a browser says of its own doing', () => {
  const left = 'http://127.0.0.1:4318/ja/process';

  test('WebKit’s words for a request it cut short are told from a real refusal', () => {
    // As Playwright hands them on: an uncaught error's message begins at the host, and a console
    // line is the whole sentence.
    for (const words of [
      '/127.0.0.1:4318/ja?_rsc=1ld0r due to access control checks.',
      'Cannot load http://127.0.0.1:4318/_next/static/chunks/0abc.js due to access control checks.',
      'Fetch API cannot load http://127.0.0.1:4318/art/31?_rsc=1ld0r due to access control checks.',
    ])
      expect(cutShort(words, left), words).toBe(true);
    // Another origin checks access, so there the same words are a refusal: another host, or
    // this host on another port.
    for (const words of [
      '/example.com/ due to access control checks.',
      'Fetch API cannot load http://127.0.0.1:1/rpc due to access control checks.',
      'The page said nothing of access control checks.',
    ])
      expect(cutShort(words, left), words).toBe(false);
    expect(cutShort('/127.0.0.1:4318/ja due to access control checks.', undefined)).toBe(false);
    expect(cutShort('/127.0.0.1:4318/ja due to access control checks.', 'about:blank')).toBe(false);
  });

  test('a load that failed is named by its path, and by no other', () => {
    const line = (path: string) =>
      `console error: Failed to load resource: the server responded with a status of 404 (Not Found): ${path}`;
    expect(failedToLoad('/uk/art/abc').test(line('/uk/art/abc'))).toBe(true);
    expect(failedToLoad('/uk/art/abc').test(line('/uk/art/abcd'))).toBe(false);
    expect(failedToLoad('/art/31.5').test(line('/art/3105'))).toBe(false);
    expect(
      failedToLoad(/\/art\/stills\/31-light-\d+-[a-f0-9]{16}\.webp/).test(
        'console error: Failed to load resource: net::ERR_FAILED: /art/stills/31-light-1280-18dcfff2778f195a.webp',
      ),
    ).toBe(true);
    expect(failedToLoad('/uk/art/abc').test('page error: /uk/art/abc')).toBe(false);
  });

  test('a 5xx that answered a prefetch is the router’s guess gone wrong, not the page’s fault', async ({
    page,
    faults,
  }) => {
    // The same answer to a request the page itself makes is a fault: 'a 5xx from the venue', above.
    await page.route('**/api/art/31', (route) => route.fulfill({ status: 503, body: 'down' }));
    await page.goto(QUIET_PAGE);
    const answered = page.waitForResponse('**/api/art/31');
    await page.evaluate(() =>
      fetch('/api/art/31', { headers: { 'Next-Router-Prefetch': '1' } }).then(() => {}),
    );
    expect((await answered).status()).toBe(503);
    await page.evaluate(() => new Promise((seen) => requestAnimationFrame(seen)));
    // No response is written down, and the browser's own line for it is set aside with it when
    // the test ends; were either counted, this test would fail there.
    expect(faults.seen().filter((fault) => fault.startsWith('response:'))).toEqual([]);
  });
});
