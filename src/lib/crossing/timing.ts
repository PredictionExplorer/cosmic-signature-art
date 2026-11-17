/**
 * The crossing's clock, kept in step with the CSS that moves the seam: the same cubic-bezier
 * curves, read from the same tokens, forwards for where the seam is at a moment and backwards
 * for the moment at which the seam is somewhere.
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
 * An easing read backwards: for a share of the travel, the share of the time at which the curve
 * reaches it. A Turn's seam moves on its curve; this gives back the Turn's own clock from where
 * the seam is, so a change keyed to time keeps its pace through the curve's slow ends.
 */
export function invertEasing(easing: (x: number) => number) {
  return (y: number) => {
    if (y <= 0) return 0;
    if (y >= 1) return 1;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (easing(mid) < y) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
}
