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
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const tokenId = parseArtworkId(id);
  if (tokenId === null) notFound();
  const t = messages(locale);
  return (
    <main id="main" className="section-wrap">
      <div className="work-breadcrumb">
        <Link href={localizedPath(locale, '/auctions')}>← {t.auctions}</Link>
      </div>
      <div className="page-heading">
        <p className="eyebrow">{t.auctionKicker}</p>
        <h1>
          {t.signature} {tokenId}
        </h1>
      </div>
      <Suspense
        fallback={
          <div className="auction-media-loading" aria-busy="true" aria-label={t.signature}>
            <span aria-hidden="true">∴</span>
          </div>
        }
      >
        <AuctionArtwork tokenId={tokenId} t={t} />
      </Suspense>
      {auctionConfigured ? (
        <AuctionPanel locale={locale} tokenId={tokenId} t={t} />
      ) : (
        <p className="notice">{t.auctionNotLive}</p>
      )}
    </main>
  );
}

async function AuctionArtwork({ tokenId, t }: { tokenId: number; t: Messages }) {
  const { artwork } = await getArtwork(tokenId);
  return artwork ? (
    <ArtworkViewer artwork={artwork} t={t} />
  ) : (
    <p className="notice">{t.mediaUnavailable}</p>
  );
}
