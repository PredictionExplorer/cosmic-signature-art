import Link from 'next/link';
import type { Messages } from '@/lib/i18n/en';
import { localizedPath, type Locale } from '@/lib/i18n/routing';
import { fill } from '@/lib/i18n/format';
import { collectionIndex, cycles, indexedAssetUrl, indexedWork } from '@/lib/art/collection-index';
import { workFolio, workNumber } from '@/lib/art/number';
import styles from './home-screens.module.css';
import { PreviewImage } from './preview-image';

/**
 * What the collection is, in the counts the index holds: the cycles it spans, the works it has,
 * and since when. The home's cover sets them beneath its standfirst.
 */
export function collectionCounts(locale: Locale, t: Messages): string[] {
  const summary = cycles();
  const first = summary[0];
  const last = summary.at(-1);
  const opened = first?.mintedAt
    ? new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(first.mintedAt),
      )
    : undefined;
  return [
    first && last ? fill(t.cyclesSpan, { first: first.cycle, last: last.cycle }) : undefined,
    collectionIndex.total === 1
      ? t.oneWork
      : fill(t.worksCount, { count: new Intl.NumberFormat(locale).format(collectionIndex.total) }),
    opened ? fill(t.since, { date: opened }) : undefined,
  ].filter((part): part is string => Boolean(part));
}

/**
 * A cycle hung twice across the seam, under its heading, its count and its date: every work of
 * the cycle as a real preview, the cycle in Ink on the paper leaf beside the cycle in Light on
 * the night leaf, each work on one line with itself. It closes the home, under how a work comes
 * to exist, and stands as the sale's last cycle while no sale is offered. A label set above the
 * heading names the section with it and describes every work's link, so a reader meets it at
 * each work as well as at the top; a note says, beneath the count, what the label means.
 */
export function CycleRow({
  locale,
  t,
  cycle,
  id,
  label,
  note,
  ground,
}: {
  locale: Locale;
  t: Messages;
  cycle: number;
  /** The heading's id; the label's is the same with `-label`. */
  id: string;
  label?: string;
  note?: string;
  /** The ground the section stands on, where a page's head follows its sections' grounds. */
  ground?: 'paper' | 'night';
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
      data-ground={ground}
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
