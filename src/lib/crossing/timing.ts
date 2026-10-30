/**
 * The crossing's clock, kept in step with the CSS that moves the running head and the strips:
 * the same cubic-bezier curves, read from the same tokens, and one mapping from the seam (100 %
 * all paper, 0 % all night) to how far the work's own order has been revealed.
 */

/** A CSS cubic-bezier easing as a function of time in [0, 1], solved as browsers do. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const ax = 3 * x1 - 3 * x2 + 1;
  const bx = 3 * x2 - 6 * x1;
  const cx = 3 * x1;
  const ay = 3 * y1 - 3 * y2 + 1;
  const by = 3 * y2 - 6 * y1;
  const cy = 3 * y1;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // Newton first, bisection where the slope is too flat to trust.
    let t = x;
    for (let i = 0; i < 8; i++) {
      const error = sampleX(t) - x;
      if (Math.abs(error) < 1e-6) return sampleY(t);
      const slope = slopeX(t);
      if (Math.abs(slope) < 1e-6) break;
      t -= error / slope;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 40; i++) {
      const value = sampleX(t);
      if (Math.abs(value - x) < 1e-7) break;
      if (value < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sampleY(t);
  };
}

/** `cubic-bezier(a, b, c, d)` or `linear` as written in a token; anything else is linear. */
export function parseEasing(value: string): (x: number) => number {
  const match =
    /cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/.exec(value);
  if (!match) return (x) => Math.min(1, Math.max(0, x));
  const [x1, y1, x2, y2] = match.slice(1).map(Number);
  return cubicBezier(x1, y1, x2, y2);
}

/**
 * The soft edge of a front, in map units: either side of it each pixel is one of the two stills,
 * untouched; across it the two are mixed as it passes, for about a tenth of a second at any one
 * pixel. The reveal also starts this far before the first arrival and ends this far past the
 * farthest wall, so the first and last pixels turn wholly inside the travel.
 */
export const FRONT_EDGE = 0.035;

/**
 * How far the order has been revealed for a seam position. Toward night the Light map leads
 * (the orbit drawing itself); toward paper the Ink map leads (the current coming to rest). The
 * reveal runs from just before the first mark to `end`, which already counts the walls.
 */
export function revealAt(seam: number, toward: 'night' | 'paper', end: number) {
  const share = toward === 'night' ? (100 - seam) / 100 : seam / 100;
  return -FRONT_EDGE + Math.min(1, Math.max(0, share)) * (end + FRONT_EDGE);
}

/**
 * Where the reveal ends once the walls are counted: the map's own 0–1, then the farthest point
 * of the region (the walls, the running head, the strip) at `spread` per plate height beyond
 * the plate's nearest edge, then the soft edge.
 */
export function revealEnd(
  region: { x?: number; y?: number; width: number; height: number },
  art: { x: number; y: number; width: number; height: number },
  spreadPerPlate: number,
) {
  const { x = 0, y = 0, width, height } = region;
  const corners = [
    [x, y],
    [x + width, y],
    [x, y + height],
    [x + width, y + height],
  ];
  const far = Math.max(
    ...corners.map(([cx, cy]) =>
      Math.hypot(
        Math.max(art.x - cx, 0, cx - art.x - art.width),
        Math.max(art.y - cy, 0, cy - art.y - art.height),
      ),
    ),
  );
  return 1 + (spreadPerPlate * far) / Math.max(1, art.height) + FRONT_EDGE;
}

/** The map's spread is per diagonal of its own frame; the walls are measured in plate heights. */
export function spreadPerPlate(spread: number, width: number, height: number) {
  return spread * (height / Math.hypot(width, height));
}
