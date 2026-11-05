'use client';
import Link from 'next/link';
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useCompactWall } from './compact-wall';
import {
  getInterpretation,
  type ArtFilm,
  type ArtInterpretation,
  type Artwork,
  twinOf,
  type Expression,
} from '@/lib/art/types';
import { workFolio, workNumber } from '@/lib/art/number';
import { getPlateGround } from '@/lib/art/plate-records';
import type { CycleSummary } from '@/lib/art/collection-index';
import type { Hanging } from '@/lib/art/collection-traits';
import { expressionWord, fill } from '@/lib/i18n/format';
import type { Messages } from '@/lib/i18n/en';
import { localizedPath, type Locale } from '@/lib/i18n/routing';
import { ArtworkMedia } from './artwork-media';
import { useCollectionMotion } from './collection-motion';
import { CollectionPreview, excerptRange, getCollectionPreviewFilm } from './collection-preview';
import { ArtworkTransition } from './artwork-transition';
import { PLATE_SIZES } from './artwork-media';
import { useSplitHead } from './split-head';
import styles from './plate-sequence.module.css';

export { useCompactWall } from './compact-wall';

/** The caption beneath a sheet in a row of two or three: 44 px, and the 9 px it rises from. */
export const SHEET_CAPTION_PX = 53;
/**
 * The eye line, as the stylesheet hangs it (plate-sequence.module.css): a sheet's top margin
 * puts its measured centre at `eye` of the band, clamped so the sheet never leaves the top
 * and its caption never leaves the bottom. When the band cannot hold the sheet and its
 * caption at all, the sheet hangs from the top, as CSS clamp() resolves a crossed range.
 */
export function hangOffset(
  centreY: number,
  bandHeight: number,
  sheetHeight: number,
  eye = 0.5,
): number {
  const upper = bandHeight - sheetHeight - SHEET_CAPTION_PX;
  return Math.max(0, Math.min(upper, bandHeight * eye - centreY * sheetHeight));
}

/**
 * What a card plays under the lease, always a hash-verified clip. Ink: on a desk the settling
 * clip, the film's own final eight seconds, which ends on the still; on a phone's budget the
 * 8 s excerpt. Light: its settling clip everywhere, since at under 400 KB it is lighter than
 * Ink's excerpt. Light moves as Ink does (third-physics-phase-d.md §2).
 */
export function sequenceFilm(
  media: ArtInterpretation | undefined,
  compact: boolean,
): ArtFilm | undefined {
  if (media?.id === 'light') return media.settlingFilm;
  if (media?.id !== 'ink') return undefined;
  const excerpt = getCollectionPreviewFilm(media);
  return compact ? excerpt : (media.settlingFilm ?? excerpt);
}

export type { Hanging };
/** The order the leaves hang in: Ink on the left, Light on the right, as the gatefold opens. */
const LEAVES: readonly Expression[] = ['ink', 'light'];

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

/**
 * A 48 px strip between cycles: the cycle, how many works it imprinted, and when. Across the
 * seam the cycle and its count stand on the paper leaf and the date on the night leaf.
 */
export function ChapterStrip({
  cycle,
  summary,
  locale,
  t,
  paired = false,
}: {
  cycle: number;
  summary?: CycleSummary;
  locale: Locale;
  t: Messages;
  paired?: boolean;
}) {
  const date = summary?.mintedAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
        new Date(summary.mintedAt),
      )
    : undefined;
  if (paired)
    return (
      <h2 className={`${styles.pairRow} ${styles.pairChapter}`} data-cycle={cycle}>
        <span className={styles.leaf} data-ground="paper">
          <span>
            {t.cycle} {cycle}
          </span>
          {summary ? (
            <span className={styles.chapterCount}>
              {summary.count === 1 ? t.oneWork : fill(t.worksCount, { count: summary.count })}
            </span>
          ) : null}
        </span>
        <span className={styles.leaf} data-ground="night">
          {date && summary?.mintedAt ? (
            <time dateTime={summary.mintedAt} className={styles.chapterDate}>
              {fill(t.imprintedOn, { date })}
            </time>
          ) : null}
        </span>
      </h2>
    );
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
  expression = 'both',
  animated = false,
  eagerFirstRow = false,
  chapters = 'none',
  cycles = [],
  rhythm = RHYTHM,
}: {
  works: Artwork[];
  locale: Locale;
  t: Messages;
  /**
   * What every card shows: one expression (a work without it falls back to what it has), or
   * `both`, each work's Ink and Light side by side across the seam.
   */
  expression?: Hanging;
  animated?: boolean;
  eagerFirstRow?: boolean;
  chapters?: Chapters;
  cycles?: CycleSummary[];
  rhythm?: readonly Shape[];
}) {
  const [intentId, setIntentId] = useState<number | null>(null);
  const compact = useCompactWall();
  const paired = expression === 'both';
  const leaves = useMemo<readonly Expression[]>(
    () => (expression === 'both' ? LEAVES : [expression]),
    [expression],
  );
  const rows = useMemo(() => sequenceRows(works, rhythm, chapters), [works, rhythm, chapters]);
  // A work moves under the lease when one of its hung expressions has a verified clip, never in
  // a row of three stills. Across the seam a work is one unit: its two halves settle together.
  const previewIds = useMemo(
    () =>
      rows.flatMap((row) =>
        row.shape === 3
          ? []
          : row.works
              .filter((work) =>
                leaves.some((leaf) => sequenceFilm(cardMedia(work, leaf, paired), compact)),
              )
              .map((work) => work.id),
      ),
    [rows, compact, paired, leaves],
  );
  const { gridRef, activeId, intent, clearIntent, fail, rest } = useCollectionMotion({
    enabled: animated,
    ids: previewIds,
  });
  useSplitHead(gridRef, paired);
  // A pair rests once each of its moving halves has played to its still, within one lease: when
  // the lease moves on, the halves that ended before it did are forgotten.
  const endings = useRef(new Map<number, Set<string>>());
  useEffect(() => {
    endings.current.clear();
  }, [activeId]);
  const ended = (work: Artwork, leaf: string, moving: number) => {
    const done = endings.current.get(work.id) ?? new Set<string>();
    done.add(leaf);
    endings.current.set(work.id, done);
    if (done.size < moving) return;
    endings.current.delete(work.id);
    rest(work.id);
  };
  const summaries = useMemo(() => new Map(cycles.map((cycle) => [cycle.cycle, cycle])), [cycles]);
  // The index of each row's first work, so the first row's plates may load eagerly.
  const starts = useMemo(
    () =>
      rows.map((_, index) =>
        rows.slice(0, index).reduce((sum, earlier) => sum + earlier.works.length, 0),
      ),
    [rows],
  );

  /** One card: a work in one expression, with its numeral and, for a hand, its label. */
  function card(row: SequenceRow, work: Artwork, index: number, leaf: Expression): ReactNode {
    const media = cardMedia(work, leaf, paired);
    if (!media)
      return (
        <span key={work.id} className={`work-card ${styles.card} ${styles.unpublished}`}>
          <span className="art-placeholder" role="img" aria-label={workNumber(work.id)} />
          <span className={styles.caption}>
            <span className={styles.folio}>{workFolio(work.id)}</span>
            {leaf === 'ink' ? <span className={styles.notYet}>{t.noInkPublished}</span> : null}
          </span>
        </span>
      );
    const word = expressionWord(media, t);
    const alt = `${workNumber(work.id)} · ${word ?? ''}`.trim();
    const label = media.id === 'ink' ? t.ink : leaf === 'ink' ? t.lightOnly : t.light;
    // The plate opens on the expression the visitor chose by choosing this card.
    const href = localizedPath(
      locale,
      `/art/${work.id}?expression=${encodeURIComponent(media.id)}`,
    );
    const film = sequenceFilm(media, compact);
    const live = animated && row.shape !== 3;
    const active = live && activeId === work.id;
    const moving = paired
      ? LEAVES.filter((other) => sequenceFilm(cardMedia(work, other, true), compact)).length
      : 1;
    const eager = eagerFirstRow && index < 2;
    // The eye line: a sheet in a row of two or three hangs so its measured centre sits on the
    // band's line; the full plate already fills its band. A pair's halves share one line.
    const centre =
      !paired && row.shape !== 1
        ? getPlateGround(work.id, media.id, media.stillSha256)?.centre.y
        : undefined;
    const hang = centre !== undefined ? ({ '--centre-y': centre } as CSSProperties) : undefined;
    const plate = live ? (
      <CollectionPreview
        key={`${work.id}-${media.id}`}
        media={media}
        alt={alt}
        artworkId={work.id}
        film={film}
        sizes={paired ? PAIR_SIZES[row.shape] : SIZES[row.shape]}
        eager={eager}
        active={active && !!film}
        onFailure={(reason) => fail(work.id, reason)}
        onEnded={() => ended(work, media.id, moving)}
      />
    ) : (
      <ArtworkMedia
        key={`${work.id}-${media.id}`}
        media={media}
        alt={alt}
        artworkId={work.id}
        sizes={paired ? PAIR_SIZES[row.shape] : SIZES[row.shape]}
        still
        thumbnail
        eager={eager}
      />
    );
    return (
      <Link
        key={`${work.id}-${media.id}`}
        className={`work-card ${styles.card}`}
        href={href}
        style={hang}
        prefetch={live ? active || intentId === work.id : undefined}
        aria-label={alt}
        data-preview-id={work.id}
        data-expression={media.id}
        data-preview-available={live && !!film}
        data-motion={active && film ? 'active' : 'still'}
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
        {live ? (
          <ArtworkTransition artworkId={work.id} interpretationId={media.id} role="preview">
            {plate}
          </ArtworkTransition>
        ) : (
          plate
        )}
        <span className={styles.caption} aria-hidden="true">
          <span className={!paired && row.shape === 1 ? 'hanging-numeral' : styles.folio}>
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
  }

  return (
    <div
      className={`work-grid ${styles.sequence} ${paired ? styles.paired : ''}`}
      ref={gridRef}
      data-hanging={expression}
    >
      {rows.map((row, rowIndex) => {
        const first = starts[rowIndex];
        const chapter =
          row.chapter !== undefined ? (
            <ChapterStrip
              cycle={row.chapter}
              summary={summaries.get(row.chapter)}
              locale={locale}
              t={t}
              paired={paired}
            />
          ) : null;
        if (paired)
          return (
            <Fragment key={rowIndex}>
              {chapter}
              <div className={styles.pairRow} data-shape={row.shape}>
                {LEAVES.map((leaf) => (
                  <div
                    key={leaf}
                    className={styles.leaf}
                    data-ground={leaf === 'ink' ? 'paper' : 'night'}
                  >
                    {row.works.map((work, offset) => card(row, work, first + offset, leaf))}
                  </div>
                ))}
              </div>
            </Fragment>
          );
        const plateMedia =
          row.shape === 1 && row.works[0] ? cardMedia(row.works[0], leaves[0], false) : undefined;
        // A full-bleed plate takes its whole band from the sheet's own measured tone; a Light
        // plate takes the field's black, so neither ever shows an edge against the wall.
        const ground = plateMedia
          ? (getPlateGround(row.works[0].id, plateMedia.id, plateMedia.stillSha256)?.tone ??
            (plateMedia.id === 'light' ? '#000000' : undefined))
          : undefined;
        return (
          <Fragment key={rowIndex}>
            {chapter}
            <div
              className={styles.row}
              data-shape={row.shape}
              data-material={plateMedia?.id}
              style={ground ? ({ '--plate-ground': ground } as CSSProperties) : undefined}
            >
              {row.works.map((work, offset) => card(row, work, first + offset, leaves[0]))}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

/** The still ladder's layout width for each shape when the leaves halve the wall. */
const PAIR_SIZES: Record<Shape, string> = {
  1: '(max-width: 767px) 50vw, 46vw',
  2: '(max-width: 767px) 50vw, 23vw',
  3: '(max-width: 767px) 50vw, 15vw',
};

/**
 * The interpretation a card shows. On its own ground a work without the asked expression shows
 * what it has; across the seam each leaf shows its own expression or nothing, so a pair's
 * halves never show the same plate twice.
 */
function cardMedia(
  work: Artwork,
  leaf: Expression,
  paired: boolean,
): ArtInterpretation | undefined {
  if (paired) return getInterpretation(work, leaf);
  return getInterpretation(work, leaf) ?? getInterpretation(work, twinOf(leaf)) ?? work.media[0];
}
