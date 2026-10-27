'use client';
import Link from 'next/link';
import { useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import { getInterpretation, type Artwork } from '@/lib/art/types';
import { workFolio, workNumber } from '@/lib/art/number';
import { getPlateGround } from '@/lib/art/plate-records';
import type { Messages } from '@/lib/i18n/en';
import { localizedPath, type Locale } from '@/lib/i18n/routing';
import { ArtworkMedia } from './artwork-media';
import styles from './hang.module.css';
import { expressionWord } from '@/lib/i18n/format';

/** A leaf is a third of the wall at rest and a little over half when chosen; a phone hangs leaves the full width. */
export const LEAF_SIZES = '(max-width: 767px) 100vw, 55vw';

/**
 * A hang: a few works on one wall, each a plate on its own measured ground. The work under
 * the hand, the focus or the first tap grows in place, and the others re-form around it a
 * blink later; a second tap, Enter or a click enters the work. The plates are seeded from
 * the works' stills on the server, so the wall is never blank. Under reduced motion or
 * Pause the growth is instant.
 */
export function Hang({
  works,
  locale,
  t,
  labels = {},
}: {
  works: Artwork[];
  locale: Locale;
  t: Messages;
  /** One line per work beneath its numeral, e.g. the structure and underlay words. */
  labels?: Record<number, string>;
}) {
  const [chosen, setChosen] = useState<number | null>(null);
  // How the last input arrived: a tap focuses a leaf too, and that focus must not choose it,
  // or the first tap would choose and enter at once.
  const lastInput = useRef<'mouse' | 'touch' | 'keyboard'>('mouse');
  function pressed(event: PointerEvent) {
    lastInput.current = event.pointerType === 'touch' ? 'touch' : 'mouse';
  }
  function clicked(event: MouseEvent, id: number) {
    // On touch the first tap chooses and the second enters; a pointer has already chosen.
    if (lastInput.current === 'touch' && chosen !== id) {
      event.preventDefault();
      setChosen(id);
    }
  }
  return (
    <div
      className={styles.hang}
      data-chosen={chosen ?? undefined}
      onKeyDown={() => (lastInput.current = 'keyboard')}
    >
      {works.map((work) => {
        const media = getInterpretation(work, 'ink') ?? work.media[0];
        const ground = media
          ? getPlateGround(work.id, media.id, media.stillSha256)?.tone
          : undefined;
        const state = chosen === null ? 'even' : chosen === work.id ? 'chosen' : 'other';
        const word = expressionWord(media, t);
        const style = ground ? ({ '--plate-ground': ground } as CSSProperties) : undefined;
        return (
          <Link
            key={work.id}
            className={styles.leaf}
            href={localizedPath(locale, `/art/${work.id}`)}
            data-state={state}
            data-material={media?.id ?? 'ink'}
            style={style}
            aria-label={`${workNumber(work.id)} · ${word ?? ''}`.trim()}
            onPointerDown={pressed}
            onPointerEnter={(event) => {
              if (event.pointerType !== 'touch') setChosen(work.id);
            }}
            onFocus={() => {
              if (lastInput.current !== 'touch') setChosen(work.id);
            }}
            onClick={(event) => clicked(event, work.id)}
          >
            <span className={styles.plate}>
              <ArtworkMedia
                media={media}
                alt=""
                artworkId={work.id}
                sizes={LEAF_SIZES}
                still
                eager
              />
            </span>
            <span className={styles.caption} aria-hidden="true">
              <span className="hanging-numeral">{workFolio(work.id)}</span>
              <span className={styles.label}>{labels[work.id] ?? word}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
