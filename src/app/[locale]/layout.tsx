import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { isLocale, locales } from '@/lib/i18n/routing';
import { VenueDocument, venueMetadata, venueViewport } from '../venue-document';

export const viewport: Viewport = venueViewport;
export const metadata: Metadata = venueMetadata;
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
  return <VenueDocument locale={locale}>{children}</VenueDocument>;
}
