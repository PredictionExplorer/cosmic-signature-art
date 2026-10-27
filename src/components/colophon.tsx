import Link from 'next/link';
import type { Messages } from '@/lib/i18n/en';
import { localizedPath, type Locale } from '@/lib/i18n/routing';
import { fill } from '@/lib/i18n/format';
import { NAVIGATION, NAVIGATION_LABEL } from '@/lib/navigation';
import { collectionIndex } from '@/lib/art/collection-index';
import { Wordmark } from './running-head';
import styles from './colophon.module.css';

/** The venue's last word: what the plates are, when the record was read, how it is set. */
export function Colophon({ locale, t }: { locale: Locale; t: Messages }) {
  const recordDate = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${collectionIndex.checkedOn}T00:00:00Z`),
  );
  return (
    <footer className={`site-footer ${styles.colophon}`}>
      <div className={styles.lines}>
        <Link className="brand" href={localizedPath(locale)} aria-label="Cosmic Signature">
          <Wordmark t={t} />
        </Link>
        <p>{t.colophonPlates}</p>
        <p>{t.colophonFilms}</p>
        <p>{t.processNote}</p>
        <p>{fill(t.recordAsOf, { date: recordDate })}</p>
        <p>{t.colophonType}</p>
      </div>
      <nav className={styles.rows} aria-label={t.colophon}>
        {(
          [
            ...NAVIGATION.map((path) => [path, t[NAVIGATION_LABEL[path]]] as const),
            ['/terms', t.terms],
            ['/privacy', t.privacy],
          ] as const
        ).map(([path, label]) => (
          <Link key={path} href={localizedPath(locale, path)}>
            {label}
          </Link>
        ))}
        <a href="https://cosmicsignature.com">{t.openProtocol} ↗</a>
      </nav>
    </footer>
  );
}
