import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { ADDRESS_HEADER, visitorAddress } from '@/lib/addresses';
import { VenueDocument, venueMetadata } from './venue-document';
import { nightViewport } from './viewport';
import { notFoundHeading } from './not-found-title';
import { NotFoundPage } from './[locale]/not-found-page';

/** Titled by what the page says, in the language it says it in (not as the venue's home). */
export async function generateMetadata(): Promise<Metadata> {
  const { locale, address } = visitorAddress((await headers()).get(ADDRESS_HEADER));
  return { ...venueMetadata, title: `${notFoundHeading(locale, address)} · Cosmic Signature` };
}
export const viewport: Viewport = nightViewport;

/**
 * The venue's 404 for an address no route answers. The proxy sends an unknown work, exhibition
 * or orbit number here before its route can stream a 200 (src/lib/addresses.ts). Next renders
 * this in place of every layout, so it brings the venue's own frame, on the night ground from
 * the first paint, in the language of the address the visitor asked for, which the proxy hands
 * on because no route here can read it.
 */
export default async function GlobalNotFound() {
  const { locale, address } = visitorAddress((await headers()).get(ADDRESS_HEADER));
  return (
    <VenueDocument locale={locale} room="night" address={address}>
      <NotFoundPage locale={locale} address={address} />
    </VenueDocument>
  );
}
