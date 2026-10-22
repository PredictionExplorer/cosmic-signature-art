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
  const [result, setResult] = useState<Awaited<ReturnType<typeof readBatch>> | null>(null);
  const [error, setError] = useState(false);
  const [works, setWorks] = useState<Record<number, Artwork>>({});
  useEffect(() => {
    let live = true;
    const abort = new AbortController();
    readBatch(page)
      .then(async (value) => {
        if (live) {
          setResult(value);
          setError(false);
        }
        // Discovery is independent of the media service: missing pictures never remove a lot.
        for (let start = 0; start < value.ids.length && live; start += 4) {
          await Promise.all(
            value.ids.slice(start, start + 4).map(async (id) => {
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
      })
      .catch(() => {
        if (live) {
          setResult(null);
          setError(true);
        }
      });
    return () => {
      live = false;
      abort.abort();
    };
  }, [page]);
  return (
    <section className="auction-live-gallery">
      <h2>{t.browseLots}</h2>
      {error ? (
        <p className="notice">{t.liveUnavailable}</p>
      ) : !result ? (
        <p className="notice" aria-busy="true">
          {t.refresh}…
        </p>
      ) : (
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
                  {lot ? (
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
          <div className="pagination">
            <button disabled={page === 0} onClick={() => setPage((value) => value - 1)}>
              {t.newer}
            </button>
            <button
              disabled={BigInt(page + 1) >= result.count}
              onClick={() => setPage((value) => value + 1)}
            >
              {t.older}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
