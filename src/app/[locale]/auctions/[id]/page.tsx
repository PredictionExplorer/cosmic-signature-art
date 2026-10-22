import Link from 'next/link';
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
  const t = messages(locale);
  return metadata(
    locale,
    `/auctions/${id}`,
    `${t.signature} ${id} · ${t.auctions}`,
    t.auctionIntro,
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
  const { artwork } = await getArtwork(tokenId);
  return (
    <main id="main" className="section-wrap">
      <div className="work-breadcrumb">
        <Link href={localizedPath(locale, '/auctions')}>← {t.auctions}</Link>
      </div>
      <div className="page-heading">
        <p className="eyebrow">{t.auctionKicker}</p>
        <h1>
          {t.signature} {id}
        </h1>
      </div>
      {artwork ? (
        <ArtworkViewer artwork={artwork} t={t} />
      ) : (
        <p className="notice">{t.mediaUnavailable}</p>
      )}
      {auctionConfigured ? (
        <AuctionPanel locale={locale} tokenId={tokenId} t={t} />
      ) : (
        <p className="notice">{t.auctionNotLive}</p>
      )}
    </main>
  );
}
