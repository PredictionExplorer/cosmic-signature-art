'use client';
import { useParams } from 'next/navigation';
import { messages } from '@/lib/i18n/messages';
import { isLocale } from '@/lib/i18n/routing';
/** Paper, one line, one word: the venue needs a moment and says so. */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const params = useParams();
  const t = messages(
    typeof params.locale === 'string' && isLocale(params.locale) ? params.locale : 'en',
  );
  return (
    <main id="main" className="section-wrap empty-state">
      <h1>{t.errorTitle}</h1>
      <div>
        <button type="button" className="text-link" onClick={reset}>
          {t.retry}
        </button>
      </div>
    </main>
  );
}
