'use client';
import { useEffect, useRef, useState } from 'react';
import { readBatch } from '@/lib/auction/client';
import { formatEth } from '@/lib/auction/catalogue';
import { collectCycleLots } from '@/lib/exhibitions/results';
import { workNumber } from '@/lib/art/number';
import type { Messages } from '@/lib/i18n/en';
import styles from './exhibitions.module.css';

/** The read begins when the section is this close to the viewport. */
const NEAR_PX = 200;

/**
 * A cycle's results, read from the configured contract once the section nears the
 * viewport: one quiet mono line per settled lot, the exact chain amount as the catalogue
 * states it, nothing for a lot that has not settled, and one line more when a batch could
 * not be read. The page mounts this only when a contract is configured; while no lot has
 * settled and every batch was read it prints nothing at all, because the works above are
 * the exhibition.
 */
export function CycleResults({ ids, t }: { ids: number[]; t: Messages }) {
  const section = useRef<HTMLElement>(null);
  const [near, setNear] = useState(false);
  const [results, setResults] = useState<{
    settled: { id: number; price: string }[];
    partial: boolean;
  } | null>(null);
  useEffect(() => {
    const node = section.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setNear(true);
      },
      { rootMargin: `${NEAR_PX}px` },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!near) return;
    let live = true;
    void collectCycleLots(ids, readBatch).then(({ lots, partial }) => {
      if (!live) return;
      const settled = [...lots]
        .filter(([, lot]) => lot.settled && lot.highestBid > 0n)
        .map(([id, lot]) => ({ id, price: formatEth(lot.highestBid) }))
        .sort((a, b) => a.id - b.id);
      setResults({ settled, partial });
    });
    return () => {
      live = false;
    };
  }, [near, ids]);
  const shown = results && (results.settled.length > 0 || results.partial);
  return (
    <section
      ref={section}
      className={styles.results}
      aria-label={t.results}
      hidden={!shown}
      data-results={results ? (results.partial ? 'partial' : 'read') : 'pending'}
    >
      {shown ? (
        <>
          <h2 className="eyebrow">{t.results}</h2>
          {results.settled.map((lot) => (
            <p key={lot.id}>
              {workNumber(lot.id)} · {t.settled} · {lot.price}
            </p>
          ))}
          {results.partial ? <p className={styles.resultsNote}>{t.resultsPartial}</p> : null}
        </>
      ) : null}
    </section>
  );
}
