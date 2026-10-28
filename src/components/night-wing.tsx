'use client';
import { useEffect, useEffectEvent, useRef, type ReactNode, type RefObject } from 'react';
import type { Room } from '@/lib/room';
import { overrideRoom } from './room-ground';
import { useOpenSheet } from './sheets-store';
import styles from './night-wing.module.css';

export type WingMode = 'scroll' | 'hard';

/**
 * The night wing: the second screen of an art page, reached by the hand. In `scroll` mode the
 * section is two screens tall with a sticky stage, and the scroll draws the night layer over
 * the plate through a scroll-driven animation of `--seam-scroll`, where the browser provides
 * one. Everywhere else (no `animation-timeline`, reduced motion, Pause, a hushed theatre)
 * the boundary is a hard material edge: a second screen in black with the same Light plate.
 * Pressing `Light` in the strip performs the Turn by time in either mode.
 */
export function NightWing({
  mode,
  expression,
  wingRef,
  fallbackRef,
  fallback,
  children,
}: {
  mode: WingMode;
  expression: string;
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
      data-night-wing
    >
      <div className={styles.stage}>{children}</div>
      <div ref={fallbackRef} className={styles.fallback} data-ground="night">
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

/** How far the hand has drawn the night across a two-screen wing: 0 at its top, 1 at its end. */
export function wingProgress(rect: DOMRect, stageHeight: number, head: number): number {
  const travel = rect.height - stageHeight;
  if (travel <= 0) return 0;
  return Math.min(1, Math.max(0, (head - rect.top) / travel));
}

/**
 * Which ground stands at the viewing line. Compact plates use their own centre rather than
 * letting the next plate, already visible lower on a tall phone, recolour the running head.
 */
export function roomAtCentre({
  expression,
  mode,
  scrollDriven,
  wing,
  stageHeight,
  fallback,
  head,
  viewportHeight,
}: {
  expression: string;
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
  if (expression === 'light') return 'night';
  if (mode === 'scroll' && scrollDriven)
    return wingProgress(wing, stageHeight, head) >= 0.5 ? 'night' : 'paper';
  if (fallback && fallback.top <= centre && fallback.bottom > centre) return 'night';
  return 'paper';
}

/**
 * Keeps <html data-room> in step with the seam: by scroll through the wing, by the Turn when
 * it commits (the viewer dispatches `cosmic:seam`), and back to the route's ground when the
 * wing leaves the centre of the viewport. Silent while a sheet or the room is open.
 */
export function useRoomSeam({
  enabled,
  expression,
  mode,
  wingRef,
  fallbackRef,
}: {
  enabled: boolean;
  expression: string;
  mode: WingMode;
  wingRef: RefObject<HTMLElement | null>;
  fallbackRef: RefObject<HTMLDivElement | null>;
}) {
  const sheet = useOpenSheet();
  const frame = useRef<number | null>(null);
  const sample = useEffectEvent(() => {
    frame.current = null;
    if (!enabled || sheet || document.querySelector('dialog[open]')) return;
    const wing = wingRef.current;
    const stage = wing?.firstElementChild as HTMLElement | null;
    const head =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--head')) || 48;
    const room = roomAtCentre({
      expression,
      mode,
      scrollDriven: scrollTimelinesSupported(),
      wing: wing?.getBoundingClientRect() ?? null,
      stageHeight: stage?.getBoundingClientRect().height ?? window.innerHeight - head,
      fallback: fallbackRef.current?.getBoundingClientRect() ?? null,
      head,
      viewportHeight: window.innerHeight,
    });
    overrideRoom(room);
  });
  useEffect(() => {
    if (!enabled) return;
    const schedule = () => {
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(sample);
    };
    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('cosmic:seam', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('cosmic:seam', schedule);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      overrideRoom(null);
    };
  }, [enabled, expression, mode, sheet]);
}
