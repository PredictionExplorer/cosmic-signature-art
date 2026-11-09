import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { ADDRESS_HEADER, visitorAddress } from '@/lib/addresses';
import { ROOM_COLORS } from '@/lib/room';
import { VenueDocument, venueMetadata, venueViewport } from './venue-document';
import { NotFoundPage } from './[locale]/not-found-page';

export const metadata: Metadata = venueMetadata;
export const viewport: Viewport = { ...venueViewport, themeColor: ROOM_COLORS.night };

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
