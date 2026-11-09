'use client';
import {
  Suspense,
  use,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  getInterpretation,
  isExpression,
  twinOf,
  type ArtInterpretation,
  type Artwork,
} from '@/lib/art/types';
import { workNumber } from '@/lib/art/number';
import { getPlateGround } from '@/lib/art/plate-records';
import type { Messages } from '@/lib/i18n/en';
import { localizedPath, type Locale } from '@/lib/i18n/routing';
import { AFTER_THE_FRAME_EVENT, SEAM_EVENT } from '@/lib/venue-events';
import { HOME_RESOLVED_KEY } from '@/lib/storage-keys';
import { ArtworkMedia } from './artwork-media';
import { useMotion } from './motion-provider';
import { useMediaPolicy } from './media-policy';
import { ArtworkTransition } from './artwork-transition';
import { ArtworkStage, useArtworkExpression } from './artwork-stage';
import { ArtworkRoom } from './artwork-room';
import { ArtworkOptions } from './artwork-options';
import { Plate } from './plate';
import {
  SeamController,
  TAP_MS,
  Turn,
  TurnLayer,
  rememberExpression,
  seamFor,
  setThemeColor,
  useRememberedExpression,
  type Expression,
  type TurnMode,
} from './turn';
import {
  Wing,
  scrollTimelinesSupported,
  useRoomSeam,
  wingProgress,
  wingSeamAt,
  type WingMode,
} from './wing';
import { setOverturePhase, useOverturePhase, type OverturePhase } from './overture-store';
import { inField } from './keys';
import { useOpenSheet } from './sheets-store';
import { ArtworkNeighbours, neighbourHref, type Neighbours } from './artwork-neighbours';
import { useArrivalCrossing } from './arrival-crossing';
import { ArtworkGatefold } from './artwork-gatefold';
import { useSit } from './sit';
import { useCompactWall } from './compact-wall';
import { excerptRange } from './collection-preview';
import { useFilmScore } from './film-score-store';
import { FilmScoreBand } from './film-score-band';
import styles from './artwork-viewer.module.css';
import { clock, fill } from '@/lib/i18n/format';
import {
  closestApproachSeconds,
  markedAt,
  markedFrom,
  pairName,
  physicsAt,
  scoreClock,
  showsClosestApproach,
  type FilmOrbit,
} from '@/lib/physics/film-score';
import { lightFilmDuration } from '@/lib/physics/light-film';

/** After a film resolves into its still, nothing moves for --t-rest; then "Again". */
const REST_MS = 8000;
/** The closest approach opens the film this many seconds before it, so it is seen to happen. */
const CLOSEST_LEAD_SECONDS = 2;

export type Presentation = 'gallery' | 'auction' | 'home';

type ArtworkViewerProps = {
  artwork: Artwork;
  t: Messages;
  locale: Locale;
  initialStill?: boolean;
  /** The visitor's request from the URL; it outranks the session's remembered choice. */
  initialExpression?: string;
  /** The page's opening without a request or a remembered choice (src/lib/art/opening.ts). */
  openingExpression?: string;
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
  /**
   * The work's orbit stands beneath the plate (orbit-score.tsx): once the film resolves into
   * its still, the strip offers After the frame, which goes on down to it.
   */
  afterTheFrame?: boolean;
  /**
   * The work's orbit, for its films' score (third-physics.md §5.5): the time line becomes the
   * orbit's separations and events, the strip reads the physics of the moment, and the options
   * open the film at the closest approach. The Light film always keeps the score's clock, the
   * Ink film where the venue checked it (third-physics-phase-e.md §6). Analysis, so never on a
   * sale's page.
   */
  orbit?: FilmOrbit;
};

export function ArtworkViewer(props: ArtworkViewerProps) {
  return (
    <ArtworkViewerSession
      key={`${props.artwork.id}:${props.initialStill ?? false}:${props.initialExpression ?? ''}:${props.openingExpression ?? ''}`}
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

function ArtworkViewerSession({
  artwork: initial,
  t,
  locale,
  initialStill = false,
  initialExpression,
  openingExpression,
  presentation = 'gallery',
  inlinePreviews,
  live,
  traits,
  neighbours,
  wing = presentation !== 'auction',
  afterTheFrame = false,
  orbit: offeredOrbit,
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
  /** Where the room's film opens when a word asked for a moment of it: the closest approach. */
  const [roomStart, setRoomStart] = useState<number | null>(null);
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
  const { sit, sitDown, stand, wake, wakeByPress, swallowWakingClick } = useSit({ mirror: true });
  const [time, setTime] = useState({ current: 0, duration: 0 });
  const [failed, setFailed] = useState(false);
  const [turning, setTurning] = useState<{
    to: Expression;
    mode: 'time' | 'peek' | 'drag' | 'overture';
  } | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  /** A held I or L: the seam is out on a peek and returns on release. */
  const peek = useRef<{ to: Expression; at: number } | null>(null);
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

  useEffect(() => () => seam.end(), [seam]);

  const ink = getInterpretation(artwork, 'ink');
  const light = getInterpretation(artwork, 'light');
  const hasBoth = !!ink?.still && !!light?.still;
  const remembered = useRememberedExpression();
  const restored = useRef(false);
  const instantNext = useRef(false);
  // The wing hangs the twin of the expression the page opened on, and a remembered choice
  // re-opens the page; a Turn afterwards never reverses the wing under the hand.
  const [turnedTwin, setTurnedTwin] = useState<Expression | null>(null);
  /**
   * The next commit is not the visitor's: a remembered choice restored, or the Overture's own
   * move. It neither turns the wing nor is remembered.
   */
  const quiet = useRef(false);
  /** The mode the next Turn by time travels in: a Turn's, or the Overture's slower crossing. */
  const turnMode = useRef<TurnMode>('time');
  /** The Overture's crossing is under way, and lands the Overture when it commits. */
  const landingOverture = useRef(false);
  /** Each Turn the twin's decode asked for; a newer one supersedes a Turn still waiting. */
  const turnRequest = useRef(0);
  // A Turn that waited on the crossing reads the room and motion as they are when it ends.
  const landsAtOnce = useRef(false);

  const { expression, pendingExpression, failedExpression, selectExpression, cancelPending } =
    useArtworkExpression({
      media: artwork.media,
      initialExpression,
      openingExpression,
      onCommit: (committed) => {
        const chosen = !quiet.current;
        quiet.current = false;
        if (chosen && isExpression(committed)) setTurnedTwin((current) => current ?? committed);
        seam.end();
        setTurning(null);
        if (hasBoth && chosen) rememberExpression(committed);
        if (landingOverture.current) {
          landingOverture.current = false;
          setOverturePhase('done');
        }
        window.dispatchEvent(new Event(SEAM_EVENT));
        setTime({ current: 0, duration: 0 });
        // A moment asked of one expression's film is not the other's.
        setRoomStart(null);
        setPlaying(false);
        setFailed(false);
        setRestart(0);
        setPlayRequest(0);
        setEnded(false);
        setRested(false);
        stand();
        setStill(false);
        setHandoverWaiting(false);
        if (home) setResolvedOverride(null);
      },
      onReady: (target, commit) => {
        if (failedLayers.current.delete(target))
          setAttempts((current) => ({ ...current, [target]: (current[target] ?? 0) + 1 }));
        // The twin is decoded. Instant crossings commit at once; otherwise the seam travels first.
        // Either way the mode asked for is spent here, so it never carries to a later Turn.
        const mode = turnMode.current;
        turnMode.current = 'time';
        const now = instantNext.current || instant || room !== null;
        instantNext.current = false;
        if (now) {
          commit();
          return;
        }
        const to = target as Expression;
        // The Turn is under way from here, and reads so. A crossing still being prepared is
        // worth a moment; past that the straight seam travels. Whatever takes the seam in the
        // meantime (a newer request, the room, a key, the page left) supersedes this Turn.
        setTurning({ to, mode });
        const request = ++turnRequest.current;
        const generation = seam.generation;
        void whenReady(400).then(() => {
          if (request !== turnRequest.current || generation !== seam.generation) return;
          if (landsAtOnce.current) {
            commit();
            return;
          }
          void seam
            .animateTo(targetSeam(to), {
              mode,
              breath: seam.seam === null,
              from: restSeam(),
              halfway: () => setThemeColor(to === 'light' ? 'night' : 'paper'),
            })
            .then((done) => {
              if (done) commit();
            });
        });
      },
    });

  useEffect(() => {
    landsAtOnce.current = instant || room !== null;
  }, [instant, room]);

  // A still that could not be decoded marks its layer; the layer is mounted afresh once a retry succeeds.
  useEffect(() => {
    if (!failedExpression) return;
    failedLayers.current.add(failedExpression);
    quiet.current = false;
    instantNext.current = false;
    turnMode.current = 'time';
    // A crossing that cannot land still ends the Overture: the head is never kept waiting.
    if (landingOverture.current) {
      landingOverture.current = false;
      setOverturePhase('done');
    }
  }, [failedExpression]);

  // An expression the URL asked for is the visitor's choice (the half they pressed, a shared
  // link): the visit remembers it, as it remembers a Turn.
  useEffect(() => {
    if (initialExpression && hasBoth && initialExpression === expression)
      rememberExpression(initialExpression);
  }, [initialExpression, hasBoth, expression]);

  // A plate opened without an expression in its URL follows the session's remembered choice.
  useEffect(() => {
    if (restored.current || initialExpression || !hasBoth || !remembered) return;
    restored.current = true;
    if (remembered !== expression) {
      instantNext.current = true;
      quiet.current = true;
      selectExpression(remembered);
    }
  }, [remembered, initialExpression, hasBoth, expression, selectExpression]);

  /*
    The Overture (overture.tsx), on a first visit to the home. Beneath its black the plate stands
    in Light, which is what condenses there; as it lands the plate crosses to the expression it
    would have opened on, by the Overture's own slower crossing, in the order the ink came to
    rest; and any input puts it there at once. None of it is the visitor's choice.
  */
  const overture = useOverturePhase();
  const followOverture = useEffectEvent((phase: OverturePhase) => {
    if (!home || !hasBoth) {
      if (phase === 'landing') setOverturePhase('done');
      return;
    }
    const opening = remembered ?? openingExpression ?? expression;
    /** The Overture's move: quiet, at once or by its crossing; false when there is none to make. */
    const stand = (to: string, how: 'at once' | TurnMode) => {
      if (to === expression) {
        // A quiet move still on its way is called off, and leaves nothing for the next Turn:
        // even one decoded and waiting in a transition, which is no longer pending.
        cancelPending();
        quiet.current = false;
        instantNext.current = false;
        turnMode.current = 'time';
        return false;
      }
      quiet.current = true;
      if (how === 'at once') instantNext.current = true;
      else turnMode.current = how;
      selectExpression(to);
      return true;
    };
    if (phase === 'playing') stand('light', 'at once');
    else if (phase === 'done') stand(opening, 'at once');
    else if (stand(opening, 'overture')) landingOverture.current = true;
    else setOverturePhase('done');
  });
  useEffect(() => {
    if (overture) followOverture(overture);
  }, [overture]);

  useEffect(() => {
    if (!ended) return;
    const timer = setTimeout(() => {
      setRested(true);
      stand();
    }, REST_MS);
    return () => clearTimeout(timer);
  }, [ended, stand]);

  const media = getInterpretation(artwork, expression);
  const settled = settledLayers.includes(expression);
  // Only a hash-verified local delivery plays on the plate: the complete 1280 film where it
  // is held, otherwise the settling clip, the film's own final eight seconds, which ends on
  // the still. The 640 excerpt is a browsing preview; a complete published original waits
  // for the room.
  const plateFilm = (item?: ArtInterpretation) =>
    item?.films.find((film) => film.delivery === 'local-preview') ?? item?.settlingFilm;
  const inlineFilm = plateFilm(media);
  const settlingPlate = inlineFilm?.id === 'settling';
  // A phone's budget (vision §4): the plate rests on its still, the eight-second excerpt is its
  // one ambient motion, labelled as such, and the plate's film answers the word alone; it is
  // never fetched unbidden over a phone's connection.
  const compact = useCompactWall();
  const excerpt = compact && !explicitFilm ? media?.previewFilm : undefined;
  const ambientSource = compact && !explicitFilm ? excerpt : inlineFilm;
  // Again is offered once the film has resolved and rested, or when this visit already saw it
  // resolve; an excerpt that rested offers the film instead.
  const showAgain = restedNow && (ended || homeResolved) && !excerpt;

  /*
    The score (third-physics.md §5.5). While a film on its work's clock plays, on the plate or in
    the room, the orbit is measured off the main thread; the time line then becomes the score,
    and the strip says which bodies are nearest and how far apart at the moment on screen. Every
    Light film keeps the score's clock (light-film.ts); an Ink film keeps it where the venue
    checked it against the film (ink-clocks.ts), and shows the orbit's mark only from its first
    ink, after a pre-roll of bare paper (third-physics-phase-e.md §6).
  */
  const orbit = presentation === 'auction' ? undefined : offeredOrbit;
  // The home opens on the opening clip and hands over to the complete film at the same frame.
  const openingFilm = home && !compact && !settlingPlate ? media?.openingFilm : undefined;
  // The plate's clock holds only when every film it plays keeps it: the opening clip as well.
  const plateClock =
    openingFilm && !scoreClock(orbit, expression, openingFilm)
      ? null
      : scoreClock(orbit, expression, inlineFilm);
  const roomClock = scoreClock(
    orbit,
    expression,
    media?.films.find((film) => film.id === 'normal'),
  );
  const score = useFilmScore(
    orbit,
    // The room may be entered on the still and its complete film chosen there.
    (!!plateClock && !!inlineFilm && !excerpt && (playing || ended)) ||
      (!!roomClock && room !== null),
  );
  const filmScore = plateClock || roomClock ? score : null;
  const oneDecimal = useMemo(
    () => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    [locale],
  );
  // The closest approach is the record's, so the room can open on it before any measuring. A
  // film that reaches it on bare paper, in the Ink film's pre-roll, shows nothing of it.
  const closest = orbit
    ? { steps: orbit.window.steps, closestApproach: orbit.closestApproach }
    : undefined;
  const closestAt =
    closest && roomClock && showsClosestApproach(roomClock, closest)
      ? closestApproachSeconds(closest)
      : null;
  const [handoverWaiting, setHandoverWaiting] = useState(false);
  const ambientFilm = !room && (!policy.constrained || explicitFilm);
  // A phone reads two compact plates in the page's natural flow. The material button still
  // performs the Turn; a sticky, viewport-long wing would leave the small plate stranded.
  const wingMode: WingMode = instant || compact ? 'hard' : 'scroll';
  const twin: Expression = turnedTwin ?? (isExpression(expression) ? twinOf(expression) : 'light');
  const twinMedia = twin === 'light' ? light : ink;
  const twinTone = twinMedia
    ? getPlateGround(artwork.id, twinMedia.id, twinMedia.stillSha256)?.tone
    : undefined;
  useRoomSeam({ enabled: true, expression, twin, twinTone, mode: wingMode, wingRef, fallbackRef });

  /**
   * Where the seam rests on the plate's own expression: wherever the hand has drawn the twin
   * across the wing, or the plate alone (100 % for Ink, 0 % for Light) outside it.
   */
  function wingSeam() {
    const wingNode = wingRef.current;
    const stageNode = wingNode?.firstElementChild as HTMLElement | null;
    if (!wingNode || !stageNode || wingMode !== 'scroll' || !scrollTimelinesSupported())
      return seamFor(twinOf(twin));
    const head =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--head')) || 48;
    return wingSeamAt(
      twin,
      wingProgress(
        wingNode.getBoundingClientRect(),
        stageNode.getBoundingClientRect().height,
        head,
      ),
    );
  }
  const targetSeam = (to: string) => (to === twin ? seamFor(twin) : wingSeam());
  const restSeam = () => targetSeam(expression);
  // The crossing in the order the work was made, where both arrival maps are bound.
  const { canvas: crossingCanvas, whenReady } = useArrivalCrossing({
    seam,
    ink,
    light,
    expression,
    enabled: hasBoth && !!ink?.arrival && !!light?.arrival && !instant,
    twin,
    wingSeam: () => (wingMode === 'scroll' && scrollTimelinesSupported() ? wingSeam() : null),
  });
  // A seam left at the finger or the key whose twin failed to decode returns to rest.
  const returnFailedSeam = useEffectEvent(() => {
    if (seam.seam === null) return;
    peek.current = null;
    void seam.animateTo(restSeam(), { mode: 'time', breath: false }).then((done) => {
      if (!done) return;
      seam.end();
      setTurning(null);
    });
  });
  useEffect(() => {
    if (failedExpression) returnFailedSeam();
  }, [failedExpression]);

  const label = (id: string) =>
    id === 'ink'
      ? t.ink
      : id === 'light'
        ? t.light
        : (artwork.media.find((item) => item.id === id)?.label ?? id);

  function openRoom(film: boolean, trigger: HTMLElement | null, at: number | null = null) {
    returnFocusRef.current = trigger;
    setRoomStart(at);
    cancelPending();
    seam.end();
    setTurning(null);
    peek.current = null;
    setRestart(0);
    setPlayRequest(0);
    setRoom(film ? 'film' : 'still');
    setPlaying(false);
    stand();
  }
  function closeRoom() {
    cancelPending();
    // The room may have crossed to the other ground: focus returns to the live layer's word.
    const study = section.current?.querySelector<HTMLElement>(
      '[data-layer-state="current"] [data-study]',
    );
    if (study && returnFocusRef.current && !study.isSameNode(returnFocusRef.current)) {
      const previous = returnFocusRef.current;
      if (!previous.isConnected || previous.closest('[data-layer-state="twin"]'))
        returnFocusRef.current = study;
    }
    setRoom(null);
    setRoomStart(null);
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
    setRestart((value) => value + 1);
    setTime((value) => ({ ...value, current: 0 }));
    if (paused) toggle();
  }
  /**
   * The strip's Film word and Space. A settling plate's inline film is only the ending; its
   * `Film` is the complete film, which opens in the room.
   */
  function togglePlay(trigger: HTMLElement | null = null) {
    if (!inlineFilm) return;
    if (showAgain) again();
    else if (playing && !paused && !still) setStill(true);
    else if (compact && !explicitFilm) {
      // The phone's excerpt gives way to the plate's own film, from its first frame.
      setTime({ current: 0, duration: 0 });
      requestFilm();
    } else if (settlingPlate) openRoom(true, trigger);
    else requestFilm();
  }
  // The running head fades with the strip (<html data-sit>, mirrored by useSit); a rest, a
  // Turn or the room standing up returns the head as well.

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
  function peekEnd(to: Expression, { lost = false }: { lost?: boolean } = {}) {
    const state = peek.current;
    if (!state || state.to !== to) return;
    peek.current = null;
    if (!lost && Date.now() - state.at < TAP_MS) {
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
    // Space belongs to the focused control; the page-wide playback shortcut is for the
    // artwork itself. Other viewing shortcuts remain available after a dialog restores focus.
    if (
      event.key === ' ' &&
      event.target instanceof Element &&
      event.target.closest('button, a[href], summary')
    )
      return;
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
  // The window losing focus or the tab hiding swallows the keyup: the peek returns on its own.
  const onKeyLost = useEffectEvent(() => {
    if (peek.current) peekEnd(peek.current.to, { lost: true });
  });
  useEffect(() => {
    const down = (event: KeyboardEvent) => onKeyDown(event);
    const up = (event: KeyboardEvent) => onKeyUp(event);
    const lost = () => onKeyLost();
    const hidden = () => {
      if (document.visibilityState === 'hidden') onKeyLost();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', lost);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', lost);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);

  const filmState = !settled || handoverWaiting ? 'arriving' : playing ? 'film' : 'still';
  const stateWord =
    filmState === 'film' && excerpt
      ? `${t.excerpt} ${excerptRange(excerpt) ?? ''}`.trimEnd()
      : t[filmState];

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
    // The physics of the moment, while a film on the score's clock plays its own frames (not an
    // excerpt) and shows the orbit's mark: the Ink film's bare paper has no bodies to read. The
    // home keeps its strip to its words in either expression; the band alone carries the score.
    const moment =
      !home &&
      current &&
      plateClock &&
      filmScore &&
      !excerpt &&
      !idle &&
      markedAt(plateClock, time.current)
        ? physicsAt(filmScore, time.current)
        : null;
    const physicsWord = moment ? (
      <span className={styles.physics} data-film-physics>
        {fill(t.filmPhysics, {
          pair: pairName(moment.pair),
          distance: oneDecimal.format(moment.distance),
        })}
      </span>
    ) : null;
    const filmWord = inlineFilm ? (
      <button
        type="button"
        className={styles.word}
        onClick={(event) => togglePlay(event.currentTarget)}
        title={settlingPlate && !compact && idle && !showAgain ? t.filmInRoom : undefined}
        data-film-word
      >
        {showAgain ? t.again : idle ? t.film : t.still}
      </button>
    ) : null;
    // When a film resolves into its still, the venue offers what no film shows: the orbit
    // carried on past its recorded window, further down the page (third-physics.md §5.6).
    // A phone's strip has no room to spare, and its orbit is the next thing down.
    const beyondWord =
      afterTheFrame && !home && !compact && showAgain ? (
        <a
          className={styles.word}
          href="#orbit"
          onClick={(event) => {
            event.preventDefault();
            window.dispatchEvent(new Event(AFTER_THE_FRAME_EVENT));
          }}
          data-after-the-frame
        >
          {t.afterTheFrame}
        </a>
      ) : null;
    return (
      <>
        {physicsWord}
        {turnWord}
        {filmWord}
        {beyondWord}
        {!home || (inlineFilm && !showAgain) ? (
          <ArtworkOptions
            key={`${layer}:${current}`}
            t={t}
            onStudy={!home ? (trigger) => openRoom(false, trigger) : undefined}
            onSit={inlineFilm && !showAgain ? sitDown : undefined}
            closest={
              !home && current && closestAt !== null
                ? {
                    clock: clock(closestAt),
                    onOpen: (trigger) =>
                      openRoom(true, trigger, Math.max(0, closestAt - CLOSEST_LEAD_SECONDS)),
                  }
                : undefined
            }
            readout={
              inlineFilm && time.duration && !excerpt ? (
                <span className={styles.clock}>
                  {clock(time.current)} / {clock(time.duration)}
                </span>
              ) : undefined
            }
          />
        ) : null}
        <span
          className={
            filmState === 'arriving' || (filmState === 'film' && excerpt) ? styles.state : 'sr-only'
          }
          data-film-state={filmState}
        >
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

  // The film's transport, at the foot of its plate: the score where the film keeps its clock,
  // otherwise its time line. A phone's excerpt is a preview, and carries neither.
  const transport =
    inlineFilm && !excerpt && (playing || (ended && !restedNow)) ? (
      filmScore && orbit && plateClock ? (
        <FilmScoreBand
          score={filmScore}
          hues={orbit.bodyHues}
          progress={time.current / lightFilmDuration(filmScore.steps)}
          material={plateClock.material}
          from={markedFrom(plateClock, filmScore)}
        />
      ) : (
        <div className="time-line" aria-hidden="true">
          <i style={{ width: `${time.duration ? (time.current / time.duration) * 100 : 0}%` }} />
        </div>
      )
    ) : null;

  function layer(id: Expression) {
    const item = getInterpretation(artwork, id);
    if (!item) return null;
    const current = id === expression;
    const previewSrc =
      item.thumbnail === getInterpretation(initial, id)?.thumbnail
        ? inlinePreviews?.[id]
        : undefined;
    // The committed layer's films: the opening clip and the complete film it hands over to on
    // the home, otherwise the plate's one inline film; the twin carries none.
    const films =
      current && ambientSource
        ? openingFilm
          ? [openingFilm, ambientSource]
          : [ambientSource]
        : [];
    const ambient = { ...item, films };
    return (
      <TurnLayer key={id} expression={id} current={current}>
        <Plate
          id={artwork.id}
          media={item}
          current={current}
          settled={settledLayers.includes(id)}
          centre={centre(id)}
          words={<div className={styles.wordsRow}>{words(id)}</div>}
          foot={current ? transport : null}
          className={current ? 'viewer-plate' : ''}
        >
          <ArtworkTransition
            artworkId={artwork.id}
            interpretationId={id}
            role="detail"
            disabled={home || !current || !!room}
            className={styles.surface}
          >
            <ArtworkMedia
              key={attempts[id] ?? 0}
              media={ambient}
              alt={`${workNumber(artwork.id)} · ${label(id)}`}
              priority={current}
              eager
              hold={!explicitFilm}
              ambient={current && ambientFilm}
              artworkId={artwork.id}
              previewSrc={previewSrc}
              still={!current || still || homeResolved || !!room}
              startAt={current ? time.current : 0}
              restart={current ? restart : 0}
              playRequest={current ? playRequest : 0}
              onPlaybackChange={current ? setPlaying : undefined}
              onHandover={current ? setHandoverWaiting : undefined}
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
          foot={transport}
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
      crossing={crossingCanvas}
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
        data-presentation={presentation}
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
          {wing && hasBoth && twinMedia ? (
            <Wing
              mode={wingMode}
              expression={expression}
              twin={twin}
              wingRef={wingRef}
              fallbackRef={fallbackRef}
              fallback={
                <Plate
                  id={artwork.id}
                  media={twinMedia}
                  current={false}
                  centre={<span>{label(twin)}</span>}
                  words={
                    <div className={styles.wordsRow}>
                      <span className={styles.state}>{t.still}</span>
                    </div>
                  }
                  className={styles.echo}
                >
                  <ArtworkMedia
                    media={{ ...twinMedia, films: [] }}
                    alt={`${workNumber(artwork.id)} · ${label(twin)}`}
                    artworkId={artwork.id}
                    previewSrc={inlinePreviews?.[twin]}
                    still
                  />
                </Plate>
              }
            >
              {turn}
            </Wing>
          ) : (
            turn
          )}
        </ArtworkStage>
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
        {presentation === 'gallery' && wing && light?.still && ink?.still ? (
          <ArtworkGatefold artwork={artwork} expression={expression} t={t} locale={locale} />
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
          startAt={roomStart ?? (ended ? 0 : time.current)}
          locale={locale}
          onClose={closeRoom}
          returnFocusRef={returnFocusRef}
          derivedViews={presentation !== 'auction'}
          filmScore={
            filmScore && orbit ? { score: filmScore, hues: orbit.bodyHues, ink: orbit.ink } : null
          }
        />
      ) : null}
    </>
  );
}
