import Link from 'next/link';
import { Suspense } from 'react';
import type { Locale } from '@/lib/i18n/routing';
import type { Messages } from '@/lib/i18n/en';
import { notFound } from 'next/navigation';
import { isLocale, localizedPath } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { metadata } from '@/lib/site';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { getCollection } from '@/lib/art/server';
import { Atlas } from '@/components/atlas';
import { WorkGrid } from '@/components/work-grid';
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = messages(locale);
  return metadata(locale, '/collection', t.collection, t.intro);
}
export default async function Collection({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ offset?: string; q?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = messages(locale);
  const search = await searchParams;
  const raw = Number(search.offset ?? 0);
  const offset = Number.isSafeInteger(raw) && raw >= 0 && raw <= 1_000_000 ? raw : 0;
  const query = typeof search.q === 'string' ? search.q.slice(0, 100) : undefined;
  return (
    <main id="main">
      <h1 className="sr-only">{t.atlas}</h1>
      {!query && offset === 0 ? (
        <Atlas
          works={[getCuratedArtwork(23)!, getCuratedArtwork(31)!, getCuratedArtwork(35)!]}
          locale={locale}
          t={t}
        />
      ) : null}
      <section id="works" className="collection-section section-wrap">
        <div className="collection-header">
          <h2>{t.allWorks}</h2>
          <form className="collection-search" action={localizedPath(locale, '/collection')}>
            <label>
              {t.search}
              <input
                name="q"
                placeholder={t.searchPlaceholder}
                defaultValue={query}
                maxLength={100}
              />
            </label>
            <button type="submit">{t.find} ↗</button>
          </form>
        </div>
        <Suspense
          key={`${offset}-${query ?? ''}`}
          fallback={
            <div
              className="collection-skeleton work-grid"
              aria-busy="true"
              aria-label={t.collection}
            >
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index}>
                  <div className="art-placeholder">∴</div>
                </div>
              ))}
            </div>
          }
        >
          <CollectionResults locale={locale} t={t} offset={offset} query={query} />
        </Suspense>
      </section>
    </main>
  );
}

async function CollectionResults({
  locale,
  t,
  offset,
  query,
}: {
  locale: Locale;
  t: Messages;
  offset: number;
  query?: string;
}) {
  const result = await getCollection({ offset, limit: 18, query, includeMedia: true });
  const url = (value: number) =>
    localizedPath(
      locale,
      `/collection?offset=${value}${query ? `&q=${encodeURIComponent(query)}` : ''}#works`,
    );
  return (
    <>
      {result.notice ? (
        <p className="notice" role="status">
          {result.notice === 'partial-records' ? t.partialRecords : t.unavailable}
        </p>
      ) : null}
      {result.items.length ? (
        <WorkGrid works={result.items} locale={locale} t={t} />
      ) : (
        <p className="notice">{t.noWorks}</p>
      )}
      <nav className="pagination" aria-label={t.collection}>
        {offset > 0 ? (
          <Link className="text-link" href={url(Math.max(0, offset - 18))}>
            ← {t.newer}
          </Link>
        ) : null}
        {result.hasMore && result.nextOffset !== null ? (
          <Link className="text-link" href={url(result.nextOffset)}>
            {t.older} →
          </Link>
        ) : null}
      </nav>
    </>
  );
}
