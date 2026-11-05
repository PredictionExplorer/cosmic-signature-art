// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, type NextResponse } from 'next/server';
import {
  getRedirectUrl,
  getRewrittenUrl,
  isRewrite,
  unstable_doesMiddlewareMatch,
} from 'next/experimental/testing/server';
import { ART_API_ORIGIN } from './lib/art/constants';
import { ADDRESS_HEADER } from './lib/addresses';
import { config, proxy } from './proxy';

const ORIGIN = 'https://cosmic.art';
const indexer = vi.fn<typeof fetch>();
beforeEach(() => {
  indexer.mockReset();
  vi.stubGlobal('fetch', indexer);
});
afterEach(() => vi.unstubAllGlobals());

const visit = (path: string, headers?: HeadersInit) =>
  proxy(new NextRequest(new URL(path, ORIGIN), { headers }));
/** The visitor's address as the proxy hands it on to whatever answers. */
const address = (response: NextResponse) =>
  response.headers.get(`x-middleware-request-${ADDRESS_HEADER}`);
const passes = (response: NextResponse) =>
  response.headers.get('x-middleware-next') === '1' && !isRewrite(response);
const record = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('the proxy', () => {
  it.each([
    ['/uk/art/abc', '/uk/_venue/not-here'],
    ['/art/abc', '/en/_venue/not-here'],
    ['/en/art/-1', '/en/_venue/not-here'],
    ['/ja/exhibitions/nothing', '/ja/_venue/not-here'],
    ['/exhibitions/cycle-9', '/en/_venue/not-here'],
    ['/zh-TW/verify/orbit/031', '/zh-TW/_venue/not-here'],
    ['/verify/orbit/999', '/en/_venue/not-here'],
    ['/vi/verify/orbit/abc', '/vi/_venue/not-here'],
  ])('sends %s to the address no route answers, in its locale, unasked', async (path, to) => {
    const response = await visit(path);
    expect(getRewrittenUrl(response)).toBe(`${ORIGIN}${to}`);
    expect(address(response)).toBe(path);
    expect(indexer).not.toHaveBeenCalled();
  });

  it('asks the indexer about a work beyond the index, and refuses it on its word', async () => {
    indexer.mockResolvedValue(record(400, { error: 'record not found', status: 0 }));
    const response = await visit('/ko/art/9999');
    expect(getRewrittenUrl(response)).toBe(`${ORIGIN}/ko/_venue/not-here`);
    expect(address(response)).toBe('/ko/art/9999');
    expect(indexer).toHaveBeenCalledOnce();
    expect(indexer.mock.calls[0][0]).toBe(`${ART_API_ORIGIN}/api/cosmicgame/cst/info/9999`);
  });

  it('lets a work beyond the index through when the indexer holds its record', async () => {
    indexer.mockResolvedValue(record(200, { status: 1, TokenInfo: { TokenId: 72 } }));
    expect(getRewrittenUrl(await visit('/art/72'))).toBe(`${ORIGIN}/en/art/72`);
    expect(passes(await visit('/zh/art/72'))).toBe(true);
  });

  it('leaves a work beyond the index to its page while the indexer is down', async () => {
    indexer.mockRejectedValue(new TypeError('fetch failed'));
    expect(passes(await visit('/uk/art/72'))).toBe(true);
    indexer.mockResolvedValue(record(503, { error: 'unavailable' }));
    expect(getRewrittenUrl(await visit('/art/72'))).toBe(`${ORIGIN}/en/art/72`);
  });

  it.each([
    ['/art/31', '/en/art/31'],
    ['/uk/art/0', null],
    ['/exhibitions/a-hang', '/en/exhibitions/a-hang'],
    ['/ja/exhibitions/cycle-2', null],
    ['/verify/orbit/71', '/en/verify/orbit/71'],
    ['/zh-HK/verify/orbit/0', null],
  ])('lets what exists through without asking: %s', async (path, rewritten) => {
    const response = await visit(path);
    if (rewritten) expect(getRewrittenUrl(response)).toBe(`${ORIGIN}${rewritten}`);
    else expect(passes(response)).toBe(true);
    expect(address(response)).toBe(path);
    expect(indexer).not.toHaveBeenCalled();
  });

  it.each([
    ['/art/031', '/art/31'],
    ['/uk/art/031?expression=ink', '/uk/art/31?expression=ink'],
    ['/en/art/00', '/en/art/0'],
  ])('sends %s to the one spelling of its number, for good', async (path, to) => {
    const response = await visit(path);
    expect(response.status).toBe(308);
    expect(getRedirectUrl(response)).toBe(`${ORIGIN}${to}`);
    expect(indexer).not.toHaveBeenCalled();
  });

  it('keeps an address without a locale the first locale’s, as it always was', async () => {
    expect(getRewrittenUrl(await visit('/'))).toBe(`${ORIGIN}/en`);
    expect(getRewrittenUrl(await visit('/collection?order=spectrum'))).toBe(
      `${ORIGIN}/en/collection?order=spectrum`,
    );
    const unmatched = await visit('/zzz');
    expect(getRewrittenUrl(unmatched)).toBe(`${ORIGIN}/en/zzz`);
    expect(address(unmatched)).toBe('/zzz');
  });

  it('names the address the visitor asked for, never one a visitor sent', async () => {
    const response = await visit('/uk/zzz', { [ADDRESS_HEADER]: '/ja/art/31' });
    expect(passes(response)).toBe(true);
    expect(address(response)).toBe('/uk/zzz');
  });

  it('keeps the visitor’s address when Next routes the 404 through again', async () => {
    // Next routes a 404 a second time from the address it was rewritten to, with the request
    // headers the first pass set.
    const again = await visit('/uk/_venue/not-here', { [ADDRESS_HEADER]: '/uk/art/9999' });
    expect(passes(again)).toBe(true);
    expect(address(again)).toBe('/uk/art/9999');
    // Asked for directly, the address no route answers is only itself.
    expect(address(await visit('/ja/_venue/not-here'))).toBe('/ja/_venue/not-here');
  });

  it.each([
    ['/art/31', true],
    ['/uk/art/abc', true],
    ['/exhibitions/nothing', true],
    ['/', true],
    ['/api/art/31', false],
    ['/_next/static/chunks/main.js', false],
    ['/art/31-ink.webp', false],
    ['/fonts/cjk/noto.woff2', false],
    ['/favicon.ico', false],
    ['/robots.txt', false],
    ['/sitemap.xml', false],
  ])('runs for %s: %s', (url, runs) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(runs);
  });
});
