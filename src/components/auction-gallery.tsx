'use client';
import Link from 'next/link';
import { memo, useEffect, useMemo, useState } from 'react';
import { formatEther } from 'viem';
import { auctionPhase, MINIMUM_BID } from '@/lib/auction/rules';
import { readBatch } from '@/lib/auction/client';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { workNumber } from '@/lib/art/number';
import { getInterpretation, type Artwork, type ArtworkResult } from '@/lib/art/types';
import { useCollectionMotion } from './collection-motion';
import { CollectionPreview, excerptRange, getCollectionPreviewFilm } from './collection-preview';
import { ArtworkTransition } from './artwork-transition';
import styles from './auction-gallery.module.css';
import { localizedPath, type Locale } from '@/lib/i18n/routing';
import type { Messages } from '@/lib/i18n/en';
export default function AuctionGallery({ locale, t }: { locale: Locale; t: Messages }) {
  const [page, setPage] = useState(0);
  const [mode, setMode] = useState<'ink' | 'light'>('ink');
  const [snapshot, setSnapshot] = useState<{
    page: number;
    value: Awaited<ReturnType<typeof readBatch>>;
    fetchedAt: number;
  } | null>(null);
  const [failedPage, setFailedPage] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [works, setWorks] = useState<Record<number, Artwork>>({});
  const result = snapshot?.page === page ? snapshot.value : null;
  const unavailable = failedPage === page || !!(result && now - snapshot!.fetchedAt > 25000);
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
    <section className={styles.gallery} aria-labelledby="auction-works-heading">
      <div className={styles.heading}>
        <h2 id="auction-works-heading">{t.browseLots}</h2>
        <div className="mode-switch" aria-label={t.ways}>
          {(['ink', 'light'] as const).map((value) => (
            <button key={value} onClick={() => setMode(value)} aria-pressed={mode === value}>
              {t[value]}
            </button>
          ))}
        </div>
      </div>
      {unavailable ? (
        <p className="notice" role="status">
          {t.liveUnavailable}
        </p>
      ) : null}
      {!result && !unavailable ? (
        <p className="notice" aria-busy="true">
          {t.refresh}…
        </p>
      ) : result ? (
        <>
          {result.ids.length === 0 ? <p className="notice">{t.noWorks}</p> : null}
          <AuctionLots
            result={result}
            works={works}
            mode={mode}
            locale={locale}
            t={t}
            unavailable={unavailable}
          />
        </>
      ) : null}
      <div className="pagination">
        <button disabled={page === 0} onClick={() => setPage((value) => value - 1)}>
          {t.newer}
        </button>
        <button
          disabled={!result || BigInt(page + 1) >= result.count}
          onClick={() => setPage((value) => value + 1)}
        >
          {t.older}
        </button>
      </div>
    </section>
  );
}

// The one-second freshness clock does not need to rerender the artwork surfaces.
const AuctionLots = memo(function AuctionLots({
  result,
  works,
  mode,
  locale,
  t,
  unavailable,
}: {
  result: Awaited<ReturnType<typeof readBatch>>;
  works: Record<number, Artwork>;
  mode: 'ink' | 'light';
  locale: Locale;
  t: Messages;
  unavailable: boolean;
}) {
  const [intentId, setIntentId] = useState<number | null>(null);
  const entries = useMemo(
    () =>
      result.ids.map((id) => {
        const work = works[id] ?? getCuratedArtwork(id);
        const media = work
          ? (getInterpretation(work, mode) ?? getInterpretation(work, 'light') ?? work.media[0])
          : undefined;
        return { id, media, lot: result.lots.find((item) => item.tokenId === id)?.lot };
      }),
    [result, works, mode],
  );
  const previewIds = useMemo(
    () => entries.filter(({ media }) => getCollectionPreviewFilm(media)).map(({ id }) => id),
    [entries],
  );
  const { gridRef, activeId, intent, clearIntent, fail, rest } = useCollectionMotion({
    enabled: mode === 'ink',
    ids: previewIds,
  });
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
        timeZoneName: 'short',
      }),
    [locale],
  );

  return (
    <div className={styles.grid} ref={gridRef}>
      {entries.map(({ id, media, lot }) => {
        const active = activeId === id;
        const timestamp = lot ? (lot.endAt > 0n ? lot.endAt : lot.eligibleAt) : 0n;
        // EVM uint values can exceed JavaScript's Date range. Such a value is not a date.
        const date =
          timestamp > 0n && timestamp <= 8_640_000_000_000n
            ? new Date(Number(timestamp) * 1000)
            : null;
        const plate = (
          <CollectionPreview
            media={media}
            alt={`${t.signature} ${id}`}
            active={active}
            artworkId={id}
            onEnded={() => rest(id)}
            onFailure={(reason) => fail(id, reason)}
          />
        );
        return (
          <Link
            key={id}
            className={styles.card}
            href={localizedPath(
              locale,
              `/auctions/${id}${media?.id === 'light' ? '?expression=light' : ''}`,
            )}
            prefetch={active || intentId === id}
            data-preview-id={id}
            data-preview-available={!!getCollectionPreviewFilm(media)}
            data-motion={active ? 'active' : 'still'}
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
            <div className={styles.plate}>
              {media ? (
                <ArtworkTransition artworkId={id} interpretationId={media.id} role="preview">
                  {plate}
                </ArtworkTransition>
              ) : (
                plate
              )}
            </div>
            <div className={styles.caption}>
              <h3>{workNumber(id)}</h3>
              {media ? (
                <span className={styles.expression}>
                  {media.id === 'ink' ? t.ink : mode === 'ink' ? t.lightOnly : t.light}
                  {active
                    ? ` / ${t.excerpt} ${excerptRange(getCollectionPreviewFilm(media)) ?? ''}`.trimEnd()
                    : ''}
                </span>
              ) : null}
            </div>
            {lot && !unavailable ? (
              <div className={styles.facts}>
                <div className={styles.bid}>
                  <span>{lot.highestBid === 0n ? t.openingBid : t.highest}</span>
                  <strong>{formatEther(lot.highestBid || MINIMUM_BID)} ETH</strong>
                </div>
                <div className={styles.phase}>
                  <span data-phase={auctionPhase(lot, result.blockTime)}>
                    {t[auctionPhase(lot, result.blockTime)]}
                  </span>
                  <span>
                    {t.cycle} {lot.roundNum.toString()}
                  </span>
                </div>
                {date ? (
                  <div className={styles.time}>
                    <span>{lot.endAt > 0n ? t.ends : t.eligible}</span>
                    <time dateTime={date.toISOString()}>{dateFormat.format(date)}</time>
                  </div>
                ) : null}
              </div>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
});
