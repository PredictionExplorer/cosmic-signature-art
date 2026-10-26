'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { getInterpretation, type Artwork } from '@/lib/art/types';
import { workNumber } from '@/lib/art/number';
import type { Messages } from '@/lib/i18n/en';
import { localizedPath, type Locale } from '@/lib/i18n/routing';
import { ArtworkMedia } from './artwork-media';
import { useCollectionMotion } from './collection-motion';
import { CollectionPreview, excerptRange, getCollectionPreviewFilm } from './collection-preview';
import { ArtworkTransition } from './artwork-transition';
export function WorkGrid({
  works,
  locale,
  t,
  eagerFirstRow = false,
  animated = false,
}: {
  works: Artwork[];
  locale: Locale;
  t: Messages;
  eagerFirstRow?: boolean;
  animated?: boolean;
}) {
  const [mode, setMode] = useState<'ink' | 'light'>('ink');
  const [intentId, setIntentId] = useState<number | null>(null);
  const previewIds = useMemo(
    () =>
      works
        .filter((work) => getCollectionPreviewFilm(getInterpretation(work, 'ink')))
        .map((work) => work.id),
    [works],
  );
  const { gridRef, activeId, intent, clearIntent, fail, rest } = useCollectionMotion({
    enabled: animated && mode === 'ink',
    ids: previewIds,
  });
  return (
    <>
      <div className="collection-display-controls">
        <div className="mode-switch" aria-label={t.ways}>
          {(['ink', 'light'] as const).map((value) => (
            <button key={value} onClick={() => setMode(value)} aria-pressed={mode === value}>
              {t[value]}
            </button>
          ))}
        </div>
      </div>
      <div className="work-grid" ref={gridRef}>
        {works.map((work, index) => {
          const media =
            getInterpretation(work, mode) ?? getInterpretation(work, 'light') ?? work.media[0];
          const active = activeId === work.id;
          const href = localizedPath(
            locale,
            `/art/${work.id}${media && media.id !== 'ink' ? `?expression=${encodeURIComponent(media.id)}` : ''}`,
          );
          const plate = animated ? (
            <CollectionPreview
              key={`${work.id}-${media?.id}`}
              media={media}
              alt={`${t.signature} ${work.id}`}
              artworkId={work.id}
              eager={eagerFirstRow && index < 2}
              active={active}
              onFailure={(reason) => fail(work.id, reason)}
              onEnded={() => rest(work.id)}
            />
          ) : (
            <ArtworkMedia
              key={`${work.id}-${media?.id}`}
              media={media}
              alt={`${t.signature} ${work.id}`}
              artworkId={work.id}
              still
              thumbnail
              eager={eagerFirstRow && index < 2}
            />
          );
          return (
            <Link
              key={work.id}
              className="work-card"
              href={href}
              prefetch={animated ? active || intentId === work.id : undefined}
              data-preview-id={work.id}
              data-preview-available={!!getCollectionPreviewFilm(media)}
              data-motion={active ? 'active' : 'still'}
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
              {animated && media ? (
                <ArtworkTransition artworkId={work.id} interpretationId={media.id} role="preview">
                  {plate}
                </ArtworkTransition>
              ) : (
                plate
              )}
              <div className="work-card-caption">
                <span>{workNumber(work.id)}</span>
                <span className="eyebrow">
                  {media?.id === 'ink' ? t.ink : mode === 'ink' ? t.lightOnly : t.light}
                  {active ? (
                    <span className="work-card-film">
                      {' '}
                      / {t.excerpt} {excerptRange(getCollectionPreviewFilm(media))}
                    </span>
                  ) : null}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
