'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatEther } from 'viem';
import { auctionPhase, MINIMUM_BID } from '@/lib/auction/rules';
import { readBatch } from '@/lib/auction/client';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { getInterpretation, type Artwork, type ArtworkResult } from '@/lib/art/types';
import { ArtworkMedia } from './artwork-media';
import { localizedPath, type Locale } from '@/lib/i18n/routing';
import type { Messages } from '@/lib/i18n/en';
export default function AuctionGallery({ locale, t }: { locale: Locale; t: Messages }) {
  const [page, setPage] = useState(0);
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
              if (live && data.artwork?.id === id)
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
    <section className="auction-live-gallery">
      <h2>{t.browseLots}</h2>
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
          <div className="work-grid">
            {result.ids.map((id) => {
              const work = works[id] ?? getCuratedArtwork(id);
              const lot = result.lots.find((item) => item.tokenId === id)?.lot;
              return (
                <Link
                  key={id}
                  href={localizedPath(locale, `/auctions/${id}`)}
                  className="work-card"
                >
                  <ArtworkMedia
                    key={work?.media.map((media) => media.still).join('|') ?? id}
                    media={work ? (getInterpretation(work, 'ink') ?? work.media[0]) : undefined}
                    alt={`${t.signature} ${id}`}
                    still
                  />
                  <div className="work-card-caption">
                    {t.signature} {id} <span>↗</span>
                  </div>
                  {lot && !unavailable ? (
                    <div className="auction-card-facts">
                      <span>{t[auctionPhase(lot, result.blockTime)]}</span>
                      <span>
                        {lot.highestBid === 0n ? `${t.minimum}: ` : ''}
                        {formatEther(lot.highestBid || MINIMUM_BID)} ETH
                      </span>
                    </div>
                  ) : null}
                </Link>
              );
            })}
          </div>
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
