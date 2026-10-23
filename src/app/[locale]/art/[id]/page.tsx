import Image from 'next/image';
import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale, localizedPath } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { metadata, jsonLd, SITE_URL } from '@/lib/site';
import { getArtwork } from '@/lib/art/server';
import { parseArtworkId } from '@/lib/art/validation';
import { getInterpretation } from '@/lib/art/types';
import { artworkSharingImage } from '@/lib/art/sharing';
import { ArtworkViewer } from '@/components/artwork-viewer';
import { AuctionPanel } from '@/components/auction-panel';
import { ArtworkIdentity, ArtworkSources } from '@/components/artwork-record';
import { ArtworkHistorySection, type HistoryQuery } from '@/components/artwork-history';
import { ArtworkComposition } from '@/components/artwork-composition';
import recordStyles from '@/components/artwork-record.module.css';
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
    `/art/${tokenId}`,
    `${t.signature} ${tokenId}`,
    t.workCopy,
    artworkSharingImage(artwork, `${t.signature} ${tokenId}`),
  );
}
export default async function ArtworkPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<HistoryQuery>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const tokenId = parseArtworkId(id);
  if (tokenId === null) notFound();
  const result = await getArtwork(tokenId);
  if (result.status === 'not-found') notFound();
  const t = messages(locale);
  const work = result.artwork;
  if (!work)
    return (
      <main id="main" className="section-wrap empty-state">
        <h1>{t.recordUnavailable}</h1>
        <Link href={localizedPath(locale, '/collection')} className="text-link">
          {t.backAtlas} ↗
        </Link>
      </main>
    );
  const light = getInterpretation(work, 'light');
  const query = await searchParams;
  const initialStill = query.view === 'still';
  return (
    <main id="main" className="work-page section-wrap">
      <div className="work-breadcrumb">
        <Link href={localizedPath(locale, '/collection')}>← {t.backAtlas}</Link>
        <span className="eyebrow">{t.allWorks}</span>
      </div>
      <ArtworkViewer artwork={work} t={t} initialStill={initialStill} />
      <section className="work-caption">
        <div>
          <p className="eyebrow">COSMIC SIGNATURE / № {String(work.id).padStart(3, '0')}</p>
          <h1>
            {t.signature} {work.id}
          </h1>
        </div>
        <div>
          <p>{t.workCopy}</p>
          <a href="#record" className="text-link">
            {t.workRecord} ↗
          </a>
        </div>
      </section>
      {result.notice ? (
        <p className="notice">
          {result.notice === 'media-unavailable' ? t.mediaRecordUnavailable : t.recordUnavailable}
        </p>
      ) : null}
      <AuctionPanel locale={locale} tokenId={work.id} t={t} />
      <ArtworkIdentity work={work} locale={locale} t={t} />
      <Suspense
        fallback={
          <p className={recordStyles.loading} aria-busy="true">
            {t.recordLoading}
          </p>
        }
      >
        <ArtworkComposition work={work} locale={locale} t={t} />
      </Suspense>
      <Suspense
        key={`${work.id}-${query.transfers ?? ''}-${query.names ?? ''}`}
        fallback={
          <p className={recordStyles.loading} aria-busy="true">
            {t.recordLoading}
          </p>
        }
      >
        <ArtworkHistorySection tokenId={work.id} locale={locale} t={t} query={query} />
      </Suspense>
      <ArtworkSources work={work} locale={locale} t={t} />
      {light?.still ? (
        <section className={recordStyles.echoRoom}>
          <p className="eyebrow">{t.sameWork}</p>
          <Image
            src={light.still}
            alt={`${t.signature} ${work.id} · ${t.light}`}
            width={light.width ?? 3456}
            height={light.height ?? 2234}
            unoptimized
          />
          <h2>{t.echo}</h2>
        </section>
      ) : null}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            '@context': 'https://schema.org',
            '@type': 'VisualArtwork',
            name: `Cosmic Signature ${work.id}`,
            url: `${SITE_URL}${localizedPath(locale, `/art/${work.id}`)}`,
            image: getInterpretation(work, 'ink')?.still ?? light?.still,
            artform: 'Generative digital art',
            identifier: String(work.id),
          }),
        }}
      />
    </main>
  );
}
