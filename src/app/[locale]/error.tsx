'use client';
import { useErrorWords } from './error-context';

/** Paper, one line, one word: the venue needs a moment and says so. */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const t = useErrorWords();
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
