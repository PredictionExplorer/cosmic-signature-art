import type { ReactNode } from 'react';
import type { ArtFilm, ArtInterpretation, Artwork } from '@/lib/art/types';
import type { Messages } from '@/lib/i18n/en';
import type { Locale } from '@/lib/i18n/routing';
import { indexedAssetUrl, indexedWork, type IndexedWork } from '@/lib/art/collection-index';
import { CopyButton } from './copy-button';
import styles from './artwork-record.module.css';

export function RecordRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** `0x7406…6c6c` with the whole address in the accessible name; the full form when asked. */
export function compactAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function ChainAddress({
  address,
  compact = false,
  copy,
}: {
  address: string;
  compact?: boolean;
  /** Offer one word that copies the full address; the labels are the visitor's. */
  copy?: { label: string; copied: string };
}) {
  return (
    <span className={styles.address}>
      <a
        href={`https://arbiscan.io/address/${address}`}
        target="_blank"
        rel="noreferrer"
        aria-label={address}
        title={address}
      >
        <code>{compact ? compactAddress(address) : address}</code>
      </a>
      {copy ? (
        <CopyButton
          className={styles.copy}
          value={address}
          label={copy.label}
          copied={copy.copied}
        />
      ) : null}
    </span>
  );
}

export function RecordDate({ value, locale }: { value: string; locale: Locale }) {
  return (
    <time dateTime={value}>
      {new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
        new Date(value),
      )}
    </time>
  );
}

/** A date and time in UTC, the way the record states when it was read. */
export function recordTime(value: Date, locale: Locale) {
  return `${new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(value)} UTC`;
}

export function shortHash(hash: string) {
  return `${hash.slice(0, 4)}…${hash.slice(-4)}`;
}

function formatBytes(bytes: number, locale: Locale) {
  const megabytes = bytes / 1_000_000;
  return megabytes >= 1
    ? new Intl.NumberFormat(locale, {
        style: 'unit',
        unit: 'megabyte',
        maximumFractionDigits: 1,
      }).format(megabytes)
    : new Intl.NumberFormat(locale, {
        style: 'unit',
        unit: 'kilobyte',
        maximumFractionDigits: 0,
      }).format(bytes / 1000);
}

function fileFormat(url?: string) {
  const match = /\.([a-z0-9]+)(?:\?|#|$)/i.exec(url ?? '');
  if (!match) return undefined;
  const extension = match[1].toLowerCase();
  return extension === 'webp' ? 'WebP' : extension === 'mp4' ? 'MP4' : extension.toUpperCase();
}

/** A label as a line begins: the catalog keeps the sweep lowercase for use mid-sentence. */
export function sentenceCase(label: string, locale: Locale) {
  return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
}

export function filmLabel(film: ArtFilm, t: Messages) {
  return film.id === 'normal'
    ? t.film
    : film.id === 'medium'
      ? t.longStudy
      : film.id === 'slow'
        ? t.extendedStudy
        : film.id === 'sweep'
          ? t.spectralSweep
          : film.label;
}

const indexFilmIds: Record<string, string> = {
  normal: 'main',
  medium: 'medium',
  slow: 'slow',
  sweep: 'sweep',
};

/**
 * The index knows byte sizes and hashes the live manifest parser does not carry; they are
 * attached only when the index describes the same seed and the same published path.
 */
function indexedMedia(work: Artwork, media: ArtInterpretation): IndexedWork['media']['ink'] {
  const indexed = indexedWork(work.id);
  if (!indexed || !work.seed || indexed.seed !== work.seed) return undefined;
  return media.id === 'ink'
    ? indexed.media.ink
    : media.id === 'light'
      ? indexed.media.light
      : undefined;
}

function sameAsset(indexed: IndexedWork | undefined, path: string | undefined, url?: string) {
  return !!indexed && !!path && !!url && indexedAssetUrl(indexed, path) === url;
}

/**
 * Files by medium: the still, the master and every published film of each expression, with
 * dimensions, duration, size and hash where the publisher states them. Every link leaves the
 * venue, so every link carries the one outward arrow.
 */
export function ArtworkSources({
  work,
  locale,
  t,
}: {
  work: Artwork;
  locale: Locale;
  t: Messages;
}) {
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const indexed = indexedWork(work.id);
  const sameSeed = !!indexed && !!work.seed && indexed.seed === work.seed;
  const expressionName = (media: ArtInterpretation) =>
    media.id === 'ink' ? t.ink : media.id === 'light' ? t.light : media.label;
  const line = (parts: (string | undefined)[]) => parts.filter(Boolean).join(' · ');
  return (
    <section className={styles.sources} aria-labelledby="sources-title">
      <h2 id="sources-title" className={styles.sectionTitle}>
        {t.sources}
      </h2>
      <div className={styles.editions}>
        {work.media.map((media) => {
          const facts = indexedMedia(work, media);
          const stillBytes =
            sameSeed && sameAsset(indexed, facts?.still?.path, media.sourceUrl)
              ? facts?.still?.bytes
              : undefined;
          const stillHash =
            media.stillSha256 ??
            (sameSeed && sameAsset(indexed, facts?.still?.path, media.sourceUrl)
              ? facts?.still?.sha256
              : undefined);
          return (
            <article className={styles.edition} key={media.id}>
              <h3>{expressionName(media)}</h3>
              <ul>
                {media.sourceUrl ? (
                  <li>
                    <a href={media.sourceUrl} target="_blank" rel="noreferrer">
                      {line([
                        t.still,
                        fileFormat(media.sourceUrl),
                        media.width && media.height
                          ? `${number.format(media.width)} × ${number.format(media.height)} px`
                          : undefined,
                        stillBytes ? formatBytes(stillBytes, locale) : undefined,
                        stillHash ? `sha256 ${shortHash(stillHash)}` : undefined,
                      ])}{' '}
                      ↗
                    </a>
                  </li>
                ) : null}
                {media.master ? (
                  <li>
                    <a href={media.master} target="_blank" rel="noreferrer">
                      {line([t.masterFile, fileFormat(media.master)])} ↗
                    </a>
                  </li>
                ) : null}
                {media.films.map((film) => {
                  const indexedFilm = facts?.films[indexFilmIds[film.id] ?? film.id];
                  const href = film.sourceUrl ?? film.src;
                  const known = sameSeed && sameAsset(indexed, indexedFilm?.path, href);
                  const hash =
                    film.sourceSha256 ?? film.sha256 ?? (known ? indexedFilm?.sha256 : undefined);
                  return (
                    <li key={film.variantKey}>
                      <a href={href} target="_blank" rel="noreferrer">
                        {line([
                          sentenceCase(filmLabel(film, t), locale),
                          film.durationSeconds
                            ? `${number.format(Math.round(film.durationSeconds))} s`
                            : undefined,
                          known && indexedFilm?.bytes
                            ? formatBytes(indexedFilm.bytes, locale)
                            : undefined,
                          hash ? `sha256 ${shortHash(hash)}` : undefined,
                        ])}{' '}
                        ↗
                      </a>
                    </li>
                  );
                })}
              </ul>
            </article>
          );
        })}
        {!work.media.length ? <p className={styles.note}>{t.noMediaFiles}</p> : null}
      </div>
      <ul className={styles.records}>
        {work.provenance.metadataUrl ? (
          <li>
            <a href={work.provenance.metadataUrl} target="_blank" rel="noreferrer">
              {t.metadataRecord} ↗
            </a>
          </li>
        ) : null}
        {work.provenance.manifestUrl ? (
          <li>
            <a href={work.provenance.manifestUrl} target="_blank" rel="noreferrer">
              {t.mediaManifest} ↗
            </a>
          </li>
        ) : null}
        <li>
          <a href={work.provenance.recordUrl} target="_blank" rel="noreferrer">
            {t.indexedRecord} ↗
          </a>
        </li>
      </ul>
    </section>
  );
}
