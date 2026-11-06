import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { preconnect, prefetchDNS, preload } from 'react-dom';
import { isLocale, locales } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { ART_API_ORIGIN, ART_MEDIA_ORIGINS } from '@/lib/art/constants';
import { compactWorks } from '@/lib/art/collection-index';
import { CJK_STYLESHEETS, LITERATA_PRELOADS } from '@/lib/fonts';
import { roomScript } from '@/lib/room';
import { MotionProvider } from '@/components/motion-provider';
import { RoomGround } from '@/components/room-ground';
import { RunningHead } from '@/components/running-head';
import { Colophon } from '@/components/colophon';
import { IndexSheet } from '@/components/index-sheet';
import { KeySheet } from '@/components/key-sheet';
import { KeyboardVocabulary } from '@/components/keys';
import { DEPLOYMENT_URL } from '@/lib/site';
import '@fontsource/ibm-plex-mono/400.css';
import '../typefaces.css';
import '../globals.css';
import { DAY_WORK_POOL } from '@/lib/art/work-of-the-day';

/**
 * What the browser needs to know today's expression for itself: the day's-work pool's size and
 * the server's pin. A layout prerendered on another day then never answers for today.
 */
const venueDay = { poolSize: DAY_WORK_POOL.length, pinned: process.env.COSMIC_VENUE_DATE };
// viewportFit makes the env(safe-area-inset-*) paddings real; the room script keeps
// theme-color in step with the ground, so black rooms are not framed by cream bars.
export const viewport: Viewport = {
  themeColor: '#f1ebdf',
  colorScheme: 'light',
  viewportFit: 'cover',
};
export const metadata: Metadata = {
  // File-based images and icons resolve against the serving deployment, so a crawler can
  // fetch them while cosmic.art's DNS is pending; canonical links are absolute on SITE_URL.
  metadataBase: new URL(DEPLOYMENT_URL),
  title: { default: 'Cosmic Signature — The shape of motion', template: '%s · Cosmic Signature' },
  description: 'A living collection of recorded three-body orbits, rendered as light and as ink.',
};
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = messages(locale);
  // Artwork and films are fetched without CORS, so the warmed connection must match.
  preconnect(ART_API_ORIGIN);
  for (const origin of ART_MEDIA_ORIGINS) if (origin !== ART_API_ORIGIN) prefetchDNS(origin);
  // The type the first paint reads in arrives with the page (src/lib/fonts.ts).
  for (const href of LITERATA_PRELOADS[locale])
    preload(href, { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' });
  const cjk = CJK_STYLESHEETS[locale];
  return (
    <html lang={locale} data-scroll-behavior="smooth" suppressHydrationWarning>
      <body>
        {cjk ? <link rel="stylesheet" href={cjk} precedence="default" /> : null}
        <script dangerouslySetInnerHTML={{ __html: roomScript(venueDay) }} />
        <MotionProvider>
          <Suspense fallback={null}>
            <RoomGround />
          </Suspense>
          <RunningHead locale={locale} t={t} />
          {children}
          <Colophon locale={locale} t={t} />
          <IndexSheet works={compactWorks()} locale={locale} t={t} {...venueDay} />
          <KeySheet t={t} />
          <KeyboardVocabulary locale={locale} />
        </MotionProvider>
      </body>
    </html>
  );
}
