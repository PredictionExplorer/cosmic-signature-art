'use client';
import Link from 'next/link';
import { openSheet, useOpenSheet } from '@/components/sheets-store';
import type { Messages } from '@/lib/i18n/en';
import styles from './collection.module.css';

/**
 * The pocket edition's 44 px bottom bar: Index, the orderings, the other expression and the
 * pager, opaque in the ground. On wider screens the running head and the Index sheet carry
 * these words and the bar is not shown.
 */
export function CollectionBar({
  t,
  orderings,
  expressionHref,
  expressionWord,
  previousHref,
  nextHref,
}: {
  t: Messages;
  orderings: { label: string; href: string; current: boolean }[];
  /** The other expression; absent on the Spectrum wall, which is always Light. */
  expressionHref?: string;
  expressionWord: string;
  previousHref?: string;
  nextHref?: string;
}) {
  const sheet = useOpenSheet();
  return (
    <nav className={styles.bar} aria-label={t.collectionControls}>
      <button
        type="button"
        onClick={() => openSheet('index')}
        aria-haspopup="dialog"
        aria-expanded={sheet === 'index'}
        aria-controls="index-sheet"
      >
        {t.index}
      </button>
      {orderings.map((ordering) => (
        <Link
          key={ordering.href}
          href={ordering.href}
          aria-current={ordering.current ? 'page' : undefined}
        >
          {ordering.label}
        </Link>
      ))}
      {expressionHref ? <Link href={expressionHref}>{expressionWord}</Link> : null}
      {previousHref ? (
        <Link href={previousHref} aria-label={t.newer}>
          ←
        </Link>
      ) : null}
      {nextHref ? (
        <Link href={nextHref} aria-label={t.older}>
          →
        </Link>
      ) : null}
    </nav>
  );
}
