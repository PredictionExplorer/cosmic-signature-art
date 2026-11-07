import { FRONT_EDGE } from './crossing/timing';

/*
  The Overture (third-physics.md §5.8): on a first visit the home opens on black, the day's
  work's three bodies begin their recorded orbit, and the real Light still condenses in the order
  its film first drew it, on the same clock. The plate then lands on the expression the home
  opens on. Version 2 registers the two: with the work's frame on its film (framing.ts), the
  bodies are drawn on the plate itself, where the film drew them, and the still condenses under
  them. Version 1, the score beside the plate in the orbit's own plane, stays for a work without
  a frame. This module is the arithmetic of that: where the score and the plate stand, and how
  far each has come at any moment. It knows nothing of the page.
*/

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where the score is drawn while the Overture plays, and where the plate condenses. */
export interface OvertureLayout {
  /**
   * registered: the score is drawn on the plate, in the plate's own place and frame.
   * stacked: the plate condenses in its place with the score beneath it, as on a phone.
   * beside: the plate condenses smaller, beside the score, as on a desk.
   */
  arrangement: 'registered' | 'stacked' | 'beside';
  score: Box;
  plate: Box;
}

/**
 * A point of the film's frame (`width` × `height` pixels, y down) in a box laid over the plate:
 * the plate's art box keeps the still's own aspect, so the frame scales onto it whole.
 */
export function framePoint(
  x: number,
  y: number,
  frame: { width: number; height: number },
  box: { width: number; height: number },
): [number, number] {
  return [(x / frame.width) * box.width, (y / frame.height) * box.height];
}

/** Room beneath the plate, as a share of the screen, that is enough to draw the score there. */
const ROOM_BENEATH = 0.32;
/** Beside the plate, the score takes this share of the width: the plate the rest. */
const SCORE_SHARE = 0.38;
/** And both stand within this share of the height. */
const HEIGHT_SHARE = 0.76;

/**
 * Where the score and the plate stand while the Overture plays. `plate` is the home plate's art
 * as the page lays it out. A registered score is drawn on the plate itself, in its own place,
 * on a desk and a phone alike. Otherwise a phone's plate leaves room beneath it, so the plate
 * condenses in its own place and the score is drawn below; a desk's plate fills its screen, so
 * the plate condenses smaller, beside the score, and grows into its place as the Overture lands.
 */
export function overtureLayout(
  viewport: { width: number; height: number },
  plate: Box,
  gutter: number,
  { registered = false }: { registered?: boolean } = {},
): OvertureLayout {
  if (registered) return { arrangement: 'registered', plate, score: plate };
  const beneath = viewport.height - (plate.y + plate.height);
  if (beneath >= viewport.height * ROOM_BENEATH) {
    const top = plate.y + plate.height + gutter;
    return {
      arrangement: 'stacked',
      plate,
      score: {
        x: gutter,
        y: top,
        width: Math.max(1, viewport.width - 2 * gutter),
        height: Math.max(1, viewport.height - top - gutter),
      },
    };
  }
  const aspect = plate.width / plate.height;
  const tall = viewport.height * HEIGHT_SHARE;
  const split = viewport.width * SCORE_SHARE;
  const plateWidth = Math.min(viewport.width - split - 2 * gutter, tall * aspect);
  const plateHeight = plateWidth / aspect;
  const scoreSide = Math.min(split - 2 * gutter, tall);
  const middle = viewport.height / 2;
  return {
    arrangement: 'beside',
    plate: {
      x: split + gutter + (viewport.width - split - 2 * gutter - plateWidth) / 2,
      y: middle - plateHeight / 2,
      width: plateWidth,
      height: plateHeight,
    },
    score: {
      x: gutter + (split - 2 * gutter - scoreSide) / 2,
      y: middle - scoreSide / 2,
      width: scoreSide,
      height: scoreSide,
    },
  };
}

/**
 * The transform that sets the plate, laid out in its own place, where the Overture condenses it:
 * the plate is drawn at its final size and only ever scaled down, so it lands sharp.
 */
export function plateTransform(from: Box, to: Box): string {
  const scale = to.width / from.width;
  return `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(${scale})`;
}

/** How far the Overture has come at `elapsed` of `duration`: one share for the score and the still. */
export function overtureShare(elapsed: number, duration: number): number {
  return duration > 0 ? Math.min(1, Math.max(0, elapsed / duration)) : 1;
}

/**
 * How far the still's arrival order is revealed at a share of the Overture: from just before its
 * first mark to just past its last, so the first and last pixels condense wholly inside it.
 */
export function revealAtShare(share: number): number {
  return -FRONT_EDGE + share * (1 + 2 * FRONT_EDGE);
}
