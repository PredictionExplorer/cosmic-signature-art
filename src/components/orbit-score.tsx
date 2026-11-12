'use client';
import {
  Fragment,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { Locale } from '@/lib/i18n/routing';
import type { Messages } from '@/lib/i18n/en';
import { clock, fill, fillParts } from '@/lib/i18n/format';
import type { WorkOrbit } from '@/lib/art/orbit-records';
import type { OrbitPlate } from '@/lib/art/orbit-plate';
import {
  LIGHT_FILM,
  lightFilmDuration,
  lightFilmFrames,
  lightFilmSeconds,
  stepsDrawnAt,
} from '@/lib/physics/light-film';
import { principalPlane, type Plane } from '@/lib/physics/plane';
import { gapAt, twinPace, type TwinRun } from '@/lib/physics/twin';
import type { TwinReply, TwinRequest } from '@/lib/physics/twin.worker';
import {
  letGo,
  pause,
  play,
  restingAt,
  scrub,
  toClosest,
  type Transport,
} from '@/lib/first-light/transport';
import { AFTER_THE_FRAME_EVENT } from '@/lib/venue-events';
import { useMotion } from './motion-provider';
import { useRememberedExpression, type Expression } from './turn';
import { layers } from './orbit-layers';
import { pictureOn, type Material, type Surface } from './orbit-picture';
import { orbitPainter } from './orbit-painter';
import {
  FADE_MS,
  REST_MS,
  beyondFact,
  beyondLine,
  furtherOn,
  heldScript,
  performBeyond,
  worthGoingOn,
  type Beyond,
  type BeyondPhase,
  type HeldScript,
} from './orbit-beyond';
import type { BeyondPath } from '@/lib/physics/beyond';
import { STRIDE, useOrbitDerivation, type Derivation } from './orbit-derivation';
import { useOrbitPresence } from './orbit-presence';
import { OrbitRecord } from './orbit-record';
import type { Sculpture } from './orbit-sculpture';
import { OrbitSlider } from './orbit-timeline';
import { Scientific, performTwin, type TwinPair } from './orbit-twin';
import {
  performWindow,
  playingLine,
  windowLine,
  windowScore,
  type Clock,
  type WindowScene,
} from './orbit-window';
import { progressText, seedShort, twinWorker, verdict } from './orbit-proof';
import { drawChoice, type Choice } from './orbit-choice';
import { useChoosing } from './orbit-choosing';
import { OrbitFigure } from './orbit-figure';
import { OrbitSaid, Sentences } from './orbit-said';
import { PressGuard, usePresses } from './orbit-word';
import { OrbitWords, type Offered } from './orbit-words';
import recordStyles from './artwork-record.module.css';
import styles from './orbit-score.module.css';

/** Past the frame the picture is brought this far beneath the running head, in pixels… */
const BENEATH_HEAD = 6;
/** …and this much of the screen is left to spare under what stands beneath it. */
const BENEATH_SPARE = 6;

/** A picture is read at no size in particular: a body is on it or off it at every size. */
const ANY_SIZE = { width: 1, height: 1, ratio: 1 };

type State = { phase: 'waiting' } | Derivation;

/** Whether this browser could draw the orbit in depth: only then is it sampled for it. */
const canTurn = () => typeof WebGL2RenderingContext !== 'undefined';

/** One part in a trillion: the twin followed in its worker, ready to perform, or not to be had. */
type Twin =
  { phase: 'following' } | { phase: 'ready'; run: TwinRun; repeat: number } | { phase: 'failed' };

/**
 * The orbit, re-performed: the work's orbit derived from its seed in this browser, drawn at
 * the Light film's pace, and every published measurement checked against the derivation. The
 * films and stills are recorded renderings; this is the physics beneath them. It lends the
 * running head the night while it stands beneath the head.
 *
 * On the plate (third-physics-phase-d.md §7): with the work's frame, the drawing lies over the
 * still of the expression the page shows, untouched, and each body is drawn where the films put
 * it. On Light the trails add their light to the still's and each body comes to stand where its
 * ribbon ends; on Ink each body, at the size the Ink edition gave it, comes to rest in the hollow
 * it left in the ink. Without a frame, or on an Ink still that does not bear the bodies out, the
 * orbit is drawn as Phase A drew it, in the plane of its greatest extent.
 *
 * After the frame (third-physics.md §5.6; docs/after-the-frame.md §8.3 and §8.4): the same
 * physics runs on past the recorded window, at the film's pace. Where the picture draws the
 * bodies where they were, the visitor is first asked whom to stay with: the frame, held where
 * the film left it, or one of the three, which then holds still in the picture. It runs until
 * what that picture shows resolves; then the still alone, a silence, and one line of what
 * happened (orbit-beyond.ts).
 *
 * In the hand (docs/first-light.md §14): where the browser can draw it, the orbit can be taken in
 * hand and turned in depth, and given back to the generator's view (orbit-sculpture.tsx). The
 * score is a slider, so the moment can be set either way (orbit-timeline.tsx), and the closest
 * approach can be played slowly, as a film slows for the moment that matters.
 *
 * One part in a trillion (docs/first-light.md §15): a twin of the orbit, one body moved by a
 * trillionth, carried past the frame beside the work until it parts (orbit-twin.tsx).
 *
 * The section is assembled from its parts: where it stands to the visitor (orbit-presence.ts),
 * the derivation (orbit-derivation.ts), the drawing (orbit-painter.ts), the orbit in depth
 * (orbit-sculpture.tsx), the slider (orbit-timeline.tsx) and the record (orbit-record.tsx). This
 * component holds what is left: the clock (src/lib/first-light/transport.ts), After the frame's
 * phases with the question and its answers, the twin's worker, where the focus goes, the page's
 * scroll to the picture, and the words that say what is happening.
 */
export function OrbitScore({
  orbit,
  t,
  locale,
  plate,
  opening,
  both = false,
}: {
  orbit: WorkOrbit;
  t: Messages;
  locale: Locale;
  /** The frame and the stills it lies over (src/lib/art/orbit-plate.ts); none draws in the plane. */
  plate?: OrbitPlate;
  /** The expression the page's plate opened on (src/lib/art/opening.ts). */
  opening?: Expression;
  /** The work publishes both expressions, so the visitor's remembered choice turns its plate. */
  both?: boolean;
}) {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  /** The line beneath the picture and its words: what must stand in view with it past the frame. */
  const beneath = useRef<HTMLDivElement>(null);
  /** The line and the words themselves: the focus is handed on when a word it stood on goes. */
  const telling = useRef<HTMLParagraphElement>(null);
  const wordsRow = useRef<HTMLDivElement>(null);
  /** The visitor asked to be told, so the focus goes to what is told. */
  const toldByHand = useRef(false);
  const trails = useRef<HTMLCanvasElement>(null);
  const continued = useRef<HTMLCanvasElement>(null);
  const marks = useRef<HTMLCanvasElement>(null);
  /**
   * The bodies' numbers while the visitor chooses among them: their canvas, and the question's
   * picture once drawn, which draws them again when the ring moves (the picture itself is not)
   * and knows what a pointer finds in it.
   */
  const names = useRef<HTMLCanvasElement>(null);
  const choice = useRef<Choice | null>(null);
  const tooSoon = usePresses();
  const events = useRef<HTMLCanvasElement>(null);
  const slider = useRef<HTMLInputElement>(null);
  const sculpture = useRef<Sculpture | null>(null);
  /** The drawing's animation frame. */
  const frame = useRef(0);
  /** How far After the frame has run, so a resize or a return carries on from it. */
  const live = useRef<{ key: string; sample: number; began?: number } | null>(null);
  /** Where the words stood as the visitor left After the frame, so they stay under the hand. */
  const wordsWere = useRef<{ top: number; bottom: number } | null>(null);
  const { near, inView, bringNear } = useOrbitPresence(section);
  const [readout, setReadout] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  /**
   * Where in the Light film the drawing stands. It plays on its own once the section is in view,
   * from the window's first step, unless motion is unwelcome.
   */
  const transport = useRef<Transport>({ kind: 'playing', seconds: 0, slowAt: null });
  /** The visitor has taken the clock: Play, Pause, the slider or the closest approach. */
  const [chosen, setChosen] = useState(false);
  const [clockState, setClockState] = useState<Clock>({ kind: 'playing', seconds: 0 });
  /** The orbit can be taken in hand here, and is turned from the generator's view now. */
  /** The orbit is turned from the generator's view now. */
  const [turned, setTurned] = useState(false);
  /** One part in a trillion: off (null), being followed, or ready; and where it has reached. */
  const [twin, setTwin] = useState<Twin | null>(null);
  const [twinTaken, setTwinTaken] = useState(0);
  const [twinRested, setTwinRested] = useState(false);
  const twinLive = useRef<TwinPair | null>(null);
  /** The twin is followed once; a repeat or a return performs what was found. */
  const twinCache = useRef<TwinRun | null>(null);
  /** The window as last laid out, so the clock can move it without laying it out again. */
  const scene = useRef<WindowScene | null>(null);
  /** After the frame as the visitor last left it; `beyond`, below, is what the section shows. */
  const [went, setWent] = useState<Beyond | null>(null);
  /** The plate's word asked for After the frame before its path was known: it is awaited. */
  const [awaited, setAwaited] = useState(false);
  /** The material After the frame was last asked for in: its pictures are read then, and kept. */
  const [wanted, setWanted] = useState<Material | null>(null);
  /** Where After the frame has got to. At the frame nothing reads it. */
  const phase: BeyondPhase = went?.phase ?? 'running';
  /**
   * The focus is to go to the line once it has its words: the visitor has asked for the
   * question (the keyboard and the screen reader are taken to it, and its answers follow it),
   * or has answered it, and the word that answered is gone.
   */
  const handOn = useRef(false);
  /**
   * Whether the performance now beginning may move the page to its picture: always when the
   * visitor has just asked, and only if they are still here when it had to wait for its path.
   * It is taken once (`compose`): a picture that comes back unasked moves nothing.
   */
  const arriving = useRef<'bring' | 'if-here' | null>(null);
  /** Whether Further on would save a wait from where the performance stands… */
  const [worthIt, setWorthIt] = useState(false);
  /** …and a count of the times it was taken, so the drawing follows the playhead it moved. */
  const [jumps, setJumps] = useState(0);
  const { paused, reducedMotion, theatre } = useMotion();
  const still = paused || reducedMotion || theatre === 'hushed';
  const steps = orbit.generation.steps;
  const film = lightFilmDuration(steps);
  /** The film's pace: steps of the window per second of the Light film. */
  const pace = steps / film;
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const oneDecimal = useMemo(
    () => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    [locale],
  );

  const {
    derivation,
    framed,
    fate,
    beyond: path,
    space,
  } = useOrbitDerivation({
    orbit,
    near,
    pace,
    frame: plate?.frame,
    depth: canTurn(),
    // The plate's word asked before the path past the frame was known: go on now it is. Where
    // there is none to perform, the wait is over all the same, and the window is the visitor's.
    onBeyond: (carried) => {
      if (!awaited) return;
      setAwaited(false);
      if (!carried) return;
      // The plate's word left the focus on the section. If it is still there the question is
      // handed it, as it is by the section's own word; a visitor who has gone on is left be.
      handOn.current = asksWhom(carried) && document.activeElement === section.current;
      startBeyond(true, carried);
    },
  });
  // Nothing is derived before the section is near, which is never on the server.
  const state: State = !near
    ? { phase: 'waiting' }
    : typeof Worker === 'undefined'
      ? { phase: 'failed' }
      : derivation;
  // The window stands whole: drawn at once, performed to its end, or brought there by the slider.
  const finished = still || done || clockState.seconds >= film;

  const result = state.phase === 'derived' ? state.result : null;
  const derivedFate = fate.phase === 'derived' ? fate.fate : null;
  const plane = useMemo<Plane | null>(
    () => (result ? principalPlane(result.samples.positions, result.samples.count) : null),
    [result],
  );

  // The plate shows the expression the page's plate shows: the visitor's choice, remembered for
  // the visit, else the page's opening; and its still lies beneath only where the frame is borne
  // out for that expression. A window that could not be placed is drawn in its plane.
  const remembered = useRememberedExpression();
  const onPage = (both && remembered) || opening;
  const material: Material | null = onPage && plate?.stills[onPage] ? onPage : null;
  const plateStill =
    material && framed !== null && state.phase !== 'failed' ? plate!.stills[material]! : null;
  const placed = plateStill && framed ? framed : null;
  /** What the orbit is drawn on, once its places there are known: a plate waits for the window's. */
  const surface: Surface | null = plateStill
    ? placed && material && plate
      ? { kind: 'plate', window: placed, frame: plate.frame, material }
      : null
    : plane && result
      ? { kind: 'plane', plane, count: result.samples.count }
      : null;
  /**
   * After the frame can be performed: the fate is known, and the path past the window, on the
   * plate the window is drawn on. In the plane there is no frame for a body to leave.
   */
  const canGoBeyond = !!derivedFate && !!path && !!placed;

  /**
   * Past the frame only for as long as it can be performed there. A plate turned to a material
   * the orbit is not drawn on (none today: every still bears its orbit out) is drawn in the
   * plane, where there is no frame for a body to leave: the section stands at the frame until
   * the plate is turned back. Then it stands past the frame as it did, and the page is not
   * moved to it: turning the plate did not ask for the orbit (`arriving`).
   */
  const beyond = canGoBeyond ? went : null;
  const choosing = !!beyond && phase === 'choosing';
  const { ringed, aiming, point, unpoint, renew, hand } = useChoosing({
    stage,
    choice,
    asked: beyond && choosing ? beyond.run : null,
    tooSoon,
    onStay: (body) => stay(body),
  });
  const performing = !!beyond && !choosing;
  /** The body the picture is kept on past the frame; none where it is the work's frame, held. */
  const keptOn = beyond && beyond.phase !== 'choosing' ? beyond.kept : null;
  /**
   * Whether the picture draws the bodies where they were: only then can a line name one, and
   * only then is there a body to stay with (a mark made of two bodies' coordinates is none).
   */
  const bodiesDrawn = plate?.frame.projection === 'position';
  /**
   * Whether the visitor is asked whom to stay with: where the picture draws the bodies where
   * they were (a mark made of two bodies' coordinates is no body to stay with), and the path
   * holds something to perform.
   */
  const asksWhom = (carried: BeyondPath | null | undefined) =>
    bodiesDrawn && !!carried && carried.samples > 1;
  /**
   * What each picture the visitor may be in shows of the path past the frame: the work's own
   * frame, held, and, where they are asked, the picture kept on each of the three. Read the
   * first time After the frame is asked for, and kept through leaving it and coming back: a
   * reading is the same at every size the plate is drawn at (a body is on the picture or off
   * it), so these stand for as long as the path and the material do. Light draws every
   * symmetry copy of a body, Ink the first alone: past the frame a plate turned to the other
   * material is read anew. At the frame a turn of the plate reads nothing: the readings wait
   * for the material they were asked for in, and are made again if the plate comes back to it.
   */
  const reads = !!went || (wanted !== null && wanted === material);
  const readings = useMemo(() => {
    if (!reads || !path || !derivedFate || !placed || !material || !plate) return null;
    const on: Surface = { kind: 'plate', window: placed, frame: plate.frame, material };
    const pictures: (number | null)[] = bodiesDrawn && path.samples > 1 ? [null, 0, 1, 2] : [null];
    return pictures.map((kept) => ({
      kept,
      script: heldScript(
        path,
        pictureOn(on, ANY_SIZE, kept === null ? null : { path: path.pixels, body: kept }),
        derivedFate,
        pace,
        bodiesDrawn,
      ),
    }));
  }, [reads, path, derivedFate, placed, material, plate, pace, bodiesDrawn]);
  const script: HeldScript | null = performing
    ? (readings?.find((one) => one.kept === keptOn)?.script ?? null)
    : null;
  /**
   * What happened in each of those pictures, sentence by sentence. Only the one the visitor
   * was in is ever told; all of them are laid out unseen in the line's room, so that the room
   * kept under the picture is the room of the longest, in this language and at this width,
   * from the moment the question is asked: nothing moves when the telling comes.
   */
  const tellings = useMemo(
    () =>
      readings && path && derivedFate
        ? readings.map((one) => ({
            kept: one.kept,
            said: beyondFact(one.script, path, derivedFate, t, number),
          }))
        : [],
    [readings, path, derivedFate, t, number],
  );
  /** What happened, once it is told: of the picture on view, in the material on view. */
  const fact =
    performing && phase === 'told'
      ? (tellings.find((one) => one.kept === keptOn)?.said ?? null)
      : null;
  /** The path held nothing past the window to perform: what happened is said at once. */
  const nothingPerformed = script?.ending.sample === 0;

  const startBeyond = (waited: boolean, carried: BeyondPath | null | undefined) => {
    arriving.current = waited ? 'if-here' : 'bring';
    setTwin(null);
    twinLive.current = null;
    setAwaited(false);
    setWanted(material);
    unpoint();
    setWorthIt(false);
    setReadout(null);
    const asks = asksWhom(carried);
    setWent((current) => {
      const run = (current?.run ?? 0) + 1;
      return asks ? { run, phase: 'choosing' } : { run, phase: 'running', kept: null };
    });
  };
  /**
   * After the frame, asked for now: by its word here, by the plate's, or again. Where the
   * visitor is asked whom to stay with, the focus goes to the question, whose answers follow
   * it: it is said by the focus it is given, whichever word asked. Where not, the focus stays
   * where the word left it.
   */
  const goBeyond = () => {
    handOn.current = asksWhom(path);
    startBeyond(false, path);
  };
  /** The visitor's answer: stay with one of the three, or (null) with the frame. Time resumes. */
  const stay = (body: number | null) => {
    arriving.current = 'bring';
    handOn.current = true;
    unpoint();
    setWorthIt(false);
    setReadout(null);
    setWent((current) => ({ run: (current?.run ?? 0) + 1, phase: 'running', kept: body }));
  };
  // Past the frame the whole picture is the subject: its four edges, the line beneath it and the
  // words stand in one screen, so the caption and the score step aside (orbit-score.module.css)
  // and, as a performance begins, the page brings the picture just under the running head,
  // unless all of that is in view already. Leaving, the caption and the score return, and the
  // words are kept in view. Either is the visitor's own act: the word they pressed.
  const composing = useRef(0);
  /**
   * Past the frame the plate is fitted to the height its screen leaves beside what stands
   * beneath it: the label, the line's room (that of the tallest thing that can come to stand
   * in it, in this language at this width) and the words. That room is found here, once it is
   * laid out, and given to the stylesheet (--beneath-measured: orbit-score.module.css). On a
   * phone it does not depend on the plate's own size, and is found in one pass. On a desk, and
   * between 700 and 860 px, what stands beneath is as wide as the plate: a room taller than
   * the desk's 172 px narrows both, a telling may then take a line more, and the observer of
   * the room (below) finds that in a further pass. At the frame it is not given, and the plate
   * is the size it always was.
   */
  const fit = useEffectEvent(() => {
    const node = section.current;
    if (!node) return;
    const picture = stage.current?.getBoundingClientRect();
    const under = beneath.current?.getBoundingClientRect();
    if (!beyond || !picture || !under) node.style.removeProperty('--beneath-measured');
    else
      node.style.setProperty(
        '--beneath-measured',
        `${Math.ceil(under.bottom - picture.bottom) + BENEATH_HEAD + BENEATH_SPARE}px`,
      );
  });
  const compose = useEffectEvent((past: boolean) => {
    cancelAnimationFrame(composing.current);
    // First of all, so that the page is brought to the picture as it will stand.
    fit();
    /** Where the picture and what stands beneath it are in the window now. */
    const stands = () => {
      const picture = stage.current?.getBoundingClientRect();
      const words = beneath.current?.getBoundingClientRect();
      if (!section.current || !picture || !words) return null;
      const head = parseFloat(getComputedStyle(section.current).scrollMarginTop) || 0;
      return { picture, words, head, room: window.innerHeight };
    };
    const now = stands();
    if (!now) return;
    if (!past) {
      // Back at the frame the caption and the score return above the words. They are put back
      // where they stood under the hand that pressed one: at once, before the next paint, and
      // once more two frames on, when the browser has answered the change in its own way.
      const were = wordsWere.current;
      wordsWere.current = null;
      if (!were || were.bottom <= now.head || were.top >= now.room) return;
      const back = () => {
        const top = wordsRow.current?.getBoundingClientRect().top;
        if (top === undefined || Math.abs(top - were.top) < 1) return;
        window.scrollTo({ top: window.scrollY + top - were.top, behavior: 'instant' });
      };
      back();
      composing.current = requestAnimationFrame(() => {
        composing.current = requestAnimationFrame(back);
      });
      return;
    }
    // The page moves to the picture only as the visitor's own act: their word for it, taken
    // once. A picture that stands past the frame again without one (a plate turned back to
    // the material its orbit is drawn on) is left where the page is.
    const asked = arriving.current;
    arriving.current = null;
    if (!asked) return;
    // A performance that waited for its path found the page already on its way here, by the
    // plate's word: if the visitor is still here it ends on the picture, wherever that scroll
    // has reached. One they asked for here moves nothing when all of it is in view.
    const waited = asked === 'if-here';
    const here = now.picture.bottom > now.head && now.picture.top < now.room;
    if (waited ? !here : now.picture.top >= now.head && now.words.bottom <= now.room) return;
    const bring = () => {
      const at = stands();
      if (!at) return;
      window.scrollTo({
        top: window.scrollY + at.picture.top - at.head - BENEATH_HEAD,
        behavior: reducedMotion ? 'instant' : 'smooth',
      });
    };
    if (reducedMotion) {
      bring();
      return;
    }
    // Two frames on, and measured again there. The note above the picture grows a line as the
    // performance begins, the browser's scroll anchoring answers that in the next frame, and
    // WebKit cancels a smooth scroll begun in the frame of a change it has to answer.
    composing.current = requestAnimationFrame(() => {
      composing.current = requestAnimationFrame(bring);
    });
  });
  const run = beyond?.run ?? null;
  const performed = useRef(false);
  useLayoutEffect(() => {
    // Nothing moves when the section first stands, only when the visitor goes past the frame or back.
    if (run === null && !performed.current) return;
    performed.current = run !== null;
    compose(run !== null);
    return () => cancelAnimationFrame(composing.current);
  }, [run]);
  // The plate's word: go on past the frame as soon as the path past it is known, bringing the
  // picture into view. Asking derives the orbit if the visitor has not come near it yet, and
  // brings the section into view to wait.
  const onPlateWord = useEffectEvent(() => {
    bringNear();
    // The word was a link to here: the keyboard and the screen reader come here too.
    section.current?.focus({ preventScroll: true });
    if (beyond && (phase === 'running' || phase === 'choosing')) {
      // Already past the frame: its picture comes back into view, whole, and a question that
      // stands unanswered is said again by the focus it is given. The picture is new under
      // the pointer that pressed the word: a second press there is not yet an answer.
      arriving.current = 'bring';
      compose(true);
      if (phase === 'choosing') {
        renew();
        telling.current?.focus({ preventScroll: true });
      }
      return;
    }
    // Its path known, the performance begins (again, where it had been told), and brings its
    // picture into view as it does. One scroll, to where it will stand: a second, begun here,
    // would carry the page past it.
    if (canGoBeyond) {
      goBeyond();
      return;
    }
    section.current?.scrollIntoView({
      block: 'start',
      behavior: reducedMotion ? 'instant' : 'smooth',
    });
    // Neither a path that could not be carried, nor one a failed derivation will never send,
    // is waited for.
    if (path === undefined && derivation.phase !== 'failed' && fate.phase !== 'failed')
      setAwaited(true);
  });
  useEffect(() => {
    const heard = () => onPlateWord();
    window.addEventListener(AFTER_THE_FRAME_EVENT, heard);
    return () => window.removeEventListener(AFTER_THE_FRAME_EVENT, heard);
  }, []);

  /** One part in a trillion: After the frame gives way, and the twin is followed if it is new. */
  const goTwin = () => {
    if (beyond) keepWords();
    setWent(null);
    unpoint();
    handOn.current = false;
    live.current = null;
    twinLive.current = null;
    setAwaited(false);
    setTwinRested(false);
    setTwinTaken(steps);
    setReadout(null);
    setTwin((current) =>
      twinCache.current
        ? {
            phase: 'ready',
            run: twinCache.current,
            repeat: current?.phase === 'ready' ? current.repeat + 1 : 0,
          }
        : { phase: 'following' },
    );
  };
  /** Back to the frame: the recorded window, drawn whole. */
  const leaveTwin = () => {
    twinLive.current = null;
    transport.current = restingAt(film, film);
    setClockState({ kind: 'resting', seconds: film });
    setTwin(null);
    setTwinRested(false);
    setReadout(null);
    setDone(true);
  };
  const following = twin?.phase === 'following';
  const twinFrame = plate?.frame;
  useEffect(() => {
    if (!following || !result || !twinFrame) return;
    let worker: Worker;
    try {
      worker = twinWorker();
    } catch {
      queueMicrotask(() => setTwin({ phase: 'failed' }));
      return;
    }
    worker.onmessage = ({ data }: MessageEvent<TwinReply>) => {
      worker.terminate();
      if (data.type === 'done') {
        twinCache.current = data.run;
        setTwin({ phase: 'ready', run: data.run, repeat: 0 });
      } else setTwin({ phase: 'failed' });
    };
    worker.onerror = () => {
      worker.terminate();
      setTwin({ phase: 'failed' });
    };
    const request: TwinRequest = {
      start: {
        masses: result.masses,
        dt: orbit.generation.dt,
        steps,
        positions: result.windowStart.positions,
        velocities: result.windowStart.velocities,
      },
      frame: twinFrame,
      horizon: orbit.fate.horizonSteps,
    };
    worker.postMessage(request);
    return () => worker.terminate();
  }, [following, result, twinFrame, orbit, steps]);

  /** What happened past the frame is told: the line under the still says it (`fact`, above). */
  const tell = () => {
    setReadout(null);
    setWent((current) =>
      current && current.phase !== 'told'
        ? {
            run: current.run,
            phase: 'told',
            kept: current.phase === 'choosing' ? null : current.kept,
          }
        : current,
    );
  };
  /** Tell me: told at the visitor's word, and the focus goes to what is told. */
  const tellNow = () => {
    toldByHand.current = true;
    tell();
  };
  useEffect(() => {
    if (phase !== 'told' || !toldByHand.current) return;
    toldByHand.current = false;
    // The word that was pressed is gone: the keyboard and the screen reader go to what it told.
    telling.current?.focus({ preventScroll: true });
  }, [phase]);
  useEffect(() => {
    if (!handOn.current) return;
    // Not before the line has its words: the question, or whom the picture stays with, which
    // the drawing says a render after the answer. A focus on an empty line says nothing.
    if (phase !== 'choosing' && !(phase === 'running' && readout)) return;
    handOn.current = false;
    telling.current?.focus({ preventScroll: true });
  }, [run, phase, readout]);
  // The performance over, the still stands alone and nothing is said or offered for a while.
  const afterRest = useEffectEvent(tell);
  const resting = !!beyond && phase === 'resting';
  useEffect(() => {
    if (!resting) return;
    const timer = setTimeout(afterRest, FADE_MS + REST_MS);
    return () => clearTimeout(timer);
  }, [resting]);
  /**
   * Further on: to the next moment of the performance. Kept in its place while it would save
   * nothing, and at the performance's end, the word does nothing: it never turns into the word
   * that tells, or a visitor stepping with it (where nothing plays it is the only way on) would
   * step on into whatever came to stand there. Tell me tells.
   */
  const goFurther = () => {
    if (!script || !live.current || !worthIt) return;
    const target = furtherOn(script, Math.floor(live.current.sample), still);
    if (target === 'end') return;
    live.current.sample = target;
    setJumps((count) => count + 1);
  };

  // The drawing: trails accumulate, the bodies ride on a layer above, and the score beneath
  // carries the three separations with the published events. On the plate the drawing lies over
  // the still, in its material: light added on night, graphite and sumi on paper. At the film's
  // pace when motion is welcome and the section is in view; all at once otherwise.
  const draw = useEffectEvent((): (() => void) | void => {
    cancelAnimationFrame(frame.current);
    // The performance over, its last frame stands under the still, which the stylesheet brings
    // back over it (orbit-score.module.css): nothing is drawn again, and no canvas is sized,
    // until the visitor goes on.
    if (beyond && (phase === 'resting' || phase === 'told')) return;
    // A plate waits for the window's places on it; the plane for its own.
    if (!result || !surface) return;
    const sheet = layers({
      trails: trails.current,
      continued: continued.current,
      marks: marks.current,
      events: events.current,
      names: names.current,
    });
    if (!sheet) return;
    // Past the frame the picture may stay with one body: the same frame, moved along with it.
    const picture = pictureOn(
      surface,
      sheet,
      beyond && beyond.phase === 'running' && beyond.kept !== null && path
        ? { path: path.pixels, body: beyond.kept }
        : null,
    );
    const hues = orbit.bodyHues;
    const painter = orbitPainter({
      ...sheet,
      picture,
      hues,
      masses: result.masses,
      closestApproach: result.closestApproach,
      steps,
      stride: STRIDE,
    });
    /** What each of the four is drawn with: the layers, the picture on them, and its painter. */
    const easel = { ...sheet, picture, painter };
    scene.current = null;
    choice.current = null;

    // The question. The three wait where the film left them, each with its number, until the
    // visitor says whom to stay with. Nothing plays.
    if (beyond && phase === 'choosing') {
      choice.current = drawChoice({
        ...easel,
        masses: result.masses,
        font: sheet.font(),
        ground: plateStill?.tone ?? 'transparent',
      });
      choice.current.ring(ringed);
      return;
    }
    // After the frame, in the picture the visitor chose. The score is not shown, and not built.
    if (beyond && script && path)
      return performBeyond({
        ...easel,
        path,
        script,
        key: String(beyond.run),
        film,
        still,
        inView,
        live,
        frame,
        speak: (sample, brought) => {
          // Until the bodies have been brought to where the picture holds them, time waits,
          // and there is nothing to go further on to.
          setWorthIt(brought && worthGoingOn(script, sample, still));
          setReadout(beyondLine(script, path, sample, t, number));
        },
        // Performed to its end, the drawing gives way to the still, and nothing is said.
        onEnd: () => {
          // Where the computation lost its energy inside the recorded window there is nothing
          // past it to perform, and no rest to take: what happened is said at once.
          if (script.ending.sample === 0) {
            tell();
            return;
          }
          // The words go for the rest: a focus that stood on one stays in the section.
          if (wordsRow.current?.contains(document.activeElement))
            section.current?.focus({ preventScroll: true });
          setReadout(null);
          setWent((current) =>
            current && current.phase === 'running' ? { ...current, phase: 'resting' } : current,
          );
        },
      });
    // One part in a trillion: the work and its twin past the frame, and on the strip beneath,
    // in the score's place, the growth of the gap between them.
    if (twin?.phase === 'ready' && derivedFate && plate && picture.kind === 'plate')
      return performTwin({
        ...easel,
        run: twin.run,
        fate: derivedFate,
        key: String(twin.repeat),
        plate,
        result,
        dt: orbit.generation.dt,
        steps,
        pace,
        stride: STRIDE,
        still,
        inView,
        live: twinLive,
        frame,
        speak: (taken) => setTwinTaken(taken),
        onRested: () => setTwinRested(true),
      });
    // The recorded window at its clock, over its score.
    const score = windowScore(sheet.strip, result, steps, STRIDE, hues);
    if (!score) return;
    // Asked for After the frame, the window waits whole for its path rather than starting over.
    // Where motion is unwelcome it is drawn whole, until the visitor takes the clock.
    if (awaited || following || (still && !chosen)) transport.current = restingAt(film, film);
    scene.current = performWindow({
      ...easel,
      score,
      count: result.samples.count,
      steps,
      stride: STRIDE,
      film,
      inView,
      transport,
      frame,
      slider,
      sculpture,
      say: (now) => {
        setClockState(now);
        setReadout(
          windowLine(
            now,
            { steps, film, closest: result.closestApproach },
            { t, number, oneDecimal },
          ),
        );
      },
      onEnd: () => setDone(true),
    });
    return () => cancelAnimationFrame(frame.current);
  });

  useEffect(
    () => draw(),
    [
      result,
      plane,
      framed,
      material,
      still,
      inView,
      beyond,
      derivedFate,
      path,
      phase,
      jumps,
      awaited,
      twin,
    ],
  );
  // The ring moves without the picture being drawn again: the numbers' layer alone is.
  useEffect(() => {
    choice.current?.ring(ringed);
  }, [ringed]);

  const resized = useEffectEvent(() => {
    // At another size the picture is not where a resting mouse found it: it aims afresh when
    // it next moves.
    point('aim', null);
    draw();
  });
  useEffect(() => {
    const node = stage.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    let first = true;
    const observer = new ResizeObserver(() => {
      if (first) {
        first = false;
        return;
      }
      resized();
    });
    observer.observe(node);
    // What stands beneath the picture takes another height at another width (a line more of
    // what happened): the plate is fitted again.
    const under = new ResizeObserver(() => fit());
    if (beneath.current) under.observe(beneath.current);
    return () => {
      observer.disconnect();
      under.disconnect();
    };
  }, []);

  /**
   * The clock as the visitor finds it. Where motion is unwelcome nothing plays until they ask, so
   * until they take the clock it rests with the window whole: also in the moment between the
   * derivation and the window's first drawing, while the transport still holds the performance it
   * would begin where motion is welcome. A slider or a word taken in that moment acts on what the
   * visitor sees, never on a performance that is not running.
   */
  const found = (): Transport => (still && !chosen ? restingAt(film, film) : transport.current);
  /**
   * The visitor takes the clock: it is set, the drawing follows at once, and it runs on if it
   * plays. Motion the visitor asks for is theirs, so it plays even where motion is unwelcome.
   */
  const takeClock = (next: Transport) => {
    setChosen(true);
    transport.current = next;
    setClockState({ kind: next.kind, seconds: next.seconds });
    if (next.kind === 'playing' && next.seconds < film) setDone(false);
    const current = scene.current;
    if (!current) return;
    current.paint(next.seconds);
    current.speak();
    current.run();
  };
  /** Play and Pause; at the end, play again from the window's first step. */
  const playPause = () => {
    const now = found();
    takeClock(now.kind === 'playing' ? pause(now) : play(now, film));
  };
  /** The closest approach, played slowly from a little before it; at rest on it where still. */
  const toClosestApproach = () =>
    takeClock(toClosest(lightFilmSeconds(orbit.published.closestApproach.step, steps), still));
  /** The slider: a frame of the Light film, held while the hand is on it. */
  const onScrub = (filmFrame: number, settled: boolean) => {
    const held = scrub(found(), filmFrame / LIGHT_FILM.fps, film);
    takeClock(settled ? letGo(held, film) : held);
  };

  /** Notes where the words stand, on the way out of After the frame (compose). */
  const keepWords = () => {
    const box = wordsRow.current?.getBoundingClientRect();
    wordsWere.current = box ? { top: box.top, bottom: box.bottom } : null;
  };
  /** Back to the frame: the recorded window, drawn whole. */
  const leaveBeyond = () => {
    keepWords();
    unpoint();
    handOn.current = false;
    live.current = null;
    transport.current = restingAt(film, film);
    setClockState({ kind: 'resting', seconds: film });
    setWent(null);
    setReadout(null);
    setDone(true);
  };

  // Each row is marked as it is checked; the fate is checked last, since it runs on past the
  // window to the horizon, and the summary speaks once every row has been.
  const comparisons =
    state.phase === 'derived'
      ? fate.phase === 'derived'
        ? [...state.comparisons, fate.comparison]
        : state.comparisons
      : null;
  const checked = state.phase === 'derived' && fate.phase !== 'deriving';
  const differing = comparisons?.filter((row) => !row.exact) ?? [];

  const progress = state.phase === 'deriving' ? state.progress : null;
  const standsAt = (step: number, seconds: number) => playingLine(step, seconds, steps, t, number);
  // The line under the drawing says what is happening now; the summary has a slot of its own,
  // so a line that changes length never moves the page beneath the section.
  const progressLine =
    state.phase === 'failed'
      ? ''
      : state.phase === 'waiting'
        ? t.orbitWaiting
        : state.phase === 'deriving'
          ? progressText(
              progress ?? { phase: 'beginnings', done: 0, total: orbit.generation.selectedIndex },
              orbit.generation,
              t,
              number,
            )
          : finished
            ? standsAt(steps, film)
            : standsAt(0, 0);
  const summary =
    state.phase === 'failed'
      ? t.orbitUnavailable
      : checked
        ? `${fill(t.orbitDerived, {
            seconds: oneDecimal.format(state.seconds),
            seed: seedShort(orbit.generation.seed),
            index: number.format(orbit.generation.selectedIndex),
            total: number.format(
              orbit.generation.candidatesPerAttempt * (orbit.generation.retryCount + 1),
            ),
            steps: number.format(orbit.generation.warmupSteps + steps),
          })} ${verdict(comparisons ?? [], t)}`
        : null;
  // Where motion is unwelcome the window stands whole and the line says so, until the visitor
  // takes the clock; then the line follows it.
  /** One part in a trillion's line: following, how far apart they stand, or where they parted. */
  const twinLine = ((): ReactNode => {
    if (!twin) return null;
    if (twin.phase === 'following') return fill(t.twinWorking, { body: 1 });
    if (twin.phase === 'failed') return t.twinUnavailable;
    const { run: found } = twin;
    const parts = (template: string, values: Record<string, ReactNode | string | number>) =>
      fillParts<ReactNode>(template, values).map((part, i) => <Fragment key={i}>{part}</Fragment>);
    if (found.parted !== null && twinTaken >= found.parted)
      return fill(t.twinParted, {
        step: number.format(found.parted),
        doubling: found.doubling ? number.format(Math.round(found.doubling / 100) * 100) : '—',
      });
    const gap = <Scientific value={gapAt(found, twinTaken)} locale={locale} />;
    if (twinRested) return parts(t.twinOneLine, { step: number.format(twinTaken), gap });
    const times = Math.round(twinPace(found, steps, pace) / pace);
    return parts(t.twinApart, {
      gap,
      step: number.format(twinTaken),
      pace: times <= 1 ? t.twinAtFilmPace : fill(t.twinFaster, { times }),
    });
  })();
  const factLine: ReactNode = fact ? <Sentences said={fact} t={t} /> : null;
  /** The question and what is told are read, in the book face; the running line is metered. */
  const read = !!beyond && (phase === 'choosing' || phase === 'told');
  /** The longest line a performance can say here, for the room it is to keep. */
  const longestLine = !beyond
    ? null
    : !bodiesDrawn
      ? fill(t.orbitBeyond, { clock: clock(0), step: number.format(orbit.fate.horizonSteps) })
      : fill(asksWhom(path) ? t.beyondKeptLine : '{line}', {
          body: 3,
          line: fill(t.beyondAway, { clock: clock(0), body: 3, widths: oneDecimal.format(88.8) }),
        });
  const line: ReactNode = twin
    ? twinLine
    : beyond
      ? phase === 'told'
        ? factLine
        : phase === 'choosing'
          ? t.beyondAsk
          : readout
      : ((still && !chosen ? null : readout) ?? progressLine);
  const derived = state.phase === 'derived';
  // The word follows the clock as the visitor finds it (found(), above): never Pause where nothing plays.
  const playing = clockState.kind === 'playing' && !(still && !chosen);
  const atEnd = clockState.seconds >= film;
  /** The clock's word: Pause while it plays; at the end, Again for whoever has watched it. */
  const clockWord = playing ? t.pause : atEnd && (chosen || !still) ? t.again : t.play;
  const clockStep = stepsDrawnAt(clockState.seconds, steps);

  const offered: Offered | null = !derived
    ? null
    : beyond
      ? {
          act: 'beyond',
          phase,
          worthIt,
          onFurther: goFurther,
          onTell: tellNow,
          onAgain: nothingPerformed ? null : goBeyond,
          onLeave: leaveBeyond,
          onTwin: placed ? goTwin : null,
        }
      : twin
        ? {
            act: 'twin',
            onAgain: twinRested && !still ? goTwin : null,
            onBeyond: canGoBeyond ? goBeyond : null,
            onLeave: leaveTwin,
          }
        : {
            act: 'window',
            clockWord,
            onClock: playPause,
            onClosest: toClosestApproach,
            onGeneratorView: turned ? () => sculpture.current?.back() : null,
            onBeyond: canGoBeyond && finished ? goBeyond : null,
            onTwin: derivedFate && finished && placed ? goTwin : null,
          };

  return (
    <PressGuard.Provider value={tooSoon}>
      {/* Act one, the show (docs/first-light.md §17): the orbit performed and held, on night. */}
      <section
        ref={section}
        id="orbit"
        tabIndex={-1}
        className={styles.orbit}
        style={
          plateStill && plate
            ? ({ '--plate-ratio': plate.frame.width / plate.frame.height } as CSSProperties)
            : undefined
        }
        aria-labelledby="orbit-title"
        data-phase={state.phase}
        data-exact={checked ? String(differing.length === 0) : undefined}
        data-fate={fate.phase === 'derived' ? fate.fate.outcome : undefined}
        data-beyond={beyond ? phase : undefined}
        data-kept={keptOn !== null ? keptOn + 1 : undefined}
        data-twin={
          twin
            ? twin.phase === 'ready'
              ? twinRested
                ? 'rested'
                : 'running'
              : twin.phase
            : undefined
        }
        data-drawing={plateStill ? 'plate' : 'plane'}
        data-material={plateStill ? (material ?? undefined) : undefined}
      >
        <header className={styles.head}>
          <h2 id="orbit-title" className={styles.title}>
            {t.orbitTitle}
          </h2>
          <p className={styles.line}>
            {twin
              ? fill(t.oneInATrillionNote, { body: 1 })
              : beyond
                ? // Both answers are said from the moment the question is asked, whatever the
                  // answer: a note that grew a line as a body was chosen would move the picture
                  // the visitor had just pressed.
                  asksWhom(path)
                  ? t.afterTheFrameNoteAsk
                  : t.afterTheFrameNote
                : t.orbitLine}
          </p>
        </header>
        <OrbitFigure
          stage={stage}
          trails={trails}
          continued={continued}
          marks={marks}
          names={names}
          sculpture={sculpture}
          orbit={orbit}
          t={t}
          oneDecimal={oneDecimal}
          number={number}
          on={
            plateStill && plate && material
              ? { frame: plate.frame, still: plateStill, material }
              : null
          }
          near={near}
          space={space}
          still={still}
          act={beyond ? 'beyond' : twin ? 'twin' : 'window'}
          labelled={phase === 'running' || phase === 'choosing'}
          hand={hand}
          aimed={aiming}
          onTurned={setTurned}
          onPlayPause={playPause}
        />
        <div ref={beneath} className={styles.score}>
          <div className={styles.strip}>
            <canvas ref={events} className={styles.events} aria-hidden="true" />
            {derived && !beyond && !twin ? (
              <OrbitSlider
                slider={slider}
                frames={lightFilmFrames(steps)}
                label={t.orbitTimeLabel}
                valueText={standsAt(clockStep, clockState.seconds)}
                disabled={awaited}
                onScrub={onScrub}
              />
            ) : null}
          </div>
          <div className={styles.readoutRow}>
            <OrbitSaid
              telling={telling}
              t={t}
              line={line}
              read={read}
              live={
                !!beyond &&
                (phase === 'resting' || phase === 'told' || (phase === 'running' && still))
              }
              onStay={derived && choosing ? stay : null}
              onPoint={(by, body) => point(by === 'focus' ? 'focus' : 'hover', body)}
              room={
                beyond && longestLine !== null
                  ? { asks: asksWhom(path), tellings, longestLine }
                  : null
              }
            />
            <OrbitWords row={wordsRow} t={t} offered={offered} />
          </div>
        </div>
      </section>
      {/* Act two, the record: the published record, checked here, opens it on paper. */}
      <section
        id="proof"
        className={styles.proofAct}
        aria-labelledby="orbit-proof-title"
        data-exact={checked ? String(differing.length === 0) : undefined}
      >
        <div className={styles.proofBody}>
          <h2
            id="orbit-proof-title"
            className={`${recordStyles.sectionTitle} ${styles.proofTitle}`}
          >
            {t.orbitTableCaption}
          </h2>
          <OrbitRecord
            orbit={orbit}
            t={t}
            locale={locale}
            comparisons={comparisons}
            summary={summary}
            energy={derivedFate?.energy ?? null}
            labelledBy="orbit-proof-title"
          />
        </div>
      </section>
    </PressGuard.Provider>
  );
}
