'use client';
import Link from 'next/link';
import { openSheet, useOpenSheet } from '@/components/sheets-store';
import { useScrollEdges } from '@/components/scroll-edges';
import type { CollectionBarWords } from './collection-bar.words';
import styles from './collection.module.css';

/**
 * The pocket edition's 44 px bottom bar: Index, the two expressions, the orderings and the
 * pager, opaque in the ground. On wider screens the running head and the Index sheet carry
 * these words and the bar is not shown.
 */
export function CollectionBar({
  t,
  orderings,
  expressions,
  previousHref,
  nextHref,
}: {
  t: CollectionBarWords;
  orderings: { label: string; href: string; current: boolean }[];
  /**
   * Each expression's word hangs it alone, or both again when it is alone; none on the
   * Spectrum wall, which is always Light.
   */
  expressions: { label: string; action: string; href: string; current: boolean }[];
  previousHref?: string;
  nextHref?: string;
}) {
  const sheet = useOpenSheet();
  const words = useScrollEdges<HTMLDivElement>();
  return (
    <nav className={styles.bar} aria-label={t.collectionControls}>
      {/* The words keep their own widths in every language and scroll sideways when the bar
          is too narrow for them, the two expressions first so they are always in view, and an
          edge with words beyond it fades; the pager holds the right edge whatever they do. */}
      <div ref={words} className={styles.barWords}>
        <button
          type="button"
          onClick={() => openSheet('index')}
          aria-haspopup="dialog"
          aria-expanded={sheet === 'index'}
          aria-controls="index-sheet"
        >
          {t.index}
        </button>
        {expressions.map((choice) => (
          <Link
            key={choice.href}
            href={choice.href}
            aria-current={choice.current ? 'true' : undefined}
            title={choice.action}
          >
            {choice.label}
          </Link>
        ))}
        {orderings.map((ordering) => (
          <Link
            key={ordering.href}
            href={ordering.href}
            aria-current={ordering.current ? 'page' : undefined}
          >
            {ordering.label}
          </Link>
        ))}
      </div>
      {previousHref || nextHref ? (
        <div className={styles.barPager}>
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
        </div>
      ) : null}
    </nav>
  );
}
