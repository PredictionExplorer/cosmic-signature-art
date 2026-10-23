'use client';
import { useSyncExternalStore } from 'react';

type Connection = EventTarget & { saveData?: boolean; effectiveType?: string };
const connection = () => (navigator as Navigator & { connection?: Connection }).connection;
function snapshot() {
  const network = connection();
  const constrained =
    network?.saveData || ['slow-2g', '2g', '3g'].includes(network?.effectiveType ?? '');
  return (document.visibilityState === 'visible' ? 1 : 0) | (constrained ? 2 : 0);
}
function subscribe(listener: () => void) {
  const network = connection();
  document.addEventListener('visibilitychange', listener);
  network?.addEventListener('change', listener);
  return () => {
    document.removeEventListener('visibilitychange', listener);
    network?.removeEventListener('change', listener);
  };
}

/** A primitive snapshot separates explicit playback from ambient loading policy. */
export function useMediaPolicy() {
  const value = useSyncExternalStore(subscribe, snapshot, () => 2);
  return { visible: !!(value & 1), constrained: !!(value & 2) };
}
