'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import {
  getInterpretation,
  type ArtFilm,
  type ArtInterpretation,
  type Artwork,
  type PlateDetail,
} from '@/lib/art/types';
import { getPlateGround } from '@/lib/art/plate-records';
import { workFolio, workNumber } from '@/lib/art/number';
import { fill } from '@/lib/i18n/format';
import type { Messages } from '@/lib/i18n/en';
import type { Locale } from '@/lib/i18n/routing';
import { ArtworkStage } from './artwork-stage';
import { inField } from './keys';
import { Loupe, type LoupeView } from './loupe';
import { useMediaPolicy } from './media-policy';
import { useMotion } from './motion-provider';
import styles from './artwork-room.module.css';

/*
  The chrome-less room (vision §6): the work fills 100dvh in its own material, black for Light
  and the sheet's measured tone for Ink. Every word sits on one hairline edge strip at the
  bottom that rests after a quiet spell and returns on any input, never leaving the DOM, so
  the keyboard always finds it. A 1 px transport at the viewport's edge replaces the native
  controls; status text lives in the strip, never over pixels. The inline film's time
  continues into the room. The Slow room is the named state of the long studies. Opening and
  closing are the Expansion: the work grows from its plate while the ground fades in.
*/
/** Controls fade after this quiet spell (--t-idle) and return on any pointer, touch or key. */
const IDLE_MS = 2000;
/** The order the strip lists a work's films in. */
const FILM_ORDER = ['normal', 'medium', 'slow', 'sweep'];
/** A step of the arrow keys on the transport, in seconds; with Shift, ten. */
const SCRUB_S = 1;
const SCRUB_SHIFT_S = 10;

type ArtworkRoomProps = {
  artwork: Artwork;
  t: Messages;
  /** Formats the loupe's coordinates; the venue's default is English. */
  locale?: Locale;
  expression: string;
  onExpressionChange: (expression: string) => void;
  /** Only an explicit request for a complete film may opt into its transfer. */
  initialFilm?: boolean;
  /**
   * The plate's current time in seconds of the complete film, so the room's film resumes
   * where the plate was. A plate playing an excerpt passes its offset into the source.
   */
  startAt?: number;
  pendingExpression?: string | null;
  expressionFailed?: boolean;
  /** Safari pointer clicks need not focus the launcher; capture the explicit opener. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
};

type FilmMemory = Map<string, number>;
type FilmStatus = 'loading' | 'failed' | null;

function expressionLabel(media: ArtInterpretation, t: Messages) {
  return media.id === 'ink' ? t.ink : media.id === 'light' ? t.light : media.label;
}

export function filmLabel(film: ArtFilm, t: Messages) {
  return film.id === 'normal'
    ? t.film
    : film.id === 'medium'
      ? t.longStudy
      : film.id === 'slow'
        ? t.extendedStudy
        : film.id === 'sweep'
          ? t.spectralSweep
          : film.label;
}

/** A long study is a complete film of minutes; the normal film and the sweep are not. */
export function isStudy(film: ArtFilm) {
  return film.id === 'medium' || film.id === 'slow';
}

/** Elapsed time in plain minutes and seconds; never the contract's hours. */
export function clock(seconds: number) {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(whole / 60)
    .toString()
    .padStart(2, '0')}:${(whole % 60).toString().padStart(2, '0')}`;
}

function tokenMs(element: Element, name: string, fallback: number): number {
  const value = getComputedStyle(element).getPropertyValue(name).trim();
  const match = /^([\d.]+)(ms|s)$/.exec(value);
  if (!match) return fallback;
  return parseFloat(match[1]) * (match[2] === 's' ? 1000 : 1);
}

/** The rungs and the published still as one srcset: a phone rests on the 1280 rung. */
function sourceSet(media: ArtInterpretation) {
  const rungs = (media.rungs ?? []).map((rung) => `${rung.src} ${rung.width}w`);
  if (!rungs.length || !media.still) return undefined;
  return [...rungs, `${media.still} ${media.width ?? 3456}w`].join(', ');
}

function RoomStill({
  media,
  label,
  attempt,
  onFailure,
}: {
  media: ArtInterpretation;
  label: string;
  attempt: number;
  onFailure: () => void;
}) {
  if (!media.still) return null;
  return (
    <div className={styles.still}>
      <img
        key={attempt}
        className={styles.image}
        src={media.still}
        srcSet={sourceSet(media)}
        sizes="100vw"
        alt={label}
        width={media.width ?? 3456}
        height={media.height ?? 2234}
        loading="eager"
        decoding="async"
        data-room-media
        onError={onFailure}
      />
    </div>
  );
}

/**
 * A complete film exists in the DOM only after a visitor chooses it. The element carries no
 * native controls: the room's own transport drives it, and reports its time to the strip.
 */
function RoomFilm({
  media,
  film,
  label,
  t,
  memory,
  startAt,
  attempt,
  playerRef,
  onTime,
  onPlaying,
  onStatus,
}: {
  media: ArtInterpretation;
  film: ArtFilm;
  label: string;
  t: Messages;
  memory: FilmMemory;
  startAt?: number;
  attempt: number;
  playerRef: RefObject<HTMLVideoElement | null>;
  onTime: (current: number, duration: number) => void;
  onPlaying: (playing: boolean) => void;
  onStatus: (status: FilmStatus) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const identity = `${film.variantKey}:${film.src}`;

  useEffect(() => {
    const player = video.current;
    if (!player) return;
    playerRef.current = player;
    let resume = true;
    let disposed = false;
    const play = () => {
      // A user agent may refuse playback; the transport remains available.
      void player.play().catch(() => {});
    };
    const restorePosition = () => {
      // The room resumes where the plate was, unless this film was already watched in the room.
      const position = memory.get(identity) ?? (film.id === 'normal' ? startAt : undefined);
      if (position && Number.isFinite(player.duration)) {
        player.currentTime = Math.min(position, Math.max(0, player.duration - 0.1));
      }
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') {
        resume = !player.paused && !player.ended;
        player.pause();
      } else if (resume && !disposed) {
        play();
      }
    };
    player.addEventListener('loadedmetadata', restorePosition);
    // Strict Mode and Activity may replay effects on the same DOM node. Cleanup
    // releases the decoder, so reattach this chosen film before restarting it.
    if (!player.getAttribute('src')) {
      player.setAttribute('src', film.src);
      player.load();
    }
    // Cached media can already have metadata before this effect subscribes.
    if (player.readyState >= HTMLMediaElement.HAVE_METADATA) restorePosition();
    document.addEventListener('visibilitychange', visibility);
    if (document.visibilityState !== 'hidden') play();
    return () => {
      disposed = true;
      if (Number.isFinite(player.currentTime)) {
        memory.set(identity, player.ended ? 0 : player.currentTime);
      }
      player.removeEventListener('loadedmetadata', restorePosition);
      document.removeEventListener('visibilitychange', visibility);
      player.pause();
      // Removing the source cancels downloads and releases the decoder even on route changes.
      player.removeAttribute('src');
      player.load();
      if (playerRef.current === player) playerRef.current = null;
    };
  }, [identity, film.src, film.id, memory, startAt, attempt, playerRef]);

  return (
    <div className={styles.film}>
      <video
        key={attempt}
        ref={video}
        src={film.src}
        poster={film.poster ?? media.still}
        className={styles.video}
        muted
        playsInline
        preload="metadata"
        aria-label={`${label} · ${filmLabel(film, t)}`}
        data-room-media
        onLoadedMetadata={(event) =>
          onTime(event.currentTarget.currentTime, event.currentTarget.duration)
        }
        onTimeUpdate={(event) =>
          onTime(event.currentTarget.currentTime, event.currentTarget.duration)
        }
        onPlay={() => onPlaying(true)}
        onPause={() => onPlaying(false)}
        onEnded={() => onPlaying(false)}
        onCanPlay={() => onStatus(null)}
        onPlaying={() => onStatus(null)}
        onWaiting={() => onStatus('loading')}
        onError={() => {
          onPlaying(false);
          onStatus('failed');
        }}
      />
    </div>
  );
}

/** The painted rectangle of a media element; its box is sized to its own proportion. */
function paintedRect(element: Element) {
  const bounds = element.getBoundingClientRect();
  return { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height };
}

export function ArtworkRoom({
  artwork,
  t,
  locale = 'en',
  expression,
  onExpressionChange,
  initialFilm = false,
  startAt,
  pendingExpression,
  expressionFailed = false,
  returnFocusRef,
  onClose,
}: ArtworkRoomProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const ground = useRef<HTMLDivElement>(null);
  const edge = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const player = useRef<HTMLVideoElement | null>(null);
  const alive = useRef(false);
  const fullscreenRequest = useRef(false);
  const backdropStart = useRef(false);
  const closing = useRef(false);
  const { paused, reducedMotion, theatre } = useMotion();
  const { constrained } = useMediaPolicy();
  const instant = paused || reducedMotion || theatre === 'hushed';
  const [positions] = useState<FilmMemory>(() => new Map());
  const [showFilm, setShowFilm] = useState(initialFilm);
  const [selectedFilms, setSelectedFilms] = useState<Record<string, string>>({});
  const [filmAttempt, setFilmAttempt] = useState(0);
  const [filmStatus, setFilmStatus] = useState<FilmStatus>(initialFilm ? 'loading' : null);
  const [stillAttempt, setStillAttempt] = useState(0);
  const [stillFailed, setStillFailed] = useState<string | null>(null);
  const [time, setTime] = useState({ current: 0, duration: 0 });
  const [playing, setPlaying] = useState(false);
  const [allowedStudies, setAllowedStudies] = useState<string[]>([]);
  const [loupe, setLoupe] = useState<{ window: number } | null>(null);
  const [view, setView] = useState<LoupeView | null>(null);
  const [hint, setHint] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenPending, setFullscreenPending] = useState(false);
  const [fullscreenFailed, setFullscreenFailed] = useState(false);
  const [idle, setIdle] = useState(false);
  // iPhone Safari never grants element fullscreen; a control that always fails is not offered.
  const [fullscreenAvailable, setFullscreenAvailable] = useState(false);
  useEffect(() => {
    setFullscreenAvailable(
      document.fullscreenEnabled === true && typeof frame.current?.requestFullscreen === 'function',
    );
  }, []);

  const media = getInterpretation(artwork, expression) ?? artwork.media[0];
  const films = media
    ? [...media.films].sort((a, b) => FILM_ORDER.indexOf(a.id) - FILM_ORDER.indexOf(b.id))
    : [];
  const film = films.find((item) => item.id === selectedFilms[media?.id ?? '']) ?? films[0];
  const label = `${workNumber(artwork.id)} · ${media ? expressionLabel(media, t) : ''}`;
  const plate = media ? getPlateGround(artwork.id, media.id, media.stillSha256) : undefined;
  const tone = media?.id === 'light' ? '#000000' : (plate?.tone ?? '#f1ebdf');
  // The detail windows travel with the work's own media, bound to the still they were cut from.
  const windows: PlateDetail[] = media?.detail ?? [];
  const stillShown = !!media?.still && stillFailed !== media.still;
  // A long study on a slow connection waits for an explicit word; the still stands in.
  const studyHeld = !!film && isStudy(film) && constrained && !allowedStudies.includes(film.id);
  const filmShown = showFilm && !!film && !loupe && !studyHeld && filmStatus !== 'failed';
  const slow = filmShown && isStudy(film);
  const numbers = new Intl.NumberFormat(locale);

  /* Open and close: the Expansion. */
  const expand = useCallback((direction: 'open' | 'close') => {
    const room = frame.current;
    const target = room?.querySelector<HTMLElement>('[data-room-media]');
    const groundNode = ground.current;
    const edgeNode = edge.current;
    if (!room || !groundNode || !edgeNode || typeof room.animate !== 'function')
      return Promise.resolve();
    const expandMs = tokenMs(room, '--t-expand', 650);
    const chromeMs = tokenMs(room, '--t-chrome', 270);
    const easing = getComputedStyle(room).getPropertyValue('--ease-settle').trim() || 'ease';
    const animations: Animation[] = [];
    const plateImage = document.querySelector<HTMLElement>(
      '[data-artwork-stage="page"] [data-layer-state="current"] .art-media img.art-still, [data-artwork-stage="page"] .art-media img.art-still',
    );
    if (target && plateImage) {
      const from = paintedRect(plateImage);
      const to = paintedRect(target);
      if (from.width && to.width) {
        const scale = from.width / to.width;
        const away = `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${scale})`;
        target.style.transformOrigin = '0 0';
        animations.push(
          target.animate(
            direction === 'open'
              ? [{ transform: away }, { transform: 'none' }]
              : [{ transform: 'none' }, { transform: away }],
            { duration: expandMs, easing, fill: 'both' },
          ),
        );
      }
    }
    animations.push(
      groundNode.animate(
        direction === 'open' ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }],
        { duration: expandMs, easing, fill: 'both' },
      ),
      edgeNode.animate(
        direction === 'open'
          ? [
              { opacity: 0, transform: 'translateY(9px)' },
              { opacity: 1, transform: 'none' },
            ]
          : [
              { opacity: 1, transform: 'none' },
              { opacity: 0, transform: 'translateY(9px)' },
            ],
        { duration: chromeMs, easing, fill: 'both' },
      ),
    );
    return Promise.all(animations.map((animation) => animation.finished.catch(() => {}))).then(
      () => {
        if (direction === 'open') for (const animation of animations) animation.cancel();
      },
    );
  }, []);
  const requestClose = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    // Without the Web Animations API, or under a still preference, the swap is instant.
    if (instant || typeof frame.current?.animate !== 'function') {
      onClose();
      return;
    }
    frame.current?.setAttribute('data-closing', '');
    void expand('close').then(() => {
      if (alive.current) onClose();
    });
  }, [expand, instant, onClose]);

  useEffect(() => {
    const modal = dialog.current;
    const room = frame.current;
    if (!modal || !room) return;
    alive.current = true;
    closing.current = false;
    const explicitOpener = returnFocusRef?.current;
    const opener = explicitOpener?.isConnected
      ? explicitOpener
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const overflowProperties = ['overflow', 'overflow-x', 'overflow-y'];
    const locked = [document.documentElement, document.body].map((element) => ({
      element,
      // Preserve explicit longhands too: writing a shorthand can replace them.
      declarations: Array.from(element.style)
        .filter((property) => overflowProperties.includes(property))
        .map((property) => ({
          property,
          value: element.style.getPropertyValue(property),
          priority: element.style.getPropertyPriority(property),
        })),
    }));
    for (const { element } of locked) element.style.setProperty('overflow', 'hidden');
    modal.showModal();
    closeButton.current?.focus({ preventScroll: true });
    if (!instant) void expand('open');
    const changed = () => setFullscreen(document.fullscreenElement === room);
    document.addEventListener('fullscreenchange', changed);
    return () => {
      alive.current = false;
      document.removeEventListener('fullscreenchange', changed);
      if (document.fullscreenElement === room && document.exitFullscreen) {
        void document.exitFullscreen().catch(() => {});
      }
      modal.close();
      for (const { element, declarations } of locked) {
        for (const property of overflowProperties) element.style.removeProperty(property);
        for (const { property, value, priority } of declarations) {
          element.style.setProperty(property, value, priority);
        }
      }
      // The opener may have moved to the other ground while the room was open; the viewer
      // points the ref at the live word before closing, so the latest value is the right one.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const explicit = returnFocusRef?.current;
      const target = explicit?.isConnected && !explicit.closest('[inert]') ? explicit : opener;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
    // The Expansion runs once, on the first paint of the room.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnFocusRef]);

  // The edge strip rests after a quiet spell; any pointer, touch or key brings it back.
  useEffect(() => {
    const room = frame.current;
    if (!room) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const rest = () => {
      if (timer) clearTimeout(timer);
      setIdle(false);
      timer = setTimeout(() => setIdle(true), IDLE_MS);
    };
    rest();
    for (const name of ['pointermove', 'pointerdown', 'touchstart', 'keydown'] as const)
      room.addEventListener(name, rest, { passive: true });
    return () => {
      if (timer) clearTimeout(timer);
      for (const name of ['pointermove', 'pointerdown', 'touchstart', 'keydown'] as const)
        room.removeEventListener(name, rest);
    };
  }, []);

  const toggleFullscreen = async () => {
    const room = frame.current;
    if (!room || fullscreenRequest.current) return;
    fullscreenRequest.current = true;
    setFullscreenPending(true);
    setFullscreenFailed(false);
    try {
      if (document.fullscreenElement === room) {
        await document.exitFullscreen();
      } else if (room.requestFullscreen) {
        // A dialog itself cannot request fullscreen; its content frame can.
        await room.requestFullscreen();
        // A request may resolve after navigation or closing the room.
        if (!alive.current && document.fullscreenElement === room) {
          await document.exitFullscreen();
        }
      } else {
        setFullscreenFailed(true);
      }
    } catch {
      if (alive.current) setFullscreenFailed(true);
    } finally {
      fullscreenRequest.current = false;
      if (alive.current) setFullscreenPending(false);
    }
  };

  function showStill() {
    setShowFilm(false);
    setLoupe(null);
    setView(null);
  }
  function pickFilm(id: string) {
    if (!media) return;
    setSelectedFilms((current) => ({ ...current, [media.id]: id }));
    setFilmStatus('loading');
    setShowFilm(true);
    setLoupe(null);
    setView(null);
  }
  function retryFilm() {
    setFilmStatus('loading');
    setFilmAttempt((value) => value + 1);
  }
  function openLoupe(window = 0) {
    if (!stillShown) return;
    setShowFilm(false);
    setLoupe({ window });
  }
  function closeLoupe() {
    setLoupe(null);
    setView(null);
  }
  function togglePlay() {
    const node = player.current;
    if (!filmShown || !node) {
      if (film && !showFilm) pickFilm(film.id);
      else if (studyHeld && film) setAllowedStudies((current) => [...current, film.id]);
      return;
    }
    if (node.paused || node.ended) void node.play().catch(() => {});
    else node.pause();
  }
  function seekBy(seconds: number) {
    const node = player.current;
    if (!node || !Number.isFinite(node.duration)) return;
    node.currentTime = Math.min(node.duration, Math.max(0, node.currentTime + seconds));
    setTime({ current: node.currentTime, duration: node.duration });
  }
  function seekTo(event: ChangeEvent<HTMLInputElement>) {
    const node = player.current;
    const value = Number(event.target.value);
    if (!node || !Number.isFinite(value)) return;
    node.currentTime = value;
    setTime({ current: value, duration: node.duration });
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDialogElement>) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (inField(event.target)) return;
    const key = event.key;
    if (key === ' ') {
      if (!film) return;
      event.preventDefault();
      togglePlay();
    } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
      if (!filmShown || (event.target as Element).closest?.('[data-loupe]')) return;
      event.preventDefault();
      seekBy((key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? SCRUB_SHIFT_S : SCRUB_S));
    } else if (key === 'i' || key === 'I' || key === 'l' || key === 'L') {
      const to = key.toLowerCase() === 'i' ? 'ink' : 'light';
      if (artwork.media.some((item) => item.id === to) && !event.repeat) {
        event.preventDefault();
        onExpressionChange(to);
      }
    } else if (key === 'f' || key === 'F') {
      if (!film) return;
      event.preventDefault();
      if (!showFilm || loupe) pickFilm(selectedFilms[media?.id ?? ''] ?? film.id);
    } else if (key === 'z' || key === 'Z') {
      event.preventDefault();
      if (loupe) closeLoupe();
      else openLoupe(0);
    } else if (key === 'w' || key === 'W') {
      if (!loupe) return;
      event.preventDefault();
      closeLoupe();
    } else if (key === '?') {
      event.preventDefault();
      setHint((value) => !value);
    }
  }

  const detailLabel =
    loupe && view
      ? fill(t.detailOf, {
          n: workFolio(artwork.id),
          scale:
            view.ratio <= 1.05
              ? t.scaleNative
              : fill(t.scaleReadout, { ratio: numbers.format(view.ratio) }),
          x: `${numbers.format(view.x0)}–${numbers.format(view.x1)}`,
          y: `${numbers.format(view.y0)}–${numbers.format(view.y1)}`,
        })
      : null;
  const status = pendingExpression
    ? t.preparingExpression
    : expressionFailed
      ? t.expressionFailed
      : fullscreenFailed
        ? t.fullScreenUnavailable
        : media && !stillShown && !filmShown
          ? t.mediaUnavailable
          : showFilm && filmStatus === 'failed'
            ? t.mediaUnavailable
            : showFilm && studyHeld
              ? t.studyWaits
              : filmShown && filmStatus === 'loading'
                ? t.loadingFilm
                : detailLabel
                  ? detailLabel
                  : slow
                    ? `${t.slowRoom} · ${fill(t.elapsed, { time: clock(time.current) })}`
                    : '';
  const retryStill = media?.still && stillFailed === media.still && !showFilm;
  const retryFilmOffer = showFilm && filmStatus === 'failed' && !studyHeld;
  const hintRows: [string, string][] = [
    ['Space', t.keyPlay],
    ['← →', t.keyScrub],
    ['I L', t.keyExpressions],
    ['F', t.keyFilm],
    ['Z', t.keyDetail],
    ['W', t.keyWhole],
    ['?', t.keyHelp],
    ['Esc', t.close],
  ];

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-label={`${workNumber(artwork.id)} · ${t.viewingRoom}`}
      data-testid="artwork-room"
      data-material={media?.id}
      onCancel={(event) => {
        event.preventDefault();
        if (hint) setHint(false);
        else requestClose();
      }}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        backdropStart.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && backdropStart.current) requestClose();
        backdropStart.current = false;
      }}
    >
      <div
        ref={frame}
        className={styles.room}
        data-material={media?.id}
        data-idle={idle ? '' : undefined}
        data-slow={slow ? '' : undefined}
        data-loupe={loupe ? '' : undefined}
        style={{ '--room-surface': tone } as CSSProperties}
      >
        <div ref={ground} className={styles.ground} aria-hidden="true" />
        <div className={styles.canvas}>
          <ArtworkStage artworkId={artwork.id} expression={expression} scope="room">
            {media ? (
              loupe && stillShown ? (
                <Loupe
                  key={`${media.id}:${media.still}`}
                  media={media}
                  windows={windows}
                  initialWindow={loupe.window}
                  label={`${label} · ${t.detail}`}
                  onView={setView}
                />
              ) : filmShown ? (
                <RoomFilm
                  key={`${film.variantKey}:${film.src}`}
                  media={media}
                  film={film}
                  label={label}
                  t={t}
                  memory={positions}
                  startAt={startAt}
                  attempt={filmAttempt}
                  playerRef={player}
                  onTime={(current, duration) => setTime({ current, duration })}
                  onPlaying={setPlaying}
                  onStatus={setFilmStatus}
                />
              ) : stillShown ? (
                <RoomStill
                  key={`${media.id}:${media.still}`}
                  media={media}
                  label={label}
                  attempt={stillAttempt}
                  onFailure={() => setStillFailed(media.still ?? null)}
                />
              ) : null
            ) : null}
          </ArtworkStage>
        </div>

        <footer ref={edge} className={styles.edge}>
          <div className={styles.strip}>
            <div className={styles.identity}>
              <span className={styles.number}>{workNumber(artwork.id)}</span>
              <div className={styles.expressions} role="group" aria-label={t.ways}>
                {[...artwork.media]
                  .sort((a, b) => Number(b.id === 'ink') - Number(a.id === 'ink'))
                  .map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onExpressionChange(item.id)}
                      aria-pressed={expression === item.id}
                      aria-busy={pendingExpression === item.id}
                    >
                      {expressionLabel(item, t)}
                    </button>
                  ))}
              </div>
            </div>
            {loupe ? (
              <div className={styles.sources} role="group" aria-label={t.detail}>
                <button type="button" onClick={closeLoupe}>
                  {t.wholePlate}
                </button>
                {windows.map((window, index) => (
                  <button
                    key={`${window.x}:${window.y}`}
                    type="button"
                    aria-label={fill(t.detailWindow, { n: index + 1 })}
                    aria-pressed={loupe.window === index}
                    onClick={() => setLoupe({ window: index })}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
            ) : (
              <div className={styles.sources} role="group" aria-label={t.sources}>
                <button
                  type="button"
                  onClick={showStill}
                  aria-pressed={!showFilm || !film}
                  disabled={!media?.still}
                >
                  {t.still}
                </button>
                {films.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => pickFilm(item.id)}
                    aria-pressed={showFilm && film?.id === item.id}
                  >
                    {filmLabel(item, t)}
                    {item.id !== 'normal' && item.durationSeconds ? (
                      <>
                        {' · '}
                        <span className={styles.meta}>
                          {fill(t.durationSeconds, { n: Math.round(item.durationSeconds) })}
                        </span>
                      </>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
            <div className={styles.actions}>
              <button
                type="button"
                onClick={() => (loupe ? closeLoupe() : openLoupe(0))}
                aria-pressed={!!loupe}
                disabled={!stillShown}
              >
                {t.detail}
              </button>
              {fullscreenAvailable ? (
                <button
                  type="button"
                  onClick={() => void toggleFullscreen()}
                  disabled={fullscreenPending}
                  aria-busy={fullscreenPending}
                >
                  {fullscreen ? t.exitFullScreen : t.fullScreen}
                </button>
              ) : null}
              <button ref={closeButton} type="button" onClick={requestClose}>
                {t.close}
              </button>
            </div>
          </div>
          <div
            className={styles.notice}
            role={status ? 'status' : undefined}
            aria-live={detailLabel ? 'off' : 'polite'}
          >
            <span className={styles.statusText}>{status}</span>
            {retryStill ? (
              <button
                type="button"
                onClick={() => {
                  setStillFailed(null);
                  setStillAttempt((value) => value + 1);
                }}
              >
                {t.retry}
              </button>
            ) : retryFilmOffer ? (
              <button type="button" onClick={retryFilm}>
                {t.retry}
              </button>
            ) : showFilm && studyHeld && film ? (
              <button
                type="button"
                onClick={() => setAllowedStudies((current) => [...current, film.id])}
              >
                {t.playAnyway}
                {film.durationSeconds ? (
                  <>
                    {' · '}
                    <span className={styles.meta}>
                      {fill(t.durationSeconds, { n: Math.round(film.durationSeconds) })}
                    </span>
                  </>
                ) : null}
              </button>
            ) : null}
          </div>
        </footer>
        {hint ? (
          <div className={styles.hint} role="note" aria-label={t.roomKeys}>
            <dl>
              {hintRows.map(([key, meaning]) => (
                <div key={key}>
                  <dt>
                    <kbd>{key}</kbd>
                  </dt>
                  <dd>{meaning}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
        {filmShown ? (
          <>
            <span className={styles.readout} aria-hidden="true">
              {clock(time.current)} · {clock(time.duration)}
            </span>
            <input
              className={styles.transport}
              type="range"
              min={0}
              max={Math.max(1, Math.floor(time.duration || 0))}
              step={1}
              value={Math.min(
                Math.floor(time.current),
                Math.max(1, Math.floor(time.duration || 0)),
              )}
              aria-label={t.filmPosition}
              aria-valuetext={fill(t.timeOf, {
                current: clock(time.current),
                total: clock(time.duration),
              })}
              data-playing={playing ? '' : undefined}
              style={
                {
                  '--progress': `${time.duration ? Math.min(100, (time.current / time.duration) * 100) : 0}%`,
                } as CSSProperties
              }
              onChange={seekTo}
            />
          </>
        ) : null}
      </div>
    </dialog>
  );
}
