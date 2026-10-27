'use client';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import type { ArtInterpretation, PlateDetail } from '@/lib/art/types';
import styles from './loupe.module.css';
import { ART_HEIGHT, ART_WIDTH } from '@/lib/art/constants';
import { rungFor } from '@/lib/art/types';

/*
  The zero-pixel loupe: the published still itself, moved and scaled with CSS transforms, never
  resampled onto a canvas and never magnified past one artwork pixel per device pixel. The
  scale is counted in artwork pixels per screen pixel; "1:1" is the native clamp. The hand
  pans with inertia, the wheel and the pinch zoom about the pointer, a double tap steps 2×
  then 4× over the fitted plate, and the arrow keys walk the window.
*/
/** A flick keeps gliding while its speed stays above this, in CSS px per frame. */
const INERTIA_FLOOR = 0.4;
const INERTIA_DECAY = 0.92;
/** How far a key moves the window, in CSS px. */
const KEY_STEP = 48;
/** A second tap within this many ms is a double tap. */
const DOUBLE_TAP_MS = 320;
/** Below this viewport width the 1280 rung paints first and the full still swaps in once decoded. */
const RUNG_FIRST_BELOW_PX = 1024;

export interface LoupeView {
  /** Artwork pixels per device pixel; 1 is native. */
  ratio: number;
  /** The visible window in artwork pixels, clamped to the plate. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export interface Pose {
  /** CSS px per artwork px. */
  scale: number;
  /** The image's top-left corner in the viewport's CSS px. */
  x: number;
  y: number;
}
type Size = { width: number; height: number };

export function fitScale(viewport: Size, art: Size) {
  if (!viewport.width || !viewport.height) return 0;
  return Math.min(viewport.width / art.width, viewport.height / art.height);
}
/** One artwork pixel per device pixel, or the fit when the plate is smaller than the screen. */
export function nativeScale(fit: number, devicePixelRatio: number) {
  return Math.max(fit, 1 / Math.max(1, devicePixelRatio));
}
export function clampScale(scale: number, fit: number, native: number) {
  return Math.min(native, Math.max(fit, scale));
}
/** The window never shows the wall: a plate larger than the viewport is pinned to its edges, a smaller one is centred. */
export function clampPose(pose: Pose, viewport: Size, art: Size): Pose {
  const width = art.width * pose.scale;
  const height = art.height * pose.scale;
  const x =
    width <= viewport.width
      ? (viewport.width - width) / 2
      : Math.min(0, Math.max(viewport.width - width, pose.x));
  const y =
    height <= viewport.height
      ? (viewport.height - height) / 2
      : Math.min(0, Math.max(viewport.height - height, pose.y));
  return { scale: pose.scale, x, y };
}
/** Scale about a fixed point of the viewport, so the pixel under the hand stays under the hand. */
export function zoomAbout(pose: Pose, scale: number, point: { x: number; y: number }): Pose {
  const factor = scale / pose.scale;
  return {
    scale,
    x: point.x - (point.x - pose.x) * factor,
    y: point.y - (point.y - pose.y) * factor,
  };
}
/** A pose that centres a rectangle of the plate, in artwork px, at the given scale. */
export function poseFor(
  rect: { x: number; y: number; width: number; height: number },
  scale: number,
  viewport: Size,
): Pose {
  return {
    scale,
    x: viewport.width / 2 - (rect.x + rect.width / 2) * scale,
    y: viewport.height / 2 - (rect.y + rect.height / 2) * scale,
  };
}
export function viewOf(pose: Pose, viewport: Size, art: Size, devicePixelRatio: number): LoupeView {
  const toArt = (css: number) => css / pose.scale;
  return {
    ratio: Math.round((1 / (pose.scale * Math.max(1, devicePixelRatio))) * 10) / 10,
    x0: Math.max(0, Math.round(toArt(-pose.x))),
    y0: Math.max(0, Math.round(toArt(-pose.y))),
    x1: Math.min(art.width, Math.round(toArt(viewport.width - pose.x))),
    y1: Math.min(art.height, Math.round(toArt(viewport.height - pose.y))),
  };
}
/** The double tap's ladder over the fitted plate: ×2, ×4, then native, then back to the whole. */
export function nextStep(scale: number, fit: number, native: number) {
  const steps = [fit * 2, fit * 4].filter((step) => step < native).concat(native);
  return steps.find((step) => step > scale * 1.01) ?? fit;
}

export function Loupe({
  media,
  windows,
  initialWindow = 0,
  label,
  onView,
}: {
  media: ArtInterpretation;
  /** The plate record's detail windows, heaviest first; the loupe opens on one of them. */
  windows: PlateDetail[];
  /** Index into `windows`, or -1 for the whole plate. */
  initialWindow?: number;
  label: string;
  onView?: (view: LoupeView) => void;
}) {
  const art = useMemo(
    () => ({ width: media.width ?? ART_WIDTH, height: media.height ?? ART_HEIGHT }),
    [media.width, media.height],
  );
  const viewport = useRef<HTMLDivElement>(null);
  // The window stands in for the canvas on the first render; the layout effect measures before paint.
  const [size, setSize] = useState<Size>(() =>
    typeof window === 'undefined'
      ? { width: 0, height: 0 }
      : { width: window.innerWidth, height: window.innerHeight },
  );
  // Null until the hand or a key moves the plate: the opening pose is derived, not stored.
  const [moved, setMoved] = useState<Pose | null>(null);
  const [openedFor, setOpenedFor] = useState(initialWindow);
  const [dpr, setDpr] = useState(1);
  const [fullReady, setFullReady] = useState(false);
  const fit = fitScale(size, art);
  const native = nativeScale(fit, dpr);
  if (openedFor !== initialWindow) {
    // A newly chosen window re-opens the loupe there; derived state resets in render.
    setOpenedFor(initialWindow);
    setMoved(null);
  }
  const chosen = windows[initialWindow];
  const pose = useMemo<Pose>(() => {
    if (!fit) return { scale: 0, x: 0, y: 0 };
    const opening: Pose = chosen ? poseFor(chosen, native, size) : { scale: fit, x: 0, y: 0 };
    const base = moved ?? opening;
    return clampPose({ ...base, scale: clampScale(base.scale, fit, native) }, size, art);
  }, [fit, native, size, art, moved, chosen]);
  const setPose = (next: (current: Pose) => Pose) => setMoved((current) => next(current ?? pose));
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    start: Pose;
    anchor: { x: number; y: number };
    distance: number;
    last: { x: number; y: number; at: number };
    velocity: { x: number; y: number };
    moved: boolean;
  } | null>(null);
  const inertia = useRef<number | null>(null);
  const lastTap = useRef(0);
  // Narrow viewports paint the 1280 rung first; the full still takes its place once decoded.
  const rung = rungFor(media.rungs, 1280);
  const rungFirst = !!rung && size.width > 0 && size.width < RUNG_FIRST_BELOW_PX;
  const source = !size.width ? undefined : rungFirst && !fullReady && rung ? rung.src : media.still;

  // The viewport's own size, kept current; jsdom has no ResizeObserver and reports 0.
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const measure = () => {
      const bounds = node.getBoundingClientRect();
      // A detached or unlaid-out node measures nothing; the window's stand-in size stays.
      if (bounds.width && bounds.height) setSize({ width: bounds.width, height: bounds.height });
      setDpr(window.devicePixelRatio || 1);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // The full still decodes off screen while the rung stands in; the swap is one src change.
  useEffect(() => {
    if (!rungFirst || fullReady || !media.still) return;
    let live = true;
    const full = new window.Image();
    full.decoding = 'async';
    full.src = media.still;
    const settle = () => {
      if (live) setFullReady(true);
    };
    if (typeof full.decode === 'function') void full.decode().then(settle, () => {});
    else full.onload = settle;
    return () => {
      live = false;
    };
  }, [rungFirst, fullReady, media.still]);

  const place = useCallback(
    (next: Pose) =>
      setMoved(clampPose({ ...next, scale: clampScale(next.scale, fit, native) }, size, art)),
    [fit, native, size, art],
  );

  const view = useMemo(
    () => (pose.scale ? viewOf(pose, size, art, dpr) : null),
    [pose, size, art, dpr],
  );
  const report = useEffectEvent((current: LoupeView | null) => {
    if (current) onView?.(current);
  });
  useEffect(() => {
    report(view);
  }, [view]);

  const stopInertia = useCallback(() => {
    if (inertia.current !== null) cancelAnimationFrame(inertia.current);
    inertia.current = null;
  }, []);
  useEffect(() => stopInertia, [stopInertia]);

  const local = (event: { clientX: number; clientY: number }) => {
    const bounds = viewport.current?.getBoundingClientRect();
    return { x: event.clientX - (bounds?.left ?? 0), y: event.clientY - (bounds?.top ?? 0) };
  };

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    stopInertia();
    const point = local(event);
    pointers.current.set(event.pointerId, point);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const points = [...pointers.current.values()];
    const anchor =
      points.length >= 2
        ? { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }
        : point;
    gesture.current = {
      start: pose,
      anchor,
      distance:
        points.length >= 2 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0,
      last: { ...point, at: performance.now() },
      velocity: { x: 0, y: 0 },
      moved: false,
    };
  }
  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const state = gesture.current;
    if (!state || !pointers.current.has(event.pointerId)) return;
    const point = local(event);
    pointers.current.set(event.pointerId, point);
    const points = [...pointers.current.values()];
    if (points.length >= 2) {
      // A pinch: scale about the fingers' midpoint from where the gesture began.
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const midpoint = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
      const scale = clampScale(
        (state.start.scale * distance) / Math.max(1, state.distance),
        fit,
        native,
      );
      const zoomed = zoomAbout(state.start, scale, state.anchor);
      place({
        ...zoomed,
        x: zoomed.x + (midpoint.x - state.anchor.x),
        y: zoomed.y + (midpoint.y - state.anchor.y),
      });
      state.moved = true;
      return;
    }
    const now = performance.now();
    const dt = Math.max(1, now - state.last.at);
    state.velocity = {
      x: ((point.x - state.last.x) / dt) * 16,
      y: ((point.y - state.last.y) / dt) * 16,
    };
    state.last = { ...point, at: now };
    if (Math.hypot(point.x - state.anchor.x, point.y - state.anchor.y) > 4) state.moved = true;
    place({
      ...pose,
      x: state.start.x + (point.x - state.anchor.x),
      y: state.start.y + (point.y - state.anchor.y),
    });
  }
  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const state = gesture.current;
    pointers.current.delete(event.pointerId);
    if (!state) return;
    if (pointers.current.size > 0) {
      // One finger of a pinch lifted: the other continues as a pan from here.
      const [remaining] = [...pointers.current.values()];
      gesture.current = { ...state, start: pose, anchor: remaining, distance: 0, moved: true };
      return;
    }
    gesture.current = null;
    if (!state.moved) {
      const now = performance.now();
      if (now - lastTap.current < DOUBLE_TAP_MS) {
        lastTap.current = 0;
        place(zoomAbout(pose, nextStep(pose.scale, fit, native), local(event)));
      } else lastTap.current = now;
      return;
    }
    // A flick glides on and settles.
    let velocity = state.velocity;
    const glide = () => {
      velocity = { x: velocity.x * INERTIA_DECAY, y: velocity.y * INERTIA_DECAY };
      if (Math.hypot(velocity.x, velocity.y) < INERTIA_FLOOR) {
        inertia.current = null;
        return;
      }
      setPose((current) =>
        clampPose({ ...current, x: current.x + velocity.x, y: current.y + velocity.y }, size, art),
      );
      inertia.current = requestAnimationFrame(glide);
    };
    if (Math.hypot(velocity.x, velocity.y) >= INERTIA_FLOOR)
      inertia.current = requestAnimationFrame(glide);
  }
  function onWheel(event: ReactWheelEvent<HTMLDivElement>) {
    stopInertia();
    const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015));
    place(zoomAbout(pose, clampScale(pose.scale * factor, fit, native), local(event)));
  }
  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? KEY_STEP * 4 : KEY_STEP;
    const centre = { x: size.width / 2, y: size.height / 2 };
    switch (event.key) {
      case 'ArrowLeft':
        place({ ...pose, x: pose.x + step });
        break;
      case 'ArrowRight':
        place({ ...pose, x: pose.x - step });
        break;
      case 'ArrowUp':
        place({ ...pose, y: pose.y + step });
        break;
      case 'ArrowDown':
        place({ ...pose, y: pose.y - step });
        break;
      case '+':
      case '=':
        place(zoomAbout(pose, clampScale(pose.scale * 1.25, fit, native), centre));
        break;
      case '-':
      case '_':
        place(zoomAbout(pose, clampScale(pose.scale / 1.25, fit, native), centre));
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    stopInertia();
  }

  const scaleState = !pose.scale
    ? undefined
    : pose.scale >= native - 1e-6
      ? 'native'
      : pose.scale <= fit + 1e-6
        ? 'fit'
        : 'between';
  return (
    <div
      ref={viewport}
      className={styles.viewport}
      role="group"
      aria-label={label}
      tabIndex={0}
      data-loupe
      data-scale={scaleState}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onKeyDown={onKeyDown}
    >
      {source ? (
        <img
          className={styles.image}
          src={source}
          alt={label}
          width={art.width}
          height={art.height}
          decoding="async"
          draggable={false}
          style={{ transform: `translate(${pose.x}px, ${pose.y}px) scale(${pose.scale})` }}
        />
      ) : null}
    </div>
  );
}
