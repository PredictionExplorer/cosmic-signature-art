import { afterEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { collectionIndex } from '@/lib/art/collection-index';
import { orbitIds } from '@/lib/art/orbit-records';
import { ART_API_ORIGIN } from '@/lib/art/constants';
import { parseArtworkId } from '@/lib/art/validation';
import { exhibitions } from '@/lib/exhibitions/exhibitions';
import { locales } from '@/lib/i18n/routing';
import {
  ASK_TIMEOUT_MS,
  EXHIBITIONS,
  INDEXED_WORKS,
  NOT_HERE,
  ORBIT_RECORDS,
  askedWork,
  asksForWork,
  nearestWork,
  notHere,
  readAddress,
  unrecorded,
  visitorAddress,
} from './addresses';

const ascending = (ids: Iterable<number>) => [...ids].sort((a, b) => a - b);

describe('what the proxy holds', () => {
  // A list that falls behind its registry refuses what exists or lets an absence through:
  // rebuild the registry, then bring the list in step (src/lib/addresses.ts).
  it('holds every work in the collection index, and no other', () => {
    expect(ascending(INDEXED_WORKS)).toEqual(ascending(collectionIndex.works.map(({ id }) => id)));
  });

  it('holds every orbit record, and no other', () => {
    expect(ascending(ORBIT_RECORDS)).toEqual(orbitIds());
  });

  it('holds every exhibition, the cycles included, and no other', () => {
    expect([...EXHIBITIONS].sort()).toEqual(
      exhibitions()
        .map(({ slug }) => slug)
        .sort(),
    );
  });
});

describe('reading an address', () => {
  it.each(['/art/31', '/art/0', '/art/71'])('lets a work in the index through: %s', (path) => {
    expect(readAddress(path)).toEqual({ kind: 'here' });
  });

  it.each([
    ['/art/72', 72],
    ['/art/9999', 9999],
    ['/art/9007199254740991', Number.MAX_SAFE_INTEGER],
  ])('asks the indexer about a work beyond the index: %s', (path, work) => {
    expect(readAddress(path)).toEqual({ kind: 'ask', work });
  });

  it.each([
    '/art/abc',
    '/art/-1',
    '/art/+31',
    '/art/1.5',
    '/art/1e3',
    '/art/0x1f',
    '/art/%33%31',
    '/art/31abc',
    '/art/12345678901234567',
    '/art/9007199254740992',
  ])('refuses what cannot be a work’s number, without asking: %s', (path) => {
    expect(readAddress(path)).toEqual({ kind: 'not-here' });
  });

  it.each([
    ['/art/031', '/art/31'],
    ['/art/0031', '/art/31'],
    ['/art/00', '/art/0'],
    ['/art/072', '/art/72'],
  ])('sends a work’s number in another spelling to its one spelling: %s', (path, to) => {
    expect(readAddress(path)).toEqual({ kind: 'respell', path: to });
  });

  it('refuses exactly what the work’s page refuses, and names what it reads', () => {
    const segment = fc.oneof(
      fc.stringMatching(/^\d{1,20}$/),
      fc.string({ minLength: 1 }).filter((value) => !value.includes('/')),
    );
    const expected = (value: string) => {
      const id = parseArtworkId(value);
      if (id === null) return { kind: 'not-here' };
      if (value !== String(id)) return { kind: 'respell', path: `/art/${id}` };
      return INDEXED_WORKS.has(id) ? { kind: 'here' } : { kind: 'ask', work: id };
    };
    fc.assert(
      fc.property(segment, (value) => {
        expect(readAddress(`/art/${value}`)).toEqual(expected(value));
      }),
    );
  });

  it.each(['/exhibitions/a-hang', '/exhibitions/the-long-curve', '/exhibitions/cycle-0'])(
    'lets an exhibition through: %s',
    (path) => expect(readAddress(path)).toEqual({ kind: 'here' }),
  );

  it.each([
    '/exhibitions/nothing',
    '/exhibitions/nowhere',
    '/exhibitions/A-HANG',
    '/exhibitions/cycle-3',
    '/exhibitions/cycle-01',
  ])('refuses an exhibition that was never hung: %s', (path) => {
    expect(readAddress(path)).toEqual({ kind: 'not-here' });
  });

  it.each(['/verify/orbit/31', '/verify/orbit/0', '/verify/orbit/71'])(
    'lets a number with an orbit record through: %s',
    (path) => expect(readAddress(path)).toEqual({ kind: 'here' }),
  );

  it.each([
    '/verify/orbit/72',
    '/verify/orbit/999',
    '/verify/orbit/031',
    '/verify/orbit/00',
    '/verify/orbit/abc',
    '/verify/orbit/-1',
    '/verify/orbit/3.1',
    `/verify/orbit/1${'0'.repeat(400)}`,
  ])('refuses a number without a record, or in another spelling: %s', (path) => {
    expect(readAddress(path)).toEqual({ kind: 'not-here' });
  });

  it.each([
    '/',
    '/collection',
    '/exhibitions',
    '/verify/orbit',
    '/art',
    '/art/31/opengraph-image',
    '/art/abc/opengraph-image',
    '/exhibitions/nothing/twitter-image',
    '/zzz',
    '/art/abc/',
    '/exhibitions/nothing/',
    NOT_HERE,
  ])('leaves every other address to its route: %s', (path) => {
    expect(readAddress(path)).toEqual({ kind: 'here' });
  });
});

describe('the address no route answers', () => {
  it('keeps the visitor’s locale in the address itself, which the proxy then leaves alone', () => {
    expect(locales.map(notHere)).toEqual(locales.map((locale) => `/${locale}${NOT_HERE}`));
    // Next routes the 404 through the proxy again, from this address.
    for (const locale of locales)
      expect(readAddress(notHere(locale).slice(locale.length + 1))).toEqual({ kind: 'here' });
  });

  it.each([
    ['/uk/art/9999', 'uk', '/uk/art/9999'],
    ['/zh-TW/exhibitions/nothing', 'zh-TW', '/zh-TW/exhibitions/nothing'],
    ['/art/abc', 'en', '/art/abc'],
    ['/', 'en', '/'],
  ])('reads the language of the visitor’s address %s', (header, locale, address) => {
    expect(visitorAddress(header)).toEqual({ locale, address });
  });

  it.each([null, '', 'uk/art/9999', '//evil.example/uk', '/\\evil.example', 'javascript:alert(1)'])(
    'trusts no address that is not a path on this site: %s',
    (header) => expect(visitorAddress(header)).toEqual({ locale: 'en', address: undefined }),
  );
});

describe('the work an address asked for', () => {
  it.each([
    ['/art/999', 999],
    ['/uk/art/999', 999],
    ['/zh-HK/art/72', 72],
    ['/verify/orbit/999', 999],
    ['/ja/verify/orbit/0', 0],
  ])('reads the number in %s', (address, work) => {
    expect(askedWork(address)).toBe(work);
    expect(asksForWork(address)).toBe(true);
  });

  it('asks for no number where none is named, though a work may be', () => {
    for (const address of ['/art/abc', '/uk/art/-1', '/verify/orbit/x'])
      expect([askedWork(address), asksForWork(address)]).toEqual([undefined, true]);
    for (const address of [undefined, '', '/', '/uk', '/exhibitions/nothing', '/art/31/more'])
      expect([askedWork(address), asksForWork(address)]).toEqual([undefined, false]);
  });

  it('finds the work next door: the nearest held, the lower of two as near', () => {
    expect(nearestWork(999)).toBe(71);
    expect(nearestWork(72)).toBe(71);
    expect(nearestWork(31)).toBe(31);
    expect(nearestWork(5, [2, 8])).toBe(2);
    expect(nearestWork(6, [2, 8])).toBe(8);
    expect(nearestWork(5, [])).toBeUndefined();
  });
});

describe('asking the indexer', () => {
  afterEach(() => vi.useRealTimers());
  const answer = (status: number, body: unknown) =>
    vi.fn(
      async () =>
        new Response(typeof body === 'string' ? body : JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
    );

  it('refuses a work only when the indexer says it has no record', async () => {
    const fetch = answer(400, { error: 'record not found', status: 0 });
    expect(await unrecorded(9999, fetch)).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      `${ART_API_ORIGIN}/api/cosmicgame/cst/info/9999`,
      expect.objectContaining({ redirect: 'error' }),
    );
    expect(await unrecorded(9999, answer(404, { error: 'record not found' }))).toBe(true);
  });

  it('lets a work through that the indexer has a record of', async () => {
    expect(await unrecorded(72, answer(200, { status: 1, TokenInfo: { TokenId: 72 } }))).toBe(
      false,
    );
  });

  it.each([
    ['an outage', answer(503, { error: 'unavailable' })],
    ['another refusal', answer(400, { error: 'bad request' })],
    ['an answer that is not JSON', answer(404, '<html>Not Found</html>')],
    ['a failed connection', vi.fn(async () => Promise.reject(new TypeError('fetch failed')))],
  ])('leaves the work to its page on %s', async (_, fetch) => {
    expect(await unrecorded(72, fetch)).toBe(false);
  });

  it('leaves the work to its page when the indexer is slow', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const asked = unrecorded(
      72,
      vi.fn(() => new Promise<Response>(() => {})),
    );
    await vi.advanceTimersByTimeAsync(ASK_TIMEOUT_MS);
    expect(await asked).toBe(false);
  });
});
