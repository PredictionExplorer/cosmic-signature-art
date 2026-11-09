import type { ShowWork } from '@/lib/first-light/show-work';
import { plateFrame } from './orbit-frames';
import { workOrbit } from './orbit-records';
import { performedOrbits } from './orbit-windows';
import { getInterpretation, type Artwork } from './types';

/**
 * A work as First Light performs it (docs/first-light.md §4): its recorded window, its frame on
 * the Light film, its closest approach and its Light still. Without a frame that still binds to
 * its film there is nothing to land on, and the page opens as it always does. Shared by the home,
 * a work's own page and the proof.
 */
export function showWorkOf(work: Artwork): ShowWork | null {
  const [performed] = performedOrbits([work.id]);
  const light = getInterpretation(work, 'light');
  const frame = light ? plateFrame(work.id, light) : undefined;
  const orbit = workOrbit(work.id);
  if (!performed || !light?.rungs?.length || !frame || !orbit) return null;
  return {
    start: performed.window,
    frame,
    closestStep: orbit.published.closestApproach.step,
    rungs: light.rungs,
  };
}
