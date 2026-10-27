import Link from 'next/link';
import { artworkSharingImage } from '@/lib/art/sharing';
import { notFound } from 'next/navigation';
import { isLocale, localizedPath } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { getArtwork } from '@/lib/art/server';
import { indexedWork } from '@/lib/art/collection-index';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { inlineCuratedPreview } from '@/lib/art/inline-preview';
import type { Artwork } from '@/lib/art/types';
import { parseArtworkId } from '@/lib/art/validation';
import { workNumber } from '@/lib/art/number';
import { metadata } from '@/lib/site';
import { auctionConfigured } from '@/lib/auction/config';
import { AuctionPanel } from '@/components/auction-panel';
import { AuctionLot } from '@/components/auction-lot';
import { ArtworkViewer } from '@/components/artwork-viewer';
import { AuctionAvailability } from '@/components/auction-summary';
import { AuctionRules } from '@/components/auction-rules';
import { artworkViewParams, type ArtworkViewQuery } from '@/lib/art/view';
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
  const { artwork, status } = await getArtwork(tokenId);
  if (status === 'not-found') return {};
  return metadata(
    locale,
    `/auctions/${tokenId}`,
    `${workNumber(tokenId)} · ${t.auctions}`,
    t.auctionIntro,
    artworkSharingImage(artwork, `${workNumber(tokenId)} · ${t.ink}`),
  );
}
/**
 * The lot page is the artwork page with the lot strip beneath its plate: the chain's one
 * line, `Collect this work`, which opens the bid sheet, `Your activity`, and the bid history.
 * Nothing in the panel changes; while a collector reviews a bid the theatre hushes, and the
 * keys that move the venue are silent inside the strip and the sheets.
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
  const initialExpression = view.get('expression') ?? undefined;
  const indexed = indexedWork(tokenId);
  // A curated work paints at once from the registry while its live record streams, as on the
  // artwork page; any other token waits for the publisher, and one it reports as not found is
  // not a lot: no strip, no canonical record.
  const registry = getCuratedArtwork(tokenId);
  const opening = initialExpression ?? (indexed?.media.ink || !indexed ? 'ink' : 'light');
  const curated = registry?.media.some((item) => item.id === opening && item.still)
    ? registry
    : undefined;
  const live = getArtwork(tokenId);
  let artwork: Artwork | null = curated ?? null;
  if (!curated) {
    const settled = await live;
    if (settled.status === 'not-found') notFound();
    artwork = settled.artwork;
  }
  return (
    <main id="main" className={styles.lotPage}>
      {artwork ? (
        <ArtworkViewer
          artwork={artwork}
          t={t}
          locale={locale}
          presentation="auction"
          initialStill={view.get('view') === 'still'}
          initialExpression={initialExpression}
          inlinePreviews={
            curated
              ? {
                  ink: inlineCuratedPreview(curated.id, 'ink'),
                  light: inlineCuratedPreview(curated.id, 'light'),
                }
              : undefined
          }
          live={curated ? live.then((result) => result.artwork) : undefined}
          traits={{ structure: indexed?.traits.structure, underlay: indexed?.traits.underlay }}
        />
      ) : (
        <p className="notice section-wrap">{t.mediaUnavailable}</p>
      )}
      <section className={styles.lotStrip} aria-label={t.auctionRoom}>
        <div className={styles.lotIdentity}>
          <h1 className={`eyebrow ${styles.lotKicker}`}>
            {t.auctionKicker} · {workNumber(tokenId)}
          </h1>
          <Link className="text-link" href={localizedPath(locale, `/art/${tokenId}#record`)}>
            {t.auctionViewRecord}
          </Link>
        </div>
        {auctionConfigured ? (
          <AuctionLot
            tokenId={tokenId}
            t={t}
            locale={locale}
            panel={<AuctionPanel locale={locale} tokenId={tokenId} t={t} />}
          />
        ) : (
          <aside id="lot-actions" className={styles.bidRail} data-keys-suppressed="">
            <AuctionAvailability locale={locale} t={t} />
          </aside>
        )}
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
