import { notFound } from 'next/navigation';
import { isLocale } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { metadata } from '@/lib/site';
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = messages(locale);
  return metadata(locale, '/privacy', t.privacy, t.privacyTitle);
}
export default async function Privacy({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = messages(locale);
  return (
    <main id="main" className="type-page legal-page">
      <div className="page-heading">
        <p className="eyebrow">{t.privacy}</p>
        <h1>{t.privacyTitle}</h1>
      </div>
      <div className="legal-copy">
        <p>{t.privacyCopy}</p>
      </div>
    </main>
  );
}
