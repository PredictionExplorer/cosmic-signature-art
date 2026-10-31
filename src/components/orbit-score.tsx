'use client';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import type { Locale } from '@/lib/i18n/routing';
import type { Messages } from '@/lib/i18n/en';
import { clock, fill } from '@/lib/i18n/format';
import type { WorkOrbit } from '@/lib/art/orbit-records';
import type { Comparison, MeasurementKey, Progress, Rederivation } from '@/lib/physics/orbit';
import type { OrbitReply, OrbitRequest } from '@/lib/physics/orbit.worker';
import {
  lightFilmDuration,
  lightFilmFrame,
  lightFilmSeconds,
  stepsDrawnAt,
} from '@/lib/physics/light-film';
import { principalPlane, type Plane } from '@/lib/physics/plane';
import { useMotion } from './motion-provider';
import { lendPlateTone, returnPlateTone } from './room-ground';
import styles from './orbit-score.module.css';

/** Every hundredth step is drawn: ten thousand points per body for a million-step window. */
const STRIDE = 100;
const MINUS = '−';

type Derivation =
  | { phase: 'deriving'; progress: Progress | null }
  | { phase: 'derived'; result: Rederivation; comparisons: Comparison[]; seconds: number }
  | { phase: 'failed' };
type State = { phase: 'waiting' } | Derivation;

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
  const marks = useRef<HTMLCanvasElement>(null);
  const events = useRef<HTMLCanvasElement>(null);
  const [derivation, setDerivation] = useState<Derivation>({ phase: 'deriving', progress: null });
  const [near, setNear] = useState(false);
  const [inView, setInView] = useState(false);
  const [readout, setReadout] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [run, setRun] = useState(0);
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
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const oneDecimal = useMemo(
    () => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    [locale],
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

  useEffect(() => {
    if (!near || typeof Worker === 'undefined') return;
    let worker: Worker;
    try {
      worker = orbitWorker();
    } catch {
      queueMicrotask(() => setDerivation({ phase: 'failed' }));
      return;
    }
    const started = performance.now();
    worker.onmessage = ({ data }: MessageEvent<OrbitReply>) => {
      if (data.type === 'progress') setDerivation({ phase: 'deriving', progress: data.progress });
      else if (data.type === 'done') {
        setDerivation({
          phase: 'derived',
          result: data.result,
          comparisons: data.comparisons,
          seconds: (performance.now() - started) / 1000,
        });
        worker.terminate();
      } else {
        setDerivation({ phase: 'failed' });
        worker.terminate();
      }
    };
    worker.onerror = () => {
      setDerivation({ phase: 'failed' });
      worker.terminate();
    };
    const request: OrbitRequest = {
      generation: orbit.generation,
      published: orbit.published,
      stride: STRIDE,
    };
    worker.postMessage(request);
    return () => worker.terminate();
  }, [near, orbit]);

  const result = state.phase === 'derived' ? state.result : null;
  const plane = useMemo<Plane | null>(
    () => (result ? principalPlane(result.samples.positions, result.samples.count) : null),
    [result],
  );

  // The drawing: trails accumulate in light, the bodies ride on a second layer, and the score
  // beneath carries the three separations with the published events. At the film's pace when
  // motion is welcome and the section is in view; all at once otherwise.
  const drawn = useRef(0);
  const frame = useRef(0);
  const draw = useEffectEvent((): (() => void) | void => {
    cancelAnimationFrame(frame.current);
    const canvases = [trails.current, marks.current, events.current];
    if (!result || !plane || canvases.some((canvas) => !canvas)) return;
    const [trailCanvas, markCanvas, eventCanvas] = canvases as HTMLCanvasElement[];
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    for (const canvas of canvases as HTMLCanvasElement[]) {
      const box = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(box.width * ratio));
      canvas.height = Math.max(1, Math.round(box.height * ratio));
    }
    const trail = trailCanvas.getContext('2d');
    const mark = markCanvas.getContext('2d');
    const score = eventCanvas.getContext('2d');
    if (!trail || !mark || !score) return;
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
    const strokes = (from: number, to: number) => {
      const spans: [number, number][] = [];
      for (let start = from; start < to;) {
        const frame = lightFilmFrame((start + 1) * STRIDE, steps);
        let end = start + 1;
        while (end < to && lightFilmFrame((end + 1) * STRIDE, steps) === frame) end += 1;
        spans.push([start, end]);
        start = end;
      }
      trail.globalCompositeOperation = 'lighter';
      trail.lineWidth = ratio;
      trail.lineJoin = 'round';
      for (let body = 0; body < 3; body++) {
        trail.strokeStyle = `oklch(0.84 0.075 ${hues[body]} / 0.2)`;
        for (const [first, last] of spans) {
          trail.beginPath();
          trail.moveTo(x(first, body), y(first, body));
          for (let sample = first + 1; sample <= last; sample++)
            trail.lineTo(x(sample, body), y(sample, body));
          trail.stroke();
        }
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
      if (!moving) return;
      for (let body = 0; body < 3; body++) {
        const cx = x(sample, body);
        const cy = y(sample, body);
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
    const scoreAt = (step: number) => {
      score.clearRect(0, 0, scoreWidth, scoreHeight);
      score.drawImage(scoreStill, 0, 0);
      score.fillStyle = 'rgb(241 235 223 / 0.92)';
      score.fillRect(Math.round(at(step)), 0, ratio, lane);
    };

    trail.clearRect(0, 0, width, height);
    if (still || !inView) {
      const last = still ? count - 1 : drawn.current;
      if (last > 0) strokes(0, last);
      bodies(last, !still && last < count - 1);
      scoreAt(Math.min(steps - 1, last * STRIDE));
      if (still) drawn.current = count - 1;
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

  useEffect(() => draw(), [result, plane, still, inView, run]);

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
  };
  const comparisons = state.phase === 'derived' ? state.comparisons : null;
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
      : state.phase === 'derived'
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

  return (
    <section
      ref={section}
      className={styles.orbit}
      aria-labelledby="orbit-title"
      data-phase={state.phase}
      data-exact={comparisons ? String(differing.length === 0) : undefined}
    >
      <header className={styles.head}>
        <h2 id="orbit-title" className={styles.title}>
          {t.orbitTitle}
        </h2>
        <p className={styles.line}>{t.orbitLine}</p>
      </header>
      <figure className={styles.figure}>
        <div ref={stage} className={styles.stage}>
          <canvas ref={trails} className={styles.layer} aria-hidden="true" />
          <canvas ref={marks} className={styles.layer} aria-hidden="true" />
        </div>
        <figcaption className={styles.caption}>{description}</figcaption>
      </figure>
      <div className={styles.score}>
        <canvas ref={events} className={styles.events} aria-hidden="true" />
        <div className={styles.readoutRow}>
          <p className={styles.readout}>{(still ? null : readout) ?? progressLine}</p>
          {finished && !still && state.phase === 'derived' ? (
            <button
              type="button"
              className={styles.again}
              onClick={() => {
                drawn.current = 0;
                setDone(false);
                setReadout(null);
                setRun((value) => value + 1);
              }}
            >
              {t.again}
            </button>
          ) : null}
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
