'use client';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import type { Locale } from '@/lib/i18n/routing';
import type { ChoiceFieldWords } from './choice-field.words';
import { fill } from '@/lib/i18n/format';
import type { OrbitGeneration } from '@/lib/physics/orbit';
import type { Beginnings, BeginningsChunk, QUICK_GATE } from '@/lib/physics/beginnings';
import type { BeginningsReply, BeginningsRequest } from '@/lib/physics/beginnings.worker';
import { useMotion } from './motion-provider';
import styles from './choice-field.module.css';

const MINUS = '−';
/** The progress line speaks at most four times a second. */
const SPEAK_EVERY_MS = 250;
/** The light's colour: the night's type, #f1ebdf. */
const LIGHT = [241, 235, 223] as const;
/** Light a beginning lays on each pixel it covers, in halves: one the gate set aside gives half. */
const KEPT = 2;
const SET_ASIDE = 1;
/** Light beyond this many halves on one pixel is as bright as the field gets. */
const TONES = 4_096;

/** Each scale's first and last decade, as powers of ten. */
interface Scales {
  energy: readonly [number, number];
  momentum: readonly [number, number];
}
/**
 * Four decades each way: −E and L from 100 to 1,000,000. Every beginning of every work in the
 * collection falls inside (−E from 328 to 327,994, L from 118 to 357,970); one that did not
 * would widen its scale by whole decades and the field would be drawn again.
 */
const OPENING: Scales = { energy: [2, 6], momentum: [2, 6] };

type Derivation =
  | { phase: 'deriving'; done: number }
  | { phase: 'derived'; result: Beginnings; seconds: number }
  | { phase: 'failed' };
type State = { phase: 'waiting' } | Derivation;

/** The beginnings received so far, in the generator's order, and how many are drawn. */
interface Field {
  energies: Float64Array;
  momenta: Float64Array;
  passed: Uint8Array;
  received: number;
  drawn: number;
  scales: Scales;
  exposure: Exposure | null;
}

/**
 * The field as an exposure: the light fallen on each pixel of the canvas, and the picture it
 * makes. Each beginning lays a square of light about a pixel and a half wide; the picture's
 * brightness rises with the logarithm of the light, so a lone beginning reads as a faint grain
 * and the crowded core keeps its shape instead of burning out.
 */
interface Exposure {
  width: number;
  height: number;
  /** The side of a beginning's square, in canvas pixels. */
  size: number;
  light: Uint32Array;
  image: ImageData;
  /** Opacity of the light's colour for each amount of light, in halves of a beginning. */
  tone: Uint8ClampedArray;
}

/**
 * An exposure for a canvas of this size. It is set by all the light the field will receive, the
 * beginnings of the attempt times the pixels each covers, spread over the canvas, so it never
 * changes while the light arrives, and a phone and a desk show the same picture.
 */
function expose(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  ratio: number,
  beginnings: number,
): Exposure {
  const size = Math.max(1, Math.round(1.5 * ratio));
  const mean = (beginnings * size * size) / (width * height);
  const full = Math.log1p(Math.max(8, 48 * mean));
  const tone = new Uint8ClampedArray(TONES);
  for (let halves = 0; halves < TONES; halves++)
    tone[halves] = Math.round(255 * Math.min(1, (Math.log1p(halves / KEPT) / full) ** 0.8));
  const image = context.createImageData(width, height);
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = LIGHT[0];
    image.data[i + 1] = LIGHT[1];
    image.data[i + 2] = LIGHT[2];
  }
  return { width, height, size, light: new Uint32Array(width * height), image, tone };
}

/** The worker is a module of its own; tests replace the global Worker. */
function beginningsWorker(): Worker {
  return new Worker(new URL('../lib/physics/beginnings.worker.ts', import.meta.url), {
    type: 'module',
  });
}

/**
 * Where a value falls along a logarithmic scale, from 0 at its first decade to 1 at its last.
 * A value no logarithm can place, an energy of zero or above, sits at the scale's start; no
 * beginning in the collection has one.
 */
function along(value: number, [first, last]: readonly [number, number]) {
  const decade = Math.log10(value);
  return Number.isFinite(decade) ? (decade - first) / (last - first) : 0;
}

/** The scales widened by whole decades to hold every beginning of a chunk; null if they do. */
function widened(scales: Scales, chunk: BeginningsChunk): Scales | null {
  let [e0, e1] = scales.energy;
  let [l0, l1] = scales.momentum;
  for (let k = 0; k < chunk.passed.length; k++) {
    const e = Math.log10(-chunk.energies[k]);
    const l = Math.log10(chunk.momenta[k]);
    if (Number.isFinite(e)) {
      e0 = Math.min(e0, Math.floor(e));
      e1 = Math.max(e1, Math.ceil(e));
    }
    if (Number.isFinite(l)) {
      l0 = Math.min(l0, Math.floor(l));
      l1 = Math.max(l1, Math.ceil(l));
    }
  }
  const same =
    e0 === scales.energy[0] &&
    e1 === scales.energy[1] &&
    l0 === scales.momentum[0] &&
    l1 === scales.momentum[1];
  return same ? null : { energy: [e0, e1], momentum: [l0, l1] };
}

const decades = ([first, last]: readonly [number, number]) =>
  Array.from({ length: last - first + 1 }, (_, k) => first + k);

/**
 * The choice: every beginning the studio drew for the day's work, derived from its seed in this
 * browser and set as a field of light, total energy across and angular momentum upward, with
 * the chosen beginning ringed. Each beginning adds its light as the worker measures it, unless
 * motion is unwelcome: then the field is drawn once, whole. The studio's search beyond the
 * quick gate cannot run here, and the caption says so, with the counts this browser computed.
 */
export function ChoiceField({
  generation,
  gate,
  t,
  locale,
}: {
  generation: OrbitGeneration;
  /** The quick gate the worker measures every beginning against (QUICK_GATE). */
  gate: typeof QUICK_GATE;
  t: ChoiceFieldWords;
  locale: Locale;
}) {
  const figure = useRef<HTMLElement>(null);
  const plot = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const field = useRef<Field | null>(null);
  const [derivation, setDerivation] = useState<Derivation>({ phase: 'deriving', done: 0 });
  const [near, setNear] = useState(false);
  const [scales, setScales] = useState<Scales>(OPENING);
  const [chosen, setChosen] = useState<{ energy: number; momentum: number } | null>(null);
  const { paused, reducedMotion, theatre } = useMotion();
  const still = paused || reducedMotion || theatre === 'hushed';
  // Nothing is derived before the figure is near, which is never on the server.
  const state: State = !near
    ? { phase: 'waiting' }
    : typeof Worker === 'undefined'
      ? { phase: 'failed' }
      : derivation;
  // Light is added as it is derived; without motion it waits to be drawn once, at the end.
  const drawing = !still || state.phase === 'derived';
  const total = generation.candidatesPerAttempt;
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const oneDecimal = useMemo(
    () => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    [locale],
  );

  // Derive when the figure is a screen away.
  useEffect(() => {
    const node = figure.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      queueMicrotask(() => setNear(true));
      return;
    }
    const approach = new IntersectionObserver(([entry]) => entry.isIntersecting && setNear(true), {
      rootMargin: '100% 0px',
    });
    approach.observe(node);
    return () => approach.disconnect();
  }, []);

  /**
   * Fit the canvas to its box at the display's ratio and add the light of every beginning
   * received but not yet drawn. A new size, or `again`, clears the exposure and draws all of
   * them anew. Light adds, so the field is the same picture however the beginnings arrive.
   */
  const draw = useEffectEvent((again: boolean) => {
    const store = field.current;
    const surface = canvas.current;
    const context = surface?.getContext('2d');
    if (!store || !surface || !context) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const box = surface.getBoundingClientRect();
    const width = Math.max(1, Math.round(box.width * ratio));
    const height = Math.max(1, Math.round(box.height * ratio));
    const shown = store.drawn;
    let exposure = store.exposure;
    let whole = again;
    if (!exposure || exposure.width !== width || exposure.height !== height) {
      surface.width = width;
      surface.height = height;
      exposure = store.exposure = expose(context, width, height, ratio, store.passed.length);
      store.drawn = 0;
      whole = true;
    } else if (again) {
      exposure.light.fill(0);
      for (let i = 3; i < exposure.image.data.length; i += 4) exposure.image.data[i] = 0;
      store.drawn = 0;
    }
    const from = store.drawn;
    const to = drawing ? store.received : shown;
    const { size, light, tone } = exposure;
    const pixels = exposure.image.data;
    // Only the rectangle the new light fell in goes back to the canvas.
    let left = width;
    let top = height;
    let right = 0;
    let bottom = 0;
    for (let i = from; i < to; i++) {
      const x = along(-store.energies[i], store.scales.energy) * width;
      const y = (1 - along(store.momenta[i], store.scales.momentum)) * height;
      // A square wholly inside the canvas: a beginning on an edge lies along it.
      const x0 = Math.min(Math.max(0, width - size), Math.max(0, Math.round(x - size / 2)));
      const y0 = Math.min(Math.max(0, height - size), Math.max(0, Math.round(y - size / 2)));
      const x1 = Math.min(width, x0 + size);
      const y1 = Math.min(height, y0 + size);
      const amount = store.passed[i] ? KEPT : SET_ASIDE;
      for (let row = y0; row < y1; row++)
        for (let column = x0; column < x1; column++) {
          const pixel = row * width + column;
          light[pixel] += amount;
          pixels[pixel * 4 + 3] = tone[Math.min(TONES - 1, light[pixel])];
        }
      left = Math.min(left, x0);
      top = Math.min(top, y0);
      right = Math.max(right, x1);
      bottom = Math.max(bottom, y1);
    }
    store.drawn = to;
    if (whole) context.putImageData(exposure.image, 0, 0);
    else if (right > left)
      context.putImageData(exposure.image, 0, 0, left, top, right - left, bottom - top);
  });

  /** A chunk from the worker: kept, measured against the scales, and drawn if light is wanted. */
  const receive = useEffectEvent((chunk: BeginningsChunk) => {
    const store = field.current;
    if (!store) return;
    store.energies.set(chunk.energies, chunk.start);
    store.momenta.set(chunk.momenta, chunk.start);
    store.passed.set(chunk.passed, chunk.start);
    store.received = chunk.start + chunk.passed.length;
    const wider = widened(store.scales, chunk);
    if (wider) store.scales = wider;
    if (wider || chunk.start === 0) setScales(store.scales);
    const index = generation.selectedIndex - chunk.start;
    if (index >= 0 && index < chunk.passed.length)
      setChosen({ energy: chunk.energies[index], momentum: chunk.momenta[index] });
    draw(!!wider || chunk.start === 0);
  });

  useEffect(() => {
    if (!near || typeof Worker === 'undefined') return;
    let worker: Worker;
    try {
      worker = beginningsWorker();
    } catch {
      queueMicrotask(() => setDerivation({ phase: 'failed' }));
      return;
    }
    field.current = {
      energies: new Float64Array(generation.candidatesPerAttempt),
      momenta: new Float64Array(generation.candidatesPerAttempt),
      passed: new Uint8Array(generation.candidatesPerAttempt),
      received: 0,
      drawn: 0,
      scales: OPENING,
      exposure: null,
    };
    let spoken = -Infinity;
    worker.onmessage = ({ data }: MessageEvent<BeginningsReply>) => {
      if (data.type === 'chunk') {
        receive(data.chunk);
        const now = performance.now();
        if (now - spoken >= SPEAK_EVERY_MS) {
          spoken = now;
          setDerivation({ phase: 'deriving', done: data.progress.done });
        }
      } else if (data.type === 'done') {
        setDerivation({ phase: 'derived', result: data.result, seconds: data.seconds });
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
    const request: BeginningsRequest = { generation };
    worker.postMessage(request);
    return () => worker.terminate();
  }, [near, generation]);

  // The light held back while motion was unwelcome is drawn once it is wanted.
  useEffect(() => draw(false), [drawing]);

  useEffect(() => {
    const node = plot.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => draw(false));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const energyTicks = decades(scales.energy);
  const momentumTicks = decades(scales.momentum);
  const at = (decade: number, [first, last]: readonly [number, number]) =>
    `${((decade - first) / (last - first)) * 100}%`;
  const edge = (decade: number, [first, last]: readonly [number, number]) =>
    decade === first ? 'start' : decade === last ? 'end' : undefined;
  const ring =
    chosen && drawing && state.phase !== 'failed'
      ? {
          x: along(-chosen.energy, scales.energy),
          y: along(chosen.momentum, scales.momentum),
        }
      : null;

  const progressLine =
    state.phase === 'waiting'
      ? fill(t.choiceFieldWaiting, { total: number.format(total) })
      : state.phase === 'deriving'
        ? fill(t.choiceFieldProgress, {
            done: number.format(state.done),
            total: number.format(total),
          })
        : state.phase === 'derived'
          ? fill(t.choiceFieldDerived, {
              total: number.format(state.result.count),
              seconds: oneDecimal.format(state.seconds),
            })
          : t.choiceFieldUnavailable;
  // Up to a warm-up and a recorded window for each beginning the gate kept: the studio's search.
  const stepsEach = generation.warmupSteps + generation.steps;
  const summaryOf = (count: number, passed: number, massesExact: boolean) =>
    fill(t.choiceFieldSummary, {
      gate:
        passed === count
          ? fill(t.choiceFieldAllPassed, {
              total: number.format(count),
              energy: number.format(gate.maxEnergy),
              momentum: number.format(gate.minAngularMomentum),
            })
          : fill(t.choiceFieldSomePassed, {
              total: number.format(count),
              passed: number.format(passed),
              failed: number.format(count - passed),
              energy: number.format(gate.maxEnergy),
              momentum: number.format(gate.minAngularMomentum),
            }),
      search: fill(t.choiceFieldSearch, {
        steps: number.format(stepsEach),
        search: number.format(passed * stepsEach),
        index: number.format(generation.selectedIndex),
      }),
      masses: massesExact ? t.choiceFieldMassesExact : t.choiceFieldMassesDiffer,
    });
  const result = state.phase === 'derived' ? state.result : null;
  const summary = result ? summaryOf(result.count, result.passed, result.chosen.massesExact) : null;

  return (
    <figure
      ref={figure}
      className={styles.field}
      data-phase={state.phase}
      data-passed={result ? result.passed : undefined}
    >
      <div className={styles.chart} aria-hidden="true">
        <span className={styles.momentumTitle}>{t.orbitMomentum}</span>
        <div className={styles.momentumScale}>
          {/* The widest label, unseen, holds the scale's column open for the placed ones. */}
          <span className={styles.sizer}>{number.format(10 ** scales.momentum[1])}</span>
          {momentumTicks.map((decade) => (
            <span
              key={decade}
              className={styles.momentumTick}
              style={{ bottom: at(decade, scales.momentum) }}
            >
              {number.format(10 ** decade)}
            </span>
          ))}
        </div>
        <div ref={plot} className={styles.plot}>
          <canvas ref={canvas} className={styles.canvas} />
          {ring ? (
            <>
              <span
                className={styles.ring}
                style={{ left: `${ring.x * 100}%`, bottom: `${ring.y * 100}%` }}
              />
              <span
                className={styles.chosen}
                data-side={ring.x > 0.55 ? 'before' : 'after'}
                style={{ left: `${ring.x * 100}%`, bottom: `${ring.y * 100}%` }}
              >
                № {number.format(generation.selectedIndex)}
              </span>
            </>
          ) : null}
        </div>
        <div className={styles.energyScale}>
          {energyTicks.map((decade, k) => (
            <span
              key={decade}
              className={styles.energyTick}
              style={{ left: at(decade, scales.energy) }}
              data-edge={edge(decade, scales.energy)}
              data-between={k % 2 === 1 ? '' : undefined}
            >
              {MINUS}
              {number.format(10 ** decade)}
            </span>
          ))}
        </div>
        <span className={styles.energyTitle}>{t.orbitEnergy}</span>
      </div>
      {/* Busy while the beginnings arrive, so a screen reader speaks the outcome, not each count. */}
      <p className={styles.progress} role="status" aria-busy={state.phase === 'deriving'}>
        {progressLine}
      </p>
      <figcaption className={styles.caption}>
        {fill(t.choiceFieldCaption, { total: number.format(total) })}
        {/* The summary's room is kept from the start, in every language and width, by the
            summary as it reads when every beginning passes, unseen beneath the one computed. */}
        <span className={styles.summary}>
          <span className={styles.room} aria-hidden="true">
            {summaryOf(total, total, true)}
          </span>
          <span data-summary>{summary}</span>
        </span>
      </figcaption>
    </figure>
  );
}
