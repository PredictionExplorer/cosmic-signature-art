'use client';

import Link from 'next/link';
import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react';
import type { OrbitWindow } from '@/lib/physics/orbit';
import type { OrreryReply, OrreryRequest } from '@/lib/physics/orrery';
import { useMotion } from './motion-provider';
import { lendPlateTone, returnPlateTone } from './room-ground';
import styles from './orrery.module.css';

/** One work as the Orrery hangs it: its window to perform, and where its numeral leads. */
export interface OrreryWork {
  id: number;
  numeral: string;
  href: string;
  /** The link's accessible name. */
  label: string;
  window: OrbitWindow;
  hues: readonly [number, number, number];
  /** The publisher's 640 px Light still, shown when a visitor points at the work. */
  plate?: string;
}

export interface OrreryCycle {
  cycle: number;
  heading: string;
  works: OrreryWork[];
}

const noSubscription = () => () => {};
/** A worker that draws on canvases handed to it: the one way the Orrery performs. */
const canPerform = () =>
  typeof Worker !== 'undefined' &&
  typeof HTMLCanvasElement !== 'undefined' &&
  'transferControlToOffscreen' in HTMLCanvasElement.prototype;
/** Unknown until the client answers, so the server's markup commits to neither way. */
const unknownOnServer = () => null;
/** The canvases' pixels per CSS pixel, two at most; a move to another screen or a zoom changes it. */
const pixelRatio = () => Math.min(2, window.devicePixelRatio || 1);
const onePerPixel = () => 1;
function subscribeRatio(onChange: () => void) {
  if (typeof matchMedia !== 'function') return () => {};
  let query = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  const changed = () => {
    query.removeEventListener('change', changed);
    query = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    query.addEventListener('change', changed);
    onChange();
  };
  query.addEventListener('change', changed);
  return () => query.removeEventListener('change', changed);
}

/**
 * The Orrery: every work's orbit performed at once, hung by cycle, its numeral beneath. Each
 * cell is a canvas handed to one worker (src/lib/physics/orrery.worker.ts), which performs the
 * orbits in view at the Light film's pace and draws each whole, once, under a still preference.
 * Pointing at a work, or focusing it, shows its own Light still in the cell. A browser that
 * cannot hand canvases to a worker shows every work's Light still instead.
 */
export function Orrery({
  cycles,
  title,
  line,
  note,
  still,
  fallback,
}: {
  cycles: OrreryCycle[];
  title: string;
  line: string;
  note: string;
  still: string;
  fallback: string;
}) {
  const section = useRef<HTMLElement>(null);
  const worker = useRef<Worker | null>(null);
  const capable = useSyncExternalStore(noSubscription, canPerform, unknownOnServer);
  /** The worker could not draw (it failed, or a canvas would not give it a context). */
  const [failed, setFailed] = useState(false);
  const performing = capable === null ? null : capable && !failed;
  const ratio = useSyncExternalStore(subscribeRatio, pixelRatio, onePerPixel);
  const { paused, reducedMotion, theatre } = useMotion();
  const moving = !paused && !reducedMotion && theatre !== 'hushed';
  const movingNow = useEffectEvent(() => moving);
  /** Works whose Light still has been asked for: loaded on first approach, then kept. */
  const [shown, setShown] = useState<ReadonlySet<number>>(() => new Set());
  const show = (id: number) =>
    setShown((current) => (current.has(id) ? current : new Set(current).add(id)));

  // One worker for the page. Canvases are made here, not rendered, so a second run of the
  // effect (Strict Mode, a new list) hands the worker fresh ones rather than spent ones.
  useEffect(() => {
    const root = section.current;
    if (!performing || !root) return;
    const stages = new Map<number, HTMLElement>();
    for (const stage of root.querySelectorAll<HTMLElement>('[data-stage]'))
      stages.set(Number(stage.dataset.stage), stage);
    const thread = new Worker(new URL('../lib/physics/orrery.worker.ts', import.meta.url), {
      type: 'module',
    });
    const canvases: HTMLCanvasElement[] = [];
    const cells: Extract<OrreryRequest, { type: 'cells' }>['cells'] = [];
    for (const work of cycles.flatMap((cycle) => cycle.works)) {
      const stage = stages.get(work.id);
      if (!stage) continue;
      const box = stage.getBoundingClientRect();
      const canvas = document.createElement('canvas');
      canvas.className = styles.canvas;
      canvas.setAttribute('aria-hidden', 'true');
      canvas.width = Math.max(1, Math.round(box.width * ratio));
      canvas.height = Math.max(1, Math.round(box.height * ratio));
      stage.prepend(canvas);
      canvases.push(canvas);
      cells.push({
        id: work.id,
        canvas: canvas.transferControlToOffscreen(),
        window: work.window,
        hues: work.hues,
      });
    }
    const send = (message: OrreryRequest, transfer: Transferable[] = []) =>
      thread.postMessage(message, transfer);
    send(
      { type: 'cells', ratio, moving: movingNow(), cells },
      cells.map((cell) => cell.canvas),
    );
    thread.onmessage = ({ data }: MessageEvent<OrreryReply>) => {
      if (data.type === 'drawn') stages.get(data.id)?.setAttribute('data-drawn', '');
      else setFailed(true);
    };
    // A worker that fails has the canvases; every work's still stands in for them.
    thread.onerror = () => setFailed(true);
    /** Cells within reach of the viewport; a hidden page has none in view. */
    const near = new Map<number, boolean>();
    const view = (id: number) =>
      send({ type: 'visible', id, visible: !document.hidden && !!near.get(id) });
    // A little ahead of the viewport, so a cell scrolled to is already under way.
    const visibility = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = Number((entry.target as HTMLElement).dataset.stage);
          near.set(id, entry.isIntersecting);
          view(id);
        }
      },
      { rootMargin: '25% 0px' },
    );
    const shown = () => stages.forEach((_, id) => view(id));
    document.addEventListener('visibilitychange', shown);
    const sizes = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const id = Number((entry.target as HTMLElement).dataset.stage);
        const { width, height } = entry.contentRect;
        send({
          type: 'size',
          id,
          width: Math.max(1, Math.round(width * ratio)),
          height: Math.max(1, Math.round(height * ratio)),
        });
      }
    });
    for (const stage of stages.values()) {
      visibility.observe(stage);
      sizes.observe(stage);
    }
    worker.current = thread;
    return () => {
      visibility.disconnect();
      sizes.disconnect();
      document.removeEventListener('visibilitychange', shown);
      thread.terminate();
      worker.current = null;
      for (const canvas of canvases) canvas.remove();
      for (const stage of stages.values()) stage.removeAttribute('data-drawn');
    };
  }, [performing, cycles, ratio]);

  useEffect(() => {
    // Every cell begins again when motion changes: none stands drawn whole until it is again.
    for (const stage of section.current?.querySelectorAll('[data-drawn]') ?? [])
      stage.removeAttribute('data-drawn');
    worker.current?.postMessage({ type: 'moving', moving } satisfies OrreryRequest);
  }, [moving]);

  // The page is night from the top: while it stands beneath the running head, the head is too.
  useEffect(() => {
    const node = section.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const holder = {};
    const head = new IntersectionObserver(
      ([entry]) =>
        entry.isIntersecting ? lendPlateTone(holder, '#000000', 'night') : returnPlateTone(holder),
      // Two pixels down, so a section that only touches the top edge has left the head.
      { rootMargin: '-2px 0px -92% 0px' },
    );
    head.observe(node);
    return () => {
      head.disconnect();
      returnPlateTone(holder);
    };
  }, []);

  const mode = performing === null ? undefined : performing ? 'performing' : 'plates';
  return (
    <section ref={section} className={styles.orrery} data-mode={mode}>
      <header className={styles.head}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.line}>{line}</p>
      </header>
      <p className={styles.note}>{note}</p>
      <p className={styles.state} role="status">
        {performing === false ? fallback : performing && !moving ? still : ''}
      </p>
      {cycles.map((cycle) => (
        <section
          key={cycle.cycle}
          className={styles.cycle}
          aria-labelledby={`orrery-cycle-${cycle.cycle}`}
        >
          <h2 id={`orrery-cycle-${cycle.cycle}`} className={styles.heading}>
            {cycle.heading}
          </h2>
          <ol className={styles.cells}>
            {cycle.works.map((work) => (
              <li key={work.id} className={styles.cell}>
                <Link
                  className={styles.link}
                  href={work.href}
                  aria-label={work.label}
                  // A finger has no hover: a tap enters the work at once, rather than first
                  // changing the cell under it, which a touch browser would take as a hover.
                  onPointerEnter={(event) => {
                    if (event.pointerType !== 'touch') show(work.id);
                  }}
                  onFocus={() => show(work.id)}
                >
                  <span className={styles.stage} data-stage={work.id}>
                    {work.plate && (shown.has(work.id) || performing === false) ? (
                      // The publisher's own preview, shown as it is; it is never drawn on.
                      <img
                        className={styles.plate}
                        src={work.plate}
                        alt=""
                        width={640}
                        height={414}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : null}
                  </span>
                  <span className={styles.numeral} aria-hidden="true">
                    {work.numeral}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </section>
  );
}
