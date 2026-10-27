'use client';
import { useEffect } from 'react';
import { overrideRoom } from '@/components/room-ground';
import type { Room } from '@/lib/room';

/**
 * The seam between a night chapter and a paper one is a hard material edge; the running
 * head follows it. Whichever section marked data-ground holds the viewport's centre line
 * sets the room; with none under the centre the route's own ground returns.
 */
export function RoomSeams() {
  useEffect(() => {
    let frame: number | undefined;
    const measure = () => {
      frame = undefined;
      const centre = window.innerHeight / 2;
      let ground: Room | null = null;
      // Past the last chapter (the colophon), the ground of the section above the centre holds,
      // so the paper coda never snaps back to night beneath itself.
      let above: Room | null = null;
      for (const section of document.querySelectorAll<HTMLElement>('main [data-ground]')) {
        const bounds = section.getBoundingClientRect();
        const room: Room = section.dataset.ground === 'paper' ? 'paper' : 'night';
        if (bounds.top <= centre) above = room;
        if (bounds.top <= centre && bounds.bottom > centre) {
          ground = room;
          break;
        }
      }
      overrideRoom(ground ?? above);
    };
    const schedule = () => {
      if (frame === undefined) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      overrideRoom(null);
    };
  }, []);
  return null;
}
