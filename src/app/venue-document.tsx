import type { Metadata } from 'next';
import { Suspense } from 'react';
import { preconnect, prefetchDNS, preload } from 'react-dom';
import type { Locale } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { ART_API_ORIGIN, ART_MEDIA_ORIGINS } from '@/lib/art/constants';
import { compactWorks } from '@/lib/art/collection-index';
import { CJK_STYLESHEETS, LITERATA_PRELOADS } from '@/lib/fonts';
import { revealScript } from '@/lib/reveal';
import { settleScript } from '@/lib/settle';
import { roomScript, type Room } from '@/lib/room';
import { ReadingPlace } from '@/components/reading-place';
import { MotionProvider } from '@/components/motion-provider';
import { RoomGround } from '@/components/room-ground';
import { RunningHead } from '@/components/running-head';
import { Colophon } from '@/components/colophon';
import { IndexSheet } from '@/components/index-sheet';
import { KeySheet } from '@/components/key-sheet';
import { KeyboardVocabulary } from '@/components/keys';
import { DEPLOYMENT_URL } from '@/lib/site';
import '@fontsource/ibm-plex-mono/400.css';
import './typefaces.css';
import './globals.css';
import { DAY_WORK_POOL } from '@/lib/art/work-of-the-day';

/**
 * What the browser needs to know today's expression for itself: the day's-work pool's size and
 * the server's pin. A layout prerendered on another day then never answers for today.
 */
const venueDay = { poolSize: DAY_WORK_POOL.length, pinned: process.env.COSMIC_VENUE_DATE };
export const venueMetadata: Metadata = {
  // File-based images and icons resolve against the serving deployment, so a crawler can
  // fetch them while cosmic.art's DNS is pending; canonical links are absolute on SITE_URL.
  metadataBase: new URL(DEPLOYMENT_URL),
  title: { default: 'Cosmic Signature — The shape of motion', template: '%s · Cosmic Signature' },
  description: 'A living collection of recorded three-body orbits, rendered as light and as ink.',
};

/**
 * The venue's frame around every page: the document in the visitor's language, the running
 * head, the colophon and the sheets. The locale's layout puts each route in it, and the venue's
 * 404 for an address no route answers wears it too (src/app/global-not-found.tsx). A page that
 * stands on one ground names it, and the room script that reads the route's ground is left out;
 * a page whose route is not the visitor's address names that address for the running head.
 */
export function VenueDocument({
  locale,
  room,
  address,
  children,
}: {
  locale: Locale;
  room?: Room;
  address?: string;
  children: React.ReactNode;
}) {
  const t = messages(locale);
  // Artwork and films are fetched without CORS, so the warmed connection must match.
  preconnect(ART_API_ORIGIN);
  for (const origin of ART_MEDIA_ORIGINS) if (origin !== ART_API_ORIGIN) prefetchDNS(origin);
  // The type the first paint reads in arrives with the page (src/lib/fonts.ts).
  for (const href of LITERATA_PRELOADS[locale])
    preload(href, { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' });
  const cjk = CJK_STYLESHEETS[locale];
  return (
    <html lang={locale} data-scroll-behavior="smooth" data-room={room} suppressHydrationWarning>
      <body>
        {cjk ? <link rel="stylesheet" href={cjk} precedence="default" /> : null}
        {room ? null : <script dangerouslySetInnerHTML={{ __html: roomScript(venueDay) }} />}
        {/* Ahead of React's streaming runtime: reveals what WebKit would hold back until load. */}
        <script dangerouslySetInnerHTML={{ __html: revealScript }} />
        {/* Ahead of every plate: a still that has loaded shows without waiting for the route's script. */}
        <script dangerouslySetInnerHTML={{ __html: settleScript }} />
        <MotionProvider>
          <Suspense fallback={null}>
            <RoomGround />
          </Suspense>
          <RunningHead locale={locale} t={t} address={address} />
          {children}
          <Colophon locale={locale} t={t} />
          <IndexSheet
            works={compactWorks()}
            locale={locale}
            t={t}
            pool={DAY_WORK_POOL}
            pinned={venueDay.pinned}
          />
          <KeySheet t={t} />
          <KeyboardVocabulary locale={locale} />
          <ReadingPlace />
        </MotionProvider>
      </body>
    </html>
  );
}
