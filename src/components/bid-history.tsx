'use client';
import { useEffect, useState } from 'react';
import type { Snapshot } from '@/lib/auction/client';
import { readBidHistory, type BidHistory as History } from '@/lib/auction/history';
import { auctionPhase } from '@/lib/auction/rules';
import { compactAddress, formatChainDate, formatEth } from '@/lib/auction/catalogue';
import { fill } from '@/lib/i18n/format';
import type { Messages } from '@/lib/i18n/en';
import type { Locale } from '@/lib/i18n/routing';
import styles from './auction-lot.module.css';

/**
 * A lot's bid history as a quiet list: each bid's amount, wallet and block time from the
 * contract's own logs, newest first, with the delivery once it happened. It is read when the
 * lot has bids and again when the record's bid or settlement changes; an unreadable history
 * says so, a list that could not be refreshed says it may be behind, and nothing is invented.
 */
export function BidHistory({
  tokenId,
  t,
  locale,
  snapshot,
}: {
  tokenId: number;
  t: Messages;
  locale: Locale;
  snapshot: Snapshot | null;
}) {
  const [history, setHistory] = useState<History | null>(null);
  const [failed, setFailed] = useState(false);
  const phase = snapshot ? auctionPhase(snapshot.lot, snapshot.blockTime) : null;
  const hasBids = phase === 'active' || phase === 'ended' || phase === 'settled';
  // The record's own facts decide when to read again: a new high bid, a settlement, a delivery.
  const key = snapshot
    ? `${snapshot.lot.highestBid}:${snapshot.lot.settled}:${snapshot.lot.delivered}`
    : '';
  useEffect(() => {
    if (!snapshot || !hasBids) return;
    let live = true;
    void readBidHistory(tokenId, {
      latestBlock: snapshot.blockNumber,
      blockTime: snapshot.blockTime,
      since: snapshot.lot.eligibleAt,
    })
      .then((value) => {
        if (live) {
          setHistory(value);
          setFailed(false);
        }
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` names the facts that warrant a new read
  }, [tokenId, hasBids, key]);
  // Every chain date the venue states reads in UTC and in the visitor's own zone.
  const when = (timestamp: bigint | null) =>
    timestamp === null ? null : formatChainDate(timestamp, locale, t);
  return (
    <section className={styles.history} aria-labelledby={`bid-history-${tokenId}`}>
      <h2 id={`bid-history-${tokenId}`} className="eyebrow">
        {t.bidHistory}
      </h2>
      {!snapshot ? null : !hasBids ? (
        <p className={styles.quiet}>{t.historyNone}</p>
      ) : failed && !history ? (
        <p className={styles.quiet} role="status">
          {t.bidHistoryUnavailable}
        </p>
      ) : history ? (
        <>
          {failed ? (
            <p className={styles.quiet} role="status">
              {t.historyStale}
            </p>
          ) : null}
          {history.entries.length === 0 ? <p className={styles.quiet}>{t.historyNone}</p> : null}
          <ol className={styles.entries}>
            {history.entries.map((entry) => (
              <li key={`${entry.transactionHash}:${entry.logIndex}`} className={styles.entryRow}>
                <span className={styles.entryWords}>
                  {entry.kind === 'bid'
                    ? [formatEth(entry.amount), compactAddress(entry.bidder), when(entry.timestamp)]
                        .filter(Boolean)
                        .join(' · ')
                    : [
                        fill(t.historyDeliveredTo, { address: compactAddress(entry.recipient) }),
                        when(entry.timestamp),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                </span>
                <a
                  href={`https://arbiscan.io/tx/${entry.transactionHash}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${t.viewChain} · ${compactAddress(entry.transactionHash)}`}
                >
                  ↗
                </a>
              </li>
            ))}
          </ol>
          {!history.complete || history.truncated ? (
            <p className={styles.quiet}>{t.historyPartial}</p>
          ) : null}
        </>
      ) : (
        <p className={styles.quiet} aria-busy="true">
          {t.readingRecord}
        </p>
      )}
    </section>
  );
}
