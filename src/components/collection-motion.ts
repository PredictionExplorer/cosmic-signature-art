'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useMotion } from './motion-provider';

type Intent = 'pointer' | 'focus';
export type PreviewFailure = 'media' | 'autoplay';
type Connection = EventTarget & { saveData?: boolean; effectiveType?: string };

function connection(): Connection | undefined {
  return (navigator as Navigator & { connection?: Connection }).connection;
}

function canPreview() {
  const network = connection();
  return (
    document.visibilityState === 'visible' &&
    !network?.saveData &&
    network?.effectiveType !== 'slow-2g' &&
    network?.effectiveType !== '2g' &&
    network?.effectiveType !== '3g'
  );
}

function subscribePolicy(listener: () => void) {
  const network = connection();
  document.addEventListener('visibilitychange', listener);
  network?.addEventListener('change', listener);
  return () => {
    document.removeEventListener('visibilitychange', listener);
    network?.removeEventListener('change', listener);
  };
}

const noPreviewOnServer = () => false;
const noSelectionOnServer = () => null;
const SETTLE_MS = 240;
const INTENT_MS = 140;
const MIN_VISIBLE = 0.25;

/** A grid has one playback lease. Visibility changes never start every visible film. */
class CollectionMotionController {
  private listeners = new Set<() => void>();
  private nodes = new Map<number, HTMLElement>();
  private visible = new Set<number>();
  private failed = new Set<number>();
  private focus: number | null = null;
  private pointer: number | null = null;
  private active: number | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private attached = false;
  private autoplayBlocked = false;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.active;

  private publish(id: number | null) {
    if (id === this.active) return;
    this.active = id;
    this.listeners.forEach((listener) => listener());
  }

  private schedule = (delay = SETTLE_MS) => {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.select(), delay);
  };

  private select() {
    if (!this.attached || this.autoplayBlocked) return;
    const candidates = new Map<number, number>();
    for (const id of this.visible) {
      const node = this.nodes.get(id);
      if (!node || this.failed.has(id)) continue;
      const rect = node.getBoundingClientRect();
      const width = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
      const height = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
      const ratio =
        rect.width > 0 && rect.height > 0 ? (width * height) / (rect.width * rect.height) : 0;
      if (ratio < MIN_VISIBLE) continue;
      const distance = Math.abs((rect.top + rect.bottom) / 2 - innerHeight / 2) / innerHeight;
      candidates.set(id, ratio - Math.min(distance, 1) * 0.25);
    }
    if (this.focus !== null && candidates.has(this.focus)) return this.publish(this.focus);
    if (this.pointer !== null && candidates.has(this.pointer)) return this.publish(this.pointer);

    let best: number | null = null;
    let bestScore = -Infinity;
    for (const [id, score] of candidates) {
      if (score > bestScore) {
        best = id;
        bestScore = score;
      }
    }
    // Small viewport movements retain the current film instead of repeatedly downloading neighbors.
    const currentScore = this.active === null ? undefined : candidates.get(this.active);
    if (currentScore !== undefined && currentScore >= bestScore - 0.18) return;
    this.publish(best);
  }

  attach(grid: HTMLElement, ids: number[]) {
    this.attached = true;
    const eligible = new Set(ids);
    this.failed = new Set([...this.failed].filter((id) => eligible.has(id)));
    for (const node of grid.querySelectorAll<HTMLElement>('[data-preview-id]')) {
      const id = Number(node.dataset.previewId);
      if (eligible.has(id)) this.nodes.set(id, node);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = Number((entry.target as HTMLElement).dataset.previewId);
          if (entry.isIntersecting && entry.intersectionRatio >= MIN_VISIBLE) this.visible.add(id);
          else this.visible.delete(id);
        }
        if (this.active !== null && !this.visible.has(this.active)) this.publish(null);
        this.schedule();
      },
      { threshold: [0, MIN_VISIBLE, 0.5, 0.75, 1] },
    );
    this.nodes.forEach((node) => observer.observe(node));
    const settle = () => this.schedule();
    window.addEventListener('scroll', settle, { passive: true });
    window.addEventListener('resize', settle, { passive: true });
    return () => {
      this.attached = false;
      clearTimeout(this.timer);
      observer.disconnect();
      window.removeEventListener('scroll', settle);
      window.removeEventListener('resize', settle);
      this.nodes.clear();
      this.visible.clear();
      this.focus = null;
      this.pointer = null;
      this.publish(null);
    };
  }

  intent = (id: number, kind: Intent, pointerType?: string) => {
    if (!this.attached || !this.nodes.has(id) || (kind === 'pointer' && pointerType === 'touch'))
      return;
    this[kind] = id;
    this.schedule(INTENT_MS);
  };

  clearIntent = (id: number, kind: Intent) => {
    if (this[kind] !== id) return;
    this[kind] = null;
    this.schedule();
  };

  fail = (id: number, reason: PreviewFailure) => {
    if (reason === 'media') this.failed.add(id);
    // A browser autoplay policy applies to the gallery, not just one artwork.
    // Do not probe every neighboring film after the browser denies the first.
    if (reason === 'autoplay') this.autoplayBlocked = true;
    if (this.active === id) this.publish(null);
    this.schedule();
  };

  resetAutoplayBlock = () => {
    this.autoplayBlocked = false;
  };
}

/** Attach `gridRef` to the grid and `data-preview-id` to each card. */
export function useCollectionMotion({ enabled, ids }: { enabled: boolean; ids: number[] }) {
  const { paused } = useMotion();
  const policyAllows = useSyncExternalStore(subscribePolicy, canPreview, noPreviewOnServer);
  const allowed = enabled && !paused && policyAllows;
  const gridRef = useRef<HTMLDivElement>(null);
  const [controller] = useState(() => new CollectionMotionController());
  const selected = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    noSelectionOnServer,
  );
  const identity = ids.join(',');

  useEffect(() => {
    // Only the explicit global playback cycle permits a new autoplay attempt.
    // Visibility, network and viewport changes retain the browser's refusal.
    if (paused) controller.resetAutoplayBlock();
  }, [paused, controller]);

  useEffect(() => {
    if (!allowed || !gridRef.current || typeof IntersectionObserver === 'undefined') return;
    return controller.attach(gridRef.current, identity ? identity.split(',').map(Number) : []);
  }, [allowed, controller, identity]);

  return {
    gridRef,
    activeId: allowed ? selected : null,
    intent: controller.intent,
    clearIntent: controller.clearIntent,
    fail: controller.fail,
  };
}
