'use client';
import {
  Fragment,
  useEffect,
  useEffectEvent,
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
import type { Continuation } from '@/lib/physics/continuation';
import type { DerivedFate } from '@/lib/physics/orbit';
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
import { beyondLine, performBeyond, type Beyond } from './orbit-beyond';
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

type State = { phase: 'waiting' } | Derivation;

/** Whether this browser could draw the orbit in depth: only then is it sampled for it. */
const canTurn = () => typeof WebGL2RenderingContext !== 'undefined';

/** The clock as the words and the slider read it, a few times a second. */
type Clock = { kind: Transport['kind']; seconds: number };

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
 * After the frame (third-physics.md §5.6): the same physics runs on past the recorded window,
 * at the film's pace, with the window dimmed behind it (orbit-beyond.ts).
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
  const trails = useRef<HTMLCanvasElement>(null);
  const continued = useRef<HTMLCanvasElement>(null);
  const marks = useRef<HTMLCanvasElement>(null);
  const events = useRef<HTMLCanvasElement>(null);
  const slider = useRef<HTMLInputElement>(null);
  const sculpture = useRef<Sculpture | null>(null);
  /** The last sample drawn, and the drawing's animation frame. */
  const drawn = useRef(0);
  const frame = useRef(0);
  /** The orbit past the frame as it stands, so a resize or a return carries on from it. */
  const live = useRef<{ key: string; continuation: Continuation } | null>(null);
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
  /** The plate's word asked for After the frame before the fate was known. */
  const [asked, setAsked] = useState(false);
  /** How far past the frame the performance has reached, and whether it has come to rest. */
  const [reached, setReached] = useState(0);
  const [rested, setRested] = useState(false);
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

  const { derivation, framed, fate, space } = useOrbitDerivation({
    orbit,
    near,
    pace,
    frame: plate?.frame,
    depth: canTurn(),
    // The plate's word asked before the fate was known: go on past the frame now it is.
    onFate: () => {
      if (asked) goBeyond('end');
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

  const goBeyond = (from: Beyond['from']) => {
    setTwin(null);
    twinLive.current = null;
    setAsked(false);
    setRested(false);
    setReached(from === 'approach' && derivedFate?.approach ? derivedFate.approach.taken : steps);
    setReadout(null);
    setBeyond((current) => ({ from, run: (current?.run ?? 0) + 1 }));
  };
  // The plate's word: bring the section into view and go on past the frame as soon as the fate
  // is known. Asking derives the orbit if the visitor has not come near it yet.
  const onAsk = useEffectEvent(() => {
    bringNear();
    section.current?.scrollIntoView({
      block: 'start',
      behavior: reducedMotion ? 'instant' : 'smooth',
    });
    // The word was a link to here: the keyboard and the screen reader come here too.
    section.current?.focus({ preventScroll: true });
    if (beyond) return;
    if (derivation.phase === 'derived' && fate.phase === 'derived') goBeyond('end');
    else setAsked(true);
  });
  useEffect(() => {
    const ask = () => onAsk();
    window.addEventListener(AFTER_THE_FRAME_EVENT, ask);
    return () => window.removeEventListener(AFTER_THE_FRAME_EVENT, ask);
  }, []);

  /** One part in a trillion: After the frame gives way, and the twin is followed if it is new. */
  const goTwin = () => {
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

  /** Past the frame, the line says how far the orbit has run, and the words follow it. */
  const speakBeyond = (of: DerivedFate) => (at: Continuation) => {
    setReached(at.taken);
    setRested(at.resting);
    setReadout(beyondLine(of, at, steps, pace, t, number));
  };

  // The drawing: trails accumulate, the bodies ride on a layer above, and the score beneath
  // carries the three separations with the published events. On the plate the drawing lies over
  // the still, in its material: light added on night, graphite and sumi on paper. At the film's
  // pace when motion is welcome and the section is in view; all at once otherwise.
  const draw = useEffectEvent((): (() => void) | void => {
    cancelAnimationFrame(frame.current);
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

    trail.clearRect(0, 0, width, height);
    beyondTrail.clearRect(0, 0, width, height);
    scene.current = null;
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
    if (beyond && derivedFate)
      return performBeyond({
        fate: derivedFate,
        from: beyond.from,
        key: `${beyond.run}:${beyond.from}`,
        picture,
        plate,
        plane,
        result,
        dt: orbit.generation.dt,
        steps,
        pace,
        still,
        inView,
        beyondTrail,
        mark,
        width,
        height,
        ratio,
        hues,
        painter,
        scoreAt,
        live,
        frame,
        speak: speakBeyond(derivedFate),
        onRested: () => setRested(true),
      });
    // Asked for After the frame, the window waits whole for the fate rather than starting over.
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
    [result, plane, framed, material, still, inView, beyond, derivedFate, asked, twin],
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

  /** Again: After the frame from where it began. */
  const again = () => {
    setReadout(null);
    if (beyond) goBeyond(beyond.from);
  };
  /** Back to the frame: the recorded window, drawn whole. */
  const leaveBeyond = () => {
    live.current = null;
    transport.current = restingAt(film, film);
    setClockState({ kind: 'resting', seconds: film });
    setBeyond(null);
    setRested(false);
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
  const line: ReactNode = twin
    ? twinLine
    : beyond
      ? readout
      : ((still && !chosen ? null : readout) ?? progressLine);
  const approach = derivedFate?.approach;
  const canApproach =
    beyond?.from === 'end' && !still && !rested && !!approach && reached < approach.taken;
  const canAgain = !still && !!beyond && rested;
  const derived = state.phase === 'derived';
  // The word follows the clock as the visitor finds it (found(), above): never Pause where nothing plays.
  const playing = clockState.kind === 'playing' && !(still && !chosen);
  const atEnd = clockState.seconds >= film;
  /** The clock's word: Pause while it plays; at the end, Again for whoever has watched it. */
  const clockWord = playing ? t.pause : atEnd && (chosen || !still) ? t.again : t.play;
  const clockStep = stepsDrawnAt(clockState.seconds, steps);

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
        data-beyond={beyond ? (rested ? 'rested' : 'running') : undefined}
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
          <figcaption className={styles.caption}>
            {description}
            {turnable && !beyond && !twin ? (
              <span className={styles.hint}>
                <span className={styles.hintPointer}>{t.orbitTurnHint}</span>
                <span className={styles.hintTouch}>{t.orbitTurnHintTouch}</span>
              </span>
            ) : null}
          </figcaption>
        </figure>
        <div className={styles.score}>
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
            <p className={styles.readout}>{line}</p>
            <div className={styles.words}>
              {derived && !beyond && !twin ? (
                <>
                  {turned ? (
                    <button
                      type="button"
                      className={styles.again}
                      onClick={() => sculpture.current?.back()}
                    >
                      {t.orbitGeneratorView}
                    </button>
                  ) : null}
                  <button type="button" className={styles.again} onClick={playPause}>
                    {clockWord}
                  </button>
                  <button type="button" className={styles.again} onClick={toClosestApproach}>
                    {t.toClosestApproach}
                  </button>
                  {derivedFate && finished ? (
                    <button
                      type="button"
                      className={styles.again}
                      aria-pressed={false}
                      onClick={() => goBeyond('end')}
                    >
                      {t.afterTheFrame}
                    </button>
                  ) : null}
                  {derivedFate && finished && placed ? (
                    <button
                      type="button"
                      className={styles.again}
                      aria-pressed={false}
                      onClick={goTwin}
                    >
                      {t.oneInATrillion}
                    </button>
                  ) : null}
                </>
              ) : null}
              {derived && twin ? (
                <>
                  {twinRested && !still ? (
                    <button type="button" className={styles.again} onClick={goTwin}>
                      {t.again}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={styles.again}
                    aria-pressed={true}
                    onClick={leaveTwin}
                  >
                    {t.oneInATrillion}
                  </button>
                  {derivedFate ? (
                    <button
                      type="button"
                      className={styles.again}
                      aria-pressed={false}
                      onClick={() => goBeyond('end')}
                    >
                      {t.afterTheFrame}
                    </button>
                  ) : null}
                </>
              ) : null}
              {derived && beyond ? (
                <>
                  {canApproach ? (
                    <button
                      type="button"
                      className={styles.again}
                      onClick={() => goBeyond('approach')}
                    >
                      {t.toTheEjection}
                    </button>
                  ) : null}
                  {canAgain ? (
                    <button type="button" className={styles.again} onClick={again}>
                      {t.again}
                    </button>
                  ) : null}
                  {derivedFate ? (
                    <button
                      type="button"
                      className={styles.again}
                      aria-pressed={!!beyond}
                      onClick={() => (beyond ? leaveBeyond() : goBeyond('end'))}
                    >
                      {t.afterTheFrame}
                    </button>
                  ) : null}
                  {placed ? (
                    <button
                      type="button"
                      className={styles.again}
                      aria-pressed={false}
                      onClick={goTwin}
                    >
                      {t.oneInATrillion}
                    </button>
                  ) : null}
                </>
              ) : null}
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
            labelledBy="orbit-proof-title"
          />
        </div>
      </section>
    </>
  );
}
