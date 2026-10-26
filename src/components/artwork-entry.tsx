import Image from 'next/image';
import { Suspense } from 'react';
import type { Locale } from '@/lib/i18n/routing';
import type { Messages } from '@/lib/i18n/en';
import { localizedPath } from '@/lib/i18n/routing';
import { jsonLd, SITE_URL, DEPLOYMENT_URL } from '@/lib/site';
import { getInterpretation, type Artwork, type ArtworkResult } from '@/lib/art/types';
import { ArtworkIdentity, ArtworkSources } from './artwork-record';
import { ArtworkHistorySection, type HistoryQuery } from './artwork-history';
import { ArtworkComposition } from './artwork-composition';
import recordStyles from './artwork-record.module.css';

/**
 * Everything beneath the plate: the entry, its glossary, the custody timeline, the files
 * by medium and the structured data, all from the live read so one page never shows two
 * renderings. The artwork page streams this once the record arrives.
 */
export function ArtworkEntry({
  result,
  fallback,
  locale,
  t,
  query,
}: {
  result: ArtworkResult;
  fallback: Artwork;
  locale: Locale;
  t: Messages;
  query: HistoryQuery;
}) {
  const work = result.artwork ?? fallback;
  const light = getInterpretation(work, 'light');
  const still = getInterpretation(work, 'ink')?.still ?? light?.still;
  return (
    <>
      {result.notice ? (
        <p className="notice">
          {result.notice === 'media-unavailable' ? t.mediaRecordUnavailable : t.recordUnavailable}
        </p>
      ) : null}
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
            image: still ? new URL(still, DEPLOYMENT_URL).href : undefined,
            artform: 'Generative digital art',
            identifier: String(work.id),
          }),
        }}
      />
    </>
  );
}
