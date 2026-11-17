'use client';
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { containedIn, lensFor, type Size } from '@/lib/first-light/camera';
import {
  DEPTH_BEATS,
  OPEN_MS,
  OPEN_TURN,
  STEP_MS,
  depthDuration,
  depthMoment,
  driftedBounds,
  fillFor,
  holdOnStage,
  shotInDepth,
  travelAt,
} from '@/lib/first-light/depth';
import {
  FLAT_HAND,
  PITCH_STEP,
  UNTURNED,
  YAW_STEP,
  isMoving,
  isTurned,
  nextHand,
  openingOf,
  turnOf,
  type Gesture,
  type Hand,
  type Turn,
} from '@/lib/first-light/hand';
import { Pace } from '@/lib/first-light/quality';
import { headAt, type PlateSpace } from '@/lib/first-light/samples';
import type { ShowWork } from '@/lib/first-light/show-work';
import { flareAt } from '@/lib/first-light/timeline';
import { lightFilmDuration, stepsDrawnAt } from '@/lib/physics/light-film';
import { stillSourceSet, type ArtInterpretation } from '@/lib/art/types';
import { AWAITS_STREAM } from '@/lib/without-script';
import type { Engine } from './first-light-engine';
import { useMotion } from './motion-provider';
import type { OrbitDepthWords } from './orbit-depth.words';
import styles from './orbit-depth.module.css';

/*
  The orbit in depth: the home's first exhibit (docs/process-essay.md §8).

  The Light still is on the stage from the first byte. When the exhibit comes into view the
  picture opens into the depth the generator set aside: the camera leaves the picture's view
  for one a quarter turn short of side on, the light runs back along its paths into the three
  bodies, and the recorded window plays again at the pace of its Light film while the camera
  travels slowly round. From the first hold the orbit is the visitor's: a drag turns it, the
  arrow keys and four buttons step it round and tip it, and it rests where it is left, never
  part-open: within twenty degrees of the picture's view it goes on into depth or back to the
  picture. One word returns it to the picture's view, where the drawing lands on the still and
  gives way to it. The figure is held whole on the stage at every turn (depth.ts).

  Where motion is unwelcome nothing opens or plays unasked: the still stands, the buttons step
  the view in one move each, and Play is an explicit word. Where the browser cannot draw it the
  still stands with a sentence that says so. It is an analysis and says so; the work is the
  still beneath it, untouched.
*/

/** Arrow keys: steps of yaw and pitch, as the hand turns it (drawn right, the near side follows). */
const KEY_TURNS: Record<string, readonly [number, number]> = {
  ArrowLeft: [1, 0],
  ArrowRight: [-1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** How much of the stage must be in view before the exhibit opens by itself. */
const IN_VIEW = 0.5;
/**
 * The trails' width here, as a multiple of the engine's own: First Light's lines are tuned to
 * land on a still; these stand alone in depth for as long as a visitor turns them.
 */
const LINE = 1.5;

/**
 * Where the exhibit stands:
 * - resting: the still alone; nothing is asked of the browser until the stage is near;
 * - preparing: the window is sampled off the main thread and the engine readied;
 * - ready: the orbit answers the hand;
 * - unavailable: this browser cannot draw it, and the still stands in.
 */
type Phase = 'resting' | 'preparing' | 'ready' | 'unavailable';
/** The performance: not yet begun, playing, held by the visitor, or played through. */
type Playing = 'idle' | 'playing' | 'held' | 'ended';

const densityOfScreen = () => Math.min(2, window.devicePixelRatio || 1);

export function OrbitDepth({
  work,
  still,
  label,
  name,
  about,
  t,
}: {
  /** The work as First Light performs it; nothing where no frame binds, and the still stands in. */
  work: ShowWork | null;
  /** The Light still the exhibit opens from and returns to. */
  still?: ArtInterpretation;
  /** "№ 023". */
  label: string;
  /** What a screen reader hears of the orbit, with the keys that turn it. */
  name: string;
  /** The id of what the page says of the drawing: that it is an analysis, and of what. */
  about: string;
  t: OrbitDepthWords;
}) {
  const { paused, reducedMotion, theatre, toggle } = useMotion();
  /** Nothing moves unasked: the visitor's pause, or a hushed theatre. */
  const quiet = paused || theatre === 'hushed';
  /** The camera steps, never glides, where motion is unwelcome. */
  const instant = quiet || reducedMotion;

  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);
  const space = useRef<PlateSpace | null>(null);
  /** The figure with its drift: what the camera turns about, and how far it reaches. */
  const reach = useRef<ReturnType<typeof driftedBounds> | null>(null);
  /** How near the figure may stand at each tilt on the stage as it was last measured. */
  const held = useRef<{ width: number; height: number; at: (pitch: number) => number } | null>(
    null,
  );
  /** The share of the window at its closest approach, where the bodies flare. */
  const peak = useRef(0);
  const hand = useRef<Hand>(FLAT_HAND);
  const pointer = useRef<number | null>(null);
  /** The visitor has turned it: the camera travels by itself no longer. */
  const taken = useRef(false);
  /** The exhibit has opened once, by itself or by the visitor. */
  const opened = useRef(false);
  const inView = useRef(false);
  const steps = work?.start.steps ?? 2;
  const seconds = lightFilmDuration(steps);
  const whole = depthDuration(seconds);
  /** The performance's clock: where it stands, whether it runs, and the frame it last moved at. */
  const clock = useRef({ ms: whole, running: false, last: 0 });
  /** The drawing buffer as it was last sized, and the pace the frames have kept. */
  const drawn = useRef({ screen: 0, ratio: 0, width: 0, height: 0, pace: new Pace(), last: 0 });
  const frame = useRef(0);
  const view = useRef(false);

  const [phase, setPhase] = useState<Phase>('resting');
  const [near, setNear] = useState(false);
  const [turned, setTurned] = useState(false);
  const [playing, setPlaying] = useState<Playing>('idle');

  // The frame loop, set up afresh whenever what it draws with changes. Each frame reads the
  // hand's turn and the performance's moment, and draws the light for both if any of it shows.
  // It asks for the next frame only while the performance runs or the hand still moves.
  const driver = useRef<{
    request(): void;
    take(now: number): void;
    carry(now: number): void;
  } | null>(null);
  useEffect(() => {
    const request = () => {
      if (!frame.current) frame.current = requestAnimationFrame(paint);
    };
    // What the camera has travelled by itself becomes part of the turn, so nothing jumps when
    // the travel ends (a hand takes it) or begins again (the window is played again).
    const carry = (now: number) => {
      const had = hand.current;
      if (taken.current || reducedMotion || !isTurned(had)) return;
      if (had.kind === 'led' || had.kind === 'pressing' || had.kind === 'springing') return;
      const moment = depthMoment(clock.current.ms, steps, seconds, (into) =>
        stepsDrawnAt(into, steps),
      );
      const turn = turnOf(had, now);
      const travel = travelAt(moment.played) * openingOf(turn);
      if (!travel) return;
      const carried = { yaw: turn.yaw + travel, pitch: turn.pitch };
      hand.current =
        had.kind === 'held'
          ? { ...had, turn: carried, from: { yaw: had.from.yaw + travel, pitch: had.from.pitch } }
          : { kind: 'turned', turn: carried };
    };
    // The visitor's own hand, a key or a button: the camera is theirs from here on, and the
    // exhibit opens by itself no more.
    const take = (now: number) => {
      if (taken.current) return;
      carry(now);
      taken.current = true;
      opened.current = true;
    };
    const paint = (now: number) => {
      frame.current = 0;
      const made = engine.current;
      const node = canvas.current;
      const sampled = space.current;
      const box = stage.current;
      const bounds = reach.current;
      if (!made || !node || !sampled || !box || !bounds) return;
      if (made.lost) {
        // The context is gone: the still stands, and says why nothing turns.
        node.style.opacity = '0';
        setPhase('unavailable');
        return;
      }
      const waiting = hand.current.kind === 'pressing';
      hand.current = nextHand(hand.current, { kind: 'tick', at: now }, instant, true);
      // A finger that has held long enough takes the orbit, and the page stops scrolling under
      // it. Until then it has taken nothing: a swipe that begins on the stage is the page's.
      if (hand.current.kind === 'held') {
        if (waiting) take(now);
        if (pointer.current !== null && !node.hasPointerCapture?.(pointer.current))
          node.setPointerCapture?.(pointer.current);
      }

      const time = clock.current;
      if (time.running) {
        // A frame held up (a tab coming back) is not played through in one stride.
        time.ms = Math.min(whole, time.ms + Math.min(100, Math.max(0, now - time.last)));
        if (time.ms >= whole) {
          time.running = false;
          setPlaying('ended');
        }
      }
      time.last = now;
      const moment = depthMoment(time.ms, steps, seconds, (into) => stepsDrawnAt(into, steps));

      const turn = turnOf(hand.current, now);
      const inDepth = isTurned(hand.current);
      // At the picture's view the still alone stands, so a window still playing waits there.
      if (!inDepth && time.running) {
        time.running = false;
        setPlaying('held');
      }
      node.dataset.view = inDepth ? 'depth' : 'picture';
      if (inDepth !== view.current) {
        view.current = inDepth;
        setTurned(inDepth);
      }
      const cover = openingOf(turn);
      node.style.opacity = String(cover);
      if (cover > 0) {
        const size: Size = { width: box.clientWidth, height: box.clientHeight };
        const buffer = drawn.current;
        const screen = densityOfScreen();
        // A window carried to another screen is drawn at that screen's density, finer or coarser.
        if (buffer.screen !== screen)
          Object.assign(buffer, { screen, ratio: screen, pace: new Pace() });
        // Where the frames come slowly the density gives way, never the motion (quality.ts).
        const ratio =
          time.running && buffer.last
            ? buffer.pace.next(now - buffer.last, buffer.ratio)
            : buffer.ratio;
        buffer.last = now;
        if (
          buffer.width !== size.width ||
          buffer.height !== size.height ||
          buffer.ratio !== ratio
        ) {
          made.resize(size.width, size.height, ratio);
          Object.assign(buffer, { ratio, width: size.width, height: size.height });
        }
        const plate = { width: sampled.width, height: sampled.height };
        const lies = containedIn({ x: 0, y: 0, ...size }, plate);
        // Until a hand takes it the camera travels as the window plays: depth is read in parallax.
        const travel = taken.current || reducedMotion ? 0 : travelAt(moment.played) * cover;
        // Turned, the figure reaches where the flat picture did not: it is measured once for
        // this stage, and stands as near as leaves it whole whichever way it is turned.
        if (held.current?.width !== size.width || held.current.height !== size.height)
          held.current = {
            ...size,
            at: holdOnStage(sampled, bounds, size, lies, fillFor(size.height, lies.height)),
          };
        const shot = shotInDepth(
          { yaw: turn.yaw + travel, pitch: turn.pitch },
          held.current.at(turn.pitch),
        );
        const head = headAt(sampled, moment.step) / Math.max(1, sampled.count - 1);
        made.draw({
          lens: lensFor(shot, size, plate, bounds.radius, 0.35, bounds.centre, lies),
          drift: shot.drift,
          drawn: head,
          heads: moment.heads,
          flare: moment.beat === 'window' ? flareAt(head, peak.current) : 0,
        });
      } else drawn.current.last = 0;
      if (clock.current.running || isMoving(hand.current)) request();
    };
    driver.current = { request, take, carry };
    request();
    return () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      driver.current = null;
    };
  }, [instant, reducedMotion, steps, seconds, whole]);
  const request = () => driver.current?.request();
  const take = (now: number) => driver.current?.take(now);

  /** The clock runs from now, wherever it stands. */
  function run() {
    clock.current.running = true;
    clock.current.last = performance.now();
    request();
  }

  /** Opens the picture into depth; `perform` runs the window again from its first step. */
  function open(perform: boolean) {
    opened.current = true;
    hand.current = nextHand(
      hand.current,
      { kind: 'lead', to: OPEN_TURN, ms: OPEN_MS, at: performance.now() },
      instant,
      true,
    );
    if (perform) {
      clock.current.ms = 0;
      setPlaying('playing');
      run();
    }
    request();
  }

  /** The exhibit comes into view: it opens once by itself, where motion is welcome. */
  const arrive = useEffectEvent(() => {
    inView.current = true;
    if (phase !== 'ready') return;
    if (!opened.current && !instant) open(true);
    else if (playing === 'playing' && !quiet) run();
    else request();
  });
  /** Out of view nothing is drawn, and the performance waits where it stood. */
  const leave = useEffectEvent(() => {
    inView.current = false;
    clock.current.running = false;
  });

  // Nothing is asked of the browser until the stage is near: then the window, the still's
  // colours and the engine, once. It opens only once half of it stands in view.
  useEffect(() => {
    const box = stage.current;
    if (!box || typeof IntersectionObserver === 'undefined') return;
    const nearby = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: '75% 0px' },
    );
    const seen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.intersectionRatio >= IN_VIEW) arrive();
          else leave();
        }
      },
      { threshold: [0, IN_VIEW] },
    );
    nearby.observe(box);
    seen.observe(box);
    return () => {
      nearby.disconnect();
      seen.disconnect();
    };
  }, []);

  useEffect(() => {
    const node = canvas.current;
    if (!near || !work || !node) return;
    let cancelled = false;
    let made: Engine | null = null;
    const begin = async () => {
      setPhase('preparing');
      const [{ createEngine }, { setTheStage }] = await Promise.all([
        import('./first-light-engines'),
        import('./first-light-show'),
      ]);
      if (cancelled) return;
      made = await createEngine(node);
      if (cancelled) {
        made?.dispose();
        return;
      }
      if (!made) {
        setPhase('unavailable');
        return;
      }
      const sampled = await setTheStage(made, work);
      if (cancelled) {
        made.dispose();
        return;
      }
      made.look = { ...made.look, width: made.look.width * LINE };
      engine.current = made;
      space.current = sampled;
      reach.current = driftedBounds(sampled);
      peak.current = headAt(sampled, work.closestStep) / Math.max(1, sampled.count - 1);
      setPhase('ready');
    };
    begin().catch((failure) => {
      console.warn('The orbit cannot be drawn in depth here:', failure);
      if (!cancelled) setPhase('unavailable');
    });
    return () => {
      cancelled = true;
      made?.dispose();
      engine.current = null;
      space.current = null;
      reach.current = null;
      held.current = null;
    };
  }, [near, work]);

  // Ready while already in view: it opens at once. The visitor's pause, or a hush, holds the
  // performance where it stands; lifted, it goes on from there.
  const settle = useEffectEvent(() => {
    if (phase !== 'ready') return;
    if (quiet) clock.current.running = false;
    else if (inView.current && !opened.current && !instant) open(true);
    else if (inView.current && playing === 'playing') run();
    request();
  });
  useEffect(() => settle(), [phase, quiet, instant]);

  // A drawing context lost while the orbit rests is seen at once, not at the next gesture.
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const lost = () => driver.current?.request();
    node.addEventListener('webglcontextlost', lost);
    return () => node.removeEventListener('webglcontextlost', lost);
  }, []);

  // The stage changes size, or the screen its density: the same moment, drawn again.
  useEffect(() => {
    const box = stage.current;
    if (!box || phase !== 'ready' || typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(() => driver.current?.request());
    watch.observe(box);
    return () => watch.disconnect();
  }, [phase]);

  function act(gesture: Gesture) {
    if (phase !== 'ready') return;
    take(gesture.at);
    hand.current = nextHand(hand.current, gesture, instant, true);
    request();
  }

  /** A button's step round, led and not jumped. From the picture's view it opens to that side. */
  function step(direction: 1 | -1, scale = 2) {
    const now = performance.now();
    take(now);
    const from = isTurned(hand.current) ? turnOf(hand.current, now) : null;
    const to: Turn = from
      ? { yaw: from.yaw + direction * scale * YAW_STEP, pitch: from.pitch }
      : { yaw: OPEN_TURN.yaw * direction, pitch: OPEN_TURN.pitch };
    act({ kind: 'lead', to, ms: from ? STEP_MS : OPEN_MS, at: now });
  }
  /** A button's tip up or down: the one way to tilt it that asks for no drag and no key. */
  function tip(direction: 1 | -1) {
    const now = performance.now();
    take(now);
    const from = isTurned(hand.current) ? turnOf(hand.current, now) : UNTURNED;
    act({
      kind: 'lead',
      to: { yaw: from.yaw, pitch: from.pitch + direction * 2 * PITCH_STEP },
      ms: STEP_MS,
      at: now,
    });
  }

  function hold() {
    clock.current.running = false;
    setPlaying('held');
  }
  function play(again: boolean) {
    // An explicit word resumes ambient motion, as a plate's does.
    if (paused) toggle();
    // It plays in depth: from the picture's view, or on its way back there, it opens first.
    if (!isTurned(hand.current) || hand.current.kind === 'springing') open(false);
    if (again || clock.current.ms >= whole) {
      // The camera goes on from where it has come to: played again, it does not cut back.
      driver.current?.carry(performance.now());
      clock.current.ms = DEPTH_BEATS.hold;
    }
    setPlaying('playing');
    run();
  }
  function pictureView() {
    act({ kind: 'back', at: performance.now() });
    // At the picture's view the still alone stands: the performance waits beneath it.
    if (playing === 'playing') hold();
  }

  // Once a finger holds the orbit, the page beneath it must not scroll: touch-action cannot
  // change mid-gesture, so its moves are held back here. A finger that lands while the page is
  // still coasting stops the page, and that touch is the page's (orbit-sculpture.tsx).
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const begin = (event: TouchEvent) => {
      if (event.cancelable || hand.current.kind !== 'pressing') return;
      hand.current = hand.current.under;
      pointer.current = null;
    };
    const keep = (event: TouchEvent) => {
      if (hand.current.kind === 'held' && event.cancelable) event.preventDefault();
    };
    node.addEventListener('touchstart', begin, { passive: true });
    node.addEventListener('touchmove', keep, { passive: false });
    return () => {
      node.removeEventListener('touchstart', begin);
      node.removeEventListener('touchmove', keep);
    };
  }, []);

  const ready = phase === 'ready';
  // Under the visitor's own Pause the performance is held, and says so: its word is Play,
  // and Play lifts the pause, as a plate's does.
  const showing: Playing = playing === 'playing' && paused ? 'held' : playing;
  const grab = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!ready || (event.pointerType === 'mouse' && event.button !== 0)) return;
    // One pointer has the orbit at a time: a second finger is the page's (a pinch), and takes
    // nothing from the first.
    if (pointer.current !== null && !event.isPrimary) return;
    const touch = event.pointerType === 'touch';
    pointer.current = event.pointerId;
    const gesture: Gesture = {
      kind: 'grab',
      x: event.clientX,
      y: event.clientY,
      at: performance.now(),
      touch,
    };
    if (touch) {
      // A finger has not taken the orbit until it has held (the frame loop sees the hold): a
      // swipe that begins on the stage scrolls the page, and the exhibit still opens by itself.
      hand.current = nextHand(hand.current, gesture, instant, true);
      request();
      return;
    }
    act(gesture);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (pointer.current !== event.pointerId) return;
    const kind = hand.current.kind;
    if (kind !== 'pressing' && kind !== 'held') return;
    hand.current = nextHand(
      hand.current,
      {
        kind: 'move',
        x: event.clientX,
        y: event.clientY,
        at: performance.now(),
        // The stage's width turns it half way round.
        perPixel: Math.PI / Math.max(1, event.currentTarget.clientWidth),
      },
      instant,
      true,
    );
    // A finger that travelled before the hold is scrolling the page: let it go.
    if (kind === 'pressing' && hand.current.kind !== 'pressing') pointer.current = null;
    request();
  };
  const release = (event: PointerEvent<HTMLCanvasElement>) => {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null;
    hand.current = nextHand(
      hand.current,
      { kind: 'release', at: performance.now() },
      instant,
      true,
    );
    if (event.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    request();
  };
  const key = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (!ready || event.altKey || event.metaKey || event.ctrlKey) return;
    const turn = KEY_TURNS[event.key];
    if (turn) {
      event.preventDefault();
      const scale = event.shiftKey ? 3 : 1;
      const now = performance.now();
      take(now);
      // From the picture's view a first press to either side opens it, as a button's does.
      if (!isTurned(hand.current) && turn[0] !== 0) return step(turn[0] > 0 ? 1 : -1);
      const from = turnOf(hand.current, now);
      act({
        kind: 'lead',
        to: {
          yaw: from.yaw + turn[0] * scale * YAW_STEP,
          pitch: from.pitch + turn[1] * scale * PITCH_STEP,
        },
        ms: STEP_MS / 2,
        at: now,
      });
      return;
    }
    if ((event.key === 'Escape' || event.key === 'Home') && isTurned(hand.current)) {
      event.preventDefault();
      event.stopPropagation();
      pictureView();
      return;
    }
    if (event.key === ' ') {
      event.preventDefault();
      if (showing === 'playing') hold();
      else play(playing === 'ended');
    }
  };

  return (
    <figure
      className={styles.exhibit}
      data-phase={phase}
      data-view={turned ? 'depth' : 'picture'}
      data-playing={showing}
      aria-describedby={about}
    >
      <div ref={stage} className={styles.stage}>
        {still?.still ? (
          <img
            className={styles.still}
            src={still.still}
            srcSet={stillSourceSet(still)}
            sizes="100vw"
            width={still.width}
            height={still.height}
            alt={`${label} · ${t.light}`}
            loading="lazy"
            decoding="async"
          />
        ) : null}
        <canvas
          ref={canvas}
          className={styles.depth}
          data-turns={ready ? 'true' : 'false'}
          data-view="picture"
          tabIndex={ready ? 0 : -1}
          role={ready ? 'img' : undefined}
          aria-label={ready ? name : undefined}
          aria-hidden={ready ? undefined : true}
          onPointerDown={grab}
          onPointerMove={move}
          onPointerUp={release}
          onPointerCancel={release}
          onKeyDown={key}
          onContextMenu={(event) => {
            if (hand.current.kind !== 'flat') event.preventDefault();
          }}
        />
      </div>
      <div className={`strip ${styles.strip}`}>
        <span className={`numeral folio ${styles.folio}`}>{label}</span>
        {phase === 'unavailable' || !work ? (
          // Said aloud too where it comes after the orbit was offered: a context lost.
          <span className={styles.hint} role="status">
            {t.depthUnavailable}
          </span>
        ) : ready ? (
          <span className={styles.hint}>
            <span className={styles.byPointer}>{t.depthHint}</span>
            <span className={styles.byTouch}>{t.depthHintTouch}</span>
          </span>
        ) : (
          // With no script nothing will be computed: the line that says it will is taken away
          // (src/lib/without-script.ts), and the still stands with its number.
          <span className={styles.hint} {...AWAITS_STREAM}>
            {t.depthWaiting}
          </span>
        )}
        <span className={`strip-words ${styles.controls}`}>
          <button
            type="button"
            className={styles.arrow}
            aria-label={t.depthTurnLeft}
            disabled={!ready}
            onClick={() => step(1)}
          >
            <span aria-hidden="true">←</span>
          </button>
          <button
            type="button"
            className={styles.arrow}
            aria-label={t.depthTurnRight}
            disabled={!ready}
            onClick={() => step(-1)}
          >
            <span aria-hidden="true">→</span>
          </button>
          <button
            type="button"
            className={`${styles.arrow} ${styles.up}`}
            aria-label={t.depthTiltUp}
            disabled={!ready}
            onClick={() => tip(-1)}
          >
            <span aria-hidden="true">→</span>
          </button>
          <button
            type="button"
            className={`${styles.arrow} ${styles.down}`}
            aria-label={t.depthTiltDown}
            disabled={!ready}
            onClick={() => tip(1)}
          >
            <span aria-hidden="true">→</span>
          </button>
          {turned ? (
            <button type="button" disabled={!ready} onClick={pictureView}>
              {t.orbitGeneratorView}
            </button>
          ) : (
            <button
              type="button"
              disabled={!ready}
              onClick={() => {
                take(performance.now());
                open(false);
              }}
            >
              {t.depthOpen}
            </button>
          )}
          {showing === 'playing' ? (
            <button type="button" disabled={!ready} onClick={hold}>
              {t.pause}
            </button>
          ) : (
            <button type="button" disabled={!ready} onClick={() => play(playing === 'ended')}>
              {playing === 'ended' ? t.again : t.play}
            </button>
          )}
        </span>
      </div>
    </figure>
  );
}
