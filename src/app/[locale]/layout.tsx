import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { isLocale, locales } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { MotionProvider } from '@/components/motion-provider';
import { SiteHeader, SiteFooter } from '@/components/site-header';
import { SITE_URL } from '@/lib/site';
import '@fontsource-variable/cormorant-garamond';
import '@fontsource-variable/cormorant-garamond/wght-italic.css';
import '@fontsource-variable/inter';
import '../globals.css';
export const viewport: Viewport = { themeColor: '#f1ebdf', colorScheme: 'light' };
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
  return (
    <html lang={locale} data-scroll-behavior="smooth">
      <body>
        <MotionProvider>
          <SiteHeader locale={locale} t={t} />
          {children}
          <SiteFooter locale={locale} t={t} />
        </MotionProvider>
      </body>
    </html>
  );
}
