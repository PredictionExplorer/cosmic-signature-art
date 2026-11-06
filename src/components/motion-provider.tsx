'use client';
import { useSyncExternalStore, type ReactNode } from 'react';
import { MOTION_KEY } from '@/lib/storage-keys';
const listeners = new Set<() => void>();
let explicit: boolean | undefined;
let query: MediaQueryList | undefined;
/**
 * The system preference, with the session's saved choice read alongside it, ready from the
 * first client read whoever makes it. A work that mounts during a later navigation therefore
 * renders its first commit with the visitor's value.
 */
function system() {
  if (!query) {
    query = window.matchMedia('(prefers-reduced-motion: reduce)');
    try {
      const saved = sessionStorage.getItem(MOTION_KEY);
      if (saved === 'paused' || saved === 'playing') explicit = saved === 'paused';
    } catch {
      /* Storage is optional. */
    }
  }
  return query;
}
function notify() {
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  const media = system();
  if (listeners.size === 0) media.addEventListener('change', notify);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) media.removeEventListener('change', notify);
  };
}
function pausedSnapshot() {
  const reduced = system().matches;
  return explicit ?? reduced;
}
function reducedMotionSnapshot() {
  return system().matches;
}
/** The server cannot know the preference, so it renders the quiet room: paused and reduced. */
function serverSnapshot() {
  return true;
}
function choose(paused: boolean) {
  explicit = paused;
  try {
    sessionStorage.setItem(MOTION_KEY, paused ? 'paused' : 'playing');
  } catch {
    /* A private browser can still control playback. */
  }
  notify();
}
/**
 * The theatre hushes while a collector reviews or signs a transaction: films hold on
 * their stills, crossings are instant and ambient choreography stops. Nothing is
 * disabled; the other expression stays one press away. Only the bid flow sets it.
 */
export type Theatre = 'playing' | 'hushed';
let theatre: Theatre = 'playing';
function theatreSnapshot() {
  return theatre;
}
function serverTheatre(): Theatre {
  return 'playing';
}
export function setTheatre(value: Theatre) {
  if (theatre === value) return;
  theatre = value;
  notify();
}

/**
 * Every reader subscribes to the store itself, never through a context. The server renders
 * paused and reduced, and for most visitors the first render after hydration changes both.
 * Passed down from a provider above the routes, that change would reach every streamed
 * Suspense boundary beneath it. React cannot hydrate a boundary still waiting for its reveal,
 * which can come after hydration (it waits for an animation frame, and WebKit withholds
 * frames), so it would discard the server's HTML and render the page again. A reader instead
 * hydrates with the server's values and updates itself once it is hydrated.
 */
export function useMotion() {
  const paused = useSyncExternalStore(subscribe, pausedSnapshot, serverSnapshot);
  const reducedMotion = useSyncExternalStore(subscribe, reducedMotionSnapshot, serverSnapshot);
  const theatreState = useSyncExternalStore(subscribe, theatreSnapshot, serverTheatre);
  // The toggle flips the state this reader shows the visitor; the choice holds for the session.
  return { paused, reducedMotion, theatre: theatreState, toggle: () => choose(!paused) };
}

/** The site's wrapper carries the motion state to CSS. It provides no context; see useMotion. */
export function MotionProvider({ children }: { children: ReactNode }) {
  const paused = useSyncExternalStore(subscribe, pausedSnapshot, serverSnapshot);
  const theatreState = useSyncExternalStore(subscribe, theatreSnapshot, serverTheatre);
  return (
    <div className={paused ? 'site motion-paused' : 'site'} data-theatre={theatreState}>
      {children}
    </div>
  );
}
