import type { PlateFrame, WindowStart } from '@/lib/physics/framing';
import type { StillRung } from '@/lib/art/types';

/** What First Light needs of a work: its window, its frame, its closest approach and its still. */
export interface ShowWork {
  start: WindowStart;
  frame: PlateFrame;
  /** The step of the window's closest approach, where the bodies flare. */
  closestStep: number;
  /** The Light still's ladder, ascending by width. */
  rungs: readonly StillRung[];
}
