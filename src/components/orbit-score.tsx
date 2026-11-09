'use client';
import Link from 'next/link';
import { useEffect, useEffectEvent, useMemo, useRef, useState, type CSSProperties } from 'react';
import { localizedPath, type Locale } from '@/lib/i18n/routing';
import type { Messages } from '@/lib/i18n/en';
import { clock, fill } from '@/lib/i18n/format';
import type { WorkOrbit } from '@/lib/art/orbit-records';
import type { OrbitPlate } from '@/lib/art/orbit-plate';
import type {
  Comparison,
  DerivedFate,
  MeasurementKey,
  Progress,
  Rederivation,
} from '@/lib/physics/orbit';
import { bodyGlow } from '@/lib/physics/body-light';
import { Continuation, restingStep } from '@/lib/physics/continuation';
import { HeldPlacement, type FramedSamples } from '@/lib/physics/framing';
import { pairName } from '@/lib/physics/film-score';
import type { OrbitReply, OrbitRequest } from '@/lib/physics/orbit.worker';
import {
  lightFilmDuration,
  lightFilmFrame,
  lightFilmSeconds,
  stepsDrawnAt,
} from '@/lib/physics/light-film';
import { principalPlane, type Plane } from '@/lib/physics/plane';
import { AFTER_THE_FRAME_EVENT } from '@/lib/venue-events';
import { useMotion } from './motion-provider';
import { lendPlateTone, returnPlateTone } from './room-ground';
import { drawScore } from './score-drawing';
import { useRememberedExpression, type Expression } from './turn';
import { MATERIALS, planePicture, platePicture, type Material } from './orbit-picture';
import {
  derivedValue,
  measurementLabels,
  orbitWorker,
  progressText,
  recordValues,
  seedShort,
  verdict,
} from './orbit-proof';
import styles from './orbit-score.module.css';

/** The plate's still is laid out at the figure's width: the full width on a phone. */
const STILL_SIZES = '(max-width: 860px) 100vw, 62vw';
/** Every hundredth step is drawn: ten thousand points per body for a million-step window. */
const STRIDE = 100;
/** To the ejection starts this many seconds of the film's pace before the escape. */
const LEAD_SECONDS = 4;
/**
 * After the frame rests once an escape is confirmed and the escaping body has left the drawing,
 * and never later than this many seconds of the film's pace after the confirmation: the pair it
 * leaves recoils the other way, and would follow it out.
 */
const AFTER_ESCAPE_SECONDS = 2;
/** After the confirmation, a drawing made at once looks for the escaper's exit this finely. */
const SETTLE_STEPS = 1_000;
/** Drawn at once, an eternal dance past the frame covers this share of a window. */
const STILL_WINDOWS = 0.5;
/** Past the frame a trail fades to a twentieth over about the film's length… */
const MEMORY_SECONDS = 30;
/** …a step every half second, since a slower fade is lost to an 8-bit canvas. */
const FADE_EVERY_SECONDS = 0.5;
const FADE = 1 - 0.05 ** (FADE_EVERY_SECONDS / MEMORY_SECONDS);
/** The continued trails: the bodies' hues drained of colour. */
const CONTINUED_ALPHA = 0.3;
/** No frame advances the performance by more than this, so a tab coming back resumes it. */
const LONGEST_FRAME_SECONDS = 0.1;
/** Drawn at once, the steps are taken this many to a frame, so the page stays responsive. */
const STILL_STEPS_PER_FRAME = 100_000;

type Derivation =
  | { phase: 'deriving'; progress: Progress | null }
  | { phase: 'derived'; result: Rederivation; comparisons: Comparison[]; seconds: number }
  | { phase: 'failed' };
type State = { phase: 'waiting' } | Derivation;
type Fate =
  | { phase: 'deriving' }
  | { phase: 'derived'; fate: DerivedFate; comparison: Comparison }
  | { phase: 'failed' };
/** After the frame: where the performance starts, and a count so a repeat starts afresh. */
type Beyond = { from: 'end' | 'approach'; run: number };

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
 * at the film's pace, with the window dimmed behind it. An ejection is performed as the
 * generator dated it, and the escaping body leaves the drawing; an eternal dance turns on to
 * the record's horizon. The fate is derived here and checked like every other measurement.
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
  const [derivation, setDerivation] = useState<Derivation>({ phase: 'deriving', progress: null });
  /** The derived window on its plate, from the worker: null when it could not be placed there. */
  const [framed, setFramed] = useState<FramedSamples | null | undefined>(undefined);
  const [fate, setFate] = useState<Fate>({ phase: 'deriving' });
  const [near, setNear] = useState(false);
  const [inView, setInView] = useState(false);
  const [readout, setReadout] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [run, setRun] = useState(0);
  const [beyond, setBeyond] = useState<Beyond | null>(null);
  /** The plate's word asked for After the frame before the fate was known. */
  const [asked, setAsked] = useState(false);
  /** How far past the frame the performance has reached, and whether it has come to rest. */
  const [reached, setReached] = useState(0);
  const [rested, setRested] = useState(false);
  const { paused, reducedMotion, theatre } = useMotion();
  const still = paused || reducedMotion || theatre === 'hushed';
  // Nothing is derived before the section is near, which is never on the server.
  const state: State = !near
    ? { phase: 'waiting' }
    : typeof Worker === 'undefined'
      ? { phase: 'failed' }
      : derivation;
  const finished = still || done;
  const steps = orbit.generation.steps;
  const film = lightFilmDuration(steps);
  /** The film's pace: steps of the window per second of the Light film. */
  const pace = steps / film;
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const oneDecimal = useMemo(
    () => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    [locale],
  );

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

  // Derive when the section is a screen away, draw while any of it is in view, and lend the
  // running head the night while the section stands beneath it: a band the height of the head
  // at the top of the viewport, so a section taller than the screen still takes the head.
  useEffect(() => {
    const node = section.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      queueMicrotask(() => setNear(true));
      return;
    }
    const holder = {};
    const approach = new IntersectionObserver(([entry]) => entry.isIntersecting && setNear(true), {
      rootMargin: '100% 0px',
    });
    const view = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    const head = new IntersectionObserver(
      ([entry]) =>
        entry.isIntersecting ? lendPlateTone(holder, '#000000', 'night') : returnPlateTone(holder),
      // Two pixels down, so a section that only touches the top edge has left the head.
      { rootMargin: '-2px 0px -92% 0px' },
    );
    approach.observe(node);
    view.observe(node);
    head.observe(node);
    return () => {
      approach.disconnect();
      view.disconnect();
      head.disconnect();
      returnPlateTone(holder);
    };
  }, []);

  const goBeyond = (from: Beyond['from']) => {
    setAsked(false);
    setRested(false);
    setReached(from === 'approach' && derivedFate?.approach ? derivedFate.approach.taken : steps);
    setReadout(null);
    setBeyond((current) => ({ from, run: (current?.run ?? 0) + 1 }));
  };
  // The plate's word: bring the section into view and go on past the frame as soon as the fate
  // is known. Asking derives the orbit if the visitor has not come near it yet.
  const onAsk = useEffectEvent(() => {
    setNear(true);
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
  const onFate = useEffectEvent(() => {
    if (asked) goBeyond('end');
  });
  useEffect(() => {
    const ask = () => onAsk();
    window.addEventListener(AFTER_THE_FRAME_EVENT, ask);
    return () => window.removeEventListener(AFTER_THE_FRAME_EVENT, ask);
  }, []);

  const plateFrame = plate?.frame;
  useEffect(() => {
    if (!near || typeof Worker === 'undefined') return;
    let worker: Worker;
    try {
      worker = orbitWorker();
    } catch {
      queueMicrotask(() => {
        setDerivation({ phase: 'failed' });
        setFramed(null);
        setFate({ phase: 'failed' });
      });
      return;
    }
    const started = performance.now();
    // The measurements come first, then the window on its plate; the worker then runs on to
    // the fate and is done.
    let measured = false;
    const fail = () => {
      if (!measured) setDerivation({ phase: 'failed' });
      setFramed((current) => current ?? null);
      setFate({ phase: 'failed' });
      worker.terminate();
    };
    worker.onmessage = ({ data }: MessageEvent<OrbitReply>) => {
      if (data.type === 'progress') setDerivation({ phase: 'deriving', progress: data.progress });
      else if (data.type === 'done') {
        measured = true;
        setDerivation({
          phase: 'derived',
          result: data.result,
          comparisons: data.comparisons,
          seconds: (performance.now() - started) / 1000,
        });
      } else if (data.type === 'framed') setFramed(data.framed);
      else if (data.type === 'fate') {
        setFate({ phase: 'derived', fate: data.fate, comparison: data.comparison });
        worker.terminate();
        onFate();
      } else fail();
    };
    worker.onerror = fail;
    const request: OrbitRequest = {
      generation: orbit.generation,
      published: orbit.published,
      stride: STRIDE,
      fate: { published: orbit.fate, lead: Math.round(LEAD_SECONDS * pace) },
      ...(plateFrame ? { frame: plateFrame } : {}),
    };
    worker.postMessage(request);
    return () => worker.terminate();
  }, [near, orbit, pace, plateFrame]);

  // The drawing: trails accumulate, the bodies ride on a layer above, and the score beneath
  // carries the three separations with the published events. On the plate the drawing lies over
  // the still, in its material: light added on night, graphite and sumi on paper. At the film's
  // pace when motion is welcome and the section is in view; all at once otherwise.
  const drawn = useRef(0);
  const frame = useRef(0);
  /** The orbit past the frame as it stands, so a resize or a return carries on from it. */
  const live = useRef<{ key: string; continuation: Continuation } | null>(null);
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
    const paint = MATERIALS[picture.material];
    const { x, y } = picture;
    /** On the plate the bodies stand where the work left them once the window is drawn. */
    const rests = picture.kind === 'plate';
    const hues = orbit.bodyHues;
    const closestSample = Math.floor(result.closestApproach.step / STRIDE);
    const copies = picture.drawn / 3;

    // One path a body for each frame of the Light film, as the film adds each frame's marks:
    // the orbit drawn whole and the orbit performed end on the same picture, at any display's
    // pace. Light adds and ink darkens alike, so the paths may be stroked body by body.
    const strokes = (from: number, to: number, alpha = 0.2) => {
      const spans: [number, number][] = [];
      const filmFrameOf = (sample: number) =>
        lightFilmFrame(Math.min(steps - 1, sample * STRIDE), steps);
      for (let start = from; start < to;) {
        const filmFrame = filmFrameOf(start + 1);
        let end = start + 1;
        while (end < to && filmFrameOf(end + 1) === filmFrame) end += 1;
        spans.push([start, end]);
        start = end;
      }
      trail.globalCompositeOperation = paint.blend;
      trail.lineWidth = picture.material === 'ink' ? 0.75 * ratio : ratio;
      trail.lineJoin = 'round';
      for (let body = 0; body < picture.drawn; body++) {
        trail.strokeStyle = paint.trail(hues[picture.body(body)], alpha);
        for (const [first, last] of spans) {
          trail.beginPath();
          trail.moveTo(x(first, body), y(first, body));
          for (let sample = first + 1; sample <= last; sample++)
            trail.lineTo(x(sample, body), y(sample, body));
          trail.stroke();
        }
      }
    };
    /**
     * The bodies wherever `at` places them: lights on night; on paper, each outlined at the size
     * the Ink edition gave it, with its centre marked.
     */
    const lights = (at: (body: number) => [number, number]) => {
      for (let body = 0; body < picture.drawn; body++) {
        const [cx, cy] = at(body);
        const hue = hues[picture.body(body)];
        const reach = picture.reach(result.masses[picture.body(body)]);
        if (picture.material === 'ink') {
          mark.strokeStyle = MATERIALS.ink.body(hue);
          mark.fillStyle = MATERIALS.ink.body(hue);
          mark.lineWidth = ratio;
          mark.beginPath();
          mark.arc(cx, cy, reach, 0, Math.PI * 2);
          mark.stroke();
          mark.beginPath();
          mark.arc(cx, cy, 1.5 * ratio, 0, Math.PI * 2);
          mark.fill();
          continue;
        }
        const glow = mark.createRadialGradient(cx, cy, 0, cx, cy, reach);
        for (const [offset, colour] of bodyGlow(hue)) glow.addColorStop(offset, colour);
        mark.fillStyle = glow;
        mark.beginPath();
        mark.arc(cx, cy, reach, 0, Math.PI * 2);
        mark.fill();
      }
    };
    /** The closest approach, ringed where it happened, in each copy drawn, and the bodies. */
    const bodies = (sample: number, shown: boolean) => {
      mark.clearRect(0, 0, width, height);
      if (sample >= closestSample) {
        const [a, b] = result.closestApproach.pair;
        const ring = rests ? Math.min(14 * ratio, 0.04 * height) : 14 * ratio;
        mark.strokeStyle = paint.mark;
        mark.lineWidth = ratio;
        for (let copy = 0; copy < copies; copy++) {
          mark.beginPath();
          mark.arc(
            (x(closestSample, copy * 3 + a) + x(closestSample, copy * 3 + b)) / 2,
            (y(closestSample, copy * 3 + a) + y(closestSample, copy * 3 + b)) / 2,
            ring,
            0,
            Math.PI * 2,
          );
          mark.stroke();
        }
      }
      if (shown) lights((body) => [x(sample, body), y(sample, body)]);
    };
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

    /*
      After the frame. The recorded window stays, dimmed, and the same physics runs on from the
      bodies the worker kept: at the window's end, or a few seconds before an ejection. Its
      trails are the bodies' hues drained of colour, on a layer of their own that forgets them
      over about a film's length: the same bodies, beyond what the work recorded. On the plate
      they go on over the same still, the camera held where the film's frame ended.
    */
    const performBeyond = (fate: DerivedFate, from: Beyond['from'], key: string) => {
      const where =
        picture.kind === 'plate' && plate
          ? {
              plate: new HeldPlacement(plate.frame, {
                masses: result.masses,
                dt: orbit.generation.dt,
                steps,
              }),
            }
          : { plane: plane! };
      const begin = (start: Beyond['from']) =>
        new Continuation({
          masses: result.masses,
          dt: orbit.generation.dt,
          origin:
            start === 'approach' && fate.approach
              ? fate.approach
              : { taken: steps, ...fate.windowEnd },
          end: restingStep(fate, Math.round(AFTER_ESCAPE_SECONDS * pace)),
          stride: STRIDE,
          ...where,
        });
      const place = (at: Continuation, index: number, body: number) =>
        picture.continued(at.path, at.width, index, body);
      const trace = (at: Continuation, first: number, last: number, alpha: number) => {
        if (last <= first) return;
        beyondTrail.globalCompositeOperation = paint.blend;
        beyondTrail.lineWidth = picture.material === 'ink' ? 0.75 * ratio : ratio;
        beyondTrail.lineJoin = 'round';
        for (let body = 0; body < picture.drawn; body++) {
          beyondTrail.strokeStyle = paint.continued(hues[picture.body(body)], alpha);
          beyondTrail.beginPath();
          beyondTrail.moveTo(...place(at, first, body));
          for (let index = first + 1; index <= last; index++)
            beyondTrail.lineTo(...place(at, index, body));
          beyondTrail.stroke();
        }
      };
      // Redrawn whole (a resize, a return, a still drawing), the last film's length of the path
      // is traced in quarters, each as faded as the performance would have left it.
      const retrace = (at: Continuation) => {
        beyondTrail.clearRect(0, 0, width, height);
        const last = at.samples - 1;
        const memory = Math.max(4, Math.round((MEMORY_SECONDS * pace) / STRIDE));
        for (let quarter = 3; quarter >= 0; quarter--)
          trace(
            at,
            Math.max(0, last - Math.round(((quarter + 1) * memory) / 4)),
            Math.max(0, last - Math.round((quarter * memory) / 4)),
            CONTINUED_ALPHA * 0.05 ** (quarter / 4),
          );
      };
      const lightsAt = (at: Continuation) => {
        mark.clearRect(0, 0, width, height);
        lights((body) => place(at, at.samples - 1, body));
      };
      const speak = (at: Continuation) => {
        const ejection = fate.outcome === 'ejection' ? fate.ejectionStep : null;
        setReached(at.taken);
        setRested(at.resting);
        setReadout(
          ejection !== null && at.taken > ejection
            ? fill(t.orbitEscaped, {
                body: (fate.escaper ?? 0) + 1,
                step: number.format(ejection),
              })
            : at.taken >= fate.horizonSteps
              ? fill(t.orbitHeld, { steps: number.format(fate.horizonSteps) })
              : fill(t.orbitBeyond, {
                  step: number.format(at.taken),
                  clock: clock((at.taken - steps) / pace),
                }),
        );
      };

      const confirmed = restingStep(fate, 0);
      const escaper = fate.outcome === 'ejection' ? fate.escaper : null;
      /**
       * Whether the escaping body's light has left the drawing altogether: on a kaleidoscope's
       * plate, every copy of it, since a turned copy may still be on the plate when the first
       * has left it.
       */
      const gone = (at: Continuation) => {
        if (escaper === null) return false;
        const reach = picture.reach(result.masses[escaper]);
        for (let copy = 0; copy < copies; copy++) {
          const [ex, ey] = place(at, at.samples - 1, copy * 3 + escaper);
          if (ex >= -reach && ex <= width + reach && ey >= -reach && ey <= height + reach)
            return false;
        }
        return true;
      };
      /** Once the escape is confirmed, the performance rests as soon as the escaper is gone. */
      const settle = (at: Continuation) => {
        if (!at.resting && at.taken >= confirmed && gone(at)) at.restHere();
      };

      // The window, dimmed, and its score: what the work recorded, behind what comes next.
      strokes(0, picture.last, paint.dimmed);
      scoreAt(null);
      // A plate and a plane place the bodies apart: a turn between Light and Ink keeps the path.
      const keyed = `${key}:${picture.kind}`;
      let at = live.current?.key === keyed ? live.current.continuation : begin(from);
      // Drawn at once, an escape is drawn from its approach rather than waited for.
      if (still && fate.approach && at.taken < fate.approach.taken) at = begin('approach');
      live.current = { key: keyed, continuation: at };
      retrace(at);
      lightsAt(at);
      if (still) {
        const target =
          fate.outcome === 'ejection'
            ? at.end
            : Math.max(at.taken, steps + Math.round(STILL_WINDOWS * steps));
        const compute = () => {
          const until = Math.min(target, at.taken + STILL_STEPS_PER_FRAME);
          // In long strides to the confirmation, then finely, so the rest finds the exit.
          while (at.taken < until && !at.resting) {
            at.advanceTo(
              at.taken < confirmed
                ? Math.min(until, confirmed)
                : Math.min(until, at.taken + SETTLE_STEPS),
            );
            settle(at);
          }
          if (at.taken < Math.min(target, at.end)) {
            frame.current = requestAnimationFrame(compute);
            return;
          }
          retrace(at);
          lightsAt(at);
          speak(at);
          setRested(true);
        };
        frame.current = requestAnimationFrame(compute);
        return () => cancelAnimationFrame(frame.current);
      }
      if (!inView || at.resting) return;
      let last: number | null = null;
      let spoken = 0;
      const perform = (now: number) => {
        const elapsed = last === null ? 0 : Math.min(LONGEST_FRAME_SECONDS, (now - last) / 1000);
        last = now;
        const before = at.samples - 1;
        if (at.perform(elapsed, pace, FADE_EVERY_SECONDS)) {
          beyondTrail.globalCompositeOperation = 'destination-out';
          beyondTrail.fillStyle = `rgb(0 0 0 / ${FADE})`;
          beyondTrail.fillRect(0, 0, width, height);
        }
        settle(at);
        trace(at, before, at.samples - 1, CONTINUED_ALPHA);
        lightsAt(at);
        if (now - spoken > 250 || at.resting) {
          spoken = now;
          speak(at);
        }
        if (!at.resting) frame.current = requestAnimationFrame(perform);
      };
      frame.current = requestAnimationFrame(perform);
      return () => cancelAnimationFrame(frame.current);
    };

    trail.clearRect(0, 0, width, height);
    beyondTrail.clearRect(0, 0, width, height);
    if (beyond && derivedFate)
      return performBeyond(derivedFate, beyond.from, `${beyond.run}:${beyond.from}`);
    // Asked for After the frame, the window waits whole for the fate rather than starting over.
    const whole = still || asked;
    if (whole || !inView) {
      // A window drawn to its end on the plate goes on to the still's step, and its bodies
      // stand where the work left them; in the plane they leave the drawing, as Phase A had it.
      const reached = whole ? count - 1 : drawn.current;
      const ended = reached >= count - 1;
      const last = ended ? picture.last : reached;
      if (last > 0) strokes(0, last);
      bodies(last, ended ? rests : true);
      scoreAt(Math.min(steps - 1, last * STRIDE));
      if (whole) drawn.current = count - 1;
      return;
    }
    if (drawn.current > 0) strokes(0, drawn.current);
    const resumeAt = lightFilmSeconds(drawn.current * STRIDE, steps);
    const begun = performance.now() - resumeAt * 1000;
    let spoken = 0;
    const tickFrame = (now: number) => {
      const seconds = Math.min(film, (now - begun) / 1000);
      const step = stepsDrawnAt(seconds, steps);
      const sample = Math.min(count - 1, Math.floor(step / STRIDE));
      if (sample > drawn.current) {
        strokes(drawn.current, sample);
        drawn.current = sample;
      }
      const complete = sample >= count - 1;
      if (complete && rests) {
        strokes(count - 1, picture.last);
        bodies(picture.last, true);
      } else bodies(sample, !complete);
      scoreAt(step);
      if (now - spoken > 250 || complete) {
        spoken = now;
        const closest = result.closestApproach;
        const nearClosest = step >= closest.step && step - closest.step < 2 * 60 * (steps / 1800);
        setReadout(
          complete
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
      }
      if (complete) {
        setDone(true);
        return;
      }
      frame.current = requestAnimationFrame(tickFrame);
    };
    frame.current = requestAnimationFrame(tickFrame);
    return () => cancelAnimationFrame(frame.current);
  });

  useEffect(
    () => draw(),
    [result, plane, framed, material, still, inView, run, beyond, derivedFate, asked],
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

  /** Again: the window from its first step, or After the frame from where it began. */
  const again = () => {
    setReadout(null);
    if (beyond) {
      goBeyond(beyond.from);
      return;
    }
    drawn.current = 0;
    setDone(false);
    setRun((value) => value + 1);
  };
  /** Back to the frame: the recorded window, drawn whole. */
  const leaveBeyond = () => {
    live.current = null;
    drawn.current = Math.max(0, (result?.samples.count ?? 1) - 1);
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

  const labels = measurementLabels(t);
  const record = recordValues(orbit, t, number);
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
  const line = beyond ? readout : ((still ? null : readout) ?? progressLine);
  const approach = derivedFate?.approach;
  const canApproach =
    beyond?.from === 'end' && !still && !rested && !!approach && reached < approach.taken;
  const canAgain = !still && (beyond ? rested : done);

  return (
    <section
      ref={section}
      id="orbit"
      tabIndex={-1}
      className={styles.orbit}
      aria-labelledby="orbit-title"
      data-phase={state.phase}
      data-exact={checked ? String(differing.length === 0) : undefined}
      data-fate={fate.phase === 'derived' ? fate.fate.outcome : undefined}
      data-beyond={beyond ? (rested ? 'rested' : 'running') : undefined}
      data-drawing={plateStill ? 'plate' : 'plane'}
      data-material={plateStill ? (material ?? undefined) : undefined}
    >
      <header className={styles.head}>
        <h2 id="orbit-title" className={styles.title}>
          {t.orbitTitle}
        </h2>
        <p className={styles.line}>{beyond ? t.afterTheFrameNote : t.orbitLine}</p>
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
          <canvas ref={trails} className={styles.layer} aria-hidden="true" />
          <canvas ref={continued} className={styles.layer} aria-hidden="true" />
          <canvas ref={marks} className={styles.layer} aria-hidden="true" />
        </div>
        <figcaption className={styles.caption}>{description}</figcaption>
      </figure>
      <div className={styles.score}>
        <canvas ref={events} className={styles.events} aria-hidden="true" />
        <div className={styles.readoutRow}>
          <p className={styles.readout}>{line}</p>
          <div className={styles.words}>
            {state.phase === 'derived' && (finished || beyond) ? (
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
              </>
            ) : null}
          </div>
        </div>
      </div>
      <div className={styles.record}>
        <table className={styles.proof}>
          <caption className={styles.tableCaption}>{t.orbitTableCaption}</caption>
          <thead className={styles.visuallyHidden}>
            <tr>
              <th scope="col">{t.orbitMeasurement}</th>
              <th scope="col">{t.orbitValue}</th>
              <th scope="col">{t.orbitCheck}</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(labels) as MeasurementKey[]).map((key) => {
              const row = comparisons?.find((comparison) => comparison.key === key);
              return (
                <tr key={key} data-key={key} data-exact={row ? String(row.exact) : undefined}>
                  <th scope="row">{labels[key]}</th>
                  <td className={key === 'braidWord' ? styles.word : undefined}>
                    <span>{record[key]}</span>
                    {row && !row.exact ? (
                      <span className={styles.derivedValue}>{derivedValue(row, t)}</span>
                    ) : null}
                  </td>
                  <td className={styles.check}>
                    {row ? (row.exact ? t.orbitExact : t.orbitDiffers) : t.orbitPending}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className={styles.summary} role="status">
          {summary}
        </p>
        <p className={styles.note}>
          {fill(t.orbitNote, {
            index: number.format(orbit.generation.selectedIndex),
            steps: number.format(orbit.generation.warmupSteps + steps),
          })}
        </p>
        {/* The same derivation, printed whole on a page of its own (Verify an orbit). */}
        <p className={styles.verify}>
          <Link className="word-link" href={localizedPath(locale, `/verify/orbit/${orbit.id}`)}>
            {t.verifyOrbitLineByLine}
          </Link>
        </p>
      </div>
    </section>
  );
}
