'use client';
import Link from 'next/link';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { readBatch } from '@/lib/auction/client';
import {
  chainStateLine,
  entryLine,
  lotExpression,
  type LotTraitsById,
} from '@/lib/auction/catalogue';
import { getPlateGround } from '@/lib/art/plate-records';
import { workNumber } from '@/lib/art/number';
import { getInterpretation, type Artwork, type ArtworkResult } from '@/lib/art/types';
import { fill } from '@/lib/i18n/format';
import type { Messages } from '@/lib/i18n/en';
import { localizedPath, type Locale } from '@/lib/i18n/routing';
import { useCollectionMotion } from './collection-motion';
import { ArtworkMedia } from './artwork-media';
import { ArtworkTransition } from './artwork-transition';
import { Plate } from './plate';
import { setPlateTone } from './room-ground';
import { YourActivity } from './your-activity';
import styles from './auction-gallery.module.css';

/** Input right after pressing Sit is the press itself, not a request for the chrome back. */
const SIT_GRACE_MS = 600;
/** A record older than this is not shown as a price; the freshness clock below is the venue's one besides the contract's countdown. */
const STALE_MS = 25000;

type Batch = Awaited<ReturnType<typeof readBatch>>;
type AuctionGalleryProps = {
  locale: Locale;
  t: Messages;
  /** The entry words the collection index lends each lot, read on the server. */
  traits?: LotTraitsById;
  /** The curated archive's works, read on the server, so a lot paints before its record arrives. */
  curated?: Record<number, Artwork>;
};

/**
 * The sale as a bound catalogue: eight full-bleed plates in lot order, alternating Ink on
 * paper and Light on black, each with its hanging lot numeral, its entry and one quiet line
 * of chain state straight from the record. One projector moves across the lots: a work's
 * settling clip, the final eight seconds of its film that end on the still, plays under the
 * lease one plate at a time. Prices refresh on their own clock; media never delays them.
 */
export default function AuctionGallery({ locale, t, traits, curated }: AuctionGalleryProps) {
  const [page, setPage] = useState(0);
  const [snapshot, setSnapshot] = useState<{
    page: number;
    value: Batch;
    fetchedAt: number;
  } | null>(null);
  const [failedPage, setFailedPage] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [works, setWorks] = useState<Record<number, Artwork>>({});
  const [activity, setActivity] = useState(false);
  const activityTrigger = useRef<HTMLButtonElement>(null);
  const result = snapshot?.page === page ? snapshot.value : null;
  const unavailable = failedPage === page || !!(result && now - snapshot!.fetchedAt > STALE_MS);
  const mediaIds = result?.ids.join(',') ?? '';

  useEffect(() => {
    let live = true;
    let reading = false;
    async function refresh() {
      if (!live || reading || document.hidden) return;
      reading = true;
      try {
        const value = await readBatch(page);
        if (live) {
          setSnapshot({ page, value, fetchedAt: Date.now() });
          setFailedPage(null);
        }
      } catch {
        if (live) setFailedPage(page);
      } finally {
        reading = false;
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 12000);
    const visible = () => void refresh();
    window.addEventListener('focus', visible);
    document.addEventListener('visibilitychange', visible);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener('focus', visible);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [page]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!mediaIds) return;
    let live = true;
    const abort = new AbortController();
    const ids = mediaIds.split(',').map(Number);
    async function loadMedia() {
      // Media has its own lifecycle: polling prices must not restart these requests.
      // Missing pictures never remove a lot or delay a financial refresh.
      for (let start = 0; start < ids.length && live; start += 4) {
        await Promise.all(
          ids.slice(start, start + 4).map(async (id) => {
            try {
              const response = await fetch(`/api/art/${id}`, {
                signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]),
              });
              if (!response.ok) return;
              const data: ArtworkResult = await response.json();
              if (
                live &&
                data.status === 'found' &&
                data.artwork?.id === id &&
                Array.isArray(data.artwork.media) &&
                data.artwork.media.every(
                  (media) => media && typeof media.id === 'string' && Array.isArray(media.films),
                )
              )
                setWorks((previous) => ({ ...previous, [id]: data.artwork! }));
            } catch {
              /* The lot link and on-chain bidding remain available without media. */
            }
          }),
        );
      }
    }
    void loadMedia();
    return () => {
      live = false;
      abort.abort();
    };
  }, [mediaIds]);

  return (
    <section className={styles.catalogue} aria-label={t.browseLots}>
      <nav className={styles.order} aria-label={t.orderOfSale}>
        <span className={styles.orderLabel}>{t.orderOfSale}</span>
        <ol className={styles.numerals}>
          {result?.ids.map((id, index) => (
            <li key={id}>
              <a href={`#lot-${index + 1}`} title={fill(t.lotNumeral, { n: index + 1 })}>
                {workNumber(id)}
              </a>
            </li>
          ))}
        </ol>
        <div className={styles.pager}>
          <button
            type="button"
            ref={activityTrigger}
            className={styles.pagerWord}
            onClick={() => setActivity(true)}
          >
            {t.yourActivity}
          </button>
          <button
            type="button"
            className={styles.pagerWord}
            disabled={page === 0}
            onClick={() => setPage((value) => value - 1)}
          >
            {t.newer}
          </button>
          <button
            type="button"
            className={styles.pagerWord}
            disabled={!result || BigInt(page + 1) >= result.count}
            onClick={() => setPage((value) => value + 1)}
          >
            {t.older}
          </button>
        </div>
      </nav>
      {unavailable ? (
        <p className={`notice ${styles.notice}`} role="status">
          {t.liveUnavailable}
        </p>
      ) : null}
      {!result && !unavailable ? (
        <p className={`notice ${styles.notice}`} aria-busy="true">
          {t.refresh}…
        </p>
      ) : result ? (
        <>
          {result.ids.length === 0 ? (
            <p className={`notice ${styles.notice}`}>{t.noWorks}</p>
          ) : null}
          <Lots
            result={result}
            works={works}
            curated={curated}
            traits={traits}
            locale={locale}
            t={t}
            unavailable={unavailable}
          />
        </>
      ) : null}
      <YourActivity
        open={activity}
        onClose={() => setActivity(false)}
        returnFocusRef={activityTrigger}
        locale={locale}
        t={t}
        page={page}
      />
    </section>
  );
}

/** The paper and night a lot's band is set in, from the plate's own measured tone. */
function lotTone(id: number, media: Artwork['media'][number] | undefined) {
  const ground = media ? getPlateGround(id, media.id, media.stillSha256) : undefined;
  if (ground)
    return { tone: ground.tone, material: media!.id === 'light' ? 'night' : 'paper' } as const;
  return media?.id === 'light'
    ? ({ tone: '#000000', material: 'night' } as const)
    : ({ tone: '#f1ebdf', material: 'paper' } as const);
}

// The one-second freshness clock does not need to rerender the artwork surfaces.
const Lots = memo(function Lots({
  result,
  works,
  curated,
  traits,
  locale,
  t,
  unavailable,
}: {
  result: Batch;
  works: Record<number, Artwork>;
  curated?: Record<number, Artwork>;
  traits?: LotTraitsById;
  locale: Locale;
  t: Messages;
  unavailable: boolean;
}) {
  const [intentId, setIntentId] = useState<number | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [sitting, setSitting] = useState<number | null>(null);
  const satAt = useRef(0);
  const entries = useMemo(
    () =>
      result.ids.map((id, index) => {
        const work = works[id] ?? curated?.[id];
        const wanted = lotExpression(index);
        const media = work
          ? (getInterpretation(work, wanted) ??
            getInterpretation(work, wanted === 'ink' ? 'light' : 'ink') ??
            work.media[0])
          : undefined;
        return {
          id,
          index,
          media,
          settling: media?.settlingFilm,
          lot: result.lots.find((item) => item.tokenId === id)?.lot,
        };
      }),
    [result, works, curated],
  );
  const settlingIds = useMemo(
    () => entries.filter(({ settling }) => settling).map(({ id }) => id),
    [entries],
  );
  const { gridRef, activeId, intent, clearIntent, fail, rest } = useCollectionMotion({
    enabled: true,
    ids: settlingIds,
  });

  // The running head borrows the ground of whichever lot's band sits beneath it.
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    let pending = false;
    const measure = () => {
      pending = false;
      const head = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--head'),
      );
      const line = (Number.isFinite(head) ? head : 48) + 1;
      let found: { id: number; media: Artwork['media'][number] | undefined } | null = null;
      for (const node of grid.querySelectorAll<HTMLElement>('[data-lot-id]')) {
        const rect = node.getBoundingClientRect();
        if (rect.top <= line && rect.bottom > line) {
          const id = Number(node.dataset.lotId);
          found = { id, media: entries.find((entry) => entry.id === id)?.media };
          break;
        }
      }
      if (found) {
        const { tone, material } = lotTone(found.id, found.media);
        setPlateTone(tone, material);
      } else setPlateTone(null);
    };
    let frame = 0;
    const schedule = () => {
      if (pending) return;
      pending = true;
      frame = requestAnimationFrame(measure);
    };
    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      setPlateTone(null);
    };
  }, [entries, gridRef]);

  // Sit fades the lot's chrome and the running head; any input after the press brings them back.
  useEffect(() => {
    const element = document.documentElement;
    if (sitting === null) {
      element.removeAttribute('data-sit');
      return;
    }
    element.setAttribute('data-sit', '');
    const wake = () => {
      if (Date.now() - satAt.current < SIT_GRACE_MS) return;
      setSitting(null);
    };
    const options = { passive: true } as const;
    window.addEventListener('pointermove', wake, options);
    window.addEventListener('pointerdown', wake, options);
    window.addEventListener('touchstart', wake, options);
    window.addEventListener('keydown', wake);
    return () => {
      element.removeAttribute('data-sit');
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('touchstart', wake);
      window.removeEventListener('keydown', wake);
    };
  }, [sitting]);

  return (
    <div className={styles.lots} ref={gridRef}>
      {entries.map(({ id, index, media, settling, lot }) => {
        const active = activeId === id;
        const expression = media?.id ?? lotExpression(index);
        const word = expression === 'ink' ? t.ink : expression === 'light' ? t.light : media?.label;
        const alt = `${workNumber(id)} · ${word ?? ''}`.trim();
        const state = lot && !unavailable ? chainStateLine(lot, result.blockTime, t, locale) : null;
        const entry = entryLine(traits?.[id]);
        const href = localizedPath(
          locale,
          `/auctions/${id}${expression === 'light' ? '?expression=light' : ''}`,
        );
        const plate = (
          <ArtworkMedia
            key={`${id}-${expression}`}
            media={media ? { ...media, films: settling ? [settling] : [] } : undefined}
            alt={alt}
            artworkId={id}
            eager={index === 0}
            priority={index === 0}
            hold
            ambient={active}
            onEnded={() => rest(id)}
            onFailure={() => fail(id, 'media')}
            onPlaybackChange={(playing) =>
              setPlayingId((previous) => (playing ? id : previous === id ? null : previous))
            }
          />
        );
        return (
          <article
            key={id}
            id={`lot-${index + 1}`}
            className={styles.lot}
            aria-label={`${fill(t.lotNumeral, { n: index + 1 })} · ${workNumber(id)}`}
            data-lot-id={id}
            data-expression={expression}
            data-preview-id={id}
            data-preview-available={!!settling}
            data-motion={active ? 'active' : 'still'}
            data-sit={sitting === id ? '' : undefined}
            onPointerEnter={(event) => {
              intent(id, 'pointer', event.pointerType);
              if (event.pointerType !== 'touch') setIntentId(id);
            }}
            onPointerLeave={() => clearIntent(id, 'pointer')}
            onFocus={() => {
              intent(id, 'focus');
              setIntentId(id);
            }}
            onBlur={() => clearIntent(id, 'focus')}
          >
            <Plate id={id} media={media} current={false} strip={false} className={styles.plate}>
              {media ? (
                <ArtworkTransition artworkId={id} interpretationId={media.id} role="preview">
                  {plate}
                </ArtworkTransition>
              ) : (
                plate
              )}
            </Plate>
            <div className={`strip ${styles.strip}`}>
              <span className={`hanging-numeral ${styles.numeral}`}>
                {fill(t.lotNumeral, { n: index + 1 })}
              </span>
              <p className={styles.centre}>
                {workNumber(id)}
                {word ? ` · ${word}` : ''}
                {entry ? ` · ${entry}` : ''}
              </p>
              <div className={`strip-words ${styles.words}`}>
                <span
                  className={`live-dot ${playingId === id ? 'is-live' : ''}`}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  aria-pressed={sitting === id}
                  onClick={() => {
                    satAt.current = Date.now();
                    setSitting(id);
                  }}
                >
                  {t.sit}
                </button>
                <Link href={href} prefetch={active || intentId === id}>
                  {t.collect}
                </Link>
              </div>
            </div>
            <div className={styles.entry}>
              <p className={styles.entryText}>
                <Link href={href} className={styles.entryLink}>
                  {workNumber(id)}
                </Link>
                {traits?.[id]?.cycle !== undefined ? ` · ${t.cycle} ${traits[id].cycle}` : ''}
                {entry ? ` · ${entry}` : ''}
                {traits?.[id]?.fate ? ` · ${traits[id].fate}` : ''}
              </p>
              <div className={styles.lines}>
                {state ? (
                  <p className={styles.chain} data-phase={state.phase}>
                    {state.line}
                  </p>
                ) : null}
                {!media ? <p className={styles.chain}>{t.mediaNotPublished}</p> : null}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
});
