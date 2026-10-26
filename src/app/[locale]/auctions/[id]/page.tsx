import Link from 'next/link';
import { Suspense } from 'react';
import type { Messages } from '@/lib/i18n/en';
import { artworkSharingImage } from '@/lib/art/sharing';
import { notFound } from 'next/navigation';
import { isLocale, localizedPath } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { getArtwork } from '@/lib/art/server';
import { parseArtworkId } from '@/lib/art/validation';
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
    `${t.signature} ${tokenId} · ${t.auctions}`,
    t.auctionIntro,
    artworkSharingImage(artwork, `${t.signature} ${tokenId}`),
  );
}
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
    <main id="main" className={`section-wrap ${styles.lotPage}`}>
      <div className="work-breadcrumb">
        <Link href={localizedPath(locale, '/auctions')}>← {t.auctions}</Link>
      </div>
      <header className={styles.lotHeading}>
        <p className="eyebrow">{t.auctionKicker}</p>
        <h1>
          {t.signature} {tokenId}
        </h1>
        <Link className="text-link" href={localizedPath(locale, `/art/${tokenId}#record`)}>
          {t.auctionViewRecord} ↗
        </Link>
      </header>
      <div className={styles.lotLayout}>
        <div className={styles.lotArtwork}>
          <Suspense
            fallback={
              <div className={styles.mediaLoading} aria-busy="true" aria-label={t.signature} />
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
        </div>
        <aside id="lot-actions" className={styles.bidRail} aria-label={t.auctionRoom}>
          {auctionConfigured ? (
            <>
              <AuctionPanel locale={locale} tokenId={tokenId} t={t} />
              <AuctionSummary locale={locale} t={t} />
            </>
          ) : (
            <AuctionAvailability locale={locale} t={t} />
          )}
        </aside>
      </div>
      <section className={styles.rules} aria-labelledby="rules-title">
        <header className={styles.rulesHeading}>
          <div>
            <p className="eyebrow">{t.auctionBeforeBid}</p>
            <h2 id="rules-title">{t.auctionRules}</h2>
          </div>
          <Link className="text-link" href={localizedPath(locale, '/terms')}>
            {t.auctionReadMore} ↗
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
  return artwork ? (
    <>
      <ArtworkViewer
        artwork={artwork}
        t={t}
        presentation="auction"
        initialStill={initialStill}
        initialExpression={initialExpression}
      />
      <div className={styles.artLabel}>
        <p>{t.workCopy}</p>
        <Link className="text-link" href={localizedPath(locale, `/art/${tokenId}#record`)}>
          {t.auctionViewRecord} ↗
        </Link>
      </div>
    </>
  ) : (
    <p className="notice">{t.mediaUnavailable}</p>
  );
}
