'use client';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import type { Locale } from '@/lib/i18n/routing';
import type { Messages } from '@/lib/i18n/en';
import { clock, fill } from '@/lib/i18n/format';
import type { WorkOrbit } from '@/lib/art/orbit-records';
import type {
  Comparison,
  DerivedFate,
  MeasurementKey,
  Progress,
  Rederivation,
} from '@/lib/physics/orbit';
import { Continuation, restingStep } from '@/lib/physics/continuation';
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
import styles from './orbit-score.module.css';

/** Every hundredth step is drawn: ten thousand points per body for a million-step window. */
const STRIDE = 100;
const MINUS = '−';
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

/** The worker is a module of its own; tests replace the global Worker. */
function orbitWorker(): Worker {
  return new Worker(new URL('../lib/physics/orbit.worker.ts', import.meta.url), { type: 'module' });
}

const exact = (value: number) => (value < 0 ? `${MINUS}${-value}` : String(value));
const pairWords = (pair: readonly number[]) => pair.map((body) => body + 1).join('–');
const seedShort = (seed: string) => `${seed.slice(0, 6)}…${seed.slice(-4)}`;

/**
 * The orbit, re-performed: the work's orbit derived from its seed in this browser, drawn at
 * the Light film's pace in the plane of its greatest extent, and every published measurement
 * checked against the derivation. The films and stills are recorded renderings; this is the
 * physics beneath them. It lends the running head the night while it stands beneath the head.
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
}: {
  orbit: WorkOrbit;
  t: Messages;
  locale: Locale;
}) {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const trails = useRef<HTMLCanvasElement>(null);
  const continued = useRef<HTMLCanvasElement>(null);
  const marks = useRef<HTMLCanvasElement>(null);
  const events = useRef<HTMLCanvasElement>(null);
  const [derivation, setDerivation] = useState<Derivation>({ phase: 'deriving', progress: null });
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

  useEffect(() => {
    if (!near || typeof Worker === 'undefined') return;
    let worker: Worker;
    try {
      worker = orbitWorker();
    } catch {
      queueMicrotask(() => {
        setDerivation({ phase: 'failed' });
        setFate({ phase: 'failed' });
      });
      return;
    }
    const started = performance.now();
    // The measurements come first; the worker then runs on to the fate and is done.
    let measured = false;
    const fail = () => {
      if (!measured) setDerivation({ phase: 'failed' });
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
      } else if (data.type === 'fate') {
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
    };
    worker.postMessage(request);
    return () => worker.terminate();
  }, [near, orbit, pace]);

  // The drawing: trails accumulate in light, the bodies ride on a layer above, and the score
  // beneath carries the three separations with the published events. At the film's pace when
  // motion is welcome and the section is in view; all at once otherwise.
  const drawn = useRef(0);
  const frame = useRef(0);
  /** The orbit past the frame as it stands, so a resize or a return carries on from it. */
  const live = useRef<{ key: string; continuation: Continuation } | null>(null);
  const draw = useEffectEvent((): (() => void) | void => {
    cancelAnimationFrame(frame.current);
    const canvases = [trails.current, continued.current, marks.current, events.current];
    if (!result || !plane || canvases.some((canvas) => !canvas)) return;
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
    const { u, v, bounds } = plane;
    const width = trailCanvas.width;
    const height = trailCanvas.height;
    const margin = 24 * ratio;
    const scale = Math.min(
      (width - 2 * margin) / (bounds.u1 - bounds.u0 || 1),
      (height - 2 * margin) / (bounds.v1 - bounds.v0 || 1),
    );
    const ox = (width - (bounds.u1 - bounds.u0) * scale) / 2 - bounds.u0 * scale;
    const oy = (height - (bounds.v1 - bounds.v0) * scale) / 2 - bounds.v0 * scale;
    const x = (sample: number, body: number) => ox + u[sample * 3 + body] * scale;
    const y = (sample: number, body: number) => oy + v[sample * 3 + body] * scale;
    const hues = orbit.bodyHues;
    const radius = result.masses.map((mass) => Math.cbrt(mass) * 0.6 * ratio);
    const closestSample = Math.floor(result.closestApproach.step / STRIDE);

    // One path a body for each frame of the Light film, as the film adds each frame's marks:
    // the orbit drawn whole and the orbit performed end on the same picture, at any display's
    // pace. Light adds, so the paths may be stroked body by body.
    const strokes = (from: number, to: number, alpha = 0.2) => {
      const spans: [number, number][] = [];
      for (let start = from; start < to;) {
        const filmFrame = lightFilmFrame((start + 1) * STRIDE, steps);
        let end = start + 1;
        while (end < to && lightFilmFrame((end + 1) * STRIDE, steps) === filmFrame) end += 1;
        spans.push([start, end]);
        start = end;
      }
      trail.globalCompositeOperation = 'lighter';
      trail.lineWidth = ratio;
      trail.lineJoin = 'round';
      for (let body = 0; body < 3; body++) {
        trail.strokeStyle = `oklch(0.84 0.075 ${hues[body]} / ${alpha})`;
        for (const [first, last] of spans) {
          trail.beginPath();
          trail.moveTo(x(first, body), y(first, body));
          for (let sample = first + 1; sample <= last; sample++)
            trail.lineTo(x(sample, body), y(sample, body));
          trail.stroke();
        }
      }
    };
    /** The three bodies as lights, wherever `at` places them. */
    const glows = (at: (body: number) => [number, number]) => {
      for (let body = 0; body < 3; body++) {
        const [cx, cy] = at(body);
        const glow = mark.createRadialGradient(cx, cy, 0, cx, cy, radius[body] * 4);
        glow.addColorStop(0, `oklch(0.96 0.04 ${hues[body]})`);
        glow.addColorStop(0.22, `oklch(0.9 0.08 ${hues[body]} / 0.55)`);
        glow.addColorStop(1, 'transparent');
        mark.fillStyle = glow;
        mark.beginPath();
        mark.arc(cx, cy, radius[body] * 4, 0, Math.PI * 2);
        mark.fill();
      }
    };
    const bodies = (sample: number, moving: boolean) => {
      mark.clearRect(0, 0, width, height);
      if (sample >= closestSample) {
        const [a, b] = result.closestApproach.pair;
        mark.strokeStyle = 'rgb(241 235 223 / 0.7)';
        mark.lineWidth = ratio;
        mark.beginPath();
        mark.arc(
          (x(closestSample, a) + x(closestSample, b)) / 2,
          (y(closestSample, a) + y(closestSample, b)) / 2,
          14 * ratio,
          0,
          Math.PI * 2,
        );
        mark.stroke();
      }
      if (moving) glows((body) => [x(sample, body), y(sample, body)]);
    };
    // The score: log separations of the three pairs, the closest approach, the syzygies and
    // the braid crossings as ticks, and the playhead.
    const scoreWidth = eventCanvas.width;
    const scoreHeight = eventCanvas.height;
    const separations = result.samples.separations;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < count * 3; i++) {
      const value = Math.log(separations[i]);
      lo = Math.min(lo, value);
      hi = Math.max(hi, value);
    }
    const at = (step: number) => (step / (steps - 1)) * scoreWidth;
    const lane = scoreHeight - 12 * ratio;
    const scoreStill = document.createElement('canvas');
    scoreStill.width = scoreWidth;
    scoreStill.height = scoreHeight;
    const base = scoreStill.getContext('2d');
    if (!base) return;
    const pairs = [
      [0, 1],
      [0, 2],
      [1, 2],
    ];
    pairs.forEach(([a, b], k) => {
      base.strokeStyle = `oklch(0.8 0.07 ${(hues[a] + hues[b]) / 2} / 0.55)`;
      base.lineWidth = ratio;
      base.beginPath();
      for (let sample = 0; sample < count; sample += 2) {
        const px = at(sample * STRIDE);
        const py =
          2 * ratio +
          (1 - (Math.log(separations[sample * 3 + k]) - lo) / (hi - lo || 1)) * (lane - 4 * ratio);
        if (sample === 0) base.moveTo(px, py);
        else base.lineTo(px, py);
      }
      base.stroke();
    });
    const tick = (step: number, length: number, alpha: number) => {
      base.fillStyle = `rgb(241 235 223 / ${alpha})`;
      base.fillRect(Math.round(at(step)), scoreHeight - length * ratio, ratio, length * ratio);
    };
    for (const crossing of result.braid.events) tick(crossing.step, 3, 0.4);
    for (const step of result.syzygies) tick(step, 7, 0.8);
    tick(result.closestApproach.step, 11, 1);
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
      over about a film's length: the same bodies, beyond what the work recorded.
    */
    const performBeyond = (fate: DerivedFate, from: Beyond['from'], key: string) => {
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
          plane,
        });
      const px = (path: Float32Array, offset: number) => ox + path[offset] * scale;
      const py = (path: Float32Array, offset: number) => oy + path[offset + 1] * scale;
      const trace = (at: Continuation, first: number, last: number, alpha: number) => {
        if (last <= first) return;
        beyondTrail.globalCompositeOperation = 'lighter';
        beyondTrail.lineWidth = ratio;
        beyondTrail.lineJoin = 'round';
        for (let body = 0; body < 3; body++) {
          beyondTrail.strokeStyle = `oklch(0.86 0.02 ${hues[body]} / ${alpha})`;
          beyondTrail.beginPath();
          beyondTrail.moveTo(px(at.path, first * 6 + body * 2), py(at.path, first * 6 + body * 2));
          for (let index = first + 1; index <= last; index++)
            beyondTrail.lineTo(
              px(at.path, index * 6 + body * 2),
              py(at.path, index * 6 + body * 2),
            );
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
      const lights = (at: Continuation) => {
        const offset = (at.samples - 1) * 6;
        mark.clearRect(0, 0, width, height);
        glows((body) => [px(at.path, offset + body * 2), py(at.path, offset + body * 2)]);
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
      /** Whether the escaping body's light has left the drawing altogether. */
      const gone = (at: Continuation) => {
        if (escaper === null) return false;
        const offset = (at.samples - 1) * 6 + escaper * 2;
        const reach = radius[escaper] * 4;
        const ex = px(at.path, offset);
        const ey = py(at.path, offset);
        return ex < -reach || ex > width + reach || ey < -reach || ey > height + reach;
      };
      /** Once the escape is confirmed, the performance rests as soon as the escaper is gone. */
      const settle = (at: Continuation) => {
        if (!at.resting && at.taken >= confirmed && gone(at)) at.restHere();
      };

      // The window, dimmed, and its score: what the work recorded, behind what comes next.
      strokes(0, count - 1, 0.07);
      scoreAt(null);
      let at = live.current?.key === key ? live.current.continuation : begin(from);
      // Drawn at once, an escape is drawn from its approach rather than waited for.
      if (still && fate.approach && at.taken < fate.approach.taken) at = begin('approach');
      live.current = { key, continuation: at };
      retrace(at);
      lights(at);
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
          lights(at);
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
        lights(at);
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
      const last = whole ? count - 1 : drawn.current;
      if (last > 0) strokes(0, last);
      bodies(last, !whole && last < count - 1);
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
      bodies(sample, !complete);
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
                  pair: pairWords(closest.pair),
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

  useEffect(() => draw(), [result, plane, still, inView, run, beyond, derivedFate, asked]);

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
  const description = fill(t.orbitCaption, {
    m1: oneDecimal.format(published.masses[0]),
    m2: oneDecimal.format(published.masses[1]),
    m3: oneDecimal.format(published.masses[2]),
    distance: oneDecimal.format(closest.distance),
    pair: pairWords(closest.pair),
    step: number.format(closest.step),
    seconds: oneDecimal.format(lightFilmSeconds(closest.step, steps)),
  });

  const labels: Record<MeasurementKey, string> = {
    mass1: fill(t.orbitMass, { n: 1 }),
    mass2: fill(t.orbitMass, { n: 2 }),
    mass3: fill(t.orbitMass, { n: 3 }),
    totalEnergy: t.orbitEnergy,
    angularMomentum: t.orbitMomentum,
    closestDistance: t.orbitClosest,
    closestWhere: t.orbitClosestWhere,
    syzygies: t.orbitSyzygies,
    braidCrossings: t.orbitBraidCrossings,
    braidWord: t.orbitBraidWord,
    fate: t.orbitFate,
  };
  const recordValues: Record<MeasurementKey, string> = {
    mass1: exact(published.masses[0]),
    mass2: exact(published.masses[1]),
    mass3: exact(published.masses[2]),
    totalEnergy: exact(published.totalEnergy),
    angularMomentum: exact(published.angularMomentum),
    closestDistance: exact(closest.distance),
    closestWhere: fill(t.orbitBodiesAt, {
      pair: pairWords(closest.pair),
      step: number.format(closest.step),
    }),
    syzygies: number.format(published.syzygyCount),
    braidCrossings: number.format(published.braid.crossings),
    braidWord: `${published.braid.word}${published.braid.truncated ? ' …' : ''}`,
    fate:
      orbit.fate.outcome === 'ejection'
        ? fill(t.orbitFateEjection, {
            body: (orbit.fate.escaper ?? 0) + 1,
            step: number.format(orbit.fate.ejectionStep ?? 0),
          })
        : fill(t.orbitFateDance, { steps: number.format(orbit.fate.horizonSteps) }),
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
          ? progress?.phase === 'beginnings'
            ? fill(t.orbitProgressBeginnings, {
                done: number.format(progress.done),
                total: number.format(progress.total),
              })
            : progress?.phase === 'warm-up'
              ? fill(t.orbitProgressWarmUp, {
                  index: number.format(orbit.generation.selectedIndex),
                  done: number.format(progress.done),
                  total: number.format(progress.total),
                })
              : progress?.phase === 'window'
                ? fill(t.orbitProgressWindow, {
                    done: number.format(progress.done),
                    total: number.format(progress.total),
                  })
                : progress?.phase === 'braid'
                  ? fill(t.orbitProgressBraid, {
                      done: number.format(progress.done),
                      total: number.format(progress.total),
                    })
                  : fill(t.orbitProgressBeginnings, {
                      done: 0,
                      total: number.format(orbit.generation.selectedIndex),
                    })
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
          })} ${
            differing.length
              ? fill(t.orbitSomeDiffer, {
                  count: differing.length,
                  total: comparisons?.length ?? 0,
                })
              : t.orbitAllExact
          }`
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
    >
      <header className={styles.head}>
        <h2 id="orbit-title" className={styles.title}>
          {t.orbitTitle}
        </h2>
        <p className={styles.line}>{beyond ? t.afterTheFrameNote : t.orbitLine}</p>
      </header>
      <figure className={styles.figure}>
        <div ref={stage} className={styles.stage}>
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
                    <span>{recordValues[key]}</span>
                    {row && !row.exact ? (
                      <span className={styles.derivedValue}>
                        {fill(t.orbitDerivedValue, { value: row.derived.replace(/^-/, MINUS) })}
                      </span>
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
      </div>
    </section>
  );
}
