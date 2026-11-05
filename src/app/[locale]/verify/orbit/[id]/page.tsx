import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale, localizedPath } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { fill } from '@/lib/i18n/format';
import { metadata } from '@/lib/site';
import { orbitIds, workOrbit } from '@/lib/art/orbit-records';
import { workNumber } from '@/lib/art/number';
import { OrbitVerifier } from '@/components/orbit-verifier';
import styles from '../verify.module.css';

type Params = Promise<{ locale: string; id: string }>;

/**
 * Every work the registry holds a record for, in every locale; any other number is not here.
 * It is never rendered either: with dynamic params a page would be rendered and cached for every
 * number anyone typed, so another number has the plain 404 of any address the venue lacks.
 */
export const dynamicParams = false;
export function generateStaticParams() {
  return orbitIds().map((id) => ({ id: String(id) }));
}

/** The record a number names, by its one spelling: "31", never "031". */
function orbitFor(id: string) {
  return /^(?:0|[1-9]\d{0,5})$/.test(id) ? workOrbit(Number(id)) : undefined;
}

export async function generateMetadata({ params }: { params: Params }) {
  const { locale, id } = await params;
  if (!isLocale(locale)) return {};
  const orbit = orbitFor(id);
  if (!orbit) return {};
  const t = messages(locale);
  const work = workNumber(orbit.id);
  // A tool, not a derived image: the venue's card beside the home stands for it.
  return metadata(
    locale,
    `/verify/orbit/${orbit.id}`,
    fill(t.verifyOrbitOf, { work }),
    fill(t.verifyOrbitWorkIntro, { work }),
    null,
  );
}

/**
 * One work's orbit, verified here: its number and seed in the margin, and beside them the
 * derivation the visitor's own browser makes from that seed, printed line by line against the
 * published record (src/components/orbit-verifier.tsx). The page hands the browser this one
 * work's record and nothing about the others.
 */
export default async function VerifyOrbitPage({ params }: { params: Params }) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const orbit = orbitFor(id);
  if (!orbit) notFound();
  const t = messages(locale);
  const number = new Intl.NumberFormat(locale);
  const work = workNumber(orbit.id);
  const { generation } = orbit;
  return (
    <main id="main" className={styles.page}>
      <div className={styles.sheet}>
        <header className={styles.head}>
          <p className={styles.back}>
            <Link className="word-link" href={localizedPath(locale, '/verify/orbit')}>
              {t.verifyOrbit}
            </Link>
          </p>
          <h1 className={`${styles.title} ${styles.numeral}`}>{work}</h1>
          <p className={`reading ${styles.lead}`}>{fill(t.verifyOrbitWorkIntro, { work })}</p>
          <dl className={styles.seed}>
            <dt>{t.seed}</dt>
            <dd>
              <code>{generation.seed}</code>
            </dd>
          </dl>
        </header>
        <div className={styles.work}>
          <OrbitVerifier key={orbit.id} orbit={orbit} t={t} locale={locale} />
        </div>
        <p className={styles.note}>
          {fill(t.verifyOrbitNote, {
            index: number.format(generation.selectedIndex),
            steps: number.format(generation.warmupSteps + generation.steps),
          })}
        </p>
      </div>
    </main>
  );
}
