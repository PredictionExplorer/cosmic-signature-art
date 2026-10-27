'use client';
import type { ReactNode } from 'react';
import { useRoom } from '@/components/room-ground';
import type { Room } from '@/lib/room';

/** Holds the venue's ground for a view: the Spectrum wall and a Light section are night. */
export function CollectionRoom({ room, children }: { room: Room | null; children: ReactNode }) {
  useRoom(room);
  return <>{children}</>;
}
