/**
 * What a place is made of as the Turn's front passes it. The two stills are registered to one
 * frame, so a Turn can leave everything where it is and change what it is made of:
 *
 * - toward the night, the ink leaves with its paper as the front crosses, and the light rises
 *   on the night just behind the front;
 * - toward the paper, the light leaves with its night as the front crosses, and the ink blooms
 *   on the paper just behind it.
 *
 * Where the front has not reached, a place is the departing still, exactly; a trail behind the
 * front it is the arriving still, exactly. In between the light is lit on the ground as light
 * adds, and the ink is a transmittance on its paper whose density grows as it blooms
 * (Beer–Lambert). The shader of sheet-painter.ts paints each pixel with the arithmetic of
 * `materialPixel` below, and the tests hold the two to the same answers.
 *
 * Where the front stands, and how far it has passed a place, is the sheet's to say (sheet.ts).
 */

export type Toward = 'night' | 'paper';
export type Rgb = readonly [number, number, number];

/**
 * How dark the sheet itself may be, as a share of its tone. The paper beneath the ink is the
 * still where it is lighter than this, so the sheet keeps its own fibres; where the still is
 * darker it is ink, and the paper beneath it rises to the sheet's whole tone across `INK_BAND`,
 * so no ghost of the ink is left in a bare ground.
 */
export const PAPER_DEPTH = 0.97;
/** How much darker than `PAPER_DEPTH` ink must be to lie on the sheet's whole tone. */
export const INK_BAND = 0.12;
/** The least a channel is taken to be, so the ink's transmittance is always defined. */
export const FLOOR = 1 / 1024;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** GLSL's smoothstep. */
function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** How far a Turn's seam has come (100 all paper, 0 all night), as a share of its travel. */
export function travelled(seam: number, toward: Toward) {
  return clamp01(toward === 'night' ? (100 - seam) / 100 : seam / 100);
}

/** What one place is made of at one moment of a Turn. */
export interface Matter {
  /** The ground: 0 the night's black, 1 the sheet's own tone. */
  ground: number;
  /** How much of the ink lies on it: 0 none, 1 the Ink still's own. */
  ink: number;
  /** How much of the light is lit on it: 0 none, 1 the Light still's own. */
  light: number;
}

/**
 * A place's matter from how far the front has passed it (`passed`, 0 to 1 across the soft edge)
 * and how far the mark behind the front has arrived on it (`arrived`, 0 to 1 over the trail).
 * The ground and the departing marks change with the edge; the arriving marks follow it.
 */
export function matterOf(passed: number, arrived: number, toward: Toward): Matter {
  return toward === 'night'
    ? { ground: 1 - passed, ink: 1 - passed, light: arrived }
    : { ground: passed, ink: arrived, light: 1 - passed };
}

/**
 * The paper beneath the ink: the still itself as deep as the sheet goes, and beneath ink the
 * sheet's own tone, reached smoothly across the faintest washes.
 */
export function paperBeneath(ink: Rgb, paper: Rgb): [number, number, number] {
  return [0, 1, 2].map((c) => {
    const sheet = Math.max(paper[c], FLOOR);
    const depth = ink[c] / sheet;
    if (depth >= PAPER_DEPTH) return ink[c];
    const under = 1 - smoothstep(PAPER_DEPTH - INK_BAND, PAPER_DEPTH, depth);
    return sheet * (PAPER_DEPTH + (1 - PAPER_DEPTH) * under);
  }) as [number, number, number];
}

/**
 * One pixel, channels from 0 to 1. `ink` is the Ink still (the sheet's tone beyond the work) and
 * `light` the Light still (black beyond it). The ground is the paper beneath the ink at the
 * ground's share of its tone; the light is lit on it as light adds; the ink is a transmittance on
 * its paper, raised to how much of it has bloomed. So with the ground paper and the ink whole the
 * pixel is the Ink still, and with the ground night and the light whole it is the Light still.
 */
export function materialPixel(
  ink: Rgb,
  light: Rgb,
  paper: Rgb,
  matter: Matter,
): [number, number, number] {
  const bare = paperBeneath(ink, paper);
  return [0, 1, 2].map((c) => {
    const lit = 1 - (1 - bare[c] * matter.ground) * (1 - light[c] * matter.light);
    const transmit = Math.max(ink[c], FLOOR) / Math.max(bare[c], FLOOR);
    return lit * Math.pow(transmit, matter.ink);
  }) as [number, number, number];
}
