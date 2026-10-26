import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale, localizedPath, type Locale } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { fill } from '@/lib/i18n/format';
import { metadata } from '@/lib/site';
import { collectionIndex, cycles } from '@/lib/art/collection-index';
import styles from './statement.module.css';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = messages(locale);
  return metadata(locale, '/statement', t.statement, t.statementLine);
}

const sections = [1, 2, 3, 4, 5, 6] as const;

/** The counts line is read from the build-time index, never typed into copy. */
export function collectionCounts(locale: Locale, t: ReturnType<typeof messages>) {
  const summaries = cycles();
  const first = summaries[0];
  const last = summaries.at(-1);
  const earliest = summaries
    .map((cycle) => cycle.mintedAt)
    .filter((date): date is string => !!date)
    .sort()[0];
  const parts = [t.livingCollection];
  if (first && last) parts.push(fill(t.cyclesSpan, { first: first.cycle, last: last.cycle }));
  parts.push(
    collectionIndex.total === 1
      ? t.oneWork
      : fill(t.worksCount, { count: new Intl.NumberFormat(locale).format(collectionIndex.total) }),
  );
  if (earliest)
    parts.push(
      fill(t.since, {
        date: new Intl.DateTimeFormat(locale, {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(earliest)),
      }),
    );
  return parts.join(' · ');
}

export default async function Statement({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = messages(locale);
  return (
    <main id="main" className={styles.page}>
      <p className={styles.epigraph}>{t.oneMotion}</p>
      <h1 className={styles.wordmark}>Cosmic Signature</h1>
      <p className={`subtitle ${styles.subtitle}`}>{t.shapeOfMotion}</p>
      <p className={styles.counts}>{collectionCounts(locale, t)}</p>
      <div className={styles.sections}>
        {sections.map((n) => (
          <section key={n} className={styles.section} aria-label={`§ ${n}`} data-section={n}>
            <span className={styles.sign} aria-hidden="true">
              § {n}
            </span>
            <p className={`reading ${styles.paragraph}`}>{t[`statement${n}`]}</p>
          </section>
        ))}
      </div>
      <p className={styles.byline}>{t.statementSigned}</p>
      <Link className={`text-link ${styles.onward}`} href={localizedPath(locale, '/collection')}>
        {t.collection} →
      </Link>
    </main>
  );
}
