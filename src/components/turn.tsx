'use client';
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { ROOM_COLORS, type Room } from '@/lib/room';
import styles from './turn.module.css';

/*
  The Turn: one straight vertical seam carries wall and work together from paper to night and
  back. Both expressions are mounted as two layers; the night layer is clipped at the seam,
  `--seam`, a percentage from the left: 100 % is all paper, 0 % all night. Light always
  arrives from the right (100 → 0), Ink always returns from the left (0 → 100), the way the
  gatefold opens. The seam lives on <html> while a Turn travels (`data-turning`), so the
  running head's inert overlay inverts with the same seam; once the expression commits the
  seam is dropped and the layers follow `data-expression` alone.
*/

/** The room takes a breath before the seam moves. */
export const BREATH_MS = 80;
/** A key held shorter than this is a tap: the Turn completes instead of returning. */
export const TAP_MS = 300;
/** A finger must carry the seam past this share of the plate for the Turn to complete. */
export const DRAG_COMMIT = 0.4;
/** Horizontal travel before a touch becomes a drag rather than a scroll. */
const DRAG_THRESHOLD_PX = 8;

export type TurnMode = 'time' | 'drag' | 'dusk';
export type Expression = 'ink' | 'light';

/** The seam position that shows one expression alone. */
export function seamFor(expression: string): number {
  return expression === 'light' ? 0 : 100;
}

const clamp = (value: number) => Math.min(100, Math.max(0, value));

function tokenMs(element: HTMLElement, name: string, fallback: number): number {
  const value = getComputedStyle(element).getPropertyValue(name).trim();
  const match = /^([\d.]+)(ms|s)$/.exec(value);
  if (!match) return fallback;
  return parseFloat(match[1]) * (match[2] === 's' ? 1000 : 1);
}

/** The phone's status bar follows the seam at the halfway point; the ground itself commits later. */
export function setThemeColor(room: Room) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', ROOM_COLORS[room]);
}

/**
 * Drives `--seam` and `data-turning` on the document element. One instance per viewer; a
 * newer travel supersedes an older one, whose promise then resolves false so nothing commits
 * twice. `end()` drops the seam once the committed expression is painted.
 */
export class SeamController {
  private token = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  /** Travels still waiting for their timer; a newer travel resolves them false. */
  private waiting = new Set<() => void>();
  constructor(private readonly root: () => HTMLElement = () => document.documentElement) {}

  /** The seam as a number from 0 to 100, or null while no Turn is in progress. */
  get seam(): number | null {
    const value = this.root().style.getPropertyValue('--seam');
    return value ? parseFloat(value) : null;
  }

  get mode(): TurnMode | null {
    return (this.root().getAttribute('data-turning') as TurnMode | null) || null;
  }

  /** A finger takes the seam: no transition, every move paints at once. */
  begin(mode: TurnMode, start: number) {
    this.cancel();
    const element = this.root();
    element.setAttribute('data-turning', mode);
    if (this.seam === null) element.style.setProperty('--seam', `${clamp(start)}%`);
  }

  set(value: number) {
    this.root().style.setProperty('--seam', `${clamp(value)}%`);
  }

  /**
   * Travel to a seam position under a mode. Resolves true when the travel completed, false
   * when a newer travel or `end()` superseded it. `halfway` fires at the midpoint of the
   * travel, for the status bar. `from` names where the travel begins when no seam is painted
   * yet: inside the night wing that is wherever the hand has drawn the night.
   */
  animateTo(
    target: number,
    {
      mode = 'time',
      breath = mode === 'time',
      halfway,
      from,
    }: { mode?: TurnMode; breath?: boolean; halfway?: () => void; from?: number } = {},
  ): Promise<boolean> {
    const element = this.root();
    this.cancel();
    const id = this.token;
    return new Promise((resolve) => {
      const supersede = () => resolve(false);
      this.waiting.add(supersede);
      const settle = (done: boolean) => {
        this.waiting.delete(supersede);
        resolve(done);
      };
      const go = () => {
        if (id !== this.token) return settle(false);
        const start = this.seam ?? from ?? (target === 0 ? 100 : 0);
        element.setAttribute('data-turning', mode);
        element.style.setProperty('--seam', `${clamp(start)}%`);
        // Flush so the transition starts from `start` rather than from the previous frame.
        void getComputedStyle(element).getPropertyValue('--seam');
        element.style.setProperty('--seam', `${clamp(target)}%`);
        const duration =
          start === target
            ? 0
            : tokenMs(
                element,
                mode === 'dusk' ? '--t-dusk' : '--t-turn',
                mode === 'dusk' ? 4000 : 900,
              );
        if (halfway) {
          this.timers.add(
            setTimeout(() => {
              if (id === this.token) halfway();
            }, duration / 2),
          );
        }
        this.timers.add(
          setTimeout(() => {
            settle(id === this.token);
          }, duration + 30),
        );
      };
      if (breath) this.timers.add(setTimeout(go, BREATH_MS));
      else go();
    });
  }

  /** The committed expression is painted: drop the seam so the layers follow data-expression. */
  end() {
    this.cancel();
    const element = this.root();
    element.removeAttribute('data-turning');
    element.style.removeProperty('--seam');
  }

  /** Supersede any travel in flight without touching the painted seam. */
  cancel() {
    this.token += 1;
    this.clearTimers();
    const waiting = [...this.waiting];
    this.waiting.clear();
    waiting.forEach((supersede) => supersede());
  }

  private clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
  }
}

/* The chosen expression travels in the URL and is remembered for the session; a new visit
   always opens on Ink, and a work that has only one expression never decides for the next. */
export const EXPRESSION_KEY = 'cosmic-art-expression-v1';
let remembered: Expression | null | undefined;
const listeners = new Set<() => void>();
function readRemembered(): Expression | null {
  if (remembered === undefined) {
    try {
      const value = sessionStorage.getItem(EXPRESSION_KEY);
      remembered = value === 'light' || value === 'ink' ? value : null;
    } catch {
      remembered = null;
    }
  }
  return remembered;
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const noMemoryOnServer = () => null;
export function rememberExpression(expression: string) {
  const next: Expression | null =
    expression === 'light' || expression === 'ink' ? expression : null;
  if (next === readRemembered()) return;
  remembered = next;
  try {
    if (next) sessionStorage.setItem(EXPRESSION_KEY, next);
    else sessionStorage.removeItem(EXPRESSION_KEY);
  } catch {
    /* Storage is optional. */
  }
  listeners.forEach((listener) => listener());
}
export function useRememberedExpression(): Expression | null {
  return useSyncExternalStore(subscribe, readRemembered, noMemoryOnServer);
}
/** Tests reset the memory between cases. */
export function forgetExpression() {
  remembered = undefined;
  try {
    sessionStorage.removeItem(EXPRESSION_KEY);
  } catch {
    /* Storage is optional. */
  }
}

/**
 * The two layers and the finger. Drag-to-Turn: a horizontal touch drag on the plate moves the
 * seam with the finger; past 40 % of the plate the Turn completes (the caller commits the
 * expression), otherwise the seam springs back. Vertical scrolling is untouched.
 */
export function Turn({
  expression,
  seam,
  canTurn,
  restSeam,
  onCommit,
  onDragChange,
  children,
  className = '',
}: {
  expression: string;
  seam: SeamController;
  /** Both expressions exist and the Turn may animate (not paused, reduced or hushed). */
  canTurn: boolean;
  /** Where the seam rests for the committed expression; inside the wing the scroll decides. */
  restSeam?: () => number;
  /** The finger carried the seam far enough: decode and commit the other expression. */
  onCommit: (to: Expression) => void;
  onDragChange?: (dragging: boolean) => void;
  children: ReactNode;
  className?: string;
}) {
  const node = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const report = useEffectEvent((value: boolean) => onDragChange?.(value));
  useEffect(() => {
    report(dragging);
  }, [dragging]);

  const other: Expression = expression === 'light' ? 'ink' : 'light';
  const rest = () => restSeam?.() ?? seamFor(expression);

  function seamAt(clientX: number) {
    const rect = node.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return rest();
    return clamp(((clientX - rect.left) / rect.width) * 100);
  }

  function down(event: ReactPointerEvent<HTMLDivElement>) {
    if (!canTurn || event.pointerType !== 'touch' || !event.isPrimary) return;
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    };
  }
  function move(event: ReactPointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    if (!state.active) {
      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;
      if (Math.abs(dx) < DRAG_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) return;
      // Only a seam that moves toward the other expression is a Turn.
      if ((expression === 'ink' && dx > 0) || (expression === 'light' && dx < 0)) {
        drag.current = null;
        return;
      }
      state.active = true;
      seam.begin('drag', rest());
      node.current?.setPointerCapture(event.pointerId);
      setDragging(true);
    }
    seam.set(seamAt(event.clientX));
  }
  function up(event: ReactPointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    drag.current = null;
    if (!state.active) return;
    setDragging(false);
    const position = seamAt(event.clientX);
    const travelled = expression === 'ink' ? (100 - position) / 100 : position / 100;
    if (travelled >= DRAG_COMMIT) onCommit(other);
    else {
      void seam.animateTo(rest(), { mode: 'time', breath: false }).then((done) => {
        if (done) seam.end();
      });
    }
  }

  return (
    <div
      ref={node}
      className={`${styles.turn} ${className}`}
      data-expression={expression}
      data-dragging={dragging ? '' : undefined}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onClickCapture={(event) => {
        // The click a browser synthesises after a drag is the drag, not a choice.
        if (dragging) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      {children}
    </div>
  );
}

/** One ground of the Turn: the paper layer carries Ink, the night layer Light. */
export function TurnLayer({
  expression,
  current,
  children,
}: {
  expression: Expression;
  current: boolean;
  children: ReactNode;
}) {
  const night = expression === 'light';
  return (
    <div
      className={`${styles.layer} ${night ? `${styles.night} turn-night` : styles.paper}`}
      data-layer={expression}
      data-layer-state={current ? 'current' : 'twin'}
      data-ground={night ? 'night' : 'paper'}
      aria-hidden={current ? undefined : 'true'}
      inert={!current}
    >
      {children}
    </div>
  );
}
