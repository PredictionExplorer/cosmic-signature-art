import Image from 'next/image';
import type { ReactNode } from 'react';
import type { Artwork } from '@/lib/art/types';
import type { Messages } from '@/lib/i18n/en';
import type { Locale } from '@/lib/i18n/routing';
import { NFT_ADDRESS } from '@/lib/site';
import { workNumber } from '@/lib/art/number';
import styles from './artwork-record.module.css';

export function RecordRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function ChainAddress({ address, compact = false }: { address: string; compact?: boolean }) {
  return (
    <a
      href={`https://arbiscan.io/address/${address}`}
      target="_blank"
      rel="noreferrer"
      aria-label={address}
    >
      <code>{compact ? `${address.slice(0, 6)}…${address.slice(-4)}` : address}</code>
    </a>
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

export function ArtworkIdentity({
  work,
  locale,
  t,
}: {
  work: Artwork;
  locale: Locale;
  t: Messages;
}) {
  const named = work.title !== `Signature ${work.id}`;
  return (
    <section id="record" className={styles.record} aria-labelledby="record-title">
      <header className={styles.heading}>
        <p className="eyebrow">
          {t.workRecord} / {workNumber(work.id)}
        </p>
        <h2 id="record-title">{t.provenanceTitle}</h2>
        <p>{t.provenanceIntro}</p>
      </header>
      {work.provenance.source === 'curated-fallback' ? (
        <p className="notice">{t.preservedRecord}</p>
      ) : null}
      <div className={styles.identity}>
        <div className={styles.origin}>
          <p className="eyebrow">{t.origin}</p>
          {work.mintedAt ? (
            <p className={styles.originDate}>
              <RecordDate value={work.mintedAt} locale={locale} />
            </p>
          ) : null}
          <p className={styles.chain}>{t.onChain}</p>
          {work.provenance.mintTransactionHash ? (
            <a
              className="text-link"
              href={`https://arbiscan.io/tx/${work.provenance.mintTransactionHash}`}
              target="_blank"
              rel="noreferrer"
            >
              {t.transaction} ↗
            </a>
          ) : null}
        </div>
        <dl className={styles.facts}>
          <RecordRow label={t.token}>
            <span className={styles.number}>{workNumber(work.id)}</span>
          </RecordRow>
          {named ? (
            <RecordRow label={t.currentName}>
              <bdi>{work.title}</bdi>
            </RecordRow>
          ) : null}
          {work.cycle !== undefined ? (
            <RecordRow label={t.cycle}>
              {new Intl.NumberFormat(locale).format(work.cycle)}
            </RecordRow>
          ) : null}
          {work.originalRecipient ? (
            <RecordRow label={t.originalRecipient}>
              <ChainAddress address={work.originalRecipient} />
            </RecordRow>
          ) : null}
          {work.owner ? (
            <RecordRow label={t.indexedOwner}>
              <ChainAddress address={work.owner} />
              <p className={styles.note}>{t.indexedNote}</p>
            </RecordRow>
          ) : null}
          {work.anchoring?.active ? (
            <RecordRow label={t.anchoringActive}>
              {work.anchoring.participant ? (
                <>
                  <span className={styles.note}>{t.anchoringParticipant}</span>
                  <br />
                  <ChainAddress address={work.anchoring.participant} />
                </>
              ) : (
                t.anchoringActive
              )}
            </RecordRow>
          ) : null}
          <RecordRow label={t.collectionContract}>
            <a
              href={`https://arbiscan.io/token/${NFT_ADDRESS}?a=${work.id}`}
              target="_blank"
              rel="noreferrer"
            >
              {t.viewChain} ↗
            </a>
          </RecordRow>
          {work.seed ? (
            <RecordRow label={t.seed}>
              <code>{work.seed}</code>
            </RecordRow>
          ) : null}
        </dl>
      </div>
    </section>
  );
}

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
  return (
    <section className={styles.sources} aria-labelledby="sources-title">
      <header className={styles.sectionHeading}>
        <div>
          <p className="eyebrow">{t.allExpressions}</p>
          <h2 id="sources-title">{t.sources}</h2>
        </div>
        <p>{t.expressionRecordCopy}</p>
      </header>
      <div className={styles.editions}>
        {work.media.map((media) => (
          <article className={styles.edition} key={media.id}>
            {media.still ? (
              <Image
                src={media.thumbnail ?? media.still}
                alt={`${t.signature} ${work.id} · ${media.id === 'ink' ? t.ink : media.id === 'light' ? t.light : media.label}`}
                width={media.width ?? 3456}
                height={media.height ?? 2234}
                unoptimized
              />
            ) : null}
            <div>
              <h3>{media.id === 'ink' ? t.ink : media.id === 'light' ? t.light : media.label}</h3>
              {media.width && media.height ? (
                <p className={styles.note}>
                  {number.format(media.width)} × {number.format(media.height)} px
                </p>
              ) : null}
              <ul>
                {media.sourceUrl ? (
                  <li>
                    <a href={media.sourceUrl} target="_blank" rel="noreferrer">
                      {t.originalStill} ↗
                    </a>
                  </li>
                ) : null}
                {media.master ? (
                  <li>
                    <a href={media.master} target="_blank" rel="noreferrer">
                      {t.masterFile} ↗
                    </a>
                  </li>
                ) : null}
                {media.films.map((film) => (
                  <li key={film.variantKey}>
                    <a href={film.sourceUrl ?? film.src} target="_blank" rel="noreferrer">
                      {film.id === 'medium'
                        ? t.longStudy
                        : film.id === 'slow'
                          ? t.extendedStudy
                          : t.originalFilm}
                      {film.durationSeconds ? ` · ${number.format(film.durationSeconds)} s` : ''} ↗
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        ))}
        {!work.media.length ? <p className={styles.note}>{t.noMediaFiles}</p> : null}
      </div>
      <details className={styles.sourceLinks}>
        <summary>
          {t.sourcesCopy}
          <span aria-hidden="true">+</span>
        </summary>
        <div>
          {work.provenance.metadataUrl ? (
            <a href={work.provenance.metadataUrl} target="_blank" rel="noreferrer">
              {t.metadataRecord} ↗
            </a>
          ) : null}
          {work.provenance.manifestUrl ? (
            <a href={work.provenance.manifestUrl} target="_blank" rel="noreferrer">
              {t.mediaManifest} ↗
            </a>
          ) : null}
          <a href={work.provenance.recordUrl} target="_blank" rel="noreferrer">
            {t.indexedRecord} ↗
          </a>
        </div>
      </details>
    </section>
  );
}
