'use client';
import Link from 'next/link';
import { workFolio, workNumber } from '@/lib/art/number';
import { fill } from '@/lib/i18n/format';
import type { Messages } from '@/lib/i18n/en';
import { localizedPath, type Locale } from '@/lib/i18n/routing';
import styles from './artwork-viewer.module.css';

export interface Neighbour {
  id: number;
  /** The publisher's 640 px preview of the neighbour's Ink expression (or Light when no Ink). */
  preview?: string;
  expression?: 'ink' | 'light';
}
export interface Neighbours {
  previous?: Neighbour;
  next?: Neighbour;
  spectral?: { id: number; deltaNm: number; direction: 'redder' | 'bluer' };
  /** The configured auction lists this token: one quiet line and `Collect`. */
  lot?: boolean;
}

/** The remembered expression travels with every step to a neighbouring work. */
export function neighbourHref(locale: Locale, id: number, expression: string) {
  return localizedPath(locale, `/art/${id}${expression === 'light' ? '?expression=light' : ''}`);
}

/** Beat 9: `← 030 · 032 →` with the neighbours' previews, the next star by wavelength, and the sale. */
export function ArtworkNeighbours({
  artworkId,
  neighbours,
  expression,
  locale,
  t,
}: {
  artworkId: number;
  neighbours: Neighbours;
  expression: string;
  locale: Locale;
  t: Messages;
}) {
  const { previous, next, spectral, lot } = neighbours;
  const step = (neighbour: Neighbour | undefined, direction: 'previous' | 'next') =>
    neighbour ? (
      <Link
        className={`${styles.step} ${direction === 'next' ? styles.stepNext : ''}`}
        href={neighbourHref(locale, neighbour.id, expression)}
        aria-label={`${direction === 'previous' ? t.previousWork : t.nextWork} · ${workNumber(neighbour.id)}`}
        data-neighbour={direction}
      >
        {neighbour.preview ? (
          <img
            src={neighbour.preview}
            alt=""
            width={640}
            height={414}
            loading="lazy"
            decoding="async"
            data-material={neighbour.expression ?? 'ink'}
          />
        ) : null}
        <span className={styles.stepLabel}>
          {direction === 'previous'
            ? `← ${workFolio(neighbour.id)}`
            : `${workFolio(neighbour.id)} →`}
        </span>
      </Link>
    ) : (
      <span className={styles.step} aria-hidden="true" />
    );
  return (
    <nav className={styles.neighbours} aria-label={`${t.previousWork} · ${t.nextWork}`}>
      {step(previous, 'previous')}
      <div className={styles.between}>
        {spectral ? (
          <Link
            className={`word-link ${styles.spectral}`}
            href={neighbourHref(locale, spectral.id, expression)}
            data-neighbour="spectral"
          >
            {t.nextByWavelength} · {workNumber(spectral.id)} ·{' '}
            {fill(spectral.direction === 'redder' ? t.nmRedder : t.nmBluer, {
              n: spectral.deltaNm,
            })}
          </Link>
        ) : null}
        {lot ? (
          <Link
            className={`word-link ${styles.collect}`}
            href={localizedPath(locale, `/auctions/${artworkId}`)}
            data-neighbour="lot"
          >
            {t.collect} · {t.auctions}
          </Link>
        ) : null}
      </div>
      {step(next, 'next')}
    </nav>
  );
}
