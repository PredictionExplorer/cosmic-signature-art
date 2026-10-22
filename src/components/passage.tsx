'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, RotateCcw } from 'lucide-react';
import type { Artwork } from '@/lib/art/types';
import { getInterpretation } from '@/lib/art/types';
import type { Messages } from '@/lib/i18n/en';
import { localizedPath, type Locale } from '@/lib/i18n/routing';
import { ArtworkMedia } from './artwork-media';
import { useMotion } from './motion-provider';

export function Passage({ artwork, locale, t }: { artwork: Artwork; locale: Locale; t: Messages }) {
  const [mode, setMode] = useState<'ink' | 'light'>('ink');
  const [crossing, setCrossing] = useState<'ink' | 'light' | null>(null);
  const [restart, setRestart] = useState(0);
  const [progress, setProgress] = useState({ time: 9, duration: 30 });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const { paused } = useMotion();
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const nextMode = mode === 'ink' ? 'light' : 'ink';
  const nextMedia = getInterpretation(artwork, nextMode);
  function cross() {
    if (crossing) return;
    if (paused) {
      setMode(nextMode);
      return;
    }
    setCrossing(nextMode);
    timers.current = [
      setTimeout(() => setMode(nextMode), 540),
      setTimeout(() => setCrossing(null), 1250),
    ];
  }
  return (
    <section className={`passage material-${mode}`} aria-labelledby="passage-title">
      <div className="passage-kicker eyebrow">
        <span>01</span>
        <span>{t.passage}</span>
        <span className="fine-line" />
        <span>{mode === 'ink' ? t.ink : t.light}</span>
      </div>
      <div className="passage-field">
        <div className="floating-sheet">
          <ArtworkMedia
            key={mode}
            media={getInterpretation(artwork, mode)}
            alt={`${t.signature} ${artwork.id} · ${mode === 'ink' ? t.ink : t.light}`}
            priority
            startAt={restart ? 0 : 9}
            restart={restart}
            repeat
            onProgress={(time, duration) => setProgress({ time, duration })}
          />
        </div>
      </div>
      <div className="passage-title">
        <p className="eyebrow">{t.threeBodies}</p>
        <h1 id="passage-title">
          {t.shape}
          <br />
          <em>{t.ofMotion}</em>
        </h1>
        <p className="hero-copy">{t.heroCopy}</p>
        <Link className="text-link" href={localizedPath(locale, '/collection')}>
          {t.enterAtlas}
          <ArrowUpRight size={17} />
        </Link>
      </div>
      <div className="passage-record">
        <span className="eyebrow">
          {t.signature} {String(artwork.id).padStart(3, '0')}
        </span>
        <div className="film-record">
          <span className="live-dot" />
          {mode === 'ink' ? `${t.ink} / ${t.film}` : t.light}
          <span>
            {mode === 'ink'
              ? `00:${Math.floor(progress.time).toString().padStart(2, '0')}`
              : t.still}
          </span>
        </div>
        <div className="progress-track">
          <i
            style={{
              width: `${mode === 'ink' ? (progress.time / progress.duration) * 100 : 100}%`,
            }}
          />
        </div>
        <div className="record-actions">
          <button onClick={() => setRestart((value) => value + 1)} disabled={mode !== 'ink'}>
            {t.beginning} <RotateCcw size={10} />
          </button>
          <Link href={localizedPath(locale, `/art/${artwork.id}?view=still`)}>
            {t.studyStill} ↗
          </Link>
        </div>
      </div>
      <button className="material-portal" onClick={cross} disabled={!!crossing}>
        <span className="eyebrow">
          {t.anotherExpression} <ArrowUpRight size={15} />
        </span>
        {nextMedia?.still ? (
          <Image src={nextMedia.still} alt="" width={3456} height={2234} unoptimized />
        ) : null}
        <span className="portal-title">{mode === 'ink' ? t.crossLight : t.crossInk}</span>
      </button>
      <p className="passage-margin eyebrow">{t.oneMotion}</p>
      {crossing ? (
        <div className={`material-curtain to-${crossing}`} aria-hidden="true">
          <span>
            {t.signature} {artwork.id}
            <br />
            {crossing === 'ink' ? t.ink : t.light}
          </span>
        </div>
      ) : null}
    </section>
  );
}
