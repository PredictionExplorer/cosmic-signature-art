import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { preconnect, prefetchDNS } from 'react-dom';
import { isLocale, locales } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { ART_API_ORIGIN, ART_MEDIA_ORIGINS } from '@/lib/art/constants';
import { roomScript } from '@/lib/room';
import { MotionProvider } from '@/components/motion-provider';
import { RoomGround } from '@/components/room-ground';
import { SiteHeader, SiteFooter } from '@/components/site-header';
import { SITE_URL } from '@/lib/site';
import '@fontsource-variable/cormorant-garamond';
import '@fontsource-variable/cormorant-garamond/wght-italic.css';
import '@fontsource-variable/inter';
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
  description: 'Three bodies. A field of ink. A living collection of generative art.',
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
  return (
    <html lang={locale} data-scroll-behavior="smooth" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: roomScript }} />
        <MotionProvider>
          <RoomGround />
          <SiteHeader locale={locale} t={t} />
          {children}
          <SiteFooter locale={locale} t={t} />
        </MotionProvider>
      </body>
    </html>
  );
}
