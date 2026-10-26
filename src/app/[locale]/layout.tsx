import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { preconnect, prefetchDNS } from 'react-dom';
import { isLocale, locales } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { ART_API_ORIGIN, ART_MEDIA_ORIGINS } from '@/lib/art/constants';
import { compactWorks } from '@/lib/art/collection-index';
import { CJK_STYLESHEETS } from '@/lib/fonts';
import { roomScript } from '@/lib/room';
import { MotionProvider } from '@/components/motion-provider';
import { RoomGround } from '@/components/room-ground';
import { RunningHead } from '@/components/running-head';
import { Colophon } from '@/components/colophon';
import { IndexSheet } from '@/components/index-sheet';
import { KeySheet } from '@/components/key-sheet';
import { KeyboardVocabulary } from '@/components/keys';
import { SITE_URL } from '@/lib/site';
import '@fontsource-variable/literata/opsz.css';
import '@fontsource-variable/literata/opsz-italic.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '../globals.css';
// viewportFit makes the env(safe-area-inset-*) paddings real; the room script keeps
// theme-color in step with the ground, so black rooms are not framed by cream bars.
export const viewport: Viewport = {
  themeColor: '#f1ebdf',
  colorScheme: 'light',
  viewportFit: 'cover',
};
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
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
  const cjk = CJK_STYLESHEETS[locale];
  return (
    <html lang={locale} data-scroll-behavior="smooth" suppressHydrationWarning>
      <body>
        {cjk ? <link rel="stylesheet" href={cjk} precedence="default" /> : null}
        <script dangerouslySetInnerHTML={{ __html: roomScript }} />
        <MotionProvider>
          <RoomGround />
          <RunningHead locale={locale} t={t} />
          {children}
          <Colophon locale={locale} t={t} />
          <IndexSheet works={compactWorks()} locale={locale} t={t} />
          <KeySheet t={t} />
          <KeyboardVocabulary locale={locale} />
        </MotionProvider>
      </body>
    </html>
  );
}
