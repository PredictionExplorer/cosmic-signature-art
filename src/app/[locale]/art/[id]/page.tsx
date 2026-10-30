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
import {
  collectionIndex,
  indexedAssetUrl,
  indexedWork,
  spectralNeighbour,
} from '@/lib/art/collection-index';
import { inlineCuratedPreview } from '@/lib/art/inline-preview';
import { parseArtworkId } from '@/lib/art/validation';
import { workNumber } from '@/lib/art/number';
import type { Artwork, ArtworkResult } from '@/lib/art/types';
import { artworkSharingImage } from '@/lib/art/sharing';
import { ArtworkViewer } from '@/components/artwork-viewer';
import type { Neighbour, Neighbours } from '@/components/artwork-neighbours';
import type { HistoryQuery } from '@/components/artwork-history';
import { ArtworkEntry } from '@/components/artwork-entry';
import { OrbitScore } from '@/components/orbit-score';
import { workOrbit } from '@/lib/art/orbit-records';
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
  // The work's card is drawn beside this route (opengraph-image.tsx) from its own rung; the
  // configured still stands only for a work the index does not know.
  const { artwork } = indexedWork(tokenId) ? { artwork: null } : await getArtwork(tokenId);
  return metadata(
    locale,
    `/art/${tokenId}`,
    workNumber(tokenId),
    indexedWork(tokenId)?.description ?? t.statementLine,
    indexedWork(tokenId) ? null : artworkSharingImage(artwork, `${workNumber(tokenId)} · ${t.ink}`),
  );
}

/** The expression the plate opens on: the request's, else Ink, else the first published. */
function openingExpression(work: Artwork, requested?: string) {
  return (
    work.media.find((item) => item.id === requested)?.id ??
    (work.media.some((item) => item.id === 'ink') ? 'ink' : work.media[0]?.id)
  );
}

/** A neighbour's 640 px preview: the hash-verified local copy when there is one, else the publisher's. */
function neighbour(id: number | undefined): Neighbour | undefined {
  if (id === undefined) return undefined;
  const indexed = indexedWork(id);
  if (!indexed) return undefined;
  const curated = getCuratedArtwork(id);
  const localInk = curated?.media.find((item) => item.id === 'ink')?.thumbnail;
  const localLight = curated?.media.find((item) => item.id === 'light')?.thumbnail;
  const ink = localInk ?? indexedAssetUrl(indexed, indexed.media.ink?.preview?.path);
  const light = localLight ?? indexedAssetUrl(indexed, indexed.media.light?.preview?.path);
  return { id, preview: ink ?? light, expression: ink ? 'ink' : 'light' };
}

/** The works either side by number and the next star by wavelength. */
export function neighboursFor(tokenId: number): Neighbours {
  const ids = collectionIndex.works.map((work) => work.id);
  const before = ids.filter((id) => id < tokenId).at(-1);
  const after = ids.find((id) => id > tokenId);
  const redder = spectralNeighbour(tokenId, 'redder');
  const bluer = redder ? undefined : spectralNeighbour(tokenId, 'bluer');
  const star = redder ?? bluer;
  return {
    previous: neighbour(before),
    next: neighbour(after),
    spectral: star
      ? {
          id: star.work.id,
          deltaNm: Math.round(star.deltaNm),
          direction: redder ? 'redder' : 'bluer',
        }
      : undefined,
  };
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
  const requestedExpression = view.get('expression') ?? undefined;
  // A curated work paints at once from the identity-verified registry while its live
  // record streams, but only when the registry holds the expression the plate opens on:
  // Ink is the first encounter, and a registry with Light alone must not decide otherwise.
  // The record for any other work must arrive before the page can exist.
  const indexed = indexedWork(tokenId);
  const registry = getCuratedArtwork(tokenId);
  // Only an expression the registry or the index publishes may shape the opening; anything
  // else is dropped here, so the plate still opens on Ink from the registry's own bytes.
  const published = (expression: string) =>
    registry?.media.some((item) => item.id === expression) ||
    (expression === 'ink' && !!indexed?.media.ink) ||
    (expression === 'light' && !!indexed?.media.light);
  const initialExpression =
    requestedExpression && (!indexed && !registry ? true : published(requestedExpression))
      ? requestedExpression
      : undefined;
  const opening = initialExpression ?? (indexed?.media.ink || !indexed ? 'ink' : 'light');
  const curated = registry?.media.some((item) => item.id === opening && item.still)
    ? registry
    : undefined;
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
  // Both grounds paint from the HTML: the Turn's twin is decoded before the key is honoured.
  const inlinePreviews = curated
    ? {
        ink: inlineCuratedPreview(curated.id, 'ink'),
        light: inlineCuratedPreview(curated.id, 'light'),
      }
    : undefined;
  // The orbit beneath the work, re-derived in the browser and checked against its record.
  const orbit = workOrbit(tokenId);
  return (
    <main id="main" className="work-page" data-opening-expression={expression}>
      <ArtworkViewer
        artwork={work}
        t={t}
        locale={locale}
        initialStill={initialStill}
        initialExpression={initialExpression}
        inlinePreviews={inlinePreviews}
        live={curated ? live.then((result) => result.artwork) : undefined}
        traits={{ structure: indexed?.traits.structure, underlay: indexed?.traits.underlay }}
        neighbours={neighboursFor(tokenId)}
      />
      {orbit ? <OrbitScore key={tokenId} orbit={orbit} t={t} locale={locale} /> : null}
      <div className="section-wrap">
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
      </div>
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
