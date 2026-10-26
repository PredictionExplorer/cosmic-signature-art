'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { getInterpretation, type Artwork } from '@/lib/art/types';
import { workFolio, workNumber } from '@/lib/art/number';
import { localizedPath, type Locale } from '@/lib/i18n/routing';
import type { Messages } from '@/lib/i18n/en';
import { ArtworkMedia } from './artwork-media';
import { useMotion } from './motion-provider';
export function Atlas({ works, locale, t }: { works: Artwork[]; locale: Locale; t: Messages }) {
  const [selected, setSelected] = useState(works[1]?.id ?? works[0].id);
  const [mode, setMode] = useState<'ink' | 'light'>('ink');
  const [rehang, setRehang] = useState(false);
  const field = useRef<HTMLDivElement>(null);
  const { paused } = useMotion();
  const index = works.findIndex((work) => work.id === selected);
  return (
    <section className="atlas" aria-label={t.atlas}>
      <div className="atlas-toolbar">
        <p className="eyebrow">
          <span>{t.atlas}</span> / {t.editorial}
        </p>
        <div className="mode-switch" aria-label={t.ways}>
          {(['ink', 'light'] as const).map((value) => (
            <button key={value} onClick={() => setMode(value)} aria-pressed={value === mode}>
              {t[value]}
            </button>
          ))}
        </div>
      </div>
      <div
        className={`constellation ${rehang ? 'rehung' : ''}`}
        ref={field}
        onPointerMove={(event) => {
          if (paused || event.pointerType === 'touch') return;
          const rect = event.currentTarget.getBoundingClientRect();
          field.current?.style.setProperty(
            '--drift-x',
            `${((event.clientX - rect.left) / rect.width - 0.5) * 10}px`,
          );
          field.current?.style.setProperty(
            '--drift-y',
            `${((event.clientY - rect.top) / rect.height - 0.5) * 8}px`,
          );
        }}
        onPointerLeave={() => {
          field.current?.style.setProperty('--drift-x', '0px');
          field.current?.style.setProperty('--drift-y', '0px');
        }}
      >
        {works.map((work, position) => {
          const role =
            position === index
              ? 'anchor'
              : position === (index + 1) % works.length
                ? 'after'
                : 'before';
          return (
            <figure className={`constellation-work position-${role}`} key={work.id}>
              <div className="constellation-drift">
                <button
                  className="constellation-select"
                  aria-label={`${t.signature} ${work.id}`}
                  aria-pressed={work.id === selected}
                  onClick={() => setSelected(work.id)}
                >
                  <ArtworkMedia
                    key={`${work.id}-${mode}`}
                    media={getInterpretation(work, mode)}
                    alt={`${t.signature} ${work.id} · ${t[mode]}`}
                    artworkId={work.id}
                    still={role !== 'anchor'}
                  />
                </button>
                <figcaption>
                  <span>{workNumber(work.id)}</span>
                  <span className="eyebrow">
                    {t[mode]} / {mode === 'ink' ? t.film : t.still}
                  </span>
                  <Link
                    href={localizedPath(locale, `/art/${work.id}`)}
                    aria-label={`${t.enterWork} ${work.id}`}
                  >
                    {t.enterWork}
                  </Link>
                </figcaption>
              </div>
            </figure>
          );
        })}
        <div className="constellation-note">
          <p className="eyebrow">{t.oneMotion}</p>
          <p>{t.current}</p>
          <i />
        </div>
        <p className="constellation-hint">{t.chooseWork}</p>
      </div>
      <div className="atlas-selection">
        <div>
          <p className="eyebrow">{t.departure}</p>
          <h2 aria-live="polite">
            {t.signature} {selected}
          </h2>
        </div>
        <div className="atlas-pager">
          {works.map((work) => (
            <button
              key={work.id}
              onClick={() => setSelected(work.id)}
              aria-pressed={work.id === selected}
            >
              {workFolio(work.id)}
            </button>
          ))}
        </div>
        <Link className="text-link" href={localizedPath(locale, `/art/${selected}`)}>
          {t.enterWork}
        </Link>
        <button
          className="rehang"
          onClick={() => setRehang((value) => !value)}
          aria-pressed={rehang}
        >
          <RotateCcw size={13} />
          {t.rehang}
        </button>
      </div>
    </section>
  );
}
