'use client';
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import { containedIn, type Rect } from '@/lib/first-light/camera';
import { OVERTURE_KEY } from '@/lib/storage-keys';
import type { Engine } from './first-light-engine';
import { createEngine } from './first-light-engines';
import { perform, setTheStage, type ShowWork } from './first-light-show';
import { setOverturePhase, useOverturePhase } from './overture-store';
import { useMotion } from './motion-provider';
import { tokenMs } from './turn';
import styles from './first-light.module.css';

/** Input that ends the performance at once, besides the keys: the hand, the wheel, a scroll. */
const MOVES = ['pointerdown', 'touchstart', 'wheel', 'scroll'] as const;

/** Swallows the click a press makes, should it come within the press's own moment. */
function swallowClick() {
  const swallow = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  window.addEventListener('click', swallow, { capture: true, once: true });
  window.setTimeout(() => window.removeEventListener('click', swallow, true), 600);
}

const boxOf = (rect: DOMRect): Rect => ({
  x: rect.left,
  y: rect.top,
  width: rect.width,
  height: rect.height,
});

/**
 * First Light on the home (docs/first-light.md §4): the venue's one timed event, on a first visit.
 *
 * - The first paint (src/lib/room.ts) shows the day's plate as it always opens, with the running
 *   head and the strip held back. The plate is the page's Largest Contentful Paint.
 * - Over it, once the window is sampled and the engine ready, the light takes the plate's place:
 *   the picture opens into the orbit's own depth, runs back into three stars, dances on the
 *   Light film's clock and folds back onto the Light still where the plate lies.
 * - The light then gives the plate back. On a Light day that is the end; on an Ink day the plate
 *   crosses to Ink by the Overture's own slower crossing, in the order the ink came to rest
 *   (artwork-viewer.tsx). The head and strip arrive last.
 * - Any input ends it at once, on the page as it would have opened, and presses nothing beneath.
 *   So do a hidden tab, a new width, and pause or reduced motion asked for while it plays.
 */
export default function FirstLightOverture({
  work,
  skip,
  onEnd,
}: {
  work: ShowWork;
  skip: string;
  onEnd: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const light = useRef<HTMLCanvasElement>(null);
  /** Ends the performance at once, wherever it stands; set while it plays. */
  const interrupt = useRef<() => void>(() => {});
  const [skippable, setSkippable] = useState(false);
  const phase = useOverturePhase();
  const { paused, reducedMotion } = useMotion();
  const ended = useEffectEvent(() => onEnd());

  /* The performance itself, from the props it was mounted with: it is performed once. */
  const run = useEffectEvent((): (() => void) => {
    const html = document.documentElement;
    const canvas = light.current!;
    const overlay = root.current!;
    let stopShow = () => {};
    let wait = 0;
    /** Ended: by input, by a failure, or by nothing left to perform. */
    let over = false;
    /** The light has given the plate back: input now acts on the page as well as ending this. */
    let lifted = false;
    /** The light has the plate: the page beneath may now stand in Light unseen. */
    let playing = false;
    /** Taken down (a remount, the page left): whatever was on its way builds nothing. */
    let cancelled = false;
    let engine: Engine | null = null;
    const width0 = innerWidth;
    const waitMs = tokenMs(html, '--t-overture-wait', 4000);
    const listening = { capture: true, passive: true } as const;
    const stop = () => {
      stopShow();
      stopShow = () => {};
      clearTimeout(wait);
      for (const name of MOVES) window.removeEventListener(name, moved, listening);
      window.removeEventListener('keydown', keyed, { capture: true });
      window.removeEventListener('resize', resized);
      document.removeEventListener('visibilitychange', hidden);
      engine?.dispose();
      engine = null;
    };
    /** The page as it would have opened, at once: the plate in its opening, the head with it. */
    function interruptNow() {
      if (over) return;
      over = true;
      stop();
      canvas.style.opacity = '0';
      setOverturePhase('done');
      html.removeAttribute('data-overture');
      ended();
    }
    // While the light holds the plate, the input that ends it does nothing else: the press is not
    // also a press on what lay beneath, and the key is not also a key for the plate.
    function moved(event: Event) {
      if (!lifted && (event.type === 'pointerdown' || event.type === 'touchstart')) swallowClick();
      interruptNow();
    }
    function keyed(event: KeyboardEvent) {
      // Tab moves to the skip control; a modifier alone is not yet a key.
      if (event.key === 'Tab' || ['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return;
      if (!lifted) {
        event.preventDefault();
        event.stopPropagation();
      }
      interruptNow();
    }
    function hidden() {
      if (document.visibilityState === 'hidden') interruptNow();
    }
    // A phone's toolbar changes the height as it settles; a new width is a new layout.
    function resized() {
      if (innerWidth !== width0) interruptNow();
    }
    interrupt.current = interruptNow;

    // The home as the visitor meets it: its plate's art, at the top of the page.
    const art = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-presentation="home"] [data-layer] .art-media',
      ),
    ]
      .map((node) => boxOf(node.getBoundingClientRect()))
      .find((box) => box.width > 1 && box.height > 1);
    // Nothing to perform on, a page already moved, or a wait already over (globals.css, after
    // --t-overture-wait): the page stands as it would have opened.
    if (!art || window.scrollY > 0 || performance.now() >= waitMs) {
      interruptNow();
      return stop;
    }
    const still = containedIn(art, { width: work.frame.width, height: work.frame.height });
    overlay.dataset.still = `${Math.round(still.x)} ${Math.round(still.y)} ${Math.round(still.width)} ${Math.round(still.height)}`;

    /** The light has given the still back: the plate beneath stands in Light, and lands. */
    const land = () => {
      if (over) return;
      lifted = true;
      overlay.dataset.beat = 'landed';
      setSkippable(false);
      html.setAttribute('data-overture', 'landing');
      setOverturePhase('landing');
      stopShow = () => {};
      engine?.dispose();
      engine = null;
    };

    // The engine, the window and the still's colours; where they cannot be had in time, or
    // cannot be had at all, the page at once.
    wait = window.setTimeout(interruptNow, Math.max(0, waitMs - performance.now()));
    createEngine(canvas)
      .then((made) => {
        if (over || cancelled || !made) {
          made?.dispose();
          if (!made && !cancelled) interruptNow();
          return null;
        }
        engine = made;
        // From here the performance is this browser's: it is not offered again.
        try {
          localStorage.setItem(OVERTURE_KEY, 'seen');
        } catch {
          /* Storage is optional; the first paint stands aside when it cannot be read. */
        }
        return setTheStage(made, work).then((space) => ({ made, space }));
      })
      .then((ready) => {
        if (!ready) return;
        clearTimeout(wait);
        if (over || cancelled) return;
        setSkippable(true);
        stopShow = perform(ready.made, ready.space, work, {
          canvas,
          stage: () => ({ width: innerWidth, height: innerHeight }),
          still: () => still,
          onMoment: (moment) => {
            if (overlay.dataset.beat !== moment.beat) overlay.dataset.beat = moment.beat;
            // Once the light covers the plate, the plate may stand in Light beneath it unseen.
            if (!playing && moment.still === 0) {
              playing = true;
              html.setAttribute('data-overture', 'playing');
              setOverturePhase('playing');
            }
          },
          onDone: land,
        });
      })
      .catch(() => {
        if (!cancelled) interruptNow();
      });

    // Listening last, once nothing above can throw and leave a listener behind.
    for (const name of MOVES) window.addEventListener(name, moved, listening);
    window.addEventListener('keydown', keyed, { capture: true });
    window.addEventListener('resize', resized);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      cancelled = true;
      stop();
      // Taken down while it plays (the page left; or development, which mounts it again at
      // once): the page stands as it would have opened.
      if (!over) {
        setOverturePhase('done');
        if (html.getAttribute('data-overture') !== 'dawn') html.removeAttribute('data-overture');
      }
    };
  });
  useLayoutEffect(() => run(), []);

  // Pause or reduced motion asked for while it plays ends it, as any input does.
  const holdStill = useEffectEvent(() => interrupt.current());
  useEffect(() => {
    if (paused || reducedMotion) holdStill();
  }, [paused, reducedMotion]);

  // Landed: the head and the strip arrive last, over --t-dawn, and the event is over.
  useEffect(() => {
    if (phase !== 'done') return;
    const html = document.documentElement;
    if (html.getAttribute('data-overture') !== 'landing') return;
    html.setAttribute('data-overture', 'dawn');
    const timer = window.setTimeout(
      () => {
        html.removeAttribute('data-overture');
        ended();
      },
      tokenMs(html, '--t-dawn', 2000),
    );
    return () => {
      clearTimeout(timer);
      // Taken away mid-dawn, the head is let stand.
      if (html.getAttribute('data-overture') === 'dawn') html.removeAttribute('data-overture');
    };
  }, [phase]);

  return (
    <div ref={root} className={styles.overture} data-first-light="">
      <canvas ref={light} className={styles.overtureLight} aria-hidden="true" />
      {skippable ? (
        <button
          type="button"
          className={`${styles.control} ${styles.skip}`}
          onClick={() => interrupt.current()}
        >
          {skip}
        </button>
      ) : null}
    </div>
  );
}
