'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { getInterpretation, type Artwork } from '@/lib/art/types';
import type { Messages } from '@/lib/i18n/en';
import { localizedPath, type Locale } from '@/lib/i18n/routing';
import { ArtworkMedia } from './artwork-media';
export function WorkGrid({
  works,
  locale,
  t,
  eagerFirstRow = false,
}: {
  works: Artwork[];
  locale: Locale;
  t: Messages;
  eagerFirstRow?: boolean;
}) {
  const [mode, setMode] = useState<'ink' | 'light'>('ink');
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
      <div className="work-grid">
        {works.map((work, index) => {
          const media =
            getInterpretation(work, mode) ?? getInterpretation(work, 'light') ?? work.media[0];
          return (
            <Link
              key={work.id}
              className="work-card"
              href={localizedPath(locale, `/art/${work.id}`)}
            >
              <ArtworkMedia
                key={`${work.id}-${media?.id}`}
                media={media}
                alt={`${t.signature} ${work.id}`}
                still
                thumbnail
                eager={eagerFirstRow && index < 2}
              />
              <div className="work-card-caption">
                <span>
                  {t.signature} {String(work.id).padStart(3, '0')}
                </span>
                <span className="eyebrow">
                  {media?.id === 'ink' ? t.ink : mode === 'ink' ? t.lightOnly : t.light}
                </span>
                <ArrowUpRight size={15} />
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
