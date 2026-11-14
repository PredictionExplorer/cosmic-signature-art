'use client';
import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import { lensFor } from '@/lib/first-light/camera';
import {
  FLAT_HAND,
  isMoving,
  isTurned,
  nextHand,
  openingOf,
  shotInHand,
  turnOf,
  type Hand,
} from '@/lib/first-light/hand';
import { hexToLinear, inkBody, inkTrail, type Material } from '@/lib/first-light/material';
import { headAt, sculptureRadius, type PlateSpace } from '@/lib/first-light/samples';
import { flareAt } from '@/lib/first-light/timeline';
import type { Engine, InkPalette } from './first-light-engine';
import { decoded } from './decoded-image';
import { INK_BODY_RADIUS } from './orbit-picture';
import styles from './orbit-score.module.css';

/*
  The orbit in the hand (docs/first-light.md §14): the work page's orbit, turned in depth.

  The verified drawing on the plate stays the flat view. This canvas lies between the still and
  that drawing, and shows only as the orbit is turned. Its cover follows the turn, so the still and
  the drawing give way to the event in depth over the first twenty degrees, and come back as it
  lands. Let go, it springs back to the generator's view.

  It draws only while it is turned, held, or on its way back. At rest it is never drawn, and
  costs nothing.
*/

/** What the section asks of the orbit in the hand. */
export interface Sculpture {
  /** The moment the drawing stands at: the step of the window it is drawn to. */
  at(step: number): void;
  /** Back to the generator's view. */
  back(): void;
  /** The focus, given to the orbit: the page is not moved to it. */
  focus(): void;
}

/** Arrow keys: steps of yaw and pitch, as the hand turns it (drawn right, the near side follows). */
const TURNS: Record<string, readonly [number, number]> = {
  ArrowLeft: [1, 0],
  ArrowRight: [-1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** Ink's palette for these bodies on this sheet, or none where the sheet's tone is not known. */
export function inkPalette(tone: string | undefined, hues: readonly number[]): InkPalette | null {
  const paper = tone ? hexToLinear(tone) : null;
  if (!paper) return null;
  return {
    paper,
    trails: [inkTrail(hues[0]), inkTrail(hues[1]), inkTrail(hues[2])],
    bodies: [inkBody(hues[0]), inkBody(hues[1]), inkBody(hues[2])],
    bodyRadius: INK_BODY_RADIUS,
  };
}

export function OrbitSculpture({
  handle,
  stage,
  space,
  material,
  tone,
  colours,
  hues,
  closestStep,
  still,
  label,
  onReady,
  onTurned,
  onPlayPause,
}: {
  /** Where the section reaches the sculpture. */
  handle: RefObject<Sculpture | null>;
  /** The stage it lies on, which carries its cover to the drawing above it. */
  stage: RefObject<HTMLDivElement | null>;
  /** The derived window in depth, from the section's own worker. */
  space: PlateSpace;
  material: Material;
  /** The sheet's tone, for ink. */
  tone?: string;
  /** A small rung of the Light still, whose light colours the trails. */
  colours?: string;
  hues: readonly number[];
  closestStep: number;
  /** Reduced motion, the visitor's pause, the hush: the orbit returns without moving to get there. */
  still: boolean;
  label: string;
  onReady: (ready: boolean) => void;
  onTurned: (turned: boolean) => void;
  onPlayPause: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);
  const hand = useRef<Hand>(FLAT_HAND);
  const step = useRef(space.steps[space.count - 1]);
  const frame = useRef(0);
  const turned = useRef(false);
  const pointer = useRef<number | null>(null);
  const size = useRef({ width: 0, height: 0, ratio: 0 });
  const [ready, setReady] = useState(false);
  const radius = sculptureRadius(space);
  const peak = headAt(space, closestStep) / Math.max(1, space.count - 1);

  // The engine, once the window in depth is here: light coloured by the still, or ink on the sheet.
  useEffect(() => {
    const node = canvas.current;
    const host = stage.current;
    if (!node || typeof WebGL2RenderingContext === 'undefined') return;
    let cancelled = false;
    let made: Engine | null = null;
    const ink = material === 'ink' ? inkPalette(tone, hues) : undefined;
    if (ink === null || (material === 'light' && !colours)) return;
    const begin = async () => {
      const [{ createEngine }, image] = await Promise.all([
        import('./first-light-engines'),
        colours && !ink ? decoded(colours) : Promise.resolve(undefined),
      ]);
      if (cancelled) return;
      made = await createEngine(node, ink);
      if (!made) return;
      if (cancelled) {
        made.dispose();
        return;
      }
      made.setScene(space, image);
      engine.current = made;
      setReady(true);
    };
    begin().catch((failure) => console.warn('The orbit cannot be turned here:', failure));
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame.current);
      made?.dispose();
      engine.current = null;
      // The drawing above comes back whole however the orbit was left.
      host?.style.removeProperty('--cover');
    };
  }, [space, material, tone, colours, hues, stage]);

  const reportReady = useEffectEvent((value: boolean) => onReady(value));
  useEffect(() => reportReady(ready), [ready]);
  // Said through an event of its own, so the frame loop is not set up afresh (and the frame it
  // was waiting for lost) each time the section hands down another function.
  const reportTurned = useEffectEvent((value: boolean) => onTurned(value));
  // Taken off the stage while it is turned, it says it is turned no longer: whatever stands here
  // next begins at the generator's view, and the section is not to go on offering the way back.
  useEffect(
    () => () => {
      if (!turned.current) return;
      turned.current = false;
      reportTurned(false);
    },
    [],
  );

  // The frame loop, set up afresh whenever what it draws with changes. Each frame reads the hand's
  // turn, sets the cover it gives, and draws the event in depth if any of it shows. It asks for
  // the next frame only while the hand is waiting for a hold or on its way back.
  const driver = useRef<{ request(): void } | null>(null);
  useEffect(() => {
    const request = () => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(paint);
    };
    const paint = (now: number) => {
      const made = engine.current;
      const node = canvas.current;
      if (!made || !node) return;
      hand.current = nextHand(hand.current, { kind: 'tick', at: now }, still);
      // A finger that has held long enough takes the orbit, and the page stops scrolling under it.
      if (
        hand.current.kind === 'held' &&
        pointer.current !== null &&
        !node.hasPointerCapture?.(pointer.current)
      )
        node.setPointerCapture?.(pointer.current);
      const turn = turnOf(hand.current, now);
      const cover = made.lost ? 0 : openingOf(turn);
      stage.current?.style.setProperty('--cover', String(cover));
      const nowTurned = isTurned(hand.current);
      node.dataset.view = nowTurned ? 'turned' : 'flat';
      if (nowTurned !== turned.current) {
        turned.current = nowTurned;
        reportTurned(nowTurned);
      }
      if (cover > 0 && !made.lost) {
        const width = node.clientWidth;
        const height = node.clientHeight;
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        const last = size.current;
        if (last.width !== width || last.height !== height || last.ratio !== ratio) {
          made.resize(width, height, ratio);
          size.current = { width, height, ratio };
        }
        const shot = shotInHand(turn);
        const drawn = headAt(space, step.current) / Math.max(1, space.count - 1);
        made.draw({
          lens: lensFor(shot, { width, height }, space, radius, 0.35, space.centre),
          drift: shot.drift,
          drawn,
          heads: 1,
          flare: material === 'light' ? flareAt(drawn, peak) : 0,
        });
      }
      if (isMoving(hand.current)) request();
    };
    driver.current = { request };
    return () => {
      cancelAnimationFrame(frame.current);
      driver.current = null;
    };
  }, [still, material, space, stage, radius, peak]);
  const request = () => driver.current?.request();

  useImperativeHandle(
    handle,
    () => ({
      at(next) {
        step.current = next;
        if (turned.current) driver.current?.request();
      },
      back() {
        hand.current = nextHand(hand.current, { kind: 'back', at: performance.now() }, still);
        driver.current?.request();
      },
      focus() {
        canvas.current?.focus({ preventScroll: true });
      },
    }),
    [still],
  );

  // Once a finger holds the orbit, the page beneath it must not scroll: touch-action cannot change
  // mid-gesture, so its moves are held back here.
  //
  // A finger that lands while the page is still coasting from a swipe stops the page, and that
  // touch is the page's: the browser says so (its touchstart cannot be cancelled, nor can its
  // first move, and asking logs an error). The hand does not take such a touch, however long it
  // rests: the finger lifts, and holds again.
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const begin = (event: TouchEvent) => {
      if (event.cancelable || hand.current.kind !== 'pressing') return;
      hand.current = hand.current.under;
      pointer.current = null;
    };
    const hold = (event: TouchEvent) => {
      if (hand.current.kind === 'held' && event.cancelable) event.preventDefault();
    };
    node.addEventListener('touchstart', begin, { passive: true });
    node.addEventListener('touchmove', hold, { passive: false });
    return () => {
      node.removeEventListener('touchstart', begin);
      node.removeEventListener('touchmove', hold);
    };
  }, []);

  const grab = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!ready || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const touch = event.pointerType === 'touch';
    pointer.current = event.pointerId;
    hand.current = nextHand(
      hand.current,
      { kind: 'grab', x: event.clientX, y: event.clientY, at: performance.now(), touch },
      still,
    );
    if (!touch) event.currentTarget.setPointerCapture?.(event.pointerId);
    request();
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
      still,
    );
    // A finger that travelled before the hold is scrolling the page: let it go.
    if (kind === 'pressing' && hand.current.kind !== 'pressing') pointer.current = null;
    request();
  };
  const release = (event: PointerEvent<HTMLCanvasElement>) => {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null;
    hand.current = nextHand(hand.current, { kind: 'release', at: performance.now() }, still);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    request();
  };
  const key = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (!ready || event.altKey || event.metaKey || event.ctrlKey) return;
    const turn = TURNS[event.key];
    if (turn) {
      event.preventDefault();
      const scale = event.shiftKey ? 3 : 1;
      hand.current = nextHand(hand.current, {
        kind: 'key',
        yaw: turn[0] * scale,
        pitch: turn[1] * scale,
        at: performance.now(),
      });
      request();
      return;
    }
    if ((event.key === 'Escape' || event.key === 'Home') && isTurned(hand.current)) {
      event.preventDefault();
      event.stopPropagation();
      hand.current = nextHand(hand.current, { kind: 'back', at: performance.now() }, still);
      request();
      return;
    }
    if (event.key === ' ') {
      event.preventDefault();
      onPlayPause();
    }
  };

  return (
    <canvas
      ref={canvas}
      className={styles.light}
      data-layer="light"
      data-turns={ready ? 'true' : 'false'}
      data-view="flat"
      tabIndex={ready ? 0 : -1}
      role={ready ? 'img' : undefined}
      aria-label={ready ? label : undefined}
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
  );
}
