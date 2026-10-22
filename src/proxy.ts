import { NextResponse, type NextRequest } from 'next/server';
import { isLocale } from './lib/i18n/routing';
export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  const segment = url.pathname.split('/')[1];
  if (isLocale(segment)) return NextResponse.next();
  url.pathname = `/en${url.pathname === '/' ? '' : url.pathname}`;
  return NextResponse.rewrite(url);
}
export const config = {
  matcher: ['/((?!api|_next|fonts/|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)'],
};
