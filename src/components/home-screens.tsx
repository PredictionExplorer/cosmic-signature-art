import Link from 'next/link';
import type { Messages } from '@/lib/i18n/en';
import { localizedPath, type Locale } from '@/lib/i18n/routing';
import { fill } from '@/lib/i18n/format';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { collectionIndex, cycles, indexedAssetUrl, indexedWork } from '@/lib/art/collection-index';
import { withCollectionPreviews } from '@/lib/art/collection-previews';
import { workFolio, workNumber } from '@/lib/art/number';
import { SpreadPlates } from './home-spread-plates';
import styles from './home-screens.module.css';
import { PreviewImage } from './preview-image';

/**
 * Screen 3 of the home, the one screen with no work: the venue's name set in small caps,
 * its subtitle, the counts read from the index, and the statement's one line with its byline.
 */
export function HomeStatement({ locale, t }: { locale: Locale; t: Messages }) {
  const summary = cycles();
  const first = summary[0];
  const last = summary.at(-1);
  const opened = first?.mintedAt
    ? new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(first.mintedAt),
      )
    : undefined;
  const counts = [
    t.livingCollection,
    first && last ? fill(t.cyclesSpan, { first: first.cycle, last: last.cycle }) : undefined,
    collectionIndex.total === 1
      ? t.oneWork
      : fill(t.worksCount, { count: new Intl.NumberFormat(locale).format(collectionIndex.total) }),
    opened ? fill(t.since, { date: opened }) : undefined,
  ].filter(Boolean);
  return (
    <section className={`${styles.screen} ${styles.statement}`} aria-labelledby="home-statement">
      <div className={styles.statementBlock}>
        <h1 id="home-statement" className={styles.wordmark}>
          Cosmic Signature
        </h1>
        <p className={`subtitle ${styles.subtitle}`}>{t.shapeOfMotion}</p>
        <p className={styles.counts}>{counts.join(' · ')}</p>
        <p className={`reading ${styles.line}`}>{t.statementLine}</p>
        <p className={styles.byline}>{t.statementSigned}</p>
        <Link className="text-link" href={localizedPath(locale, '/collection')}>
          {t.collection} →
        </Link>
      </div>
    </section>
  );
}

/** Screen 4: Signatures 031 and 035 in Ink, side by side, each in its own tone. */
export function HomeSpread({ locale, t }: { locale: Locale; t: Messages }) {
  const works = [31, 35].flatMap((id) => {
    const work = getCuratedArtwork(id);
    return work ? [{ ...work, media: withCollectionPreviews(work, work.media) }] : [];
  });
  return <SpreadPlates works={works} locale={locale} t={t} />;
}

/** Screen 5: the day's work's cycle, its count and date, and every work of the cycle as a real preview. */
export function HomeCycle({
  locale,
  t,
  dayWork,
}: {
  locale: Locale;
  t: Messages;
  dayWork: number;
}) {
  const cycle = indexedWork(dayWork)?.cycle;
  const summary = cycles().find((candidate) => candidate.cycle === cycle);
  if (cycle === undefined || !summary) return null;
  const date = summary.mintedAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
        new Date(summary.mintedAt),
      )
    : undefined;
  const number = new Intl.NumberFormat(locale);
  return (
    <section className={`${styles.screen} ${styles.cycle}`} aria-labelledby="home-cycle">
      <header className={styles.cycleHead}>
        <h2 id="home-cycle" className="chapter">
          {t.cycle} {number.format(cycle)}
        </h2>
        <p className={styles.cycleMeta}>
          {summary.count === 1
            ? t.oneWork
            : fill(t.worksCount, { count: number.format(summary.count) })}
          {date ? ` · ${fill(t.imprintedOn, { date })}` : ''}
        </p>
      </header>
      <ul className={styles.row}>
        {summary.ids.map((id) => {
          const work = indexedWork(id);
          const preview = work ? indexedAssetUrl(work, work.media.ink?.preview?.path) : undefined;
          return (
            <li key={id}>
              <Link href={localizedPath(locale, `/art/${id}`)} className={styles.cell}>
                <span className="art-media" data-material="ink">
                  {preview ? (
                    <PreviewImage
                      src={preview}
                      alt={`${workNumber(id)} · ${t.ink}`}
                      width={work?.media.ink?.preview?.width ?? 640}
                      height={work?.media.ink?.preview?.height ?? 414}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span className="art-placeholder" role="img" aria-label={workNumber(id)} />
                  )}
                </span>
                <span className="numeral control">{workFolio(id)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <Link
        className="text-link"
        href={localizedPath(locale, `/collection?order=cycle&cycle=${cycle}`)}
      >
        {t.theCollection} →
      </Link>
    </section>
  );
}
