import { NextResponse, type NextRequest } from 'next/server';
import { isLocale, locales } from './lib/i18n/routing';
import {
  ADDRESS_HEADER,
  DAY_POOL_SIZE,
  NOT_HERE,
  notHere,
  readAddress,
  renderedOnRequest,
  unrecorded,
} from './lib/addresses';
import { documentScripts, scriptHash } from './lib/document-scripts';
import { strictScriptPolicy } from './lib/security-headers';

/**
 * The policy header a page rendered on request carries beside the enforced one. Report-only:
 * the browser runs what the enforced policy allows and says where this one would have refused.
 * Next reads the nonce from the request's copy of the header and writes it on every script it
 * sends (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
 */
const SCRIPT_POLICY = 'content-security-policy-report-only';

/** The document's own inline scripts, by hash: the same for every request this server answers. */
let ownScripts: Promise<string[]> | undefined;
function ownScriptHashes(): Promise<string[]> {
  ownScripts ??= Promise.all(
    documentScripts({ poolSize: DAY_POOL_SIZE, pinned: process.env.COSMIC_VENUE_DATE }).map(
      scriptHash,
    ),
  );
  return ownScripts;
}

/** A nonce: sixteen random bytes, unguessable and never used twice. */
function freshNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}

/**
 * The nonce of a policy this proxy wrote on an earlier pass. Next routes a 404 through here a
 * second time, and on a loopback host it fetches every rewritten address from itself: the page
 * is rendered once, with the first pass's nonce, and a second nonce would name no script on it.
 */
function carriedNonce(request: NextRequest): string | undefined {
  return /'nonce-([A-Za-z0-9+/_-]+={0,2})'/.exec(request.headers.get(SCRIPT_POLICY) ?? '')?.[1];
}

/** A document a browser navigates to: not the router's fetch of a page's data, nor its guess. */
function isDocument(request: NextRequest): boolean {
  const { headers } = request;
  return (
    !headers.has('rsc') &&
    !headers.has('next-router-prefetch') &&
    headers.get('purpose') !== 'prefetch'
  );
}

/**
 * Every page address passes here first. An address without a locale is the first locale's:
 * /art/31 is /en/art/31. A work, an exhibition or an orbit number that does not exist is sent
 * to an address no route answers, so it is a true 404 before its route can stream a 200
 * (src/lib/addresses.ts). The visitor's own address rides along as a request header, so the
 * venue's 404 speaks their language and its running head points at their address
 * (src/app/global-not-found.tsx).
 *
 * A page rendered for each request is also given a nonce here, and the script policy that
 * rests on it (src/lib/security-headers.ts). A prerendered page is a file, written before any
 * request: it can carry no nonce, and is sent the enforced policy alone.
 */
export async function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  const segment = url.pathname.split('/')[1];
  const locale = isLocale(segment) ? segment : locales[0];
  const prefix = isLocale(segment) ? `/${segment}` : '';
  const path = url.pathname.slice(prefix.length) || '/';
  const headers = new Headers(request.headers);
  // Next routes a 404 through here again from the address no route answers; the address the
  // visitor asked for, written the first time, stands.
  if (path !== NOT_HERE || !headers.has(ADDRESS_HEADER)) headers.set(ADDRESS_HEADER, url.pathname);
  const reading = readAddress(path);
  if (reading.kind === 'respell') {
    url.pathname = `${prefix}${reading.path}`;
    return NextResponse.redirect(url, 308);
  }
  const refused =
    reading.kind === 'not-here' || (reading.kind === 'ask' && (await unrecorded(reading.work)));
  // The venue's 404 is rendered for each request too (it reads the visitor's address).
  const policy =
    isDocument(request) && (refused || path === NOT_HERE || renderedOnRequest(path))
      ? strictScriptPolicy(carriedNonce(request) ?? freshNonce(), await ownScriptHashes(), {
          development: process.env.NODE_ENV === 'development',
        })
      : undefined;
  if (policy) headers.set(SCRIPT_POLICY, policy);
  else headers.delete(SCRIPT_POLICY);
  const answered = (response: NextResponse) => {
    if (policy) response.headers.set(SCRIPT_POLICY, policy);
    return response;
  };
  if (refused) {
    url.pathname = notHere(locale);
    return answered(NextResponse.rewrite(url, { request: { headers } }));
  }
  if (prefix) return answered(NextResponse.next({ request: { headers } }));
  url.pathname = `/${locales[0]}${path === '/' ? '' : path}`;
  return answered(NextResponse.rewrite(url, { request: { headers } }));
}
/*
  Every address runs through the proxy except the venue's files, named here by folder or by name:
  the API, the framework's and the host's own paths, the fonts, the icons, the stills, films and
  maps under /art, and the six files the app serves from its root. The rule was once "anything
  with a dot in it", which let /uk/art/31.5 past to a streamed 200. Next reads a matcher at
  build time, so it has to be written out; proxy.test.ts reads the files themselves, and fails
  for one this does not name, which would otherwise be rewritten under a locale and lost.
*/
export const config = {
  matcher: [
    '/((?!api/|_next/|_vercel/|fonts/|icons/|art/.+\\.(?:webp|mp4)$|(?:favicon\\.ico|icon\\.svg|apple-icon\\.png|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml)$).*)',
  ],
};
