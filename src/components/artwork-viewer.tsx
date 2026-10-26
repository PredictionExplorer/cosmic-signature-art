'use client';
import Image from 'next/image';
import { Suspense, use, useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, RotateCcw, Pause, Play } from 'lucide-react';
import { getInterpretation, type Artwork } from '@/lib/art/types';
import { workNumber } from '@/lib/art/number';
import type { Messages } from '@/lib/i18n/en';
import { ArtworkMedia } from './artwork-media';
import { useMotion } from './motion-provider';
import { useMediaPolicy } from './media-policy';
import { ArtworkTransition } from './artwork-transition';
import { ArtworkStage, useArtworkExpression } from './artwork-stage';
import { ArtworkRoom } from './artwork-room';
import styles from './artwork-viewer.module.css';

/** After a film resolves into its still, nothing moves for --t-rest; then "Again". */
const REST_MS = 8000;
/** Input right after pressing Sit is the press itself, not a request for the chrome back. */
const SIT_GRACE_MS = 600;

type ArtworkViewerProps = {
  artwork: Artwork;
  t: Messages;
  initialStill?: boolean;
  initialExpression?: string;
  presentation?: 'gallery' | 'auction';
  /** Inline preview bytes per expression, read on the server for the route's hero. */
  inlinePreviews?: Partial<Record<string, string>>;
  /** The streaming live record; its media replace the registry's only when they differ. */
  live?: Promise<Artwork | null>;
};
export function ArtworkViewer(props: ArtworkViewerProps) {
  return (
    <ArtworkViewerSession
      key={`${props.artwork.id}:${props.initialStill ?? false}:${props.initialExpression ?? ''}`}
      {...props}
    />
  );
}

function mediaSignature(artwork: Artwork) {
  return JSON.stringify(
    artwork.media.map((item) => [
      item.id,
      item.still,
      item.thumbnail,
      item.films.map((film) => film.src),
    ]),
  );
}

/** The live record arrives after the plate; it changes the work only if its media differ. */
function LiveSync({
  live,
  onLive,
}: {
  live: Promise<Artwork | null>;
  onLive: (artwork: Artwork) => void;
}) {
  const artwork = use(live);
  useEffect(() => {
    if (artwork) onLive(artwork);
  }, [artwork, onLive]);
  return null;
}

function ArtworkViewerSession({
  artwork: initial,
  t,
  initialStill = false,
  initialExpression,
  presentation = 'gallery',
  inlinePreviews,
  live,
}: ArtworkViewerProps) {
  const [liveArtwork, setLiveArtwork] = useState<Artwork | null>(null);
  const artwork = liveArtwork ?? initial;
  const adoptLive = useCallback(
    (candidate: Artwork) => {
      setLiveArtwork((current) => {
        const base = current ?? initial;
        if (candidate.id !== base.id || mediaSignature(candidate) === mediaSignature(base))
          return current;
        return candidate;
      });
    },
    [initial],
  );
  const [still, setStill] = useState(initialStill);
  const [compare, setCompare] = useState(false);
  const [room, setRoom] = useState<'still' | 'film' | null>(null);
  const [restart, setRestart] = useState(0);
  const [playRequest, setPlayRequest] = useState(0);
  const [explicitFilm, setExplicitFilm] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [settled, setSettled] = useState(false);
  const [ended, setEnded] = useState(false);
  const [rested, setRested] = useState(false);
  const [sit, setSit] = useState(false);
  const sitAt = useRef(0);
  const [time, setTime] = useState({ current: 0, duration: 0 });
  const [failed, setFailed] = useState(false);
  const returnFocusRef = useRef<HTMLButtonElement>(null);
  // The click a browser synthesises after a waking press must not reach faded chrome.
  const swallowClick = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (swallowClick.current) clearTimeout(swallowClick.current);
    },
    [],
  );
  const { paused, toggle } = useMotion();
  const policy = useMediaPolicy();
  const { expression, pendingExpression, failedExpression, selectExpression, cancelPending } =
    useArtworkExpression({
      media: artwork.media,
      initialExpression,
      onCommit: () => {
        setTime({ current: 0, duration: 0 });
        setPlaying(false);
        setFailed(false);
        setCompare(false);
        setRestart(0);
        setPlayRequest(0);
        setSettled(false);
        setEnded(false);
        setRested(false);
        setSit(false);
      },
    });
  useEffect(() => {
    if (!ended) return;
    const timer = setTimeout(() => {
      setRested(true);
      setSit(false);
    }, REST_MS);
    return () => clearTimeout(timer);
  }, [ended]);
  const media = getInterpretation(artwork, expression);
  const light = getInterpretation(artwork, 'light');
  // The inline bytes were read from the registry's thumbnail; they follow only that thumbnail.
  const previewSrc =
    media?.thumbnail === getInterpretation(initial, expression)?.thumbnail
      ? inlinePreviews?.[expression]
      : undefined;
  // Only a hash-verified local delivery plays inline, from frame 0. The 640 excerpt is a
  // browsing preview; a complete published original waits for the room.
  const inlineFilm = media?.films.find((film) => film.delivery === 'local-preview');
  // The media identity stays stable; whether the film may play is a separate switch, so
  // the room opening or the connection policy settling never remounts the plate.
  const ambient = media ? { ...media, films: inlineFilm ? [inlineFilm] : [] } : undefined;
  const ambientFilm = !room && (!policy.constrained || explicitFilm);
  const label = (id: string) =>
    id === 'ink'
      ? t.ink
      : id === 'light'
        ? t.light
        : (artwork.media.find((item) => item.id === id)?.label ?? id);
  const clock = (seconds: number) =>
    `${Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0')}:${Math.floor(seconds % 60)
      .toString()
      .padStart(2, '0')}`;
  function openRoom(film: boolean, trigger: HTMLButtonElement) {
    returnFocusRef.current = trigger;
    cancelPending();
    setRestart(0);
    setPlayRequest(0);
    setRoom(film ? 'film' : 'still');
    setPlaying(false);
    setSit(false);
  }
  function closeRoom() {
    cancelPending();
    setRoom(null);
  }
  function requestFilm() {
    setFailed(false);
    setStill(false);
    setExplicitFilm(true);
    setEnded(false);
    setRested(false);
    setPlayRequest((value) => value + 1);
    if (paused) toggle();
  }
  function restartFilm() {
    setFailed(false);
    setStill(false);
    setExplicitFilm(true);
    setEnded(false);
    setRested(false);
    setRestart((value) => value + 1);
    setTime((value) => ({ ...value, current: 0 }));
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
  function wakeByPress() {
    if (!sit || Date.now() - sitAt.current < SIT_GRACE_MS) return;
    setSit(false);
    // The press only brings the chrome back; the click that follows it is not a choice.
    if (swallowClick.current) clearTimeout(swallowClick.current);
    swallowClick.current = setTimeout(() => {
      swallowClick.current = null;
    }, 500);
  }
  function swallowWakingClick(event: React.MouseEvent) {
    if (!swallowClick.current) return;
    clearTimeout(swallowClick.current);
    swallowClick.current = null;
    event.preventDefault();
    event.stopPropagation();
  }
  const idle = paused || still || !playing;
  const filmState = !settled ? 'arriving' : playing ? 'film' : 'still';
  const state = t[filmState];
  return (
    <>
      <section
        className={`viewing-room ${styles.room} ${presentation === 'auction' ? styles.auction : ''}`}
        aria-label={t.ways}
        data-expression={expression}
        data-sit={sit ? '' : undefined}
        onPointerMove={wake}
        onPointerDown={wakeByPress}
        onTouchStart={wakeByPress}
        onKeyDown={wake}
        onFocus={wake}
        onClickCapture={swallowWakingClick}
      >
        {live ? (
          <Suspense fallback={null}>
            <LiveSync live={live} onLive={adoptLive} />
          </Suspense>
        ) : null}
        <header className={styles.topbar}>
          <p className="eyebrow">
            {t.viewingRoom} / {workNumber(artwork.id)}
          </p>
          <div className={`interpretation-list ${styles.expressions}`} aria-label={t.ways}>
            {[...artwork.media]
              .sort((a, b) => Number(b.id === 'ink') - Number(a.id === 'ink'))
              .map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    selectExpression(item.id);
                    setCompare(false);
                  }}
                  aria-pressed={expression === item.id}
                  aria-busy={pendingExpression === item.id}
                >
                  {label(item.id)}
                </button>
              ))}
          </div>
          <button
            className={styles.enlarge}
            onClick={(event) => openRoom(false, event.currentTarget)}
            aria-label={t.enlarge}
          >
            <Maximize2 size={17} />
            <span>{t.enlarge}</span>
          </button>
        </header>
        <div className={`viewer-media ${styles.media}`}>
          <div
            className={`viewer-plate ${styles.plate} ${compare ? `paired ${styles.paired}` : ''}`}
          >
            <ArtworkTransition
              artworkId={artwork.id}
              interpretationId={expression}
              role="detail"
              disabled={compare || !!room}
            >
              <ArtworkStage
                artworkId={artwork.id}
                expression={expression}
                scope="page"
                disabled={compare || !!room}
              >
                <ArtworkMedia
                  key={`${artwork.id}-${expression}`}
                  media={ambient}
                  alt={`${t.signature} ${artwork.id} · ${label(expression)}`}
                  priority
                  hold
                  ambient={ambientFilm}
                  artworkId={artwork.id}
                  previewSrc={previewSrc}
                  still={still || !!room}
                  startAt={time.current}
                  restart={restart}
                  playRequest={playRequest}
                  onPlaybackChange={setPlaying}
                  onProgress={(current, duration) => setTime({ current, duration })}
                  onSettled={() => setSettled(true)}
                  onEnded={() => {
                    setEnded(true);
                    setPlaying(false);
                  }}
                  onFailure={() => setFailed(true)}
                />
              </ArtworkStage>
            </ArtworkTransition>
            {compare && light?.still ? (
              <Image
                src={light.still}
                alt={`${t.signature} ${artwork.id} · ${t.light}`}
                width={light.width ?? 3456}
                height={light.height ?? 2234}
                unoptimized
              />
            ) : null}
          </div>
        </div>
        <div className={styles.lower}>
          <div className={`work-transport ${styles.transport}`}>
            {inlineFilm ? (
              <>
                <button
                  onClick={() => {
                    if (playing && !paused && !still) toggle();
                    else requestFilm();
                  }}
                >
                  {idle ? <Play size={12} /> : <Pause size={12} />}{' '}
                  {ended && rested ? t.again : idle ? t.play : t.pause}
                </button>
                <button onClick={restartFilm}>
                  <RotateCcw size={12} /> {t.restart}
                </button>
                <button onClick={() => setStill((value) => !value)} aria-pressed={still}>
                  {t.still}
                </button>
                <button onClick={sitDown} aria-pressed={sit}>
                  {t.sit}
                </button>
                <div className="progress-track" aria-hidden="true">
                  <i
                    style={{
                      width: `${time.duration ? (time.current / time.duration) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className={styles.clock}>
                  {clock(time.current)} / {clock(time.duration)}
                </span>
                <span className={styles.state} data-film-state={filmState}>
                  {state}
                </span>
              </>
            ) : (
              <span className={styles.state} data-film-state={settled ? 'still' : 'arriving'}>
                {settled ? t.still : t.arriving}
              </span>
            )}
          </div>
          <aside className={`work-rail ${styles.rail}`}>
            <p className={styles.ending}>{t.oneMotion}</p>
            <div className={styles.actions}>
              {expression !== 'light' && light ? (
                <button
                  className="text-link"
                  onClick={() => {
                    cancelPending();
                    setCompare((value) => !value);
                  }}
                  aria-pressed={compare}
                >
                  {compare ? t.closeCompare : t.compare}
                </button>
              ) : null}
              {media?.films.length ? (
                <button
                  className="text-link"
                  onClick={(event) => openRoom(true, event.currentTarget)}
                >
                  {t.completeFilm}
                  <Play size={13} />
                </button>
              ) : null}
            </div>
          </aside>
          {pendingExpression ? (
            <p className={styles.status} role="status">
              {t.preparingExpression}
            </p>
          ) : failedExpression ? (
            <p className={styles.status} role="status">
              {t.expressionFailed}
            </p>
          ) : failed ? (
            <p className={styles.status} role="status">
              {t.mediaUnavailable}
            </p>
          ) : null}
        </div>
      </section>
      {room ? (
        <ArtworkRoom
          artwork={artwork}
          t={t}
          expression={expression}
          pendingExpression={pendingExpression ?? undefined}
          expressionFailed={!!failedExpression}
          onExpressionChange={selectExpression}
          initialFilm={room === 'film'}
          onClose={closeRoom}
          returnFocusRef={returnFocusRef}
        />
      ) : null}
    </>
  );
}
