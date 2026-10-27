'use client';
import { useLayoutEffect, useSyncExternalStore } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { ROOM_COLORS, roomFor, type Room } from '@/lib/room';

export function applyRoom(room: Room) {
  document.documentElement.setAttribute('data-room', room);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', ROOM_COLORS[room]);
}

/**
 * A page or a seam may hold the ground open against the route's default: the Spectrum wall
 * is black on a paper route, and the night wing takes the room as it scrolls into view.
 */
let override: Room | null = null;
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const snapshot = () => override;
const noOverrideOnServer = () => null;
export function overrideRoom(room: Room | null) {
  if (override === room) return;
  override = room;
  listeners.forEach((listener) => listener());
}

/** Hold the ground for the life of a component; the route's own ground returns on unmount. */
export function useRoom(room: Room | null) {
  useLayoutEffect(() => {
    if (!room) return;
    overrideRoom(room);
    return () => overrideRoom(null);
  }, [room]);
}

/**
 * While a plate dominates the viewport the running head may take the sheet's own tone, so
 * the head and the letterbox read as one wall. The plate's material rides along on
 * <html data-plate-material>, so the head's type follows the tone it stands on and not the
 * room's: a Light plate on a paper route reads in the night's type. Null returns the head
 * to the room's ground.
 */
export function setPlateTone(tone: string | null, material: Room = 'paper') {
  const root = document.documentElement;
  if (tone && /^#[0-9a-f]{6}$/i.test(tone)) {
    root.style.setProperty('--plate-tone', tone);
    root.setAttribute('data-plate-material', material);
  } else {
    root.style.removeProperty('--plate-tone');
    root.removeAttribute('data-plate-material');
  }
}

/**
 * Keeps the ground on <html> in step with client navigation; the inline script covers first
 * paint. Reads the query too, so the Spectrum wall and the Light section arrive on night;
 * the layout wraps it in Suspense because of that read.
 */
export function RoomGround() {
  const pathname = usePathname();
  const search = useSearchParams();
  const routeRoom = roomFor(pathname, search.toString());
  const held = useSyncExternalStore(subscribe, snapshot, noOverrideOnServer);
  const room = held ?? routeRoom;
  useLayoutEffect(() => {
    applyRoom(room);
    return () => applyRoom('paper');
  }, [room]);
  return null;
}
