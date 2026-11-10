import type { Viewport } from 'next';
import { ROOM_COLORS } from '@/lib/room';

/**
 * The venue's viewport. viewportFit makes the env(safe-area-inset-*) paddings real, and the
 * theme colour is the paper's; the room script keeps it in step with the ground as a page
 * turns, so black rooms are not framed by cream bars.
 */
export const venueViewport: Viewport = {
  themeColor: ROOM_COLORS.paper,
  colorScheme: 'light',
  viewportFit: 'cover',
};

/**
 * A night route's viewport (src/lib/room.ts NIGHT_ROUTES), and the 404's: the browser's chrome
 * is black from the first byte, before any script, and the head React renders agrees with the
 * one the room script set, so a page never carries a second, paper theme colour after it.
 */
export const nightViewport: Viewport = { ...venueViewport, themeColor: ROOM_COLORS.night };
