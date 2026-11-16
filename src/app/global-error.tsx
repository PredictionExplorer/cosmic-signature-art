'use client';
import { usePathname } from 'next/navigation';
import { faultReference, tryAgain } from '@/lib/fault';
import { CJK_STYLESHEETS } from '@/lib/fonts';
import { isLocale, locales, localizedPath } from '@/lib/i18n/routing';
import { GLOBAL_ERROR_WORDS } from './global-error.words';
import '@fontsource/ibm-plex-mono/400.css';
import './typefaces.css';
import './globals.css';

/**
 * The venue's last page: what stands when the document itself has failed, the one fault no
 * route's error page can catch because that page lives inside the document. Next renders this
 * in place of every layout, so it brings its own <html>, its own styles and its own words
 * (global-error.words.ts), and reads the visitor's language from the address, which is all
 * that is left to read it from. An address with no locale is English, as the proxy has it.
 *
 * It is the route's error page again (paper, one line, one word, and the server's reference
 * when the fault was the server's) with one thing more: the way home, as a plain link, so that
 * following it loads a whole new document.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const segment = usePathname()?.split('/')[1] ?? '';
  const locale = isLocale(segment) ? segment : locales[0];
  const t = GLOBAL_ERROR_WORDS[locale];
  const reference = faultReference(error);
  const cjk = CJK_STYLESHEETS[locale];
  return (
    <html lang={locale} data-room="paper">
      <body>
        {/* The locale's own face, as the document links it: this page may be all that was sent. */}
        {cjk ? <link rel="stylesheet" href={cjk} precedence="default" /> : null}
        {/* React lifts a title to the head wherever it is rendered: this page can export no metadata. */}
        <title>{`${t.errorTitle} · Cosmic Signature`}</title>
        <div className="site">
          <header className="site-header">
            <div className="head-row">
              {/* A plain link, never the router's: what failed may be the router's own frame. */}
              <a className="brand" href={localizedPath(locale)} aria-label="Cosmic Signature">
                <span className="brand-name">Cosmic Signature</span>
              </a>
            </div>
          </header>
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
        </div>
      </body>
    </html>
  );
}
