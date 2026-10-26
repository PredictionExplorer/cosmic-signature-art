'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { messages } from '@/lib/i18n/messages';
import { isLocale, localizedPath } from '@/lib/i18n/routing';
export default function NotFound() {
  const params = useParams();
  const locale =
    typeof params.locale === 'string' && isLocale(params.locale) ? params.locale : 'en';
  const t = messages(locale);
  return (
    <main id="main" className="section-wrap empty-state">
      <p className="eyebrow">404</p>
      <h1>{t.notFound}</h1>
      <Link className="text-link" href={localizedPath(locale, '/collection')}>
        {t.returnGallery}
      </Link>
    </main>
  );
}
