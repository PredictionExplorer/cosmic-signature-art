import type { PlateFrame } from '@/lib/physics/framing';
import { ART_HEIGHT, ART_WIDTH } from './constants';
import { plateFrame } from './orbit-frames';
import { inkBearsOrbit } from './orbit-hollows';
import { getPlateGround } from './plate-records';
import { getInterpretation, type ArtInterpretation, type Artwork } from './types';

/** A still the orbit section lays its drawing over: its ladder, its proportions and its ground. */
export interface PlateStill {
  src: string;
  srcSet?: string;
  width: number;
  height: number;
  /** The plate's own measured ground (plate-records.ts), so the still meets it without an edge. */
  tone?: string;
}

/** Where the orbit section draws: the window's frame on the plate, and the stills it lies over. */
export interface OrbitPlate {
  frame: PlateFrame;
  /** Light wherever the frame binds; Ink only where its still bears the bodies out. */
  stills: { light?: PlateStill; ink?: PlateStill };
}

/** No drawing beside the plate is worth the 3,456 px original: the ladder's rungs up to this. */
const WIDEST_RUNG = 1920;

function plateStill(id: number, media: ArtInterpretation | undefined): PlateStill | undefined {
  if (!media?.still) return undefined;
  const rungs = (media.rungs ?? []).filter((rung) => rung.width <= WIDEST_RUNG);
  const widest = rungs.at(-1);
  return {
    src: widest?.src ?? media.still,
    srcSet: rungs.length ? rungs.map((rung) => `${rung.src} ${rung.width}w`).join(', ') : undefined,
    width: widest?.width ?? media.width ?? ART_WIDTH,
    height: widest?.height ?? media.height ?? ART_HEIGHT,
    tone: getPlateGround(id, media.id, media.stillSha256)?.tone,
  };
}

/**
 * What the orbit section draws on (third-physics-phase-d.md §7): the work's frame on its Light
 * film, which places the bodies where the film drew them, and the stills it lies over. The Ink
 * edition stirs with the bodies where the Light film draws them, so the Ink still is offered too,
 * once its hollows bear the bodies out (orbit-hollows.ts). Nothing without a frame that binds:
 * the section then draws the orbit in its own plane, as Phase A did.
 */
export function orbitPlate(work: Artwork): OrbitPlate | undefined {
  const light = getInterpretation(work, 'light');
  const ink = getInterpretation(work, 'ink');
  const frame = plateFrame(work.id, light);
  if (!frame) return undefined;
  const stills: OrbitPlate['stills'] = {};
  const lightStill = plateStill(work.id, light);
  const inkStill = inkBearsOrbit(work.id, ink) ? plateStill(work.id, ink) : undefined;
  if (lightStill) stills.light = lightStill;
  if (inkStill) stills.ink = inkStill;
  return stills.light || stills.ink ? { frame, stills } : undefined;
}
