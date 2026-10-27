'use client';
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';

/** Input right after pressing Sit is the press itself, not a request for the chrome back. */
export const SIT_GRACE_MS = 600;
/** The click a browser synthesises after a waking tap arrives well within this window. */
const SWALLOW_MS = 500;

/**
 * Sit: the strip and the words rest until the visitor moves, and the press that wakes them
 * is only a press, never a choice. One ritual for every plate that offers the word. With
 * `mirror` the state is also written to `<html data-sit>`, so the running head rests with
 * the strip (globals.css reads it); the caller still sets `data-sit` on its own element.
 */
export function useSit({ mirror = false }: { mirror?: boolean } = {}) {
  const [sit, setSit] = useState(false);
  const sitAt = useRef(0);
  const swallow = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (swallow.current) clearTimeout(swallow.current);
    },
    [],
  );
  useEffect(() => {
    if (!mirror) return;
    const element = document.documentElement;
    if (sit) element.setAttribute('data-sit', '');
    else element.removeAttribute('data-sit');
    return () => element.removeAttribute('data-sit');
  }, [sit, mirror]);
  const sitDown = useCallback(() => {
    sitAt.current = Date.now();
    setSit(true);
  }, []);
  const stand = useCallback(() => setSit(false), []);
  function sitting() {
    return sit && Date.now() - sitAt.current >= SIT_GRACE_MS;
  }
  /** Any movement or key brings the chrome back once the press that sat is behind us. */
  function wake() {
    if (sitting()) stand();
  }
  /** A press brings the chrome back; the click that follows it is swallowed. */
  function wakeByPress() {
    if (!sitting()) return;
    stand();
    if (swallow.current) clearTimeout(swallow.current);
    swallow.current = setTimeout(() => {
      swallow.current = null;
    }, SWALLOW_MS);
  }
  function swallowWakingClick(event: MouseEvent<HTMLElement>) {
    if (!swallow.current) return;
    clearTimeout(swallow.current);
    swallow.current = null;
    event.preventDefault();
    event.stopPropagation();
  }
  return { sit, sitDown, stand, wake, wakeByPress, swallowWakingClick };
}
