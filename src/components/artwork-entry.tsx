import { Suspense, type ReactNode } from 'react';
import type { Locale } from '@/lib/i18n/routing';
import type { Messages } from '@/lib/i18n/en';
import { localizedPath } from '@/lib/i18n/routing';
import { fill } from '@/lib/i18n/format';
import { jsonLd, NFT_ADDRESS, SITE_URL, DEPLOYMENT_URL } from '@/lib/site';
import { getArtworkDetails } from '@/lib/art/server';
import { indexedWork } from '@/lib/art/collection-index';
import { detailsFromIndexedWork, type ArtworkDetails } from '@/lib/art/details-validation';
import { workFolio, workNumber } from '@/lib/art/number';
import { getInterpretation, type Artwork, type ArtworkResult } from '@/lib/art/types';
import { ArtworkSources, ChainAddress, RecordDate, filmLabel, recordTime } from './artwork-record';
import { ArtworkHistorySection, type HistoryQuery } from './artwork-history';
import recordStyles from './artwork-record.module.css';
import styles from './artwork-entry.module.css';

/**
 * Everything beneath the plate: the entry with its footnoted glossary, the Verify-on-chain
 * drawer, the custody timeline and the files by medium, all from the live read so one page
 * never shows two renderings. The artwork page streams this once the record arrives.
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
  return (
    <article id="record" className={styles.entry} aria-label={t.entry}>
      {result.notice ? (
        <p className={`notice ${styles.notice}`}>
          {result.notice === 'media-unavailable' ? t.mediaRecordUnavailable : t.recordUnavailable}
        </p>
      ) : null}
      <Suspense
        fallback={
          <p className={recordStyles.loading} aria-busy="true">
            {t.recordLoading}
          </p>
        }
      >
        <EntryBody work={work} locale={locale} t={t} />
      </Suspense>
      <section className={styles.provenance} aria-labelledby="provenance-title">
        <h2 id="provenance-title" className={recordStyles.sectionTitle}>
          {t.provenanceTitle}
        </h2>
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
      </section>
      <ArtworkSources work={work} locale={locale} t={t} />
    </article>
  );
}

/**
 * The live metadata read is the source. When it is unavailable, the build-time index stands in
 * for the identical seed only; a pending record (metadata without rendering traits) stays bare.
 */
export async function EntryBody({
  work,
  locale,
  t,
}: {
  work: Artwork;
  locale: Locale;
  t: Messages;
}) {
  const live = await getArtworkDetails(work.id, work.seed);
  const indexed = indexedWork(work.id);
  const fromIndex =
    live.status === 'unavailable' && indexed && work.seed && indexed.seed === work.seed
      ? detailsFromIndexedWork(indexed)
      : null;
  return (
    <EntryView
      work={work}
      details={live.details ?? fromIndex}
      unavailable={live.status === 'unavailable' && !fromIndex}
      recordAt={work.provenance.source === 'live' ? new Date() : null}
      locale={locale}
      t={t}
    />
  );
}

type Note = { key: string; text: string };

function Mark({ n, t }: { n: number; t: Messages }) {
  return (
    <sup className={styles.mark}>
      <a href={`#note-${n}`} aria-label={fill(t.footnote, { n })}>
        {n}
      </a>
    </sup>
  );
}

function Separator() {
  return <span className={styles.separator}> · </span>;
}

/** The entry as typeset text: generated per work, every fact the publisher's own. */
export function EntryView({
  work,
  details,
  unavailable = false,
  recordAt,
  locale,
  t,
}: {
  work: Artwork;
  details: ArtworkDetails | null;
  /** The live read failed and no index record stood in; the entry says so once. */
  unavailable?: boolean;
  /** When the live record was read; null for a preserved record, which states its own date. */
  recordAt: Date | null;
  locale: Locale;
  t: Messages;
}) {
  const nf = new Intl.NumberFormat(locale);
  const nf1 = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const nf3 = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 });
  const ink = getInterpretation(work, 'ink');
  const light = getInterpretation(work, 'light');
  const frame = ink ?? light;
  const folio = workFolio(work.id);
  const named = work.title !== `Signature ${work.id}`;
  const cycle = work.cycle ?? details?.round;
  const imprinted = details?.imprintedAt ?? work.mintedAt;
  const copy = { label: t.copyAddress, copied: t.copied };

  // The glossary is numbered in the order its words appear; Signature and expression lead.
  const notes: Note[] = [
    { key: 'signature', text: t.glossarySignature },
    { key: 'expression', text: t.glossaryExpression },
  ];
  const note = (key: string, text: string) => {
    if (!notes.some((entry) => entry.key === key)) notes.push({ key, text });
    return notes.findIndex((entry) => entry.key === key) + 1;
  };
  // The selection line sits above the entry, so its Borda note is numbered before the traits.
  const bordaNote = details?.borda ? note('borda', t.glossaryBorda) : 0;
  const underlayNote = details?.underlay ? note('underlay', t.glossaryUnderlay) : 0;
  const spectralNote = details?.spectralClass ? note('spectralClass', t.glossarySpectralClass) : 0;
  const wavelengthNote =
    details?.wavelengthNm !== undefined ? note('wavelength', t.glossaryWavelength) : 0;
  const chaosNote = details?.chaos !== undefined ? note('chaos', t.glossaryChaos) : 0;
  const syzygyNote = details?.syzygies !== undefined ? note('syzygies', t.glossarySyzygies) : 0;
  const massesNote = details?.masses ? note('masses', t.glossaryMasses) : 0;
  const eccentricityNote =
    details?.eccentricity !== undefined ? note('eccentricity', t.glossaryEccentricity) : 0;

  const filmDurations = (frame?.films ?? [])
    .filter((film) => film.id !== 'sweep' && film.durationSeconds)
    .map((film) => `${nf.format(Math.round(film.durationSeconds!))} s`);
  const sweep = light?.films.find((film) => film.id === 'sweep');
  const traits: ReactNode[] = [];
  if (details?.structure) traits.push(<bdi key="structure">{details.structure}</bdi>);
  if (details?.underlay)
    traits.push(
      <span key="underlay">
        <bdi>{details.underlay}</bdi>
        <Mark n={underlayNote} t={t} />
      </span>,
    );
  if (details?.palette) traits.push(<bdi key="palette">{details.palette}</bdi>);
  if (details?.spectralClass)
    traits.push(
      <span key="spectral">
        {t.spectralClass} <bdi>{details.spectralClass}</bdi>
        <Mark n={spectralNote} t={t} />
        {details.wavelengthNm !== undefined ? (
          <>
            , <span className="numeral">{nf.format(details.wavelengthNm)} nm</span>
            <Mark n={wavelengthNote} t={t} />
          </>
        ) : null}
      </span>,
    );
  else if (details?.wavelengthNm !== undefined)
    traits.push(
      <span key="wavelength">
        <span className="numeral">{nf.format(details.wavelengthNm)} nm</span>
        <Mark n={wavelengthNote} t={t} />
      </span>,
    );
  if (details?.massBalance) traits.push(<bdi key="mass">{details.massBalance}</bdi>);
  if (details?.chaos !== undefined)
    traits.push(
      <span key="chaos">
        {t.chaos} <span className="numeral">{nf.format(details.chaos)} / 100</span>
        <Mark n={chaosNote} t={t} />
      </span>,
    );
  if (details?.syzygies !== undefined)
    traits.push(
      <span key="syzygies">
        {t.syzygies} <span className="numeral">{nf.format(details.syzygies)}</span>
        <Mark n={syzygyNote} t={t} />
      </span>,
    );
  if (details?.wildcard) traits.push(<span key="wildcard">{t.wildcard}</span>);
  if (details?.allocation) traits.push(<bdi key="allocation">{details.allocation}</bdi>);

  const measures: [string, ReactNode][] = [];
  if (details?.masses)
    measures.push([
      `${t.masses}`,
      <>
        {details.masses.map((mass) => nf1.format(mass)).join(' : ')}
        <Mark n={massesNote} t={t} />
      </>,
    ]);
  if (details?.hueDegrees)
    measures.push([t.bodyHues, details.hueDegrees.map((hue) => `${nf1.format(hue)}°`).join(' · ')]);
  if (details?.eccentricity !== undefined)
    measures.push([
      t.eccentricity,
      <>
        {nf3.format(details.eccentricity)}
        <Mark n={eccentricityNote} t={t} />
      </>,
    ]);
  if (details?.integrator) measures.push([t.integrator, <bdi key="i">{details.integrator}</bdi>]);
  if (details?.simulationSteps !== undefined)
    measures.push([t.simulationSteps, nf.format(details.simulationSteps)]);
  if (details?.braidCrossings !== undefined)
    measures.push([t.braidCrossings, nf.format(details.braidCrossings)]);

  const borda = details?.borda;
  const bordaWeights =
    borda &&
    borda.chaosWeight !== undefined &&
    borda.equilibriumWeight !== undefined &&
    borda.aestheticScore !== undefined &&
    borda.selectionScore !== undefined
      ? fill(t.bordaNote, {
          chaos: nf3.format(borda.chaosWeight),
          equilibrium: nf3.format(borda.equilibriumWeight),
          aesthetic: nf3.format(borda.aestheticScore),
          score: nf3.format(borda.selectionScore),
        })
      : undefined;

  const stillHashes = work.media
    .filter((media) => media.stillSha256)
    .map((media) => ({
      label: `${media.id === 'ink' ? t.ink : media.id === 'light' ? t.light : media.label} · ${t.still}`,
      hash: media.stillSha256!,
    }));
  const filmHashes = work.media.flatMap((media) =>
    media.films
      .filter((film) => film.sourceSha256 ?? film.sha256)
      .map((film) => ({
        label: `${media.id === 'ink' ? t.ink : media.id === 'light' ? t.light : media.label} · ${filmLabel(film, t)}`,
        hash: (film.sourceSha256 ?? film.sha256)!,
      })),
  );
  // The custody line: who received the work, who holds it, and when the record was read.
  const custody: ReactNode[] = [];
  if (work.originalRecipient)
    custody.push(
      <>
        {t.mintedTo} <ChainAddress address={work.originalRecipient} compact copy={copy} />
      </>,
    );
  if (work.owner)
    custody.push(
      <>
        {t.heldBy} <ChainAddress address={work.owner} compact copy={copy} />
      </>,
    );
  if (work.anchoring?.active)
    custody.push(
      <>
        {t.anchoringActive}
        {work.anchoring.participant ? (
          <>
            {' '}
            (<ChainAddress address={work.anchoring.participant} compact copy={copy} />)
          </>
        ) : null}
      </>,
    );
  if (recordAt) custody.push(fill(t.recordAsOf, { date: recordTime(recordAt, locale) }));
  else if (work.provenance.checkedOn) {
    // The placeholder leads in some locales (ja, ko): the template is split around it, never trimmed.
    const [before, after] = t.recordAsOf.split('{date}');
    custody.push(
      <>
        {before}
        <RecordDate value={work.provenance.checkedOn} locale={locale} />
        {after}
      </>,
    );
  }
  const structured = {
    '@context': 'https://schema.org',
    '@type': 'VisualArtwork',
    name: workNumber(work.id),
    alternateName: `Cosmic Signature ${folio}`,
    url: `${SITE_URL}${localizedPath(locale, `/art/${work.id}`)}`,
    image: frame?.still ? new URL(frame.still, DEPLOYMENT_URL).href : undefined,
    artform: 'Generative digital art',
    artMedium: 'Generative three-body simulation rendered as light and as ink',
    artworkSurface: ink ? 'kozo paper ground' : undefined,
    identifier: String(work.id),
    creator: { '@type': 'Organization', name: 'Cosmic Signature' },
    dateCreated: imprinted?.slice(0, 10),
    description: details?.description,
    isPartOf: {
      '@type': 'Collection',
      name: 'Cosmic Signature',
      url: `${SITE_URL}${localizedPath(locale, '/collection')}`,
    },
  };

  return (
    <div className={styles.body}>
      <p className={`entry-numeral ${styles.numeral}`} aria-hidden="true">
        {folio}
      </p>
      {borda ? (
        <>
          <p className={`chapter ${styles.selection}`}>
            {fill(t.selectionLine, {
              total: nf.format(borda.totalCandidates),
              index: nf.format(borda.selectedIndex),
            })}
          </p>
          <p className={styles.borda}>
            {bordaWeights ?? t.selection}
            <Mark n={bordaNote} t={t} />
          </p>
        </>
      ) : null}
      <div className={styles.lines}>
        {work.provenance.source === 'curated-fallback' ? (
          <p className="notice">{t.preservedRecord}</p>
        ) : null}
        {unavailable ? <p className="notice">{t.detailsUnavailable}</p> : null}
        <h1 id="entry-title" className={styles.title}>
          {t.signature} {folio}
          {details?.fate ? (
            <>
              {' — '}
              <bdi>{details.fate}</bdi>
            </>
          ) : null}
        </h1>
        {named ? (
          <p className={styles.name}>
            <bdi>{work.title}</bdi>
          </p>
        ) : null}
        {cycle !== undefined || imprinted ? (
          <p>
            {cycle !== undefined ? (
              <>
                {t.cycle} <span className="numeral">{nf.format(cycle)}</span>
              </>
            ) : null}
            {cycle !== undefined && imprinted ? <Separator /> : null}
            {imprinted ? <RecordDate value={imprinted} locale={locale} /> : null}
          </p>
        ) : null}
        <p>
          {t.threeBodyOrbit}
          <Mark n={1} t={t} />
          {ink ? ` ${t.inkMedium}` : ''}
          {light ? ` ${t.lightMedium}` : ''}
          {ink || light ? <Mark n={2} t={t} /> : null}
        </p>
        {frame?.width && frame.height ? (
          <p>
            <span className="numeral">
              {nf.format(frame.width)} × {nf.format(frame.height)} px
            </span>
            {filmDurations.length ? (
              <>
                <Separator />
                {t.filmsWord} <span className="numeral">{filmDurations.join(', ')}</span>
              </>
            ) : null}
            {sweep?.durationSeconds ? (
              <>
                <Separator />
                {t.spectralSweep}{' '}
                <span className="numeral">{nf.format(Math.round(sweep.durationSeconds))} s</span>
              </>
            ) : null}
          </p>
        ) : null}
        {traits.length ? (
          <p className={styles.traits}>
            {traits.map((trait, index) => (
              <span key={index}>
                {index > 0 ? <Separator /> : null}
                {trait}
              </span>
            ))}
          </p>
        ) : null}
        <p className={styles.custody}>
          {custody.map((segment, index) => (
            <span key={index}>
              {segment}
              {index < custody.length - 1 ? <Separator /> : null}
            </span>
          ))}
        </p>
        {work.seed ? (
          <p>
            {t.seedShort}{' '}
            <code title={work.seed}>{`${work.seed.slice(0, 6)}…${work.seed.slice(-4)}`}</code>
          </p>
        ) : null}
      </div>
      {measures.length ? (
        <dl className={styles.measures}>
          {measures.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <aside className={styles.notes} aria-label={t.glossary}>
        <ol role="list">
          {notes.map((entry, index) => (
            <li key={entry.key} id={`note-${index + 1}`}>
              <span className={styles.noteNumber} aria-hidden="true">
                {index + 1}
              </span>
              <span>{entry.text}</span>
            </li>
          ))}
        </ol>
      </aside>
      <details className={styles.verify}>
        <summary>
          <span>{t.verifyOnChain}</span>
          <span aria-hidden="true">+</span>
        </summary>
        <dl className={styles.proofs}>
          <div>
            <dt>{t.token}</dt>
            <dd>
              <a
                href={`https://arbiscan.io/token/${NFT_ADDRESS}?a=${work.id}`}
                target="_blank"
                rel="noreferrer"
              >
                {workNumber(work.id)} · {t.viewChain} ↗
              </a>
            </dd>
          </div>
          {work.provenance.mintTransactionHash ? (
            <div>
              <dt>{t.transaction}</dt>
              <dd>
                <a
                  href={`https://arbiscan.io/tx/${work.provenance.mintTransactionHash}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${t.transaction} ${work.provenance.mintTransactionHash}`}
                >
                  <code>{work.provenance.mintTransactionHash}</code> ↗
                </a>
              </dd>
            </div>
          ) : null}
          {work.originalRecipient ? (
            <div>
              <dt>{t.originalRecipient}</dt>
              <dd>
                <ChainAddress address={work.originalRecipient} copy={copy} />
              </dd>
            </div>
          ) : null}
          {work.owner ? (
            <div>
              <dt>{t.indexedOwner}</dt>
              <dd>
                <ChainAddress address={work.owner} copy={copy} />
                <p className={recordStyles.note}>{t.indexedNote}</p>
              </dd>
            </div>
          ) : null}
          {work.anchoring?.participant ? (
            <div>
              <dt>{t.anchoringParticipant}</dt>
              <dd>
                <ChainAddress address={work.anchoring.participant} copy={copy} />
              </dd>
            </div>
          ) : null}
          {work.seed ? (
            <div>
              <dt>{t.seed}</dt>
              <dd>
                <code>{work.seed}</code>
              </dd>
            </div>
          ) : null}
          {[...stillHashes, ...filmHashes].map((proof) => (
            <div key={`${proof.label}-${proof.hash}`}>
              <dt>{proof.label} · sha256</dt>
              <dd>
                <code>{proof.hash}</code>
              </dd>
            </div>
          ))}
        </dl>
        <p className={recordStyles.note}>{t.honestyRecord}</p>
        <p className={recordStyles.note}>{t.honestyMedia}</p>
      </details>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structured) }} />
    </div>
  );
}
