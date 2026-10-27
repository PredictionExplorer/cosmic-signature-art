'use client';
import { useSyncExternalStore } from 'react';

/** A phone's wall: the plate is 100 vw and the rhythm is full, two halves, full. */
export const COMPACT_QUERY = '(max-width: 767px)';
const compactQuery = () =>
  typeof window.matchMedia === 'function' ? window.matchMedia(COMPACT_QUERY) : undefined;
function subscribeCompact(listener: () => void) {
  const query = compactQuery();
  query?.addEventListener('change', listener);
  return () => query?.removeEventListener('change', listener);
}
const compactOnServer = () => false;

/** Whether the wall is a phone's; false on the server and wherever media queries are absent. */
export function useCompactWall(): boolean {
  return useSyncExternalStore(
    subscribeCompact,
    () => compactQuery()?.matches ?? false,
    compactOnServer,
  );
}
