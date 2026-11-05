'use client';
import {
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import type { Room } from '@/lib/room';
import type { Expression } from '@/lib/art/types';
import { SEAM_EVENT } from '@/lib/venue-events';
import { lendPlateTone, overrideRoom, returnPlateTone } from './room-ground';
import { useOpenSheet } from './sheets-store';
import styles from './wing.module.css';

export type WingMode = 'scroll' | 'hard';

/** The ground each expression hangs on: Ink on paper, Light on night. */
export function groundOf(expression: string): Room {
  return expression === 'light' ? 'night' : 'paper';
}

/**
 * The wing: the second screen of an art page, reached by the hand, where the plate's twin
 * hangs. Under an Ink plate it is the night wing, and the hand draws the night over the plate
 * from the right; under a Light plate it is the paper wing, and the hand draws the paper back
 * from the left, as Ink always returns (third-physics-phase-d.md §2). The twin is the page's
 * from its opening, so a Turn on the plate never reverses the wing under the hand.
 *
 * In `scroll` mode the section is two screens tall with a sticky stage, and the scroll draws
 * the twin over the plate through a scroll-driven animation of `--seam-scroll`, where the
 * browser provides one. Everywhere else (no `animation-timeline`, reduced motion, Pause, a
 * hushed theatre) the boundary is a hard material edge: a second screen on the twin's ground
 * with the twin's plate. The word in the strip performs the Turn by time in either mode.
 */
export function Wing({
  mode,
  expression,
  twin,
  wingRef,
  fallbackRef,
  fallback,
  children,
}: {
  mode: WingMode;
  expression: string;
  /** The expression the wing hangs: the twin of the one the page opened on. */
  twin: Expression;
  wingRef: RefObject<HTMLElement | null>;
  fallbackRef: RefObject<HTMLDivElement | null>;
  /** The second screen of the hard-edge path. */
  fallback: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      ref={wingRef}
      className={styles.wing}
      data-mode={mode}
      data-expression={expression}
      data-twin={twin}
      data-wing={groundOf(twin)}
    >
      <div className={styles.stage}>{children}</div>
      <div ref={fallbackRef} className={styles.fallback} data-ground={groundOf(twin)}>
        {fallback}
      </div>
    </section>
  );
}

export function scrollTimelinesSupported(): boolean {
  return (
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('animation-timeline: view()')
  );
}

/** How far the hand has drawn the twin across a two-screen wing: 0 at its top, 1 at its end. */
export function wingProgress(rect: DOMRect, stageHeight: number, head: number): number {
  const travel = rect.height - stageHeight;
  if (travel <= 0) return 0;
  return Math.min(1, Math.max(0, (head - rect.top) / travel));
}

/**
 * The seam (100 % all paper, 0 % all night) where the hand has drawn the twin a given share of
 * the way: the night from the right over Ink, the paper from the left over Light.
 */
export function wingSeamAt(twin: Expression, progress: number): number {
  return twin === 'light' ? 100 * (1 - progress) : 100 * progress;
}

/**
 * Which ground stands at the viewing line. Compact plates use their own centre rather than
 * letting the next plate, already visible lower on a tall phone, recolour the running head.
 */
export function roomAtCentre({
  expression,
  twin = 'light',
  mode,
  scrollDriven,
  wing,
  stageHeight,
  fallback,
  head,
  viewportHeight,
}: {
  expression: string;
  /** The wing's expression; the night wing's Light unless the page opened on Light. */
  twin?: Expression;
  mode: WingMode;
  scrollDriven: boolean;
  wing: DOMRect | null;
  stageHeight: number;
  fallback: DOMRect | null;
  head: number;
  viewportHeight: number;
}): Room | null {
  if (!wing) return null;
  const centre = Math.min(viewportHeight / 2, head + stageHeight / 2);
  if (wing.bottom <= centre || wing.top >= centre) return null;
  const own = groundOf(expression);
  const far = groundOf(twin);
  // The plate already shows the twin, so the wing has nothing to draw over it.
  if (expression === twin) return own;
  if (mode === 'scroll' && scrollDriven)
    return wingProgress(wing, stageHeight, head) >= 0.5 ? far : own;
  if (fallback && fallback.top <= centre && fallback.bottom > centre) return far;
  return own;
}

/**
 * Keeps <html data-room> in step with the seam: by scroll through the wing, by the Turn when
 * it commits (the viewer dispatches `cosmic:seam`), and back to the route's ground when the
 * wing leaves the centre of the viewport. Silent while a sheet or the room is open.
 *
 * The paper the hand draws over a Light plate is the Ink twin's sheet, so the running head
 * takes that sheet's tone while it stands there, as it takes a plate's. The night needs no
 * lending: a night room is the night whatever lies under it.
 */
export function useRoomSeam({
  enabled,
  expression,
  twin,
  twinTone,
  mode,
  wingRef,
  fallbackRef,
}: {
  enabled: boolean;
  expression: string;
  twin: Expression;
  /** The twin's measured ground, which the head takes once the paper wing is drawn. */
  twinTone?: string;
  mode: WingMode;
  wingRef: RefObject<HTMLElement | null>;
  fallbackRef: RefObject<HTMLDivElement | null>;
}) {
  const sheet = useOpenSheet();
  const frame = useRef<number | null>(null);
  const [holder] = useState(() => ({}));
  const sample = useEffectEvent(() => {
    frame.current = null;
    if (!enabled || sheet || document.querySelector('dialog[open]')) return;
    const wing = wingRef.current;
    const stage = wing?.firstElementChild as HTMLElement | null;
    const head =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--head')) || 48;
    const room = roomAtCentre({
      expression,
      twin,
      mode,
      scrollDriven: scrollTimelinesSupported(),
      wing: wing?.getBoundingClientRect() ?? null,
      stageHeight: stage?.getBoundingClientRect().height ?? window.innerHeight - head,
      fallback: fallbackRef.current?.getBoundingClientRect() ?? null,
      head,
      viewportHeight: window.innerHeight,
    });
    overrideRoom(room);
    if (twin !== 'ink' || !twinTone) return;
    if (room === 'paper' && expression !== twin) lendPlateTone(holder, twinTone, 'paper');
    else returnPlateTone(holder);
  });
  // The first reading lands before the first paint after hydration, so the ground the inline
  // script painted for the plate (src/lib/room.ts) is held, never flipped for a frame.
  useLayoutEffect(() => {
    if (!enabled) return;
    const schedule = () => {
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(sample);
    };
    sample();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener(SEAM_EVENT, schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener(SEAM_EVENT, schedule);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      overrideRoom(null);
      returnPlateTone(holder);
    };
  }, [enabled, expression, twin, twinTone, mode, sheet, holder]);
}
