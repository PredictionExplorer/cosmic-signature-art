'use client';
import { useLayoutEffect } from 'react';
import { usePathname } from 'next/navigation';
import { ROOM_COLORS, roomForPath, type Room } from '@/lib/room';

export function applyRoom(room: Room) {
  document.documentElement.setAttribute('data-room', room);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', ROOM_COLORS[room]);
}

/** Keeps the ground on <html> in step with client navigation; the inline script covers first paint. */
export function RoomGround() {
  const room = roomForPath(usePathname());
  useLayoutEffect(() => {
    applyRoom(room);
    return () => applyRoom('paper');
  }, [room]);
  return null;
}
