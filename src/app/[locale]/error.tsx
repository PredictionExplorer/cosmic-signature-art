'use client';
import { faultReference, tryAgain } from '@/lib/fault';
import { useErrorWords } from './error-context';

/**
 * Paper, one line, one word: the venue needs a moment and says so. The word asks for the
 * route's data again and renders it again; for a file of script a deployment has replaced, it
 * loads the page afresh (src/lib/fault.ts). Under them, when the fault was the server's, the
 * reference the server wrote beside it in its log.
 */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useErrorWords();
  const reference = faultReference(error);
  return (
    <main id="main" className="section-wrap empty-state">
      <h1>{t.errorTitle}</h1>
      <div>
        <button type="button" className="text-link" onClick={() => tryAgain(error, retry)}>
          {t.retry}
        </button>
      </div>
      {reference ? (
        <p className="numeral" translate="no" data-fault-reference="">
          <code>{reference}</code>
        </p>
      ) : null}
    </main>
  );
}
