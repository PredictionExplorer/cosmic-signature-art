import Link from 'next/link';
import { getArtworkHistory } from '@/lib/art/server';
import type {
  ArtworkHistory,
  ArtworkHistoryOptions,
  ArtworkNameEvent,
  ArtworkTransferEvent,
} from '@/lib/art/history-types';
import { historyCursorSchema } from '@/lib/art/history-validation';
import type { Messages } from '@/lib/i18n/en';
import { localizedPath, type Locale } from '@/lib/i18n/routing';
import { ChainAddress, RecordDate } from './artwork-record';
import styles from './artwork-record.module.css';
import { artworkViewParams, type ArtworkViewQuery } from '@/lib/art/view';

export interface HistoryQuery extends ArtworkViewQuery {
  transfers?: string | string[];
  names?: string | string[];
}

/** Only opaque validated continuations enter links or upstream requests. */
export function historyOptions(query: HistoryQuery): ArtworkHistoryOptions | null {
  const transfers = historyCursorSchema.optional().safeParse(query.transfers);
  const names = historyCursorSchema.optional().safeParse(query.names);
  return transfers.success && names.success
    ? { transferCursor: transfers.data, nameCursor: names.data }
    : null;
}

export function historyHref(
  locale: Locale,
  tokenId: number,
  query: HistoryQuery,
  stream: 'transfers' | 'names',
  cursor: string | null,
) {
  const params = artworkViewParams(query);
  const other = stream === 'transfers' ? 'names' : 'transfers';
  const parsed = historyCursorSchema.safeParse(query[other]);
  if (parsed.success) params.set(other, parsed.data);
  if (cursor) params.set(stream, cursor);
  return localizedPath(
    locale,
    `/art/${tokenId}${params.size ? `?${params}` : ''}#${stream === 'transfers' ? 'custody-history' : 'naming-history'}`,
  );
}

export async function ArtworkHistorySection({
  tokenId,
  locale,
  t,
  query,
}: {
  tokenId: number;
  locale: Locale;
  t: Messages;
  query: HistoryQuery;
}) {
  const options = historyOptions(query);
  const viewParams = artworkViewParams(query);
  if (!options)
    return (
      <section id="history" className={styles.history}>
        <p className="notice">{t.historyUnavailable}</p>
        <Link
          className="text-link"
          href={localizedPath(
            locale,
            `/art/${tokenId}${viewParams.size ? `?${viewParams}` : ''}#history`,
          )}
        >
          {t.latestEvents}
        </Link>
      </section>
    );
  const history = await getArtworkHistory(tokenId, options);
  return <ArtworkHistoryView history={history} locale={locale} t={t} query={query} />;
}

/**
 * Mint, transfers and naming events as lanes on one 1 px timeline with 44 px nodes. The two
 * streams stay independently paginated; nothing implies a merged chronology or a sale.
 */
export function ArtworkHistoryView({
  history,
  locale,
  t,
  query,
}: {
  history: ArtworkHistory;
  locale: Locale;
  t: Messages;
  query: HistoryQuery;
}) {
  return (
    <section id="history" className={styles.history} aria-label={t.provenanceTitle}>
      <div className={styles.histories}>
        {(['transfers', 'names'] as const).map((stream) => {
          const page = history[stream];
          const label = stream === 'transfers' ? t.ownershipHistory : t.namingHistory;
          return (
            <section
              id={stream === 'transfers' ? 'custody-history' : 'naming-history'}
              className={styles.historyStream}
              key={stream}
              aria-label={label}
            >
              <h3>{label}</h3>
              {page.status === 'unavailable' ? (
                <p className="notice" role="status">
                  {t.historyUnavailable}
                </p>
              ) : page.items.length ? (
                <ol className={styles.timeline}>
                  {page.items.map((event) => (
                    <HistoryEvent key={event.eventLogId} event={event} locale={locale} t={t} />
                  ))}
                </ol>
              ) : (
                <p className={styles.note}>
                  {page.cursor
                    ? t.noHistoryOnPage
                    : stream === 'transfers'
                      ? t.noTransfers
                      : t.noNames}
                </p>
              )}
              {page.cursor || page.nextCursor ? (
                <nav className={styles.historyNav} aria-label={label}>
                  {page.cursor ? (
                    <Link href={historyHref(locale, history.tokenId, query, stream, null)}>
                      ← {t.latestEvents}
                    </Link>
                  ) : null}
                  {page.nextCursor ? (
                    <Link
                      href={historyHref(locale, history.tokenId, query, stream, page.nextCursor)}
                    >
                      {t.earlierEvents} →
                    </Link>
                  ) : null}
                </nav>
              ) : null}
            </section>
          );
        })}
      </div>
      <p className={`${styles.note} ${styles.historyNote}`}>{t.historyNote}</p>
    </section>
  );
}

function HistoryEvent({
  event,
  locale,
  t,
}: {
  event: ArtworkTransferEvent | ArtworkNameEvent;
  locale: Locale;
  t: Messages;
}) {
  const label =
    event.kind === 'mint'
      ? t.eventMint
      : event.kind === 'burn'
        ? t.eventBurn
        : event.kind === 'name'
          ? event.newName
            ? t.eventName
            : t.nameCleared
          : t.eventTransfer;
  const copy = { label: t.copyAddress, copied: t.copied };
  return (
    <li className={styles.event}>
      <div className={styles.eventHeader}>
        <h4>{label}</h4>
        <RecordDate value={event.occurredAt} locale={locale} />
      </div>
      {event.kind === 'name' ? (
        <>
          {event.newName ? (
            <p className={styles.eventName}>
              <bdi>{event.newName}</bdi>
            </p>
          ) : null}
          <div className={styles.eventAddresses}>
            <div>
              <span>{t.namedBy}</span>
              <ChainAddress address={event.changedByAddress} compact copy={copy} />
            </div>
          </div>
        </>
      ) : (
        <div className={styles.eventAddresses}>
          {event.kind !== 'mint' ? (
            <div>
              <span>{t.fromAddress}</span>
              <ChainAddress address={event.fromAddress} compact copy={copy} />
            </div>
          ) : null}
          {event.kind !== 'burn' ? (
            <div>
              <span>{t.toAddress}</span>
              <ChainAddress address={event.toAddress} compact copy={copy} />
            </div>
          ) : null}
        </div>
      )}
      <div className={styles.eventChain}>
        <a
          href={`https://arbiscan.io/tx/${event.transactionHash}`}
          target="_blank"
          rel="noreferrer"
        >
          {t.transaction} ↗
        </a>
        <a href={`https://arbiscan.io/block/${event.blockNumber}`} target="_blank" rel="noreferrer">
          {t.block} {new Intl.NumberFormat(locale).format(event.blockNumber)} ↗
        </a>
      </div>
    </li>
  );
}
