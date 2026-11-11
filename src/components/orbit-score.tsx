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
import { pairName } from '@/lib/physics/film-score';
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
  advance,
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
import { drawScore } from './score-drawing';
import { useRememberedExpression, type Expression } from './turn';
import { planePicture, platePicture, type Material } from './orbit-picture';
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
import { STRIDE, useOrbitDerivation, type Derivation } from './orbit-derivation';
import { useOrbitPresence } from './orbit-presence';
import { OrbitRecord } from './orbit-record';
import { OrbitSculpture, type Sculpture } from './orbit-sculpture';
import { OrbitSlider } from './orbit-timeline';
import { Scientific, TWIN_TONE, performTwin, type TwinPair } from './orbit-twin';
import { progressText, seedShort, twinWorker, verdict } from './orbit-proof';
import recordStyles from './artwork-record.module.css';
import styles from './orbit-score.module.css';

/** The plate's still is laid out at the figure's width: the full width on a phone. */
const STILL_SIZES = '(max-width: 860px) 100vw, 62vw';
/** Past the frame the picture is brought this far beneath the running head, in pixels. */
const BENEATH_HEAD = 6;

type State = { phase: 'waiting' } | Derivation;

/** Whether this browser could draw the orbit in depth: only then is it sampled for it. */
const canTurn = () => typeof WebGL2RenderingContext !== 'undefined';

/** The clock as the words and the slider read it, a few times a second. */
type Clock = { kind: Transport['kind']; seconds: number };

/** One part in a trillion: the twin followed in its worker, ready to perform, or not to be had. */
type Twin =
  { phase: 'following' } | { phase: 'ready'; run: TwinRun; repeat: number } | { phase: 'failed' };

/** One of the words beside the line: pressed or not where it is a mode, dimmed where it would do nothing. */
function Word({
  label,
  onClick,
  pressed,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={styles.again}
      aria-pressed={pressed}
      aria-disabled={disabled || undefined}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

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
 * After the frame (third-physics.md §5.6; docs/after-the-frame.md §8.3): the same physics runs
 * on past the recorded window, at the film's pace, with the camera held where the film left it,
 * until a body's absence from the picture resolves; then the still alone, a silence, and one
 * line of what happened (orbit-beyond.ts).
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
 * component holds the clock (src/lib/first-light/transport.ts) and says what is happening.
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
  const events = useRef<HTMLCanvasElement>(null);
  const slider = useRef<HTMLInputElement>(null);
  const sculpture = useRef<Sculpture | null>(null);
  /** The last sample drawn, and the drawing's animation frame. */
  const drawn = useRef(0);
  const frame = useRef(0);
  /** How far After the frame has run, so a resize or a return carries on from it. */
  const live = useRef<{ key: string; sample: number } | null>(null);
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
  const [turnable, setTurnable] = useState(false);
  const [turned, setTurned] = useState(false);
  /** One part in a trillion: off (null), being followed, or ready; and where it has reached. */
  const [twin, setTwin] = useState<Twin | null>(null);
  const [twinTaken, setTwinTaken] = useState(0);
  const [twinRested, setTwinRested] = useState(false);
  const twinLive = useRef<TwinPair | null>(null);
  /** The twin is followed once; a repeat or a return performs what was found. */
  const twinCache = useRef<TwinRun | null>(null);
  /** The drawing as last laid out, so the clock can move it without laying it out again. */
  const scene = useRef<{ paint(seconds: number): void; run(): void; speak(): void } | null>(null);
  const [beyond, setBeyond] = useState<Beyond | null>(null);
  /** The plate's word asked for After the frame before its path was known. */
  const [asked, setAsked] = useState(false);
  /** After the frame: performed, then the still alone in silence, then told. */
  const [phase, setPhase] = useState<BeyondPhase>('running');
  /**
   * Whether the performance now beginning may move the page to its picture: always when the
   * visitor has just asked, and only if they are still here when it had to wait for its path.
   */
  const arriving = useRef<'bring' | 'if-here'>('bring');
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
      if (!asked) return;
      setAsked(false);
      if (carried) startBeyond(true);
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
  /**
   * After the frame can be performed: the fate is known, and the path past the window, on the
   * plate the window is drawn on. In the plane there is no frame for a body to leave.
   */
  const canGoBeyond = !!derivedFate && !!path && !!placed;

  /**
   * What the picture on view shows of the path past the frame, read once After the frame is
   * asked for. The reading is the same at every size the plate is drawn at (a body is on the
   * frame or off it), so it stands for as long as the path and the material do: Light draws
   * every symmetry copy of a body, Ink the first alone.
   */
  const pastFrame = !!beyond;
  const script = useMemo<HeldScript | null>(
    () =>
      pastFrame && path && derivedFate && placed && material && plate
        ? heldScript(
            path,
            platePicture(placed, plate.frame, material, 1, 1, 1),
            derivedFate,
            pace,
            plate.frame.projection === 'position',
          )
        : null,
    [pastFrame, path, derivedFate, placed, material, plate, pace],
  );
  /**
   * What happened, sentence by sentence, once it is told: of the picture on view, so a plate
   * turned to its other material while the line stands is told of that picture.
   */
  const fact = useMemo(
    () =>
      phase === 'told' && script && path && derivedFate
        ? beyondFact(script, path, derivedFate, t, number)
        : null,
    [phase, script, path, derivedFate, t, number],
  );
  /** The path held nothing past the window to perform: what happened is said at once. */
  const nothingPerformed = script?.ending.sample === 0;

  const startBeyond = (waited: boolean) => {
    arriving.current = waited ? 'if-here' : 'bring';
    setTwin(null);
    twinLive.current = null;
    setAsked(false);
    setPhase('running');
    setWorthIt(false);
    setReadout(null);
    setBeyond((current) => ({ run: (current?.run ?? 0) + 1 }));
  };
  /** After the frame, asked for now: by its word here, by the plate's, or again. */
  const goBeyond = () => startBeyond(false);
  // Past the frame the whole picture is the subject: its four edges, the line beneath it and the
  // words stand in one screen, so the caption and the score step aside (orbit-score.module.css)
  // and, as a performance begins, the page brings the picture just under the running head,
  // unless all of that is in view already. Leaving, the caption and the score return, and the
  // words are kept in view. Either is the visitor's own act: the word they pressed.
  const composing = useRef(0);
  const compose = useEffectEvent((performing: boolean) => {
    cancelAnimationFrame(composing.current);
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
    if (!performing) {
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
    // A performance that waited for its path found the page already on its way here, by the
    // plate's word: if the visitor is still here it ends on the picture, wherever that scroll
    // has reached. One they asked for here moves nothing when all of it is in view.
    const waited = arriving.current === 'if-here';
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
  const onAsk = useEffectEvent(() => {
    bringNear();
    // The word was a link to here: the keyboard and the screen reader come here too.
    section.current?.focus({ preventScroll: true });
    if (beyond && phase === 'running') {
      // Already past the frame: its picture comes back into view, whole.
      arriving.current = 'bring';
      compose(true);
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
      setAsked(true);
  });
  useEffect(() => {
    const ask = () => onAsk();
    window.addEventListener(AFTER_THE_FRAME_EVENT, ask);
    return () => window.removeEventListener(AFTER_THE_FRAME_EVENT, ask);
  }, []);

  /** One part in a trillion: After the frame gives way, and the twin is followed if it is new. */
  const goTwin = () => {
    if (beyond) keepWords();
    setBeyond(null);
    live.current = null;
    twinLive.current = null;
    setAsked(false);
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

  /** What happened past the frame is told: the line under the still says it (`fact`, below). */
  const tell = () => {
    setReadout(null);
    setPhase('told');
  };
  /** Tell me, or Further on from the end: told at the visitor's word, and the focus goes to it. */
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
  // The performance over, the still stands alone and nothing is said or offered for a while.
  const afterRest = useEffectEvent(tell);
  const resting = !!beyond && phase === 'resting';
  useEffect(() => {
    if (!resting) return;
    const timer = setTimeout(afterRest, FADE_MS + REST_MS);
    return () => clearTimeout(timer);
  }, [resting]);
  /** Further on: to the next moment of the performance, or, from its end, to what happened. */
  const goFurther = () => {
    // Kept in its place while it would save nothing, the word does nothing then.
    if (!script || !live.current || !worthIt) return;
    const target = furtherOn(script, Math.floor(live.current.sample), still);
    if (target === 'end') {
      tellNow();
      return;
    }
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
    // back over it (orbit-score.module.css): nothing is drawn again until the visitor goes on.
    if (beyond && phase !== 'running') return;
    const canvases = [trails.current, continued.current, marks.current, events.current];
    // A plate waits for the window's places on it; the plane for its own.
    const ready = plateStill ? !!placed : !!plane;
    if (!result || !ready || canvases.some((canvas) => !canvas)) return;
    const [trailCanvas, continuedCanvas, markCanvas, eventCanvas] = canvases as HTMLCanvasElement[];
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    for (const canvas of canvases as HTMLCanvasElement[]) {
      const box = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(box.width * ratio));
      canvas.height = Math.max(1, Math.round(box.height * ratio));
    }
    const trail = trailCanvas.getContext('2d');
    const beyondTrail = continuedCanvas.getContext('2d');
    const mark = markCanvas.getContext('2d');
    const score = eventCanvas.getContext('2d');
    if (!trail || !beyondTrail || !mark || !score) return;
    const { count } = result.samples;
    const width = trailCanvas.width;
    const height = trailCanvas.height;
    const picture =
      placed && material && plate
        ? platePicture(placed, plate.frame, material, width, height, ratio)
        : planePicture(plane!, count, width, height, ratio);
    /** On the plate the bodies stand where the work left them once the window is drawn. */
    const rests = picture.kind === 'plate';
    const hues = orbit.bodyHues;
    const painter = orbitPainter({
      trail,
      mark,
      picture,
      width,
      height,
      ratio,
      hues,
      masses: result.masses,
      closestApproach: result.closestApproach,
      steps,
      stride: STRIDE,
    });

    trail.clearRect(0, 0, width, height);
    beyondTrail.clearRect(0, 0, width, height);
    scene.current = null;
    if (beyond && script && path) {
      // Past the frame the score is not shown, and is not built.
      return performBeyond({
        path,
        script,
        key: String(beyond.run),
        picture,
        film,
        still,
        inView,
        beyondTrail,
        mark,
        width,
        height,
        ratio,
        hues,
        painter,
        live,
        frame,
        speak: (sample) => {
          setWorthIt(worthGoingOn(script, sample, still));
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
          setPhase('resting');
        },
      });
    }
    // The score: log separations of the three pairs, the closest approach, the syzygies and
    // the braid crossings as ticks, and the playhead.
    const scoreWidth = eventCanvas.width;
    const scoreHeight = eventCanvas.height;
    const at = (step: number) => (step / (steps - 1)) * scoreWidth;
    const lane = scoreHeight - 12 * ratio;
    const scoreStill = document.createElement('canvas');
    scoreStill.width = scoreWidth;
    scoreStill.height = scoreHeight;
    const base = scoreStill.getContext('2d');
    if (!base) return;
    drawScore(
      base,
      {
        separations: result.samples.separations,
        count,
        stride: STRIDE,
        closestApproach: result.closestApproach,
        syzygies: result.syzygies,
        crossings: result.braid.events.map((crossing) => crossing.step),
      },
      hues,
      {
        ratio,
        x: at,
        lane: { top: 2 * ratio, height: lane - 4 * ratio },
        base: scoreHeight,
        ticks: { crossing: 3, syzygy: 7, closest: 11 },
        lineAlpha: 0.55,
        ink: 'rgb(241 235 223)',
        every: 2,
      },
    );
    /** The score with its playhead, or dimmed without one while the orbit runs past it. */
    const scoreAt = (step: number | null) => {
      score.clearRect(0, 0, scoreWidth, scoreHeight);
      score.globalAlpha = step === null ? 0.35 : 1;
      score.drawImage(scoreStill, 0, 0);
      score.globalAlpha = 1;
      if (step === null) return;
      score.fillStyle = 'rgb(241 235 223 / 0.92)';
      score.fillRect(Math.round(at(step)), 0, ratio, lane);
    };

    if (twin?.phase === 'ready' && derivedFate && plate && picture.kind === 'plate') {
      const found = twin.run;
      const speed = twinPace(found, steps, pace);
      // The gap's growth on a log scale, from a trillionth up: steady doubling is a straight line.
      const span = Math.max(found.until, steps);
      const highest = found.gaps.reduce((most, gap) => Math.max(most, gap), 1e-12);
      const top = Math.max(0, Math.ceil(Math.log10(highest)));
      const bottom = -12;
      const gx = (step: number) => (step / span) * scoreWidth;
      const gy = (gap: number) =>
        lane -
        2 * ratio -
        ((Math.log10(Math.max(gap, 1e-13)) - bottom) / (top - bottom)) * (lane - 4 * ratio);
      const growth = (taken: number) => {
        score.clearRect(0, 0, scoreWidth, scoreHeight);
        // Where the frame ends: the recorded window lies to its left.
        score.fillStyle = 'rgb(241 235 223 / 0.35)';
        score.fillRect(Math.round(gx(steps)), 0, ratio, lane);
        score.strokeStyle = TWIN_TONE.light(0.95);
        score.lineWidth = 1.5 * ratio;
        score.beginPath();
        for (let i = 0; i < found.gaps.length && i * found.every <= taken; i++) {
          if (i === 0) score.moveTo(gx(0), gy(found.gaps[0]));
          else score.lineTo(gx(i * found.every), gy(found.gaps[i]));
        }
        score.stroke();
        if (found.parted !== null && taken >= found.parted) {
          score.fillStyle = TWIN_TONE.light(1);
          score.beginPath();
          score.arc(gx(found.parted), gy(gapAt(found, found.parted)), 3 * ratio, 0, Math.PI * 2);
          score.fill();
        }
      };
      return performTwin({
        run: found,
        fate: derivedFate,
        key: String(twin.repeat),
        picture,
        plate,
        result,
        dt: orbit.generation.dt,
        steps,
        pace: speed,
        stride: STRIDE * Math.max(1, Math.round(speed / pace)),
        still,
        inView,
        beyondTrail,
        mark,
        width,
        height,
        ratio,
        hues,
        painter,
        growth,
        live: twinLive,
        frame,
        speak: (taken) => setTwinTaken(taken),
        onRested: () => setTwinRested(true),
      });
    }
    // Asked for After the frame, the window waits whole for its path rather than starting over.
    // Where motion is unwelcome it is drawn whole, until the visitor takes the clock.
    if (asked || following || (still && !chosen)) transport.current = restingAt(film, film);
    setClockState({ kind: transport.current.kind, seconds: transport.current.seconds });
    drawn.current = 0;
    const filmFrames = lightFilmFrames(steps);

    /**
     * The window drawn to the moment the clock stands at. Forward, the strokes are added; back,
     * the drawing is laid again. A window drawn to its end on the plate goes on to the still's
     * step, and its bodies stand where the work left them; in the plane they leave the drawing,
     * as Phase A had it.
     */
    const paint = (seconds: number) => {
      const step = stepsDrawnAt(seconds, steps);
      const sample = Math.min(count - 1, Math.floor(step / STRIDE));
      if (sample < drawn.current) {
        trail.clearRect(0, 0, width, height);
        drawn.current = 0;
      }
      const complete = sample >= count - 1;
      if (complete && drawn.current === 0) {
        if (picture.last > 0) painter.strokes(0, picture.last);
        painter.bodies(picture.last, rests);
        drawn.current = picture.last;
        scoreAt(Math.min(steps - 1, picture.last * STRIDE));
      } else {
        if (sample > drawn.current) {
          painter.strokes(drawn.current, sample);
          drawn.current = sample;
        }
        if (complete && rests) {
          if (drawn.current < picture.last) {
            painter.strokes(count - 1, picture.last);
            drawn.current = picture.last;
          }
          painter.bodies(picture.last, true);
        } else painter.bodies(sample, !complete);
        scoreAt(step);
      }
      if (slider.current)
        slider.current.value = String(
          Math.min(filmFrames - 1, Math.floor(seconds * LIGHT_FILM.fps + 1e-9)),
        );
      sculpture.current?.at(step);
    };

    /** What is happening now, a few times a second: the step and the clock, or the approach. */
    let spoken = -Infinity;
    const speak = (now = performance.now(), force = true) => {
      if (!force && now - spoken <= 250) return;
      spoken = now;
      const { kind, seconds } = transport.current;
      setClockState({ kind, seconds });
      const step = stepsDrawnAt(seconds, steps);
      const closest = result.closestApproach;
      const nearClosest = step >= closest.step && step - closest.step < 2 * 60 * (steps / 1800);
      setReadout(
        seconds >= film && kind !== 'scrubbing'
          ? null
          : nearClosest
            ? fill(t.orbitClosestNow, {
                distance: oneDecimal.format(closest.distance),
                pair: pairName(closest.pair),
              })
            : fill(t.orbitPlaying, {
                step: number.format(step),
                total: number.format(steps),
                clock: clock(seconds),
              }),
      );
    };

    /** The clock running, while it plays and the section is in view. */
    const runClock = () => {
      cancelAnimationFrame(frame.current);
      if (!inView || transport.current.kind !== 'playing') return;
      let last = performance.now();
      const tick = (now: number) => {
        // The film's own clock: a frame that comes late, or a tab that comes back, finds the
        // drawing where the film would be.
        const elapsed = Math.max(0, (now - last) / 1000);
        last = now;
        transport.current = advance(transport.current, elapsed, film);
        paint(transport.current.seconds);
        const ended = transport.current.kind !== 'playing';
        speak(now, ended);
        if (ended) {
          setDone(true);
          return;
        }
        frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
    };

    scene.current = { paint, run: runClock, speak: () => speak() };
    paint(transport.current.seconds);
    // The line says where the clock stands from the first drawing, a clock the hand set before it too.
    speak();
    runClock();
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
      asked,
      twin,
    ],
  );

  useEffect(() => {
    const node = stage.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    let first = true;
    const observer = new ResizeObserver(() => {
      if (first) {
        first = false;
        return;
      }
      draw();
    });
    observer.observe(node);
    return () => observer.disconnect();
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
    live.current = null;
    transport.current = restingAt(film, film);
    setClockState({ kind: 'resting', seconds: film });
    setBeyond(null);
    setPhase('running');
    setReadout(null);
    setDone(true);
  };

  const published = orbit.published;
  const closest = published.closestApproach;
  // The caption says where the bodies are drawn, and, on the plate, that this is analysis.
  const caption = plateStill
    ? material === 'ink'
      ? t.orbitCaptionInk
      : t.orbitCaptionLight
    : t.orbitCaption;
  const description = fill(caption, {
    m1: oneDecimal.format(published.masses[0]),
    m2: oneDecimal.format(published.masses[1]),
    m3: oneDecimal.format(published.masses[2]),
    distance: oneDecimal.format(closest.distance),
    pair: pairName(closest.pair),
    step: number.format(closest.step),
    seconds: oneDecimal.format(lightFilmSeconds(closest.step, steps)),
  });

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
  const playingLine = (step: number, seconds: number) =>
    fill(t.orbitPlaying, {
      step: number.format(step),
      total: number.format(steps),
      clock: clock(seconds),
    });
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
            ? playingLine(steps, film)
            : playingLine(0, 0);
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
  /** What stands between two sentences on one line: a space, or nothing in Japanese and Chinese. */
  const betweenSentences = fill(t.sentences, { first: '', second: '' });
  // What happened: each sentence a box of its own, so a line breaks between two before it
  // breaks inside one.
  const factLine: ReactNode = fact?.map((sentence, index) => (
    <Fragment key={sentence}>
      {index ? betweenSentences : null}
      <span className={styles.sentence}>{sentence}</span>
    </Fragment>
  ));
  const line: ReactNode = twin
    ? twinLine
    : beyond
      ? phase === 'told'
        ? factLine
        : readout
      : ((still && !chosen ? null : readout) ?? progressLine);
  const derived = state.phase === 'derived';
  // The word follows the clock as the visitor finds it (found(), above): never Pause where nothing plays.
  const playing = clockState.kind === 'playing' && !(still && !chosen);
  const atEnd = clockState.seconds >= film;
  /** The clock's word: Pause while it plays; at the end, Again for whoever has watched it. */
  const clockWord = playing ? t.pause : atEnd && (chosen || !still) ? t.again : t.play;
  const clockStep = stepsDrawnAt(clockState.seconds, steps);

  /*
    The words beside the line, as one list with a key to each. A word that stays from one state to
    the next (After the frame and One part in a trillion in all three; Again and Tell me in each
    other's place) stays the same element, in the same order, so a hand or a keyboard that
    pressed it still stands on it afterwards. Nothing is offered in the rest after a performance.
  */
  const words: ReactNode[] = [];
  if (derived && beyond) {
    if (phase === 'running') {
      // Further on keeps its place for the whole performance, and is dimmed while it would save
      // nothing: a word that came and went with the clock moved the others from under the hand.
      words.push(
        <Word key="onward" label={t.beyondOnward} onClick={goFurther} disabled={!worthIt} />,
        <Word key="main" label={t.beyondTell} onClick={tellNow} />,
      );
    } else if (phase === 'told') {
      // Nothing was performed where the path held nothing: there is nothing to perform again.
      if (!nothingPerformed) words.push(<Word key="main" label={t.again} onClick={goBeyond} />);
      words.push(
        <a key="record" className={styles.again} href="#proof">
          {t.beyondRecord}
        </a>,
      );
    }
    if (phase !== 'resting') {
      words.push(<Word key="after" label={t.afterTheFrame} onClick={leaveBeyond} pressed />);
      if (placed)
        words.push(<Word key="twin" label={t.oneInATrillion} onClick={goTwin} pressed={false} />);
    }
  } else if (derived && twin) {
    if (twinRested && !still) words.push(<Word key="again" label={t.again} onClick={goTwin} />);
    if (canGoBeyond)
      words.push(<Word key="after" label={t.afterTheFrame} onClick={goBeyond} pressed={false} />);
    words.push(<Word key="twin" label={t.oneInATrillion} onClick={leaveTwin} pressed />);
  } else if (derived) {
    if (turned)
      words.push(
        <Word key="view" label={t.orbitGeneratorView} onClick={() => sculpture.current?.back()} />,
      );
    words.push(
      <Word key="clock" label={clockWord} onClick={playPause} />,
      <Word key="closest" label={t.toClosestApproach} onClick={toClosestApproach} />,
    );
    if (canGoBeyond && finished)
      words.push(<Word key="after" label={t.afterTheFrame} onClick={goBeyond} pressed={false} />);
    if (derivedFate && finished && placed)
      words.push(<Word key="twin" label={t.oneInATrillion} onClick={goTwin} pressed={false} />);
  }

  return (
    <>
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
                ? t.afterTheFrameNote
                : t.orbitLine}
          </p>
        </header>
        <figure className={styles.figure}>
          <div
            ref={stage}
            className={styles.stage}
            data-drawing={plateStill ? 'plate' : 'plane'}
            data-material={plateStill ? (material ?? undefined) : undefined}
            style={
              plateStill && plate
                ? ({
                    '--plate-aspect': `${plate.frame.width} / ${plate.frame.height}`,
                    '--plate-ratio': plate.frame.width / plate.frame.height,
                    '--plate-ground': plateStill.tone,
                  } as CSSProperties)
                : undefined
            }
          >
            {/* The work's still, untouched: the drawing lies over it and never alters a pixel. It is
              fetched once the section is a screen away, as its derivation begins, rather than at
              each browser's own lazy margin, which Firefox keeps close to the viewport. */}
            {plateStill ? (
              <img
                key={material}
                className={styles.still}
                src={plateStill.src}
                srcSet={plateStill.srcSet}
                sizes={plateStill.srcSet ? STILL_SIZES : undefined}
                width={plateStill.width}
                height={plateStill.height}
                alt=""
                decoding="async"
                loading={near ? 'eager' : 'lazy'}
              />
            ) : null}
            {/* The orbit in depth: shown only as the hand turns it, beneath the drawing it replaces. */}
            {plateStill && space && material && !beyond && !twin ? (
              <OrbitSculpture
                key={`depth-${material}`}
                handle={sculpture}
                stage={stage}
                space={space}
                material={material}
                tone={plateStill.tone}
                colours={plateStill.colours}
                hues={orbit.bodyHues}
                closestStep={orbit.published.closestApproach.step}
                still={still}
                label={t.orbitStageLabel}
                onReady={setTurnable}
                onTurned={setTurned}
                onPlayPause={playPause}
              />
            ) : null}
            <canvas ref={trails} className={styles.layer} data-layer="trails" aria-hidden="true" />
            <canvas
              ref={continued}
              className={styles.layer}
              data-layer="continued"
              aria-hidden="true"
            />
            <canvas ref={marks} className={styles.layer} data-layer="marks" aria-hidden="true" />
          </div>
          {/* Past the frame the caption is the label alone, for as long as the derived picture
            stands: the still that returns is the work, and needs none. Its line is kept. */}
          <figcaption className={styles.caption}>
            {beyond ? (
              <span
                className={styles.label}
                data-shown={phase === 'running'}
                aria-hidden={phase !== 'running'}
              >
                {t.analysisNotWork}
              </span>
            ) : (
              description
            )}
            {turnable && !beyond && !twin ? (
              <span className={styles.hint}>
                <span className={styles.hintPointer}>{t.orbitTurnHint}</span>
                <span className={styles.hintTouch}>{t.orbitTurnHintTouch}</span>
              </span>
            ) : null}
          </figcaption>
        </figure>
        <div ref={beneath} className={styles.score}>
          <div className={styles.strip}>
            <canvas ref={events} className={styles.events} aria-hidden="true" />
            {derived && !beyond && !twin ? (
              <OrbitSlider
                slider={slider}
                frames={lightFilmFrames(steps)}
                label={t.orbitTimeLabel}
                valueText={playingLine(clockStep, clockState.seconds)}
                disabled={asked}
                onScrub={onScrub}
              />
            ) : null}
          </div>
          <div className={styles.readoutRow}>
            {/* Past the frame the line is said aloud once the performance is over: what happened,
              to a visitor who cannot see the picture empty. While it runs it changes four times
              a second, and is not. */}
            <p
              ref={telling}
              className={styles.readout}
              tabIndex={-1}
              aria-live={beyond && phase !== 'running' ? 'polite' : undefined}
            >
              {line}
            </p>
            <div ref={wordsRow} className={styles.words}>
              {words}
            </div>
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
    </>
  );
}
