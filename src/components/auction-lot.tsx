'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { readAuction, AuctionConfigurationError, type Snapshot } from '@/lib/auction/client';
import { chainStateLine } from '@/lib/auction/catalogue';
import type { Messages } from '@/lib/i18n/en';
import type { Locale } from '@/lib/i18n/routing';
import { BidHistory } from './bid-history';
import { BidSheet } from './bid-sheet';
import { YourActivity } from './your-activity';
import styles from './auction-lot.module.css';

/** A record older than this is not stated as fact; one timer per record, never a ticking clock. */
const STALE_MS = 25000;

function isUnknownAuction(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UnknownAuction');
}

/**
 * The lot strip beneath the plate: one quiet line of chain state, the words that open the
 * bid sheet and the activity sheet, and the bid history. The live panel itself lives inside
 * the sheet and is handed in by the page; nothing in it changes. The keys that move the
 * venue are silent inside this strip, as they were inside the rail.
 */
export function AuctionLot({
  tokenId,
  t,
  locale,
  panel,
}: {
  tokenId: number;
  t: Messages;
  locale: Locale;
  panel: ReactNode;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /** The fetch time of the record that has aged out, if the current one has. */
  const [staleFor, setStaleFor] = useState<number | null>(null);
  const [sheet, setSheet] = useState<'bid' | 'activity' | null>(null);
  const collect = useRef<HTMLButtonElement>(null);
  const activity = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let live = true;
    let reading = false;
    async function refresh() {
      if (!live || reading || document.hidden) return;
      reading = true;
      try {
        const value = await readAuction(tokenId);
        if (live) {
          setSnapshot(value);
          setProblem(null);
        }
      } catch (error) {
        if (live) {
          setSnapshot(null);
          setProblem(
            error instanceof AuctionConfigurationError
              ? t.configMismatch
              : isUnknownAuction(error)
                ? t.unregistered
                : t.liveUnavailable,
          );
        }
      } finally {
        reading = false;
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 12000);
    const visible = () => void refresh();
    window.addEventListener('focus', visible);
    document.addEventListener('visibilitychange', visible);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener('focus', visible);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [tokenId, t]);
  // A record that is not refreshed in time stops being stated: one timeout per record.
  useEffect(() => {
    if (!snapshot) return;
    const { fetchedAt } = snapshot;
    const timer = setTimeout(
      () => setStaleFor(fetchedAt),
      Math.max(0, fetchedAt + STALE_MS - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [snapshot]);
  const stale = !!snapshot && staleFor === snapshot.fetchedAt;
  const state =
    snapshot && !stale ? chainStateLine(snapshot.lot, snapshot.blockTime, t, locale) : null;
  return (
    <div id="lot-actions" className={styles.lot} data-keys-suppressed="">
      <p className={styles.chain} data-phase={state?.phase}>
        {state ? state.line : (problem ?? (stale ? t.liveUnavailable : t.readingRecord))}
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          ref={collect}
          className="primary-button"
          onClick={() => setSheet('bid')}
        >
          {t.collectThisWork}
        </button>
        <button
          type="button"
          ref={activity}
          className={styles.word}
          onClick={() => setSheet('activity')}
        >
          {t.yourActivity}
        </button>
      </div>
      <BidHistory tokenId={tokenId} t={t} locale={locale} snapshot={stale ? null : snapshot} />
      <BidSheet
        open={sheet === 'bid'}
        onClose={() => setSheet(null)}
        returnFocusRef={collect}
        tokenId={tokenId}
        t={t}
        locale={locale}
        panel={panel}
      />
      <YourActivity
        open={sheet === 'activity'}
        onClose={() => setSheet(null)}
        returnFocusRef={activity}
        t={t}
        locale={locale}
        scope={{ tokenId }}
      />
    </div>
  );
}
