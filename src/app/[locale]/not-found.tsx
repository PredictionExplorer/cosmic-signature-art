import { locale } from 'next/root-params';
import { isLocale, locales } from '@/lib/i18n/routing';
import { NotFoundPage } from './not-found-page';

/**
 * A page's own notFound(), inside the venue's frame. An unknown work, exhibition or orbit
 * number is refused by the proxy before its page renders (src/lib/addresses.ts); this answers
 * what is left, after the page has begun to stream. A not-found file is given no params, so it
 * reads the route's language as a root parameter: the segment above the root layout, which any
 * Server Component may ask for.
 */
export default async function NotFound() {
  const named = await locale();
  // The layout above has already refused a locale the venue does not speak.
  return <NotFoundPage locale={isLocale(named) ? named : locales[0]} />;
}
