'use client';
import Link from 'next/link';
import { useState, type CSSProperties } from 'react';
import {
  getInterpretation,
  type ArtFilm,
  type ArtInterpretation,
  type Artwork,
  type Expression,
} from '@/lib/art/types';
import { getPlateGround } from '@/lib/art/plate-records';
import { workFolio, workNumber } from '@/lib/art/number';
import { localizedPath, type Locale } from '@/lib/i18n/routing';
import type { Messages } from '@/lib/i18n/en';
import { ArtworkTransition } from './artwork-transition';
import { useCollectionMotion } from './collection-motion';
import { CollectionPreview, excerptRange, getCollectionPreviewFilm } from './collection-preview';
import styles from './home-screens.module.css';

/**
 * Two plates across the seam, the Ink leaf on paper and the Light leaf on night, each
 * letterboxed in its own measured tone with its numeral hanging in the outer margin. No caption
 * until hover or focus; then the label strip appears and that plate's clip wakes under the one
 * playback lease (Ink's eight-second excerpt, Light's settling clip), labelled as what it is,
 * holding its last frame and fading back to the still. A click is the Walk.
 */
export function SpreadPlates({
  leaves,
  locale,
  t,
}: {
  leaves: { work: Artwork; expression: Expression }[];
  locale: Locale;
  t: Messages;
}) {
  const hung = leaves.flatMap(({ work, expression }) => {
    const media = getInterpretation(work, expression) ?? work.media[0];
    return media ? [{ work, media, film: spreadFilm(media) }] : [];
  });
  const previewIds = hung.filter(({ film }) => film).map(({ work }) => work.id);
  const { gridRef, activeId, intent, clearIntent, fail, rest } = useCollectionMotion({
    enabled: true,
    ids: previewIds,
    // No caption and no clip until hover or focus: scrolling past the spread wakes nothing.
    intentOnly: true,
  });
  const [intentId, setIntentId] = useState<number | null>(null);
  return (
    <section
      ref={gridRef}
      className={`${styles.screen} ${styles.spread}`}
      aria-label={t.selectedWorks}
    >
      {hung.map(({ work, media, film }, index) => {
        const ground = getPlateGround(work.id, media.id, media.stillSha256);
        const tone = ground?.tone ?? (media.id === 'light' ? '#000000' : undefined);
        const active = activeId === work.id;
        const word = media.id === 'ink' ? t.ink : t.light;
        const alt = `${workNumber(work.id)} · ${word}`;
        return (
          <div
            key={work.id}
            className={styles.side}
            data-side={index === 0 ? 'left' : 'right'}
            data-ground={media.id === 'light' ? 'night' : 'paper'}
          >
            <figure
              className={styles.leaf}
              style={tone ? ({ '--plate-ground': tone } as CSSProperties) : undefined}
            >
              <span className={`hanging-numeral ${styles.leafNumeral}`} aria-hidden="true">
                {workFolio(work.id)}
              </span>
              <Link
                href={localizedPath(locale, `/art/${work.id}?expression=${media.id}`)}
                className={styles.leafPlate}
                aria-label={alt}
                data-preview-id={work.id}
                data-preview-available={!!film}
                data-motion={active ? 'active' : 'still'}
                prefetch={active || intentId === work.id}
                onPointerEnter={(event) => {
                  intent(work.id, 'pointer', event.pointerType);
                  if (event.pointerType !== 'touch') setIntentId(work.id);
                }}
                onPointerLeave={() => clearIntent(work.id, 'pointer')}
                onFocus={() => {
                  intent(work.id, 'focus');
                  setIntentId(work.id);
                }}
                onBlur={() => clearIntent(work.id, 'focus')}
              >
                <ArtworkTransition artworkId={work.id} interpretationId={media.id} role="preview">
                  <CollectionPreview
                    media={media}
                    alt={alt}
                    artworkId={work.id}
                    film={film}
                    sizes="(max-width: 767px) 100vw, 46vw"
                    active={active}
                    onFailure={(reason) => fail(work.id, reason)}
                    onEnded={() => rest(work.id)}
                  />
                </ArtworkTransition>
              </Link>
              <figcaption className={`strip ${styles.leafStrip}`}>
                <span className="numeral control">{workNumber(work.id)}</span>
                <span className={styles.leafLabel}>
                  {word}
                  {active && film
                    ? ` · ${film.id === 'settling' ? t.settling : t.excerpt} ${excerptRange(film) ?? ''}`.trimEnd()
                    : ''}
                </span>
              </figcaption>
            </figure>
          </div>
        );
      })}
    </section>
  );
}

/** The clip a leaf wakes into: Ink's eight-second excerpt, or Light's settling clip. */
function spreadFilm(media: ArtInterpretation): ArtFilm | undefined {
  return media.id === 'light' ? media.settlingFilm : getCollectionPreviewFilm(media);
}
