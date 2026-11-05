import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale, localizedPath } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { metadata } from '@/lib/site';
import { orbitIds } from '@/lib/art/orbit-records';
import { workFolio, workNumber } from '@/lib/art/number';
import { OrbitPicker } from '@/components/orbit-picker';
import styles from './verify.module.css';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = messages(locale);
  // A tool, not a derived image: the venue's card beside the home stands for it.
  return metadata(locale, '/verify/orbit', t.verifyOrbit, t.verifyOrbitIntro, null);
}

/**
 * Verify an orbit (third-physics.md §5.12), the door: a work's number, or any of the numbers
 * the registry holds a record for, each a link to the page where the visitor's browser derives
 * that work's orbit from its seed and compares it with the record, line by line.
 */
export default async function VerifyOrbitIndex({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = messages(locale);
  const ids = orbitIds();
  return (
    <main id="main" className={styles.page}>
      <div className={styles.sheet}>
        <header className={styles.head}>
          <h1 className={styles.title}>{t.verifyOrbit}</h1>
          <p className={`reading ${styles.lead}`}>{t.verifyOrbitIntro}</p>
          <OrbitPicker ids={ids} locale={locale} t={t} />
        </header>
        <section className={`${styles.works} ${styles.work}`} aria-labelledby="works-title">
          <h2 id="works-title" className={styles.worksTitle}>
            {t.verifyOrbitWorks}
          </h2>
          <ol className={styles.numbers}>
            {ids.map((id) => (
              <li key={id}>
                {/* A ledger of every work: none is fetched ahead, the one chosen is. */}
                <Link
                  href={localizedPath(locale, `/verify/orbit/${id}`)}
                  prefetch={false}
                  aria-label={workNumber(id)}
                >
                  {workFolio(id)}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
