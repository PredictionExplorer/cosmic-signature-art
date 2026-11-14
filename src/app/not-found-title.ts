import { askedWork, asksForWork, nearestWork } from '@/lib/addresses';
import { workNumber } from '@/lib/art/number';
import { fill } from '@/lib/i18n/format';
import { messages } from '@/lib/i18n/messages';
import type { Locale } from '@/lib/i18n/routing';

/**
 * What the venue's 404 says of an address, in the visitor's language: a number the collection
 * does not hold has not been imprinted, a work it cannot name is not here, and any other page
 * is not here. It is the page's heading (src/app/[locale]/not-found-view.tsx says the same of
 * what it is handed, and a browser test holds the two to one another), and so its title: a tab,
 * a history and a screen reader name the page by what it is, not as the venue's home.
 */
export function notFoundHeading(locale: Locale, address: string | undefined): string {
  const t = messages(locale);
  const asked = askedWork(address);
  if (asked !== undefined && nearestWork(asked) !== asked)
    return fill(t.notImprinted, { work: workNumber(asked) });
  return address !== undefined && !asksForWork(address) ? t.pageNotFound : t.notFound;
}
