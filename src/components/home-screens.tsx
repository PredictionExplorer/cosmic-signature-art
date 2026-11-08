import Link from 'next/link';
import type { Messages } from '@/lib/i18n/en';
import { localizedPath, type Locale } from '@/lib/i18n/routing';
import { fill } from '@/lib/i18n/format';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { collectionIndex, cycles, indexedAssetUrl, indexedWork } from '@/lib/art/collection-index';
import { artworkForView } from '@/lib/art/view-media';
import { workFolio, workNumber } from '@/lib/art/number';
import type { Expression } from '@/lib/art/types';
import { SpreadPlates } from './home-spread-plates';
import { bindFigures, SEPARATOR } from '@/lib/typography';
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
  ].filter((part): part is string => Boolean(part));
  return (
    <section className={`${styles.screen} ${styles.statement}`} aria-labelledby="home-statement">
      <div className={styles.statementBlock}>
        <h1 id="home-statement" className="wordmark">
          Cosmic Signature
        </h1>
        <p className={`subtitle ${styles.subtitle}`}>{t.shapeOfMotion}</p>
        <p className="counts">{counts.map(bindFigures).join(SEPARATOR)}</p>
        <p className={`reading ${styles.line}`}>{t.statementLine}</p>
        <p className={styles.byline}>{t.statementSigned}</p>
        <Link className="text-link" href={localizedPath(locale, '/collection')}>
          {t.collection} →
        </Link>
      </div>
    </section>
  );
}

/**
 * Screen 4: Signatures 031 and 035 across the seam, one in Ink on paper and one in Light on
 * night, each in its own tone. The two change places with the day's expression, so each hangs
 * in both on alternate days.
 */
export function HomeSpread({
  locale,
  t,
  day,
}: {
  locale: Locale;
  t: Messages;
  /** The day's expression, which decides which work hangs in Ink. */
  day: Expression;
}) {
  const ids = day === 'ink' ? [31, 35] : [35, 31];
  const leaves = ids.flatMap((id, index) => {
    const work = getCuratedArtwork(id);
    const expression: Expression = index === 0 ? 'ink' : 'light';
    return work ? [{ work: artworkForView(work, 'card'), expression }] : [];
  });
  return <SpreadPlates leaves={leaves} locale={locale} t={t} />;
}

/**
 * Screen 5: the day's work's cycle, its count and date, and every work of the cycle as a real
 * preview, twice across the seam: the cycle in Ink on the paper leaf beside the cycle in Light
 * on the night leaf, each work on one line with itself.
 */
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
  if (cycle === undefined) return null;
  return <CycleRow locale={locale} t={t} cycle={cycle} id="home-cycle" />;
}

/**
 * A cycle hung twice across the seam, under its heading, its count and its date: the home's
 * screen 5, and the sale's last cycle while no sale is offered. A label set above the heading
 * names the section with it and describes every work's link, so a reader meets it at each work
 * as well as at the top; a note says, beneath the count, what the label means.
 */
export function CycleRow({
  locale,
  t,
  cycle,
  id,
  label,
  note,
}: {
  locale: Locale;
  t: Messages;
  cycle: number;
  /** The heading's id; the label's is the same with `-label`. */
  id: string;
  label?: string;
  note?: string;
}) {
  const summary = cycles().find((candidate) => candidate.cycle === cycle);
  if (!summary) return null;
  const date = summary.mintedAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
        new Date(summary.mintedAt),
      )
    : undefined;
  const number = new Intl.NumberFormat(locale);
  const labelId = label ? `${id}-label` : undefined;
  return (
    <section
      className={`${styles.screen} ${styles.cycle}`}
      aria-labelledby={labelId ? `${labelId} ${id}` : id}
    >
      <header className={styles.cycleHead}>
        {label ? (
          <p id={labelId} className={`eyebrow ${styles.cycleLabel}`}>
            {label}
          </p>
        ) : null}
        <h2 id={id} className="chapter">
          {t.cycle} {number.format(cycle)}
        </h2>
        <p className={styles.cycleMeta}>
          {summary.count === 1
            ? t.oneWork
            : fill(t.worksCount, { count: number.format(summary.count) })}
          {date ? ` · ${fill(t.imprintedOn, { date })}` : ''}
        </p>
        {note ? <p className={`reading ${styles.cycleNote}`}>{note}</p> : null}
      </header>
      <div className={styles.pairs}>
        {(['ink', 'light'] as const).map((leaf) => (
          <ul
            key={leaf}
            className={styles.row}
            data-ground={leaf === 'ink' ? 'paper' : 'night'}
            aria-label={t[leaf]}
          >
            {summary.ids.map((id) => {
              const work = indexedWork(id);
              const published = work?.media[leaf]?.preview;
              const preview = work ? indexedAssetUrl(work, published?.path) : undefined;
              return (
                <li key={id}>
                  <Link
                    href={localizedPath(locale, `/art/${id}?expression=${leaf}`)}
                    className={styles.cell}
                    aria-describedby={labelId}
                  >
                    <span className="art-media" data-material={leaf}>
                      {preview ? (
                        <PreviewImage
                          src={preview}
                          alt={`${workNumber(id)} · ${t[leaf]}`}
                          width={published?.width ?? 640}
                          height={published?.height ?? 414}
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
        ))}
      </div>
      <Link
        className="text-link"
        href={localizedPath(locale, `/collection?order=cycle&cycle=${cycle}`)}
      >
        {t.theCollection} →
      </Link>
    </section>
  );
}
