'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
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
import { heldNm, startingNm, wavelengthRange } from '@/lib/art/spectral-sweep';
import { clock, expressionWord, fill, filmLabel, formatBytes } from '@/lib/i18n/format';
import type { Messages } from '@/lib/i18n/en';
import type { Locale } from '@/lib/i18n/routing';
import { stillRequest } from './artwork-media';
import { ArtworkStage } from './artwork-stage';
import { inField } from './keys';
import { Loupe, type LoupeView } from './loupe';
import { useMediaPolicy } from './media-policy';
import { useMotion } from './motion-provider';
import { Apart, NoticeRoom, NOTICE_JOIN, WhenRamp, noticeLines, noticeWords } from './room-notice';
import { WavelengthSlider, wavelengthForKey } from './spectrum-rule';
import { WavelengthLens } from './wavelength-lens';
import { WhenLens } from './when-lens';
import { FilmScoreBand } from './film-score-band';
import styles from './artwork-room.module.css';
import {
  markedAt,
  markedFrom,
  pairName,
  physicsAt,
  scoreClock,
  type FilmScore,
  type InkClock,
} from '@/lib/physics/film-score';
import { lightFilmDuration } from '@/lib/physics/light-film';
import { ART_HEIGHT, ART_WIDTH } from '@/lib/art/constants';
import { tokenMs } from './turn';

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
/** The keys that move the Wavelength lens from anywhere in the room while it is on. */
const WAVELENGTH_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End']);
/** A film's clock before it has reported one. */
const NO_TIME = { current: 0, duration: 0 };

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
  /**
   * The derived views (the When and Wavelength lenses) may be offered. They are analysis, never
   * the work, so a sale surface passes false and the room shows the work alone.
   */
  derivedViews?: boolean;
  /**
   * The films' score (third-physics.md §5.5), as the viewer measured it: the complete film's
   * transport carries it, and its readout says the physics of the moment. Every Light film keeps
   * its clock; an Ink film does where `ink` names it (third-physics-phase-e.md §6).
   */
  filmScore?: { score: FilmScore; hues: readonly number[]; ink?: InkClock } | null;
  onClose: () => void;
};

type FilmMemory = Map<string, number>;
type FilmStatus = 'loading' | 'failed' | null;

/** A long study is a complete film of minutes; the normal film and the sweep are not. */
export function isStudy(film: ArtFilm) {
  return film.id === 'medium' || film.id === 'slow';
}

/** The room's still is as wide as the room: its layout width for the still ladder. */
export const ROOM_SIZES = '100vw';

/** The rungs and the published still as one srcset: a phone rests on the 1280 rung. */
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
  // The whole ladder, whatever the connection: the room is where the original is asked for.
  const still = stillRequest(media, { sizes: ROOM_SIZES });
  if (!still) return null;
  return (
    <div className={styles.still}>
      <img
        key={attempt}
        className={styles.image}
        src={still.src}
        srcSet={still.srcSet}
        sizes={still.sizes}
        alt={label}
        width={media.width ?? ART_WIDTH}
        height={media.height ?? ART_HEIGHT}
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
    // A film has a position once its metadata has arrived or it has moved. Before that it reads
    // 0, which a replay of this effect (Strict Mode, Activity) must not remember as the
    // visitor's: the plate's time would be lost.
    let positioned = false;
    const play = () => {
      // A user agent may refuse playback; the transport remains available.
      void player.play().catch(() => {});
    };
    const restorePosition = () => {
      positioned = true;
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
      const position = player.currentTime;
      if (Number.isFinite(position) && (positioned || position > 0)) {
        memory.set(identity, player.ended ? 0 : position);
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

/** The loupe's view, held outside React state so a pan re-renders the readout alone. */
function createViewStore() {
  let value: LoupeView | null = null;
  const listeners = new Set<() => void>();
  return {
    set(view: LoupeView | null) {
      value = view;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get: () => value,
  };
}
type ViewStore = ReturnType<typeof createViewStore>;
const noView = () => null;

/** "Detail of Plate 031 (1:1) · x 1,420–2,340 / y 580–1,175", from the loupe's latest view. */
function DetailReadout({
  store,
  folio,
  t,
  numbers,
}: {
  store: ViewStore;
  folio: string;
  t: Messages;
  numbers: Intl.NumberFormat;
}) {
  const view = useSyncExternalStore(store.subscribe, store.get, noView);
  if (!view) return null;
  return fill(t.detailOf, {
    n: folio,
    scale:
      view.ratio <= 1.05
        ? t.scaleNative
        : fill(t.scaleReadout, { ratio: numbers.format(view.ratio) }),
    x: `${numbers.format(view.x0)}–${numbers.format(view.x1)}`,
    y: `${numbers.format(view.y0)}–${numbers.format(view.y1)}`,
  });
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
  derivedViews = true,
  filmScore = null,
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
  /** The clock of the film it was read from; another film reads as its start until it reports. */
  const [filmClock, setFilmClock] = useState({ film: '', ...NO_TIME });
  const [playing, setPlaying] = useState(false);
  const [allowedStudies, setAllowedStudies] = useState<string[]>([]);
  const [loupe, setLoupe] = useState<{ window: number } | null>(null);
  const [when, setWhen] = useState(false);
  /** The arrival map a When lens could not be painted from, so its word rests. */
  const [whenFailed, setWhenFailed] = useState<string | null>(null);
  /** The Wavelength lens, and the wavelength it holds while the room is open. */
  const [wavelength, setWavelength] = useState(false);
  const [chosenNm, setChosenNm] = useState<number | null>(null);
  /** A held frame of the sweep is on screen; until then the lens says it is loading. */
  const [sweepHeld, setSweepHeld] = useState(false);
  /** The sweep a Wavelength lens could not be shown from (or the work without one): its word rests. */
  const [sweepFailed, setSweepFailed] = useState<string | null>(null);
  const [views] = useState(createViewStore);
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
  const filmIdentity = film ? `${film.variantKey}:${film.src}` : '';
  const time = filmClock.film === filmIdentity ? filmClock : NO_TIME;
  const setTime = (next: { current: number; duration: number }) =>
    setFilmClock({ film: filmIdentity, ...next });
  const label = `${workNumber(artwork.id)} · ${media ? expressionWord(media, t) : ''}`;
  const plate = media ? getPlateGround(artwork.id, media.id, media.stillSha256) : undefined;
  const tone = media?.id === 'light' ? '#000000' : (plate?.tone ?? '#f1ebdf');
  // The detail windows travel with the work's own media, bound to the still they were cut from.
  const windows: PlateDetail[] = media?.detail ?? [];
  const stillShown = !!media?.still && stillFailed !== media.still;
  // A long study on a slow connection waits for an explicit word; the still stands in.
  const studyHeld = !!film && isStudy(film) && constrained && !allowedStudies.includes(film.id);
  const filmShown = showFilm && !!film && !loupe && !studyHeld && filmStatus !== 'failed';
  const slow = filmShown && isStudy(film);
  // The When lens needs the still, its rung and the arrival map bound to them.
  const whenOffered = derivedViews && !!media?.arrival && !!media.rungs?.length;
  const whenShown =
    when && whenOffered && stillShown && !loupe && !filmShown && whenFailed !== media?.arrival?.src;
  const whenCaption = media?.id === 'light' ? t.whenLight : t.whenInk;
  // A lens that could not be painted is said once, beside the still that stands in for it.
  const whenUnavailable =
    whenOffered && whenFailed === media?.arrival?.src && stillShown && !filmShown && !loupe;
  // A lens that cannot be painted keeps its word, and its focus, but does nothing.
  const whenBlocked = !stillShown || whenFailed === media?.arrival?.src;
  // The Wavelength lens holds the published spectral sweep, a film of Light, on one frame. A
  // sweep without a measured span, or a work without a sweep, keeps the word and says so once.
  const sweep = media?.id === 'light' ? films.find((item) => item.id === 'sweep') : undefined;
  const span = sweep?.span;
  // Offered where the work has a sweep: the home's curated media carry none, and a work's page
  // has one once its live record arrives.
  const wavelengthOffered = derivedViews && media?.id === 'light' && !!sweep;
  const sweepKey = sweep && span ? sweep.src : `${artwork.id}:unmeasured`;
  const wavelengthBlocked = sweepFailed === sweepKey;
  const held = span ? heldNm(chosenNm ?? startingNm(span), span) : null;
  const wavelengthShown =
    wavelength &&
    wavelengthOffered &&
    !!span &&
    !wavelengthBlocked &&
    !loupe &&
    !filmShown &&
    !whenShown;
  const wavelengthLoading = wavelengthShown && !sweepHeld;
  const wavelengthUnavailable =
    wavelengthOffered && wavelengthBlocked && stillShown && !filmShown && !loupe && !whenShown;
  const numbers = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const oneDecimal = useMemo(
    () => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    [locale],
  );
  // The score belongs to a complete film on its clock: the Light film, and an Ink film the venue
  // checked against it, whose readout waits for its first ink.
  const kept =
    filmShown && derivedViews && film?.id === 'normal' && media
      ? scoreClock(filmScore ?? undefined, media.id, film)
      : null;
  const scored = filmScore && kept ? { ...filmScore, clock: kept } : null;
  const moment =
    scored && markedAt(scored.clock, time.current) ? physicsAt(scored.score, time.current) : null;

  /*
    A lens that leaves takes its slider with it. Focus that was on the slider would fall to the
    page, outside the dialog that hears the room's keys, so it returns to the lens's word.
  */
  const wavelengthWord = useRef<HTMLButtonElement>(null);
  const wavelengthWasShown = useRef(false);
  useLayoutEffect(() => {
    const left = wavelengthWasShown.current && !wavelengthShown;
    wavelengthWasShown.current = wavelengthShown;
    if (!left) return;
    const active = document.activeElement;
    if (!active || active === document.body) wavelengthWord.current?.focus({ preventScroll: true });
  }, [wavelengthShown]);

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

  // The edge strip rests after a quiet spell; any pointer, touch or key brings it back. Under
  // reduced motion or Pause the chrome stays, as everywhere in the venue; only the Slow room
  // lets it rest, so a long study can be watched without it.
  useEffect(() => {
    const room = frame.current;
    if (!room || (instant && !slow)) return;
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
  }, [instant, slow]);

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
    setWhen(false);
    setWavelength(false);
    views.set(null);
  }
  function pickFilm(id: string) {
    if (!media) return;
    setSelectedFilms((current) => ({ ...current, [media.id]: id }));
    setFilmStatus('loading');
    setShowFilm(true);
    setLoupe(null);
    setWhen(false);
    setWavelength(false);
    views.set(null);
  }
  /** The When lens takes the still's place; the film, the loupe and the other lens step aside. */
  function toggleWhen() {
    if (whenShown) return setWhen(false);
    if (!whenOffered || whenBlocked) return;
    setShowFilm(false);
    setLoupe(null);
    setWavelength(false);
    views.set(null);
    setWhen(true);
  }
  /** The Wavelength lens takes the still's place as When does; it never plays by itself. */
  function toggleWavelength() {
    if (wavelengthShown) return setWavelength(false);
    if (!wavelengthOffered || wavelengthBlocked) return;
    if (!span) return setSweepFailed(sweepKey);
    setShowFilm(false);
    setLoupe(null);
    setWhen(false);
    views.set(null);
    setSweepHeld(false);
    setWavelength(true);
  }
  function retryFilm() {
    setFilmStatus('loading');
    setFilmAttempt((value) => value + 1);
  }
  function openLoupe(window = 0) {
    if (!stillShown) return;
    setShowFilm(false);
    setWhen(false);
    setWavelength(false);
    setLoupe({ window });
  }
  function closeLoupe() {
    setLoupe(null);
    views.set(null);
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
    // While the Wavelength lens is on, the arrows, Home and End move the wavelength it holds.
    if (wavelengthShown && span && held !== null && WAVELENGTH_KEYS.has(key)) {
      const { min, max } = wavelengthRange(span);
      event.preventDefault();
      setChosenNm(wavelengthForKey(event, held, min, max));
      return;
    }
    if (key === ' ') {
      // Space belongs to the film, not to the lens's slider, where it would switch to the film.
      if (!film || (event.target as Element).closest?.('[role="slider"]')) return;
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
    } else if (key === 't' || key === 'T') {
      // A held key paints the lens once, not on every repeat.
      if (!whenOffered || event.repeat) return;
      event.preventDefault();
      toggleWhen();
    } else if (key === 'n' || key === 'N') {
      // N for nanometres, the lens's one unit in every language; a held key acts once.
      if (!wavelengthOffered || event.repeat) return;
      event.preventDefault();
      toggleWavelength();
    } else if (key === '?') {
      event.preventDefault();
      setHint((value) => !value);
    }
  }

  const status = pendingExpression
    ? t.preparingExpression
    : expressionFailed
      ? t.expressionFailed
      : fullscreenFailed
        ? t.fullScreenUnavailable
        : media && !stillShown && !filmShown && !wavelengthShown
          ? t.mediaUnavailable
          : showFilm && filmStatus === 'failed'
            ? t.mediaUnavailable
            : showFilm && studyHeld
              ? t.studyWaits
              : filmShown && filmStatus === 'loading'
                ? t.loadingFilm
                : slow
                  ? t.slowRoom
                  : '';
  // The Slow room's clock stands beside its name, outside the words a screen reader is told:
  // inside them, a status that changed every second would be read out every second.
  const slowClock = slow && status === t.slowRoom && fill(t.elapsed, { time: clock(time.current) });
  // What the notice says. A lens's label comes first, so it is never the part that gives way.
  const said = whenShown
    ? noticeWords(t.analysisNotWork, whenCaption, status)
    : wavelengthShown
      ? noticeWords(
          t.analysisNotWork,
          wavelengthLoading ? t.wavelengthLoading : t.wavelengthCaption,
          status,
        )
      : whenUnavailable && !status
        ? t.whenUnavailable
        : wavelengthUnavailable && !status
          ? t.wavelengthUnavailable
          : status;
  const roomFor = useMemo(
    () => noticeLines({ artwork, t, derivedViews, constrained, isStudy, numbers }),
    [artwork, t, derivedViews, constrained, numbers],
  );
  const retryStill = media?.still && stillFailed === media.still && !showFilm;
  const retryFilmOffer = showFilm && filmStatus === 'failed' && !studyHeld;
  const hintRows: [string, string][] = [
    ['Space', t.keyPlay],
    ['← →', t.keyScrub],
    ['I L', t.keyExpressions],
    ['F', t.keyFilm],
    ['Z', t.keyDetail],
    ['W', t.keyWhole],
    ...(whenOffered ? [['T', t.keyWhen] as [string, string]] : []),
    ...(wavelengthOffered ? [['N', t.keyWavelength] as [string, string]] : []),
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
        data-idle={idle && (!instant || slow) ? '' : undefined}
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
                  description={t.loupeKeys}
                  onView={views.set}
                />
              ) : whenShown && media.arrival ? (
                <WhenLens
                  key={`${media.id}:${media.arrival.src}`}
                  media={media}
                  paper={tone}
                  label={fill(t.whenAlt, { plate: label, caption: whenCaption })}
                  onFailure={() => {
                    setWhenFailed(media.arrival?.src ?? null);
                    setWhen(false);
                  }}
                />
              ) : wavelengthShown && sweep && span && held !== null ? (
                <WavelengthLens
                  key={`${media.id}:${sweep.src}`}
                  media={media}
                  film={sweep}
                  span={span}
                  nm={held}
                  label={fill(t.wavelengthAlt, { plate: label, n: held })}
                  rule={
                    <WavelengthSlider
                      value={held}
                      {...wavelengthRange(span)}
                      dominantNm={span.dominantNm}
                      label={t.wavelengthLens}
                      valueText={fill(t.wavelengthValue, { n: held })}
                      onChange={setChosenNm}
                    />
                  }
                  onState={(state) => setSweepHeld(state === 'held')}
                  onFailure={() => {
                    setSweepFailed(sweep.src);
                    setWavelength(false);
                  }}
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
                      {expressionWord(item, t)}
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
                          {item.bytes ? ` · ${formatBytes(item.bytes, locale)}` : ''}
                        </span>
                      </>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
            <div className={styles.actions}>
              {whenOffered ? (
                <button
                  type="button"
                  onClick={toggleWhen}
                  aria-pressed={whenShown}
                  aria-disabled={whenBlocked || undefined}
                >
                  {t.whenLens}
                </button>
              ) : null}
              {wavelengthOffered ? (
                <button
                  ref={wavelengthWord}
                  type="button"
                  onClick={toggleWavelength}
                  aria-pressed={wavelengthShown}
                  aria-disabled={wavelengthBlocked || undefined}
                  aria-busy={wavelengthLoading || undefined}
                >
                  {t.wavelengthLens}
                </button>
              ) : null}
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
          <div className={styles.notice}>
            <div className={styles.said}>
              <span
                role={said || loupe ? 'status' : undefined}
                aria-live={loupe ? 'off' : 'polite'}
              >
                {loupe && stillShown ? (
                  <DetailReadout
                    store={views}
                    folio={workFolio(artwork.id)}
                    t={t}
                    numbers={numbers}
                  />
                ) : (
                  said
                )}
              </span>
              {slowClock ? (
                <span aria-hidden="true">
                  {NOTICE_JOIN}
                  {slowClock}
                </span>
              ) : null}
              {whenShown ? <WhenRamp first={t.whenFirst} last={t.whenLast} /> : null}
              {retryStill || retryFilmOffer || (showFilm && studyHeld) ? <Apart /> : null}
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
            <NoticeRoom lines={roomFor} first={t.whenFirst} last={t.whenLast} />
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
            {scored ? (
              <FilmScoreBand
                score={scored.score}
                hues={scored.hues}
                progress={time.current / lightFilmDuration(scored.score.steps)}
                material={scored.clock.material}
                from={markedFrom(scored.clock, scored.score)}
                className={styles.score}
              />
            ) : null}
            <span className={styles.readout} aria-hidden="true">
              {clock(time.current)} · {clock(time.duration)}
              {moment
                ? ` · ${fill(t.filmPhysics, {
                    pair: pairName(moment.pair),
                    distance: oneDecimal.format(moment.distance),
                  })}`
                : null}
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
