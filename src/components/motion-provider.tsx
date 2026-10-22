'use client';
import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';

const key = 'cosmic-art-motion-v1';
const listeners = new Set<() => void>();
let explicit: boolean | undefined;
let query: MediaQueryList | undefined;
function notify() {
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  if (!query) {
    query = window.matchMedia('(prefers-reduced-motion: reduce)');
    try {
      const saved = sessionStorage.getItem(key);
      if (saved === 'paused' || saved === 'playing') explicit = saved === 'paused';
    } catch {
      /* Storage is optional. */
    }
  }
  listeners.add(listener);
  query.addEventListener('change', listener);
  return () => {
    listeners.delete(listener);
    query?.removeEventListener('change', listener);
  };
}
function snapshot() {
  return explicit ?? query?.matches ?? true;
}
const MotionContext = createContext({ paused: true, toggle: () => {} });
export function MotionProvider({ children }: { children: ReactNode }) {
  const paused = useSyncExternalStore(subscribe, snapshot, () => true);
  function toggle() {
    explicit = !paused;
    try {
      sessionStorage.setItem(key, explicit ? 'paused' : 'playing');
    } catch {
      /* A private browser can still control playback. */
    }
    notify();
  }
  return (
    <MotionContext value={{ paused, toggle }}>
      <div className={paused ? 'site motion-paused' : 'site'}>{children}</div>
    </MotionContext>
  );
}
export const useMotion = () => useContext(MotionContext);
