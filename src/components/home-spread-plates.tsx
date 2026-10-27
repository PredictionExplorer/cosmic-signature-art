'use client';
import Link from 'next/link';
import { useState, type CSSProperties } from 'react';
import { getInterpretation, type Artwork } from '@/lib/art/types';
import { getPlateGround } from '@/lib/art/plate-records';
import { workFolio, workNumber } from '@/lib/art/number';
import { localizedPath, type Locale } from '@/lib/i18n/routing';
import type { Messages } from '@/lib/i18n/en';
import { ArtworkTransition } from './artwork-transition';
import { useCollectionMotion } from './collection-motion';
import { CollectionPreview, excerptRange, getCollectionPreviewFilm } from './collection-preview';
import styles from './home-screens.module.css';

/**
 * Two Ink plates hung side by side, each letterboxed in its own measured tone with its numeral
 * hanging in the outer margin. No caption until hover or focus; then the label strip appears
 * and that plate's eight-second excerpt wakes under the one playback lease, labelled as an
 * excerpt, holding its last frame and fading back to the still. A click is the Walk.
 */
export function SpreadPlates({
  works,
  locale,
  t,
}: {
  works: Artwork[];
  locale: Locale;
  t: Messages;
}) {
  const previewIds = works
    .filter((work) => getCollectionPreviewFilm(getInterpretation(work, 'ink')))
    .map((work) => work.id);
  const { gridRef, activeId, intent, clearIntent, fail, rest } = useCollectionMotion({
    enabled: true,
    ids: previewIds,
    // No caption and no excerpt until hover or focus: scrolling past the spread wakes nothing.
    intentOnly: true,
  });
  const [intentId, setIntentId] = useState<number | null>(null);
  return (
    <section
      ref={gridRef}
      className={`${styles.screen} ${styles.spread}`}
      aria-label={t.selectedWorks}
    >
      {works.map((work, index) => {
        const media = getInterpretation(work, 'ink') ?? work.media[0];
        if (!media) return null;
        const ground = getPlateGround(work.id, media.id, media.stillSha256);
        const film = getCollectionPreviewFilm(media);
        const active = activeId === work.id;
        const alt = `${workNumber(work.id)} · ${media.id === 'ink' ? t.ink : t.light}`;
        return (
          <figure
            key={work.id}
            className={styles.leaf}
            data-side={index === 0 ? 'left' : 'right'}
            style={ground ? ({ '--plate-ground': ground.tone } as CSSProperties) : undefined}
          >
            <span className={`hanging-numeral ${styles.leafNumeral}`} aria-hidden="true">
              {workFolio(work.id)}
            </span>
            <Link
              href={localizedPath(locale, `/art/${work.id}`)}
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
                  active={active}
                  onFailure={(reason) => fail(work.id, reason)}
                  onEnded={() => rest(work.id)}
                />
              </ArtworkTransition>
            </Link>
            <figcaption className={`strip ${styles.leafStrip}`}>
              <span className="numeral control">{workNumber(work.id)}</span>
              <span className={styles.leafLabel}>
                {media.id === 'ink' ? t.ink : t.light}
                {active && film ? ` · ${t.excerpt} ${excerptRange(film) ?? ''}` : ''}
              </span>
            </figcaption>
          </figure>
        );
      })}
    </section>
  );
}
