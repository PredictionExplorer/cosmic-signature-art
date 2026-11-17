'use client';
import { useLayoutEffect } from 'react';
import { overrideRoom } from '@/components/room-ground';
import type { Room } from '@/lib/room';
import { SEAM_EVENT } from '@/lib/venue-events';

/** The ground a part of the home stands on: its own, or the ground of the expression its plate shows. */
function groundOf(part: HTMLElement): Room {
  const ground = part.dataset.ground ?? (part.dataset.expression === 'light' ? 'night' : 'paper');
  return ground === 'paper' ? 'paper' : 'night';
}

/**
 * The seam between a night chapter and a paper one is a hard material edge; the running
 * head follows it. Whichever part of the home holds the viewport's centre line sets the room:
 * a section by the ground it is marked with, the day's plate by the expression it shows, which
 * a Turn changes under the hand. With none under the centre the ground of the part above holds.
 *
 * The first reading lands before the first paint after hydration, so the ground the inline
 * script painted for the plate (src/lib/room.ts) is held, never flipped for a frame. Nothing is
 * read while a room is open over the page: its ground is its own. When the room closes the
 * page is read again, since a Turn made inside it changed the plate beneath.
 */
export function RoomSeams() {
  useLayoutEffect(() => {
    let frame: number | undefined;
    const measure = () => {
      frame = undefined;
      if (document.querySelector('dialog[open]')) return;
      const centre = window.innerHeight / 2;
      let ground: Room | null = null;
      // Past the last chapter (the colophon), the ground of the section above the centre holds,
      // so the paper close never snaps back to night beneath itself.
      let above: Room | null = null;
      for (const part of document.querySelectorAll<HTMLElement>(
        'main > [data-ground], main > [data-presentation="home"]',
      )) {
        const bounds = part.getBoundingClientRect();
        if (bounds.top > centre) break;
        above = groundOf(part);
        if (bounds.bottom > centre) {
          ground = above;
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
    // A Turn on the day's plate changes the ground it stands on.
    window.addEventListener(SEAM_EVENT, schedule);
    // A dialog's close does not bubble: it is heard on its way down.
    document.addEventListener('close', schedule, true);
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener(SEAM_EVENT, schedule);
      document.removeEventListener('close', schedule, true);
      overrideRoom(null);
    };
  }, []);
  return null;
}
