'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RotateCcw } from 'lucide-react';
import type { Artwork } from '@/lib/art/types';
import { getInterpretation } from '@/lib/art/types';
import { workNumber } from '@/lib/art/number';
import type { Messages } from '@/lib/i18n/en';
import { localizedPath, type Locale } from '@/lib/i18n/routing';
import { ArtworkMedia } from './artwork-media';
import { useMotion } from './motion-provider';

/** The home rests briefly after its film resolves (--t-rest-dusk); the Dusk follows later. */
const REST_MS = 6000;
/** Input right after pressing Sit is the press itself, not a request for the chrome back. */
const SIT_GRACE_MS = 600;
/** Once the arrival film has resolved in this session, the home opens on the still. */
const resolvedKey = 'cosmic-art-home-film-v1';
const noSubscription = () => () => {};
function resolvedInSession() {
  try {
    return sessionStorage.getItem(resolvedKey) === 'resolved';
  } catch {
    return false;
  }
}
const unresolvedOnServer = () => false;

function clock(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)
    .toString()
    .padStart(2, '0')}:${(whole % 60).toString().padStart(2, '0')}`;
}

export function Passage({
  artwork,
  locale,
  t,
  previewSrc,
}: {
  artwork: Artwork;
  locale: Locale;
  t: Messages;
  /** Inline bytes of the Ink preview, so the first paint needs no image request. */
  previewSrc?: string;
}) {
  const [mode, setMode] = useState<'ink' | 'light'>('ink');
  const [crossing, setCrossing] = useState<'ink' | 'light' | null>(null);
  const [restart, setRestart] = useState(0);
  const [progress, setProgress] = useState({ time: 0, duration: 0 });
  const [playing, setPlaying] = useState(false);
  const [settled, setSettled] = useState(false);
  const [ended, setEnded] = useState(false);
  const [restedHere, setRested] = useState(false);
  // The session remembers a resolved arrival; a visitor's Again or a fresh ending overrides it.
  const resolvedBefore = useSyncExternalStore(
    noSubscription,
    resolvedInSession,
    unresolvedOnServer,
  );
  const [resolvedOverride, setResolvedOverride] = useState<boolean | null>(null);
  // An ending on this very visit is remembered for the next one; here it rests first.
  const resolved = resolvedOverride ?? (ended ? false : resolvedBefore);
  const rested = restedHere || (resolvedOverride === null && !ended && resolvedBefore);
  const [sit, setSit] = useState(false);
  const sitAt = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const { paused, toggle } = useMotion();
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (!ended) return;
    const timer = setTimeout(() => {
      setRested(true);
      setSit(false);
    }, REST_MS);
    return () => clearTimeout(timer);
  }, [ended]);
  const nextMode = mode === 'ink' ? 'light' : 'ink';
  const nextMedia = getInterpretation(artwork, nextMode);
  const media = getInterpretation(artwork, mode);
  const hasFilm = mode === 'ink' && !!media?.films.length;
  function cross() {
    if (crossing) return;
    setSettled(false);
    setPlaying(false);
    setSit(false);
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
  function again() {
    setResolvedOverride(false);
    setEnded(false);
    setRested(false);
    setProgress({ time: 0, duration: 0 });
    setRestart((value) => value + 1);
    if (paused) toggle();
  }
  function sitDown() {
    sitAt.current = Date.now();
    setSit(true);
  }
  function wake() {
    if (!sit || Date.now() - sitAt.current < SIT_GRACE_MS) return;
    setSit(false);
  }
  const state = !settled ? t.arriving : playing ? t.film : t.still;
  const label = `${mode === 'ink' ? t.ink : t.light} / ${state}`;
  return (
    <section
      className={`passage material-${mode}`}
      aria-labelledby="passage-title"
      data-sit={sit ? '' : undefined}
      onPointerMove={wake}
      onKeyDown={wake}
      onTouchStart={wake}
      onFocus={wake}
    >
      <div className="passage-kicker eyebrow">
        <span>{t.passage}</span>
        <span className="fine-line" />
        <span>{mode === 'ink' ? t.ink : t.light}</span>
      </div>
      <div className="passage-field">
        <div className="floating-sheet">
          <ArtworkMedia
            key={mode}
            media={media}
            alt={`${t.signature} ${artwork.id} · ${mode === 'ink' ? t.ink : t.light}`}
            priority
            hold
            artworkId={artwork.id}
            previewSrc={mode === 'ink' ? previewSrc : undefined}
            still={mode === 'ink' && resolved}
            restart={restart}
            onProgress={(time, duration) => setProgress({ time, duration })}
            onPlaybackChange={setPlaying}
            onSettled={() => setSettled(true)}
            onEnded={() => {
              setEnded(true);
              setPlaying(false);
              try {
                sessionStorage.setItem(resolvedKey, 'resolved');
              } catch {
                /* Storage is optional. */
              }
            }}
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
        <Link className="text-link" href={localizedPath(locale, '/collection?view=atlas')}>
          {t.enterAtlas}
        </Link>
      </div>
      <div className="passage-record">
        <span className="eyebrow">{workNumber(artwork.id)}</span>
        <div className="film-record">
          <span className={playing ? 'live-dot is-live' : 'live-dot'} />
          {label}
          <span>{hasFilm && progress.duration ? clock(progress.time) : ''}</span>
        </div>
        <div className="progress-track">
          <i
            style={{
              width: `${
                mode === 'ink'
                  ? progress.duration
                    ? (progress.time / progress.duration) * 100
                    : 0
                  : 100
              }%`,
            }}
          />
        </div>
        <div className="record-actions">
          {hasFilm && rested ? (
            <button onClick={again}>
              {t.again} <RotateCcw size={10} />
            </button>
          ) : hasFilm ? (
            <button onClick={sitDown} aria-pressed={sit}>
              {t.sit}
            </button>
          ) : null}
          <Link href={localizedPath(locale, `/art/${artwork.id}?view=still`)}>{t.studyStill}</Link>
        </div>
      </div>
      <button className="material-portal" onClick={cross} disabled={!!crossing}>
        <span className="eyebrow">{t.anotherExpression}</span>
        {nextMedia?.still ? (
          <Image
            src={nextMedia.thumbnail ?? nextMedia.still}
            alt=""
            width={nextMedia.thumbnail ? (nextMedia.thumbnailWidth ?? 640) : 3456}
            height={nextMedia.thumbnail ? (nextMedia.thumbnailHeight ?? 414) : 2234}
            unoptimized
          />
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
