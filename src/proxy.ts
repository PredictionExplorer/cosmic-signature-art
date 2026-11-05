import { NextResponse, type NextRequest } from 'next/server';
import { isLocale, locales } from './lib/i18n/routing';
import { ADDRESS_HEADER, NOT_HERE, notHere, readAddress, unrecorded } from './lib/addresses';

/**
 * Every page address passes here first. An address without a locale is the first locale's:
 * /art/31 is /en/art/31. A work, an exhibition or an orbit number that does not exist is sent
 * to an address no route answers, so it is a true 404 before its route can stream a 200
 * (src/lib/addresses.ts). The visitor's own address rides along as a request header, so the
 * venue's 404 speaks their language and its running head points at their address
 * (src/app/global-not-found.tsx).
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
  if (reading.kind === 'not-here' || (reading.kind === 'ask' && (await unrecorded(reading.work)))) {
    url.pathname = notHere(locale);
    return NextResponse.rewrite(url, { request: { headers } });
  }
  if (prefix) return NextResponse.next({ request: { headers } });
  url.pathname = `/${locales[0]}${path === '/' ? '' : path}`;
  return NextResponse.rewrite(url, { request: { headers } });
}
export const config = {
  matcher: ['/((?!api|_next|fonts/|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)'],
};
