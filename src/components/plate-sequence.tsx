'use client';
import Link from 'next/link';
import { Fragment, useMemo, useState, useSyncExternalStore, type CSSProperties } from 'react';
import {
  getInterpretation,
  type ArtFilm,
  type ArtInterpretation,
  type Artwork,
} from '@/lib/art/types';
import { workFolio, workNumber } from '@/lib/art/number';
import { getPlateGround } from '@/lib/art/plate-records';
import type { CycleSummary } from '@/lib/art/collection-index';
import { fill } from '@/lib/i18n/format';
import type { Messages } from '@/lib/i18n/en';
import { localizedPath, type Locale } from '@/lib/i18n/routing';
import { ArtworkMedia } from './artwork-media';
import { useCollectionMotion } from './collection-motion';
import { CollectionPreview, excerptRange, getCollectionPreviewFilm } from './collection-preview';
import { ArtworkTransition } from './artwork-transition';
import { PLATE_SIZES } from './artwork-media';
import styles from './plate-sequence.module.css';

/** A phone's wall: the plate is 100 vw and the rhythm is full, two halves, full. */
const COMPACT_QUERY = '(max-width: 767px)';
const compactQuery = () =>
  typeof window.matchMedia === 'function' ? window.matchMedia(COMPACT_QUERY) : undefined;
function subscribeCompact(listener: () => void) {
  const query = compactQuery();
  query?.addEventListener('change', listener);
  return () => query?.removeEventListener('change', listener);
}
const compactOnServer = () => false;
/** Whether the wall is a phone's; false on the server and wherever media queries are absent. */
export function useCompactWall(): boolean {
  return useSyncExternalStore(
    subscribeCompact,
    () => compactQuery()?.matches ?? false,
    compactOnServer,
  );
}

/**
 * What a card plays under the lease: on a desk the settling clip, the film's own final eight
 * seconds, which ends on the still; on a phone's budget the 8 s excerpt. Only Ink moves in the
 * sequence, and never without a hash-verified clip.
 */
export function sequenceFilm(
  media: ArtInterpretation | undefined,
  compact: boolean,
): ArtFilm | undefined {
  if (!media || media.id !== 'ink') return undefined;
  const excerpt = getCollectionPreviewFilm(media);
  return compact ? excerpt : (media.settlingFilm ?? excerpt);
}

/** The still ladder's layout width for each shape of the rhythm. */
const SIZES: Record<Shape, string> = {
  1: PLATE_SIZES,
  2: '(max-width: 767px) 50vw, 46vw',
  3: '(max-width: 767px) 50vw, 30vw',
};

/**
 * The hang of a page of eighteen: one full-bleed plate, a spread of two, three stills, full
 * again. A fixed editorial rhythm, never scaled by a trait; a work's place in it says nothing
 * about its rank.
 */
export const RHYTHM: readonly Shape[] = [1, 2, 3, 1, 2, 1, 3, 1, 2, 2];
export type Shape = 1 | 2 | 3;
export type Chapters = 'none' | 'boundaries' | 'all';
export interface SequenceRow {
  shape: Shape;
  works: Artwork[];
  /** A cycle whose chapter strip precedes this row. */
  chapter?: number;
}

/**
 * Walk the works through the rhythm; a row never straddles two cycles, so a chapter strip
 * can stand exactly where one cycle ends and the next begins.
 */
export function sequenceRows(
  works: Artwork[],
  rhythm: readonly Shape[] = RHYTHM,
  chapters: Chapters = 'none',
): SequenceRow[] {
  const rows: SequenceRow[] = [];
  let step = 0;
  let index = 0;
  let previous: number | undefined | null = null;
  while (index < works.length) {
    const shape = rhythm[step % rhythm.length];
    step += 1;
    const cycle = works[index].cycle;
    const row: SequenceRow = { shape, works: [] };
    const opens =
      previous === null ? chapters === 'all' : chapters !== 'none' && cycle !== previous;
    if (opens && cycle !== undefined) row.chapter = cycle;
    while (row.works.length < shape && index < works.length && works[index].cycle === cycle) {
      row.works.push(works[index]);
      index += 1;
    }
    previous = cycle;
    rows.push(row);
  }
  return rows;
}

/** A 48 px strip between cycles: the cycle, how many works it imprinted, and when. */
export function ChapterStrip({
  cycle,
  summary,
  locale,
  t,
}: {
  cycle: number;
  summary?: CycleSummary;
  locale: Locale;
  t: Messages;
}) {
  const date = summary?.mintedAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
        new Date(summary.mintedAt),
      )
    : undefined;
  return (
    <h2 className={styles.chapter} data-cycle={cycle}>
      <span>
        {t.cycle} {cycle}
      </span>
      {summary ? (
        <span className={styles.chapterCount}>
          {summary.count === 1 ? t.oneWork : fill(t.worksCount, { count: summary.count })}
        </span>
      ) : null}
      {date && summary?.mintedAt ? (
        <time dateTime={summary.mintedAt} className={styles.chapterDate}>
          {fill(t.imprintedOn, { date })}
        </time>
      ) : null}
    </h2>
  );
}

export function PlateSequence({
  works,
  locale,
  t,
  expression = 'ink',
  animated = false,
  eagerFirstRow = false,
  chapters = 'none',
  cycles = [],
  rhythm = RHYTHM,
}: {
  works: Artwork[];
  locale: Locale;
  t: Messages;
  /** The expression every card shows; a work without it falls back to what it has. */
  expression?: 'ink' | 'light';
  animated?: boolean;
  eagerFirstRow?: boolean;
  chapters?: Chapters;
  cycles?: CycleSummary[];
  rhythm?: readonly Shape[];
}) {
  const [intentId, setIntentId] = useState<number | null>(null);
  const compact = useCompactWall();
  const rows = useMemo(() => sequenceRows(works, rhythm, chapters), [works, rhythm, chapters]);
  // Only a verified Ink clip may move, and never in a row of three stills.
  const previewIds = useMemo(
    () =>
      rows.flatMap((row) =>
        row.shape === 3
          ? []
          : row.works
              .filter((work) => sequenceFilm(getInterpretation(work, 'ink'), compact))
              .map((work) => work.id),
      ),
    [rows, compact],
  );
  const { gridRef, activeId, intent, clearIntent, fail, rest } = useCollectionMotion({
    enabled: animated && expression === 'ink',
    ids: previewIds,
  });
  const summaries = useMemo(() => new Map(cycles.map((cycle) => [cycle.cycle, cycle])), [cycles]);
  // The index of each row's first work, so the first row's plates may load eagerly.
  const starts = useMemo(
    () =>
      rows.map((_, index) =>
        rows.slice(0, index).reduce((sum, earlier) => sum + earlier.works.length, 0),
      ),
    [rows],
  );
  return (
    <div className={`work-grid ${styles.sequence}`} ref={gridRef}>
      {rows.map((row, rowIndex) => {
        const first = starts[rowIndex];
        const plateMedia =
          row.shape === 1 && row.works[0]
            ? (getInterpretation(row.works[0], expression) ??
              getInterpretation(row.works[0], 'light') ??
              row.works[0].media[0])
            : undefined;
        // A full-bleed plate takes its whole band from the sheet's own measured tone; a Light
        // plate takes the field's black, so neither ever shows an edge against the wall.
        const ground = plateMedia
          ? (getPlateGround(row.works[0].id, plateMedia.id, plateMedia.stillSha256)?.tone ??
            (plateMedia.id === 'light' ? '#000000' : undefined))
          : undefined;
        return (
          <Fragment key={rowIndex}>
            {row.chapter !== undefined ? (
              <ChapterStrip
                cycle={row.chapter}
                summary={summaries.get(row.chapter)}
                locale={locale}
                t={t}
              />
            ) : null}
            <div
              className={styles.row}
              data-shape={row.shape}
              style={ground ? ({ '--plate-ground': ground } as CSSProperties) : undefined}
            >
              {row.works.map((work, offset) => {
                const index = first + offset;
                const media =
                  getInterpretation(work, expression) ??
                  getInterpretation(work, 'light') ??
                  work.media[0];
                const word =
                  media?.id === 'ink' ? t.ink : media?.id === 'light' ? t.light : media?.label;
                const alt = `${workNumber(work.id)} · ${word ?? ''}`.trim();
                const label =
                  media?.id === 'ink' ? t.ink : expression === 'ink' ? t.lightOnly : t.light;
                const href = localizedPath(
                  locale,
                  `/art/${work.id}${media && media.id !== 'ink' ? `?expression=${encodeURIComponent(media.id)}` : ''}`,
                );
                const film = sequenceFilm(media, compact);
                const live = animated && row.shape !== 3;
                const active = live && activeId === work.id;
                const eager = eagerFirstRow && index < 2;
                // The eye line: a sheet in a row of two or three hangs so its measured centre
                // sits on the band's line; the full plate already fills its band.
                const centre =
                  row.shape !== 1 && media
                    ? getPlateGround(work.id, media.id, media.stillSha256)?.centre.y
                    : undefined;
                const hang =
                  centre !== undefined ? ({ '--centre-y': centre } as CSSProperties) : undefined;
                const plate = live ? (
                  <CollectionPreview
                    key={`${work.id}-${media?.id}`}
                    media={media}
                    alt={alt}
                    artworkId={work.id}
                    film={film}
                    sizes={SIZES[row.shape]}
                    eager={eager}
                    active={active}
                    onFailure={(reason) => fail(work.id, reason)}
                    onEnded={() => rest(work.id)}
                  />
                ) : (
                  <ArtworkMedia
                    key={`${work.id}-${media?.id}`}
                    media={media}
                    alt={alt}
                    artworkId={work.id}
                    sizes={SIZES[row.shape]}
                    still
                    thumbnail
                    eager={eager}
                  />
                );
                return (
                  <Link
                    key={work.id}
                    className={`work-card ${styles.card}`}
                    href={href}
                    style={hang}
                    prefetch={live ? active || intentId === work.id : undefined}
                    aria-label={alt}
                    data-preview-id={work.id}
                    data-preview-available={live && !!film}
                    data-motion={active ? 'active' : 'still'}
                    onPointerEnter={(event) => {
                      intent(work.id, 'pointer', event.pointerType);
                      if (event.pointerType !== 'touch') setIntentId(work.id);
                    }}
                    onPointerLeave={() => clearIntent(work.id, 'pointer')}
                    onFocus={() => {
                      intent(work.id, 'focus');
                      setIntentId(work.id);
                    }}
                    onBlur={() => clearIntent(work.id, 'focus')}
                  >
                    {live && media ? (
                      <ArtworkTransition
                        artworkId={work.id}
                        interpretationId={media.id}
                        role="preview"
                      >
                        {plate}
                      </ArtworkTransition>
                    ) : (
                      plate
                    )}
                    <span className={styles.caption} aria-hidden="true">
                      <span className={row.shape === 1 ? 'hanging-numeral' : styles.folio}>
                        {workFolio(work.id)}
                      </span>
                      <span className={styles.label}>
                        {label}
                        {active && film
                          ? ` · ${film.id === 'settling' ? t.settling : t.excerpt} ${excerptRange(film) ?? ''}`.trimEnd()
                          : ''}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
