import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Locale } from '@/lib/i18n/routing';
import type { Messages } from '@/lib/i18n/en';
import { isLocale, localizedPath } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { metadata } from '@/lib/site';
import { getArtwork } from '@/lib/art/server';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { inlineCuratedPreview } from '@/lib/art/inline-preview';
import { parseArtworkId } from '@/lib/art/validation';
import { workNumber } from '@/lib/art/number';
import type { Artwork, ArtworkResult } from '@/lib/art/types';
import { artworkSharingImage } from '@/lib/art/sharing';
import { ArtworkViewer } from '@/components/artwork-viewer';
import { AuctionPanel } from '@/components/auction-panel';
import type { HistoryQuery } from '@/components/artwork-history';
import { ArtworkEntry } from '@/components/artwork-entry';
import recordStyles from '@/components/artwork-record.module.css';
import { artworkViewParams } from '@/lib/art/view';
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

/** The expression the plate opens on: the request's, else Ink, else the first published. */
function openingExpression(work: Artwork, requested?: string) {
  return (
    work.media.find((item) => item.id === requested)?.id ??
    (work.media.some((item) => item.id === 'ink') ? 'ink' : work.media[0]?.id)
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
  const t = messages(locale);
  const query = await searchParams;
  const view = artworkViewParams(query);
  const initialStill = view.get('view') === 'still';
  const initialExpression = view.get('expression') ?? undefined;
  // A curated work paints at once from the identity-verified registry while its live
  // record streams; the record for any other work must arrive before the page can exist.
  const curated = getCuratedArtwork(tokenId);
  const live = getArtwork(tokenId);
  let work: Artwork | null = curated ?? null;
  let settled: ArtworkResult | null = null;
  if (!curated) {
    settled = await live;
    if (settled.status === 'not-found') notFound();
    work = settled.artwork;
  }
  if (!work)
    return (
      <main id="main" className="section-wrap empty-state">
        <h1>{t.recordUnavailable}</h1>
        <Link href={localizedPath(locale, '/collection')} className="text-link">
          {t.backAtlas}
        </Link>
      </main>
    );
  const expression = openingExpression(work, initialExpression);
  const inlinePreviews =
    curated && expression
      ? { [expression]: inlineCuratedPreview(curated.id, expression) }
      : undefined;
  return (
    <main id="main" className="work-page section-wrap">
      <div className="work-breadcrumb">
        <Link href={localizedPath(locale, '/collection')}>← {t.backAtlas}</Link>
        <span className="eyebrow">{t.allWorks}</span>
      </div>
      <ArtworkViewer
        artwork={work}
        t={t}
        initialStill={initialStill}
        initialExpression={initialExpression}
        inlinePreviews={inlinePreviews}
        live={curated ? live.then((result) => result.artwork) : undefined}
      />
      <section className="work-caption">
        <div>
          <p className="eyebrow">COSMIC SIGNATURE / {workNumber(work.id)}</p>
          <h1>
            {t.signature} {work.id}
          </h1>
        </div>
        <div>
          <p>{t.workCopy}</p>
          <a href="#record" className="text-link">
            {t.workRecord}
          </a>
        </div>
      </section>
      <AuctionPanel locale={locale} tokenId={work.id} t={t} />
      {settled ? (
        <ArtworkEntry result={settled} fallback={work} locale={locale} t={t} query={query} />
      ) : (
        <Suspense
          fallback={
            <p className={recordStyles.loading} aria-busy="true">
              {t.recordLoading}
            </p>
          }
        >
          <StreamedRecord live={live} fallback={work} locale={locale} t={t} query={query} />
        </Suspense>
      )}
    </main>
  );
}

async function StreamedRecord({
  live,
  ...props
}: {
  live: Promise<ArtworkResult>;
  fallback: Artwork;
  locale: Locale;
  t: Messages;
  query: HistoryQuery;
}) {
  return <ArtworkEntry result={await live} {...props} />;
}
