import { ArtReadError, createArtRequest, type ArtFetchLike } from './art/request';
import { isLocale, locales, type Locale } from './i18n/routing';

/**
 * The addresses the proxy (src/proxy.ts) answers for before anything renders. Every route
 * under a locale streams behind its loading plate ([locale]/loading.tsx), so by the time a
 * page's own notFound() runs the response has begun as a 200. A work, an exhibition or an
 * orbit number that does not exist is refused here instead, while a 404 can still be said.
 * The proxy holds three short lists for that, never the registries behind them;
 * addresses.test.ts keeps the lists in step with the registries.
 */

/** No route answers this, under any locale: Next serves the venue's own 404 there. */
export const NOT_HERE = '/_venue/not-here';
/**
 * Where the proxy sends what does not exist: the address no route answers, in the visitor's
 * locale (src/app/global-not-found.tsx). Next routes a 404 a second time, through the proxy,
 * from the address it was rewritten to, so the locale travels in the address itself.
 */
export function notHere(locale: Locale): string {
  return `/${locale}${NOT_HERE}`;
}

/**
 * The request header that carries the visitor's own address ("/uk/art/9999") to the venue's 404,
 * which has no route of its own to read: its language comes from it, and its running head's
 * language menu points at it rather than at the address no route answers. Only the proxy
 * writes it.
 */
export const ADDRESS_HEADER = 'x-venue-address';

/**
 * The visitor's address as the venue's 404 trusts it: a path on this site, as the proxy writes
 * one, or nothing. "//host" and "/\host" are other sites to a browser.
 */
export function visitorAddress(header: string | null): { locale: Locale; address?: string } {
  const address = header && /^\/(?![/\\])/.test(header) ? header : undefined;
  const segment = address?.split('/')[1] ?? '';
  return { locale: isLocale(segment) ? segment : locales[0], address };
}

function span(first: number, last: number): number[] {
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

/** Every work in the collection index (src/lib/art/collection-index.json), by number. */
export const INDEXED_WORKS: ReadonlySet<number> = new Set(span(0, 71));
/** Every work with an orbit record (src/lib/art/orbit-records.json): Verify an orbit's numbers. */
export const ORBIT_RECORDS: ReadonlySet<number> = new Set(span(0, 71));
/** Every exhibition (src/lib/exhibitions/exhibitions.ts): the hang, the four trails, the cycles. */
export const EXHIBITIONS: ReadonlySet<string> = new Set([
  'a-hang',
  'the-long-curve',
  'almost-still',
  'turbulence',
  'light-becoming-trace',
  'cycle-0',
  'cycle-1',
  'cycle-2',
]);

/** What the proxy reads in an address, its locale set aside: "/art/31", never "/uk/art/31". */
export type Reading =
  /** An address the proxy does not judge, or a thing it knows: the route answers. */
  | { kind: 'here' }
  /** Nothing is here: the venue's 404. */
  | { kind: 'not-here' }
  /** A work's number in another spelling, "031" for 31: the one spelling answers. */
  | { kind: 'respell'; path: string }
  /** A work beyond the index: only the indexer's record can say. */
  | { kind: 'ask'; work: number };

const HERE: Reading = { kind: 'here' };
const NOT: Reading = { kind: 'not-here' };
/** A number in its one spelling: "31", never "031", "+31" or "31.0". */
const SPELLING = /^(?:0|[1-9]\d*)$/;

/** A work's number as its page reads one (parseArtworkId): up to 16 digits, a safe integer. */
function workId(segment: string): number | null {
  if (!/^\d{1,16}$/.test(segment)) return null;
  const id = Number(segment);
  return Number.isSafeInteger(id) ? id : null;
}

export function readAddress(path: string): Reading {
  const segments = path.split('/').slice(1);
  // A trailing slash or an empty segment is Next's to normalise, not the proxy's to judge.
  if (segments.some((segment) => !segment)) return HERE;
  const [room, name, number] = segments;
  if (room === 'art' && segments.length === 2) {
    const id = workId(name);
    if (id === null) return NOT;
    if (!SPELLING.test(name)) return { kind: 'respell', path: `/art/${id}` };
    return INDEXED_WORKS.has(id) ? HERE : { kind: 'ask', work: id };
  }
  if (room === 'exhibitions' && segments.length === 2) return EXHIBITIONS.has(name) ? HERE : NOT;
  if (room === 'verify' && name === 'orbit' && segments.length === 3)
    return SPELLING.test(number) && ORBIT_RECORDS.has(Number(number)) ? HERE : NOT;
  return HERE;
}

/**
 * How long the proxy waits for the indexer before it leaves a number to the work's page, which
 * asks again with its own, longer deadline (ART_REQUEST_TIMEOUT_MS). The indexer answers an
 * unknown number in about 150 ms.
 */
export const ASK_TIMEOUT_MS = 2_000;

/**
 * The work an address asked for by number, its locale set aside: "/uk/art/999" asks for 999, and
 * so does "/verify/orbit/999", the record of its orbit. Anything else asks for no work.
 */
export function askedWork(address?: string): number | undefined {
  const segments = (address ?? '').split(/[?#]/)[0].split('/').slice(1);
  if (isLocale(segments[0] ?? '')) segments.shift();
  const [room, name, number] = segments;
  if (room === 'art' && segments.length === 2) return workId(name) ?? undefined;
  if (room === 'verify' && name === 'orbit' && segments.length === 3)
    return workId(number) ?? undefined;
  return undefined;
}

/** Whether an address names a work at all, by number or not: "/art/abc" does, "/about" does not. */
export function asksForWork(address?: string): boolean {
  const segments = (address ?? '').split(/[?#]/)[0].split('/').slice(1);
  if (isLocale(segments[0] ?? '')) segments.shift();
  return (
    (segments[0] === 'art' && segments.length === 2) ||
    (segments[0] === 'verify' && segments[1] === 'orbit' && segments.length === 3)
  );
}

/**
 * The work next door to a number: the nearest the venue holds, the lower of two as near. A
 * number past the collection's last work is next door to that work.
 */
export function nearestWork(
  asked: number,
  works: Iterable<number> = INDEXED_WORKS,
): number | undefined {
  let nearest: number | undefined;
  for (const work of works)
    if (
      nearest === undefined ||
      Math.abs(work - asked) < Math.abs(nearest - asked) ||
      (Math.abs(work - asked) === Math.abs(nearest - asked) && work < nearest)
    )
      nearest = work;
  return nearest;
}

/**
 * Whether the indexer says, in so many words, that a work has no record. Works are minted after
 * the index is built, and the venue never infers a total from it, so a number beyond the index
 * is asked. Only the explicit "record not found" refuses it: an outage, a slow answer or
 * anything unreadable leaves the number to the page, which tells an outage from an absence
 * (docs/media-and-indexer-integration.md).
 */
export async function unrecorded(work: number, fetch?: ArtFetchLike): Promise<boolean> {
  const request = createArtRequest({ fetch, timeoutMs: ASK_TIMEOUT_MS });
  try {
    await request(`/api/cosmicgame/cst/info/${work}`);
    return false;
  } catch (error) {
    return error instanceof ArtReadError && error.notFound;
  }
}
