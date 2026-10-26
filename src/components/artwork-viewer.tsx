'use client';
import {
  Suspense,
  use,
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getInterpretation, type Artwork } from '@/lib/art/types';
import { workNumber } from '@/lib/art/number';
import type { Messages } from '@/lib/i18n/en';
import { localizedPath, type Locale } from '@/lib/i18n/routing';
import { ArtworkMedia } from './artwork-media';
import { useMotion } from './motion-provider';
import { useMediaPolicy } from './media-policy';
import { ArtworkTransition } from './artwork-transition';
import { ArtworkStage, useArtworkExpression } from './artwork-stage';
import { ArtworkRoom } from './artwork-room';
import { Plate } from './plate';
import {
  SeamController,
  TAP_MS,
  Turn,
  TurnLayer,
  rememberExpression,
  setThemeColor,
  useRememberedExpression,
  type Expression,
} from './turn';
import {
  NightWing,
  scrollTimelinesSupported,
  useRoomSeam,
  wingProgress,
  type WingMode,
} from './night-wing';
import { DUSK_CANCEL_EVENTS, DuskController } from './dusk';
import { inField } from './keys';
import { useOpenSheet } from './sheets-store';
import { ArtworkNeighbours, neighbourHref, type Neighbours } from './artwork-neighbours';
import styles from './artwork-viewer.module.css';

/** After a film resolves into its still, nothing moves for --t-rest; then "Again". */
const REST_MS = 8000;
/** The home rests a little less (--t-rest-dusk), because the Dusk may follow. */
const REST_HOME_MS = 6000;
/** Input right after pressing Sit is the press itself, not a request for the chrome back. */
const SIT_GRACE_MS = 600;
/** The click a browser synthesises after a waking tap arrives well within this window. */
const SWALLOW_MS = 500;
/** Once the home's arrival film has resolved in this session, the home opens on the still. */
const HOME_RESOLVED_KEY = 'cosmic-art-home-film-v1';

export type Presentation = 'gallery' | 'auction' | 'home';

type ArtworkViewerProps = {
  artwork: Artwork;
  t: Messages;
  locale: Locale;
  initialStill?: boolean;
  initialExpression?: string;
  presentation?: Presentation;
  /** Inline preview bytes per expression, read on the server for the route's hero. */
  inlinePreviews?: Partial<Record<string, string>>;
  /** The streaming live record; its media replace the registry's only when they differ. */
  live?: Promise<Artwork | null>;
  /** The label line's words, read from the collection index on the server. */
  traits?: { structure?: string; underlay?: string };
  neighbours?: Neighbours;
  /** The night wing beneath the plate; the lot page has the bid rail there instead. */
  wing?: boolean;
  /** The home's one automatic event, behind its flag. */
  dusk?: boolean;
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

const noSubscription = () => () => {};
function homeResolvedInSession() {
  try {
    return sessionStorage.getItem(HOME_RESOLVED_KEY) === 'resolved';
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

function ArtworkViewerSession({
  artwork: initial,
  t,
  locale,
  initialStill = false,
  initialExpression,
  presentation = 'gallery',
  inlinePreviews,
  live,
  traits,
  neighbours,
  wing = presentation !== 'auction',
  dusk = false,
}: ArtworkViewerProps) {
  const router = useRouter();
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
  const { paused, reducedMotion, theatre, toggle } = useMotion();
  const instant = paused || reducedMotion || theatre === 'hushed';
  const policy = useMediaPolicy();
  const sheet = useOpenSheet();
  const home = presentation === 'home';

  // Playback and arrival state of the committed expression.
  const [still, setStill] = useState(initialStill);
  const [room, setRoom] = useState<'still' | 'film' | null>(null);
  const [restart, setRestart] = useState(0);
  const [playRequest, setPlayRequest] = useState(0);
  const [explicitFilm, setExplicitFilm] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [settledLayers, setSettledLayers] = useState<string[]>([]);
  // A layer whose still could not be fetched is mounted afresh once a retry has decoded it.
  const failedLayers = useRef(new Set<string>());
  const [attempts, setAttempts] = useState<Record<string, number>>({});
  const [ended, setEnded] = useState(false);
  const [rested, setRested] = useState(false);
  const [sit, setSit] = useState(false);
  const sitAt = useRef(0);
  const [time, setTime] = useState({ current: 0, duration: 0 });
  const [failed, setFailed] = useState(false);
  const [turning, setTurning] = useState<{
    to: Expression;
    mode: 'time' | 'peek' | 'drag' | 'dusk';
  } | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const swallowClick = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [seam] = useState(() => new SeamController());
  const wingRef = useRef<HTMLElement>(null);
  const fallbackRef = useRef<HTMLDivElement>(null);
  const section = useRef<HTMLElement>(null);
  // The home remembers a resolved arrival for the session; Again or a fresh ending overrides it.
  const resolvedBefore = useSyncExternalStore(
    noSubscription,
    () => home && homeResolvedInSession(),
    unresolvedOnServer,
  );
  const [resolvedOverride, setResolvedOverride] = useState<boolean | null>(null);
  const homeResolved = home && (resolvedOverride ?? (ended ? false : resolvedBefore));
  const restedNow = rested || (home && resolvedOverride === null && !ended && resolvedBefore);
  const idle = paused || still || homeResolved || !playing;
  // Again is offered once the film has resolved and rested, or when this visit already saw it resolve.
  const showAgain = restedNow && (ended || homeResolved);
  // The Dusk controller is created once; each firing performs the latest render's Dusk.
  const [duskController] = useState(() => new DuskController());

  useEffect(
    () => () => {
      if (swallowClick.current) clearTimeout(swallowClick.current);
      seam.end();
    },
    [seam],
  );

  const ink = getInterpretation(artwork, 'ink');
  const light = getInterpretation(artwork, 'light');
  const hasBoth = !!ink?.still && !!light?.still;
  const remembered = useRememberedExpression();
  const restored = useRef(false);
  const instantNext = useRef(false);

  const { expression, pendingExpression, failedExpression, selectExpression, cancelPending } =
    useArtworkExpression({
      media: artwork.media,
      initialExpression,
      onCommit: (committed) => {
        seam.end();
        setTurning(null);
        if (hasBoth) rememberExpression(committed);
        window.dispatchEvent(new Event('cosmic:seam'));
        setTime({ current: 0, duration: 0 });
        setPlaying(false);
        setFailed(false);
        setRestart(0);
        setPlayRequest(0);
        setEnded(false);
        setRested(false);
        setSit(false);
        setStill(false);
        if (home) setResolvedOverride(null);
      },
      onReady: (target, commit) => {
        if (failedLayers.current.delete(target))
          setAttempts((current) => ({ ...current, [target]: (current[target] ?? 0) + 1 }));
        // The twin is decoded. Instant crossings commit at once; otherwise the seam travels first.
        const now = instantNext.current || instant || room !== null;
        instantNext.current = false;
        if (now) {
          commit();
          return;
        }
        const to = target as Expression;
        setTurning({ to, mode: 'time' });
        void seam
          .animateTo(targetSeam(to), {
            mode: 'time',
            breath: seam.seam === null,
            from: restSeam(),
            halfway: () => setThemeColor(to === 'light' ? 'night' : 'paper'),
          })
          .then((done) => {
            if (done) commit();
          });
      },
    });

  // A still that could not be decoded marks its layer; the layer is mounted afresh once a retry succeeds.
  useEffect(() => {
    if (failedExpression) failedLayers.current.add(failedExpression);
  }, [failedExpression]);

  // A plate opened without an expression in its URL follows the session's remembered choice.
  useEffect(() => {
    if (restored.current || initialExpression || !hasBoth || !remembered) return;
    restored.current = true;
    if (remembered !== expression) {
      instantNext.current = true;
      selectExpression(remembered);
    }
  }, [remembered, initialExpression, hasBoth, expression, selectExpression]);

  const restMs = home ? REST_HOME_MS : REST_MS;
  useEffect(() => {
    if (!ended) return;
    const timer = setTimeout(() => {
      setRested(true);
      setSit(false);
    }, restMs);
    return () => clearTimeout(timer);
  }, [ended, restMs]);

  const media = getInterpretation(artwork, expression);
  const settled = settledLayers.includes(expression);
  // Only a hash-verified local delivery plays inline, from frame 0. The 640 excerpt is a
  // browsing preview; a complete published original waits for the room.
  const inlineFilm = media?.films.find((film) => film.delivery === 'local-preview');
  const ambientFilm = !room && (!policy.constrained || explicitFilm);
  const wingMode: WingMode = instant ? 'hard' : 'scroll';
  useRoomSeam({ enabled: true, expression, mode: wingMode, wingRef, fallbackRef });

  /** Where the seam rests for Ink: 100 % on a plate, or wherever the hand has drawn the night. */
  function inkSeam() {
    const wingNode = wingRef.current;
    const stageNode = wingNode?.firstElementChild as HTMLElement | null;
    if (!wingNode || !stageNode || wingMode !== 'scroll' || !scrollTimelinesSupported()) return 100;
    const head =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--head')) || 48;
    return (
      100 *
      (1 -
        wingProgress(
          wingNode.getBoundingClientRect(),
          stageNode.getBoundingClientRect().height,
          head,
        ))
    );
  }
  const targetSeam = (to: string) => (to === 'light' ? 0 : inkSeam());
  const restSeam = () => targetSeam(expression);

  const label = (id: string) =>
    id === 'ink'
      ? t.ink
      : id === 'light'
        ? t.light
        : (artwork.media.find((item) => item.id === id)?.label ?? id);

  const peek = useRef<{ to: Expression; at: number } | null>(null);
  function openRoom(film: boolean, trigger: HTMLElement | null) {
    returnFocusRef.current = trigger;
    cancelPending();
    seam.end();
    setTurning(null);
    peek.current = null;
    setRestart(0);
    setPlayRequest(0);
    setRoom(film ? 'film' : 'still');
    setPlaying(false);
    setSit(false);
  }
  function closeRoom() {
    cancelPending();
    // The room may have crossed to the other ground: focus returns to the live layer's word.
    const study = section.current?.querySelector<HTMLElement>(
      '[data-layer-state="current"] [data-study]',
    );
    if (study && returnFocusRef.current && !study.isSameNode(returnFocusRef.current)) {
      const previous = returnFocusRef.current;
      if (previous.closest('[data-layer-state="twin"]')) returnFocusRef.current = study;
    }
    setRoom(null);
  }
  function requestFilm() {
    setFailed(false);
    setStill(false);
    setExplicitFilm(true);
    setEnded(false);
    setRested(false);
    if (home) setResolvedOverride(false);
    setPlayRequest((value) => value + 1);
    if (paused) toggle();
  }
  function again() {
    setFailed(false);
    setStill(false);
    setExplicitFilm(true);
    setEnded(false);
    setRested(false);
    if (home) setResolvedOverride(false);
    duskController.reset();
    setRestart((value) => value + 1);
    setTime((value) => ({ ...value, current: 0 }));
    if (paused) toggle();
  }
  function togglePlay() {
    if (!inlineFilm) return;
    if (showAgain) again();
    else if (playing && !paused && !still) setStill(true);
    else requestFilm();
  }
  function sitDown() {
    sitAt.current = Date.now();
    setSit(true);
    document.documentElement.setAttribute('data-sit', '');
  }
  function stand() {
    setSit(false);
    document.documentElement.removeAttribute('data-sit');
  }
  useEffect(() => () => document.documentElement.removeAttribute('data-sit'), []);
  function wake() {
    if (!sit || Date.now() - sitAt.current < SIT_GRACE_MS) return;
    stand();
  }
  function wakeByPress() {
    if (!sit || Date.now() - sitAt.current < SIT_GRACE_MS) return;
    stand();
    // The press only brings the chrome back; the click that follows it is not a choice.
    if (swallowClick.current) clearTimeout(swallowClick.current);
    swallowClick.current = setTimeout(() => {
      swallowClick.current = null;
    }, SWALLOW_MS);
  }
  function swallowWakingClick(event: MouseEvent) {
    if (!swallowClick.current) return;
    clearTimeout(swallowClick.current);
    swallowClick.current = null;
    event.preventDefault();
    event.stopPropagation();
  }

  /* The Turn's three drivers: the word (and a tap of I/L), a held key, and the finger. */
  const canTurn = hasBoth && !room;
  const turnTo = (to: Expression) => {
    if (!canTurn || to === expression) return;
    selectExpression(to);
  };
  function peekStart(to: Expression) {
    if (!canTurn || to === expression || peek.current) return;
    if (instant) {
      selectExpression(to);
      return;
    }
    peek.current = { to, at: Date.now() };
    setTurning({ to, mode: 'peek' });
    void seam.animateTo(targetSeam(to), { mode: 'time', from: restSeam() });
  }
  function peekEnd(to: Expression) {
    const state = peek.current;
    if (!state || state.to !== to) return;
    peek.current = null;
    if (Date.now() - state.at < TAP_MS) {
      selectExpression(to);
      return;
    }
    const back = expression as Expression;
    setTurning({ to: back, mode: 'peek' });
    void seam.animateTo(restSeam(), { mode: 'time', breath: false }).then((done) => {
      if (!done) return;
      seam.end();
      setTurning(null);
    });
  }

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (inField(event.target) || sheet || room || document.querySelector('dialog[open]')) return;
    switch (event.key) {
      case ' ':
        if (!inlineFilm) return;
        event.preventDefault();
        togglePlay();
        return;
      case 'ArrowLeft':
        if (neighbours?.previous)
          router.push(neighbourHref(locale, neighbours.previous.id, expression));
        return;
      case 'ArrowRight':
        if (neighbours?.next) router.push(neighbourHref(locale, neighbours.next.id, expression));
        return;
      case 'l':
      case 'L':
        if (!event.repeat) peekStart('light');
        return;
      case 'i':
      case 'I':
        if (!event.repeat) peekStart('ink');
        return;
      case 'f':
      case 'F':
        if (media?.films.length) openRoom(true, null);
        return;
      case 's':
      case 'S':
        if (inlineFilm && !sit) sitDown();
        return;
      case 'z':
      case 'Z':
        if (!home) openRoom(false, null);
        return;
    }
  });
  const onKeyUp = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === 'l' || event.key === 'L') peekEnd('light');
    if (event.key === 'i' || event.key === 'I') peekEnd('ink');
  });
  useEffect(() => {
    const down = (event: KeyboardEvent) => onKeyDown(event);
    const up = (event: KeyboardEvent) => onKeyUp(event);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  /* The Dusk: the home's one automatic event, behind its flag. */
  const performDusk = useEffectEvent(async () => {
    if (
      !dusk ||
      !home ||
      instant ||
      expression !== 'ink' ||
      !canTurn ||
      sheet ||
      room ||
      document.fullscreenElement ||
      document.visibilityState !== 'visible'
    )
      return false;
    setTurning({ to: 'light', mode: 'dusk' });
    const done = await seam.animateTo(0, {
      mode: 'dusk',
      breath: false,
      from: restSeam(),
      halfway: () => setThemeColor('night'),
    });
    if (!done) return false;
    // Hand and clock never fight: land the scroll where the hand would have drawn the night.
    const wingNode = wingRef.current;
    const stage = wingNode?.firstElementChild as HTMLElement | null;
    if (wingNode && stage && wingMode === 'scroll' && scrollTimelinesSupported()) {
      const top =
        wingNode.getBoundingClientRect().top +
        window.scrollY +
        (wingNode.offsetHeight - stage.offsetHeight);
      window.scrollTo({ top, behavior: 'instant' as ScrollBehavior });
    }
    selectExpression('light');
    return true;
  });
  useEffect(() => {
    if (!dusk || !home || !ended) return;
    duskController.arm();
  }, [dusk, home, ended, duskController]);
  useEffect(() => {
    if (!dusk || !home || !rested) return;
    void duskController.fire(() => performDusk());
  }, [dusk, home, rested, duskController]);
  const duskInput = useEffectEvent(() => {
    if (duskController.input() !== 'cancel') return;
    // Cancel, never resume mid-travel: the seam returns and the plate stays on paper.
    setTurning(null);
    void seam.animateTo(inkSeam(), { mode: 'time', breath: false }).then((done) => {
      if (done) seam.end();
    });
  });
  useEffect(() => {
    if (!dusk || !home) return;
    const cancel = () => duskInput();
    const hidden = () => {
      if (document.visibilityState === 'hidden') duskInput();
    };
    for (const name of DUSK_CANCEL_EVENTS) window.addEventListener(name, cancel, { passive: true });
    document.addEventListener('visibilitychange', hidden);
    return () => {
      for (const name of DUSK_CANCEL_EVENTS) window.removeEventListener(name, cancel);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [dusk, home]);

  const filmState = !settled ? 'arriving' : playing ? 'film' : 'still';
  const stateWord = t[filmState];

  /** The strip's right-hand words for one layer; only the committed layer's are live. */
  function words(layer: Expression): ReactNode {
    const other: Expression = layer === 'light' ? 'ink' : 'light';
    const current = layer === expression;
    const turnWord = hasBoth ? (
      <button
        type="button"
        className={styles.word}
        onClick={() => turnTo(other)}
        aria-busy={current && (turning?.to === other || pendingExpression === other)}
        title={other === 'light' ? t.showLight : t.showInk}
        data-turn={other}
      >
        {other === 'light' ? t.light : t.ink}
      </button>
    ) : null;
    if (home && layer === 'light')
      return (
        <>
          {turnWord}
          <Link className={styles.word} href={localizedPath(locale, '/collection?order=spectrum')}>
            {t.throughSpectrum} →
          </Link>
        </>
      );
    const filmWord = inlineFilm ? (
      <button type="button" className={styles.word} onClick={togglePlay} data-film-word>
        {showAgain ? t.again : idle ? t.film : t.still}
      </button>
    ) : null;
    return (
      <>
        {turnWord}
        {filmWord}
        {inlineFilm && !showAgain ? (
          <button type="button" className={styles.word} onClick={sitDown} aria-pressed={sit}>
            {t.sit}
          </button>
        ) : null}
        {!home ? (
          <button
            type="button"
            className={styles.word}
            onClick={(event) => openRoom(false, event.currentTarget)}
            data-study
          >
            {t.enlarge}
          </button>
        ) : null}
        {inlineFilm && time.duration ? (
          <span className={styles.clock}>
            {clock(time.current)} / {clock(time.duration)}
          </span>
        ) : null}
        <span className={styles.state} data-film-state={filmState}>
          {stateWord}
        </span>
      </>
    );
  }

  /** The strip's centre: the label line, or the home's one line. */
  function centre(layer: Expression): ReactNode {
    if (home) {
      if (layer !== 'ink') return <span />;
      return (
        <p className={styles.line}>
          <em>{t.statementLine}</em> <span className="folio">{t.statementSigned}</span>
        </p>
      );
    }
    if (layer === 'light' && !ink?.still)
      return (
        <span>
          {t.light} · {t.noInkPublished}
        </span>
      );
    const parts = [traits?.structure, traits?.underlay].filter(Boolean);
    return <span>{[...parts, label(layer)].join(' · ')}</span>;
  }

  function layer(id: Expression) {
    const item = getInterpretation(artwork, id);
    if (!item) return null;
    const current = id === expression;
    const previewSrc =
      item.thumbnail === getInterpretation(initial, id)?.thumbnail
        ? inlinePreviews?.[id]
        : undefined;
    const ambient = current
      ? { ...item, films: inlineFilm ? [inlineFilm] : [] }
      : { ...item, films: [] };
    return (
      <TurnLayer key={id} expression={id} current={current}>
        <Plate
          id={artwork.id}
          media={item}
          current={current}
          settled={settledLayers.includes(id)}
          centre={centre(id)}
          words={<div className={styles.wordsRow}>{words(id)}</div>}
          className={current ? 'viewer-plate' : ''}
        >
          <ArtworkTransition
            artworkId={artwork.id}
            interpretationId={id}
            role="detail"
            disabled={!current || !!room}
            className={styles.surface}
          >
            <ArtworkMedia
              key={attempts[id] ?? 0}
              media={ambient}
              alt={`${workNumber(artwork.id)} · ${label(id)}`}
              priority={current}
              eager
              hold
              ambient={current && ambientFilm}
              artworkId={artwork.id}
              previewSrc={previewSrc}
              still={!current || still || homeResolved || !!room}
              startAt={current ? time.current : 0}
              restart={current ? restart : 0}
              playRequest={current ? playRequest : 0}
              onPlaybackChange={current ? setPlaying : undefined}
              onProgress={
                current ? (now, duration) => setTime({ current: now, duration }) : undefined
              }
              onSettled={() =>
                setSettledLayers((layers) => (layers.includes(id) ? layers : [...layers, id]))
              }
              onEnded={
                current
                  ? () => {
                      setEnded(true);
                      setPlaying(false);
                      if (home) {
                        try {
                          sessionStorage.setItem(HOME_RESOLVED_KEY, 'resolved');
                        } catch {
                          /* Storage is optional. */
                        }
                      }
                    }
                  : undefined
              }
              onFailure={current ? () => setFailed(true) : undefined}
            />
          </ArtworkTransition>
        </Plate>
      </TurnLayer>
    );
  }

  const inkLayer = ink?.still ? layer('ink') : null;
  const lightLayer = light?.still ? layer('light') : null;
  const foreign =
    expression !== 'ink' && expression !== 'light' ? (
      <TurnLayer key={expression} expression="ink" current>
        <Plate
          id={artwork.id}
          media={media}
          current
          settled={settled}
          centre={<span>{label(expression)}</span>}
          words={<div className={styles.wordsRow}>{words('ink')}</div>}
          className="viewer-plate"
        >
          <ArtworkMedia
            media={media}
            alt={`${workNumber(artwork.id)} · ${label(expression)}`}
            priority
            hold
            artworkId={artwork.id}
            still={still || !!room}
            onSettled={() =>
              setSettledLayers((layers) =>
                layers.includes(expression) ? layers : [...layers, expression],
              )
            }
          />
        </Plate>
      </TurnLayer>
    ) : null;

  const turn = (
    <Turn
      expression={expression}
      seam={seam}
      canTurn={canTurn && !instant}
      restSeam={restSeam}
      onCommit={turnTo}
      onDragChange={(dragging) =>
        setTurning(dragging ? { to: expression === 'light' ? 'ink' : 'light', mode: 'drag' } : null)
      }
    >
      {foreign ?? (
        <>
          {inkLayer}
          {lightLayer}
        </>
      )}
    </Turn>
  );

  return (
    <>
      <section
        ref={section}
        className={`viewing-room ${styles.room} ${styles[presentation]}`}
        aria-label={t.ways}
        data-expression={expression}
        data-live={liveArtwork ? 'adopted' : undefined}
        data-turning={turning?.mode}
        data-sit={sit ? '' : undefined}
        onPointerMove={() => {
          wake();
          if (sit) return;
        }}
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
        <ArtworkStage artworkId={artwork.id} expression={expression} scope="page" disabled>
          {wing && light?.still && ink?.still ? (
            <NightWing
              mode={wingMode}
              expression={expression}
              wingRef={wingRef}
              fallbackRef={fallbackRef}
              fallback={
                <Plate
                  id={artwork.id}
                  media={light}
                  current={false}
                  centre={<span>{label('light')}</span>}
                  words={
                    <div className={styles.wordsRow}>
                      <span className={styles.state}>{t.still}</span>
                    </div>
                  }
                  className={styles.echo}
                >
                  <ArtworkMedia
                    media={{ ...light, films: [] }}
                    alt={`${workNumber(artwork.id)} · ${t.light}`}
                    artworkId={artwork.id}
                    previewSrc={inlinePreviews?.light}
                    still
                  />
                </Plate>
              }
            >
              {turn}
            </NightWing>
          ) : (
            turn
          )}
        </ArtworkStage>
        {inlineFilm && (playing || (ended && !restedNow)) ? (
          <div className="time-line" aria-hidden="true">
            <i style={{ width: `${time.duration ? (time.current / time.duration) * 100 : 0}%` }} />
          </div>
        ) : null}
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
        {neighbours ? (
          <ArtworkNeighbours
            artworkId={artwork.id}
            neighbours={neighbours}
            expression={expression}
            locale={locale}
            t={t}
          />
        ) : null}
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
