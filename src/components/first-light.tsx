'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Size } from '@/lib/first-light/camera';
import type { PlateSpace } from '@/lib/first-light/samples';
import { DURATION } from '@/lib/first-light/timeline';
import type { Engine } from './first-light-engine';
import { createEngine } from './first-light-engines';
import { motionWelcome, perform, setTheStage, type ShowWork } from './first-light-show';
import styles from './first-light.module.css';

/** One work as First Light performs it: its still, and the window and frame that made it. */
export interface FirstLightWork extends ShowWork {
  id: number;
  /** "№ 031". */
  label: string;
  /** The still's text alternative. */
  alt: string;
  href: string;
}

export interface FirstLightWords {
  skip: string;
  watch: string;
  again: string;
  computed: string;
}

/**
 * Where the performance stands:
 * - resting: the still alone, before anything has begun;
 * - preparing: the orbit is sampled and the engine readied while the still is on view;
 * - playing: the light performs over the still;
 * - ended: the still again, with the line that says what was seen;
 * - invited: motion is not welcome, so nothing plays until asked;
 * - unavailable: this browser cannot draw it, and the still simply stays.
 */
type State = 'resting' | 'preparing' | 'playing' | 'ended' | 'invited' | 'unavailable';

/** The still holds the stage at least this long before its picture opens. */
const HOLD_MS = 900;
/** Past this, the still stays: First Light is never a loading screen. */
const PATIENCE_MS = 6000;
/** Input that ends the performance at once, besides the keys. */
const MOVES = ['pointerdown', 'wheel', 'touchstart'] as const;

export function FirstLight({ work, words }: { work: FirstLightWork; words: FirstLightWords }) {
  const stageRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const spaceRef = useRef<PlateSpace | null>(null);
  /** Stops the show where it stands. */
  const stopRef = useRef<() => void>(() => {});
  const focusSkip = useRef(false);
  /** Asked for before the orbit was ready: it plays the moment it is. */
  const wanted = useRef(false);
  const [state, setState] = useState<State>('resting');

  const sizeOf = useCallback((): Size => {
    const stage = stageRef.current;
    return { width: stage?.clientWidth || 1, height: stage?.clientHeight || 1 };
  }, []);

  const finish = useCallback(() => {
    stopRef.current();
    stopRef.current = () => {};
    if (canvasRef.current) canvasRef.current.style.opacity = '0';
    setState((current) => (current === 'playing' ? 'ended' : current));
  }, []);

  const play = useCallback(() => {
    const engine = engineRef.current;
    const space = spaceRef.current;
    const canvas = canvasRef.current;
    if (!engine || !space || !canvas || engine.lost) {
      setState('unavailable');
      return;
    }
    stopRef.current = perform(engine, space, work, { canvas, stage: sizeOf, onDone: finish });
    setState('playing');
  }, [finish, sizeOf, work]);

  // Prepare once: the orbit off the main thread, the still's colours, the engine. Then, unless
  // motion is unwelcome, open the picture once the still has held the stage a moment.
  useEffect(() => {
    let cancelled = false;
    let engine: Engine | null = null;
    const painted = performance.now();
    const welcome = motionWelcome();
    const canvas = canvasRef.current;
    const patience = window.setTimeout(() => {
      if (!cancelled && !spaceRef.current) setState('unavailable');
    }, PATIENCE_MS);
    (canvas ? createEngine(canvas) : Promise.resolve(null))
      .then((made) => {
        if (cancelled) {
          made?.dispose();
          return null;
        }
        if (!made) {
          setState('unavailable');
          return null;
        }
        engine = made;
        engineRef.current = made;
        setState(welcome ? 'preparing' : 'invited');
        return setTheStage(made, work);
      })
      .then((space) => {
        if (cancelled || !space) return;
        spaceRef.current = space;
        window.clearTimeout(patience);
        if (!welcome && !wanted.current) return;
        const wait = welcome ? Math.max(0, HOLD_MS - (performance.now() - painted)) : 0;
        window.setTimeout(() => {
          if (cancelled) return;
          if (document.visibilityState === 'visible') play();
          else setState('ended');
        }, wait);
      })
      .catch(() => {
        if (!cancelled) setState('unavailable');
      });
    return () => {
      cancelled = true;
      window.clearTimeout(patience);
      stopRef.current();
      engine?.dispose();
      engineRef.current = null;
      spaceRef.current = null;
    };
    // One work per mount: the page gives each work its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [work.id]);

  // While it plays, any input ends it at once, on the still; so does leaving the tab. The rules
  // arrive in the same commit as the skip control, as on the home, so nothing slips between them.
  useLayoutEffect(() => {
    if (state !== 'playing') return;
    const end = (event: Event) => {
      // The skip control's own click ends it too; a modifier alone does not.
      if (event instanceof KeyboardEvent && ['Shift', 'Control', 'Alt', 'Meta'].includes(event.key))
        return;
      finish();
    };
    const hidden = () => {
      if (document.visibilityState === 'hidden') finish();
    };
    for (const name of MOVES) window.addEventListener(name, end, { passive: true });
    window.addEventListener('keydown', end);
    document.addEventListener('visibilitychange', hidden);
    if (focusSkip.current) skipRef.current?.focus({ preventScroll: true });
    return () => {
      for (const name of MOVES) window.removeEventListener(name, end);
      window.removeEventListener('keydown', end);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [state, finish]);

  const replay = (event: React.MouseEvent) => {
    // A press by keyboard (no pointer clicks) keeps the keyboard's place on the skip control.
    focusSkip.current = event.detail === 0;
    if (engineRef.current && spaceRef.current) play();
    else wanted.current = true;
  };

  const finest = work.rungs[work.rungs.length - 1];
  return (
    <section
      ref={stageRef}
      className={styles.stage}
      data-state={state}
      data-duration={DURATION}
      aria-label={work.label}
    >
      <img
        className={styles.still}
        src={finest?.src}
        srcSet={work.rungs.map((rung) => `${rung.src} ${rung.width}w`).join(', ')}
        sizes="100vw"
        width={work.frame.width}
        height={work.frame.height}
        alt={work.alt}
        fetchPriority="high"
        decoding="async"
      />
      <canvas ref={canvasRef} className={styles.light} aria-hidden="true" />
      <div className={styles.foot}>
        <p className={styles.caption}>
          <Link className={`word-link ${styles.work}`} href={work.href}>
            {work.label}
          </Link>
          {state === 'ended' ? <span className={styles.line}>{words.computed}</span> : null}
        </p>
        {state === 'playing' ? (
          <button ref={skipRef} type="button" className={styles.control} onClick={finish}>
            {words.skip}
          </button>
        ) : state === 'invited' || state === 'ended' ? (
          <button type="button" className={styles.control} onClick={replay}>
            {state === 'invited' ? words.watch : words.again}
          </button>
        ) : null}
      </div>
    </section>
  );
}
