'use client';
import { useSyncExternalStore } from 'react';

/**
 * The venue's two sheets, the Index and the keys, are opened from the running head, from
 * the keyboard and from any page; this tiny external store lets them share one state.
 */
export type Sheet = 'index' | 'keys' | null;
let open: Sheet = null;
const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const snapshot = () => open;
const closedOnServer = () => null;

export function openSheet(sheet: Exclude<Sheet, null>) {
  if (open === sheet) return;
  open = sheet;
  notify();
}
export function closeSheet(sheet?: Exclude<Sheet, null>) {
  if (open === null || (sheet && open !== sheet)) return;
  open = null;
  notify();
}
export function toggleSheet(sheet: Exclude<Sheet, null>) {
  if (open === sheet) closeSheet(sheet);
  else openSheet(sheet);
}
export function useOpenSheet(): Sheet {
  return useSyncExternalStore(subscribe, snapshot, closedOnServer);
}
