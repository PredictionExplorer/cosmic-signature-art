'use client';
import { useEffect, useState } from 'react';
import { formatEther } from 'viem';
import { readAuction } from '@/lib/auction/client';
import { workNumber } from '@/lib/art/number';
import { fill } from '@/lib/i18n/format';
import type { Messages } from '@/lib/i18n/en';
import type { Locale } from '@/lib/i18n/routing';
import styles from './exhibitions.module.css';

/**
 * A cycle's results, read from the configured contract: one quiet mono line per settled
 * lot, nothing for a lot that has not settled and nothing at all while no lot has. The
 * page mounts this only when a contract is configured; an unreachable chain prints nothing
 * rather than an apology, because the works above are the exhibition.
 */
export function CycleResults({ ids, locale, t }: { ids: number[]; locale: Locale; t: Messages }) {
  const [settled, setSettled] = useState<{ id: number; eth: string }[]>([]);
  useEffect(() => {
    let live = true;
    const results: { id: number; eth: string }[] = [];
    let next = 0;
    async function worker() {
      while (live && next < ids.length) {
        const id = ids[next++];
        try {
          const snapshot = await readAuction(id);
          if (snapshot.lot.settled && snapshot.lot.highestBid > 0n)
            results.push({
              id,
              eth: new Intl.NumberFormat(locale, { maximumFractionDigits: 5 }).format(
                Number(formatEther(snapshot.lot.highestBid)),
              ),
            });
        } catch {
          /* A lot that cannot be read has no result to show. */
        }
      }
    }
    void Promise.all([worker(), worker()]).then(() => {
      if (live) setSettled([...results].sort((a, b) => a.id - b.id));
    });
    return () => {
      live = false;
    };
  }, [ids, locale]);
  if (settled.length === 0) return null;
  return (
    <section className={styles.results} aria-label={t.results}>
      <h2 className="eyebrow">{t.results}</h2>
      {settled.map((lot) => (
        <p key={lot.id}>
          {workNumber(lot.id)} · {fill(t.settledAt, { eth: lot.eth })}
        </p>
      ))}
    </section>
  );
}
