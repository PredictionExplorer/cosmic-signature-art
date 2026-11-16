import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Locale } from '@/lib/i18n/routing';
import type { Messages } from '@/lib/i18n/en';
import { isLocale, localizedPath } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { words } from '@/lib/i18n/words';
import { metadata } from '@/lib/site';
import { getArtwork, getArtworkDetails } from '@/lib/art/server';
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
import { getInterpretation, isExpression, type Artwork, type ArtworkResult } from '@/lib/art/types';
import { heldWork, type HeldWork } from '@/lib/art/held';
import { artworkSharingImage } from '@/lib/art/sharing';
import { ArtworkViewer } from '@/components/artwork-viewer';
import { ARTWORK_VIEWER_WORDS } from '@/components/artwork-viewer.words';
import type { Neighbour, Neighbours } from '@/components/artwork-neighbours';
import type { HistoryQuery } from '@/components/artwork-history';
import { ArtworkEntry, HeldEntry } from '@/components/artwork-entry';
import { WaitingRoom } from '@/components/waiting-room';
import { STREAMED } from '@/lib/without-script';
import { OrbitScore } from '@/components/orbit-score';
import { Overture } from '@/components/overture';
import { showWorkOf } from '@/lib/art/first-light-work';
import { workOrbit } from '@/lib/art/orbit-records';
import { workDescription, workLine } from '@/lib/art/work-description';
import { filmOrbit } from '@/lib/art/orbit-windows';
import { orbitPlate } from '@/lib/art/orbit-plate';
import { artworkViewParams } from '@/lib/art/view';
import { knownExpressions, openingExpression, openingOn } from '@/lib/art/opening';
import { expressionOfTheDay } from '@/lib/art/work-of-the-day';

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
    // The venue's own line for this work, in this language: never the token's English text
    // (src/lib/art/work-description.ts).
    workDescription(tokenId, t, locale),
    indexedWork(tokenId) ? null : artworkSharingImage(artwork, `${workNumber(tokenId)} · ${t.ink}`),
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

type PageProps = {
  tokenId: number;
  locale: Locale;
  t: Messages;
  query: HistoryQuery;
  initialExpression: string | undefined;
};

/**
 * A work's page is sent whole wherever the venue holds the work itself: the plate, the orbit
 * and the entry are set at once from the registry or the build-time index (src/lib/art/held.ts),
 * outside any Suspense boundary, and the live record streams after them. The work and its words
 * are then in the first bytes of the page, in their places, with or without script: React sets
 * the content of a boundary aside in a hidden segment that only script can put in place
 * (src/lib/without-script.ts), so nothing a reader came for may wait inside one.
 */
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
  const requestedExpression = artworkViewParams(query).get('expression') ?? undefined;
  const indexed = indexedWork(tokenId);
  const registry = getCuratedArtwork(tokenId);
  // Only an expression the registry or the index publishes may shape the opening; anything
  // else is dropped here, so the plate still opens from the venue's own bytes.
  const published = knownExpressions(registry, indexed);
  const initialExpression =
    requestedExpression && (!indexed && !registry ? true : published(requestedExpression))
      ? requestedExpression
      : undefined;
  // The plate opens on the request's expression, else the day's (src/lib/art/opening.ts), and
  // paints at once from the copy the venue holds of it.
  const opening = initialExpression ?? openingExpression(published) ?? expressionOfTheDay();
  const held = heldWork(registry, indexed, opening);
  const live = getArtwork(tokenId);
  const page: PageProps = { tokenId, locale, t, query, initialExpression };
  if (held) return <WorkPage {...page} work={held.artwork} held={held} live={live} />;
  // Nothing is held of a work imprinted since the index was read: its record must arrive
  // before its page can exist. The page keeps a plate's place for it meanwhile.
  return (
    <Suspense fallback={<WaitingRoom />}>
      <AwaitedWorkPage {...page} live={live} />
    </Suspense>
  );
}

/** The page of a work the venue holds nothing of, once the indexer has answered. */
async function AwaitedWorkPage({ live, ...page }: PageProps & { live: Promise<ArtworkResult> }) {
  const settled = await live;
  if (settled.status === 'not-found') notFound();
  if (!settled.artwork)
    return (
      <main id="main" className="section-wrap empty-state" {...STREAMED}>
        <h1>{page.t.recordUnavailable}</h1>
        <Link href={localizedPath(page.locale, '/collection')} className="text-link">
          {page.t.backAtlas}
        </Link>
      </main>
    );
  return <WorkPage {...page} work={settled.artwork} settled={settled} />;
}

/**
 * The page itself. A held work is handed its copy and the promise of the live record; a work
 * that waited for its record is handed the record, settled.
 */
function WorkPage({
  tokenId,
  locale,
  t,
  query,
  initialExpression,
  work,
  held,
  live,
  settled,
}: PageProps & {
  work: Artwork;
  held?: HeldWork;
  live?: Promise<ArtworkResult>;
  settled?: ArtworkResult;
}) {
  const indexed = indexedWork(tokenId);
  const expression = openingOn(work, initialExpression);
  // Both grounds paint from the HTML: the Turn's twin is decoded before the key is honoured.
  const inlinePreviews = held?.curated
    ? {
        ink: inlineCuratedPreview(work.id, 'ink'),
        light: inlineCuratedPreview(work.id, 'light'),
      }
    : undefined;
  // The orbit beneath the work, re-derived in the browser and checked against its record, and
  // drawn on the plate where its frame binds: over the still the page's plate shows.
  const orbit = workOrbit(tokenId);
  // The line under the still: what the record says of the three, each sentence said only where
  // it is true of this work (src/lib/art/fate-line.ts). The same under either expression, and
  // the same words the page's description is made of (src/lib/art/work-description.ts).
  const line = workLine(tokenId, t, locale);
  const both = !!getInterpretation(work, 'ink')?.still && !!getInterpretation(work, 'light')?.still;
  return (
    // A page that waited for its record arrives by the stream, and is shown where the stream
    // left it when no script can place it.
    <main
      id="main"
      className="work-page"
      data-opening-expression={expression}
      {...(settled ? STREAMED : {})}
    >
      <ArtworkViewer
        artwork={work}
        t={words(t, ARTWORK_VIEWER_WORDS)}
        locale={locale}
        initialStill={artworkViewParams(query).get('view') === 'still'}
        initialExpression={initialExpression}
        openingExpression={expression}
        inlinePreviews={inlinePreviews}
        live={live?.then((result) => result.artwork)}
        traits={{ structure: indexed?.traits.structure, underlay: indexed?.traits.underlay }}
        lines={line ? { ink: line, light: line } : undefined}
        neighbours={neighboursFor(tokenId)}
        afterTheFrame={!!orbit}
        orbit={filmOrbit(tokenId)}
      />
      {/* First Light, when this work is the page a first visit opens on: a shared link (§16). */}
      <Overture work={showWorkOf(work)} skip={t.firstLightSkip} />
      {/* The orbit section is the one part still handed the whole catalog: its words are not
          listed yet (PENDING in src/lib/i18n/client-boundary.test.ts). */}
      {orbit ? (
        <OrbitScore
          key={tokenId}
          orbit={orbit}
          t={t}
          locale={locale}
          plate={orbitPlate(work)}
          opening={expression && isExpression(expression) ? expression : undefined}
          both={both}
        />
      ) : null}
      <div className="section-wrap">
        {settled ? (
          <ArtworkEntry result={settled} fallback={work} locale={locale} t={t} query={query} />
        ) : live ? (
          // The entry stands at once as the venue holds it, and the live record takes its
          // place when it arrives. With no script the held entry is the page's entry.
          <Suspense fallback={<HeldEntry work={work} locale={locale} t={t} />}>
            <StreamedRecord live={live} fallback={work} locale={locale} t={t} query={query} />
          </Suspense>
        ) : null}
      </div>
    </main>
  );
}

/**
 * The live entry, handed on only once its characteristics have been read too. The entry reads
 * them itself, behind a boundary of its own, and React's cache makes that the same read; having
 * it finished here means the live entry arrives whole. Otherwise it could take the held entry's
 * place while still opening, and a reader would watch the entry's words go and come back.
 *
 * A work the indexer says was never imprinted is refused here, whatever the index holds: only
 * the indexer can say that. The plate has been sent by then, so the refusal comes by the
 * stream, and the venue's not-found takes the page's place, marked noindex.
 */
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
  const result = await live;
  if (result.status === 'not-found') notFound();
  const work = result.artwork ?? props.fallback;
  await getArtworkDetails(work.id, work.seed);
  return <ArtworkEntry result={result} {...props} />;
}
