import Link from 'next/link';
import { Suspense } from 'react';
import type { Messages } from '@/lib/i18n/en';
import { artworkSharingImage } from '@/lib/art/sharing';
import { notFound } from 'next/navigation';
import { isLocale, localizedPath } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { getArtwork } from '@/lib/art/server';
import { indexedWork } from '@/lib/art/collection-index';
import { parseArtworkId } from '@/lib/art/validation';
import { workNumber } from '@/lib/art/number';
import { metadata } from '@/lib/site';
import { auctionConfigured } from '@/lib/auction/config';
import { AuctionPanel } from '@/components/auction-panel';
import { ArtworkViewer } from '@/components/artwork-viewer';
import { AuctionAvailability, AuctionSummary } from '@/components/auction-summary';
import { AuctionRules } from '@/components/auction-rules';
import { artworkViewParams, type ArtworkViewQuery } from '@/lib/art/view';
import type { Locale } from '@/lib/i18n/routing';
import styles from '../auction-pages.module.css';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) return {};
  const tokenId = parseArtworkId(id);
  if (tokenId === null) return {};
  const t = messages(locale);
  const { artwork } = await getArtwork(tokenId);
  return metadata(
    locale,
    `/auctions/${tokenId}`,
    `${workNumber(tokenId)} · ${t.auctions}`,
    t.auctionIntro,
    artworkSharingImage(artwork, `${workNumber(tokenId)} · ${t.ink}`),
  );
}
/**
 * The lot page is the artwork page with the bid rail beneath its plate. Nothing in the
 * panel changes; while a collector reviews a bid the theatre hushes, and the keys that move
 * the venue are silent inside the rail.
 */
export default async function AuctionWork({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams?: Promise<ArtworkViewQuery>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const tokenId = parseArtworkId(id);
  if (tokenId === null) notFound();
  const t = messages(locale);
  const view = artworkViewParams(searchParams ? await searchParams : {});
  return (
    <main id="main" className={styles.lotPage}>
      <Suspense
        fallback={
          <div
            className={`loading-plate ${styles.lotLoading}`}
            role="img"
            aria-busy="true"
            aria-label={workNumber(tokenId)}
          />
        }
      >
        <AuctionArtwork
          tokenId={tokenId}
          t={t}
          locale={locale}
          initialStill={view.get('view') === 'still'}
          initialExpression={view.get('expression') ?? undefined}
        />
      </Suspense>
      <section className={styles.lotLayout} aria-label={t.auctionRoom}>
        <aside id="lot-actions" className={styles.bidRail} data-keys-suppressed="">
          <h1 className={`eyebrow ${styles.lotKicker}`}>
            {t.auctionKicker} · {workNumber(tokenId)}
          </h1>
          {auctionConfigured ? (
            <>
              <AuctionPanel locale={locale} tokenId={tokenId} t={t} />
              <AuctionSummary locale={locale} t={t} />
            </>
          ) : (
            <AuctionAvailability locale={locale} t={t} />
          )}
        </aside>
        <div className={styles.lotRecord}>
          <Link className="text-link" href={localizedPath(locale, `/art/${tokenId}#record`)}>
            {t.auctionViewRecord}
          </Link>
        </div>
      </section>
      <section className={`${styles.rules} section-wrap`} aria-labelledby="rules-title">
        <header className={styles.rulesHeading}>
          <div>
            <p className="eyebrow">{t.auctionBeforeBid}</p>
            <h2 id="rules-title">{t.auctionRules}</h2>
          </div>
          <Link className="text-link" href={localizedPath(locale, '/terms')}>
            {t.auctionReadMore}
          </Link>
        </header>
        <AuctionRules t={t} />
      </section>
    </main>
  );
}

async function AuctionArtwork({
  tokenId,
  t,
  locale,
  initialStill,
  initialExpression,
}: {
  tokenId: number;
  t: Messages;
  locale: Locale;
  initialStill: boolean;
  initialExpression?: string;
}) {
  const { artwork } = await getArtwork(tokenId);
  const indexed = indexedWork(tokenId);
  return artwork ? (
    <ArtworkViewer
      artwork={artwork}
      t={t}
      locale={locale}
      presentation="auction"
      initialStill={initialStill}
      initialExpression={initialExpression}
      traits={{ structure: indexed?.traits.structure, underlay: indexed?.traits.underlay }}
    />
  ) : (
    <p className="notice section-wrap">{t.mediaUnavailable}</p>
  );
}
