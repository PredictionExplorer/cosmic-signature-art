/**
 * Where each body came to rest on its Ink still (third-physics-phase-d.md §7).
 *
 * The Ink edition stirs its sumi with the orbit's three bodies, placed where the Light film draws
 * the heads of their trails: the same projection, view, drift and fit, and the primary copy of a
 * kaleidoscope (CS-Image-Generation, docs/ember-design.md §3). Each body is an ellipse of the area
 * of a disc whose radius is 2.5 % of the sheet's height, and holds no ink. The still is the
 * window's last step, so each body has left a hollow where it stood: paper, ringed by ink. This
 * finds that hollow around a place on a grey raster of the still.
 */

/** The Ink edition's body, as a share of the sheet's height: a disc of radius 0.05 on a canvas two units high. */
export const BODY_RADIUS = 0.025;

export const HOLLOW = Object.freeze({
  /** Bare paper: the still's luminance at this quantile; a pixel within `margin` of it is paper. */
  paperQuantile: 0.7,
  margin: 18,
  /** A body stands on paper when a paper pixel lies within this many radii of its place. */
  seedReach: 0.2,
  /** The hollow is looked for this many radii around the place; past them the paper is open. */
  reach: 3,
  /** A hollow is the body's when it is a body's size, in radii, and centred within `offset` radii. */
  accept: Object.freeze({ radius: Object.freeze([0.8, 1.6]), offset: 1 / 3 }),
});

/** The luminance of bare paper on a grey raster of an Ink still. */
export function paperLevel(grey, quantile = HOLLOW.paperQuantile) {
  const counts = new Array(256).fill(0);
  for (const value of grey) counts[value] += 1;
  const above = grey.length * (1 - quantile);
  let seen = 0;
  for (let value = 255; value >= 0; value--) {
    seen += counts[value];
    if (seen >= above) return value;
  }
  return 0;
}

const round = (value) => Math.round(value * 10_000) / 10_000;

/**
 * The paper around a body's place (`x`, `y` in the raster's pixels): whether the place is paper,
 * and the hollow it stands in, if the paper closes around it within reach: its centre's offset
 * from the place and its radius as a disc of the same area, both in body radii.
 */
export function hollowAt(grey, width, height, x, y, paper, parameters = HOLLOW) {
  const radius = BODY_RADIUS * height;
  const threshold = paper - parameters.margin;
  const reach = parameters.reach * radius;
  const isPaper = (px, py) =>
    px >= 0 && py >= 0 && px < width && py < height && grey[py * width + px] >= threshold;
  // The nearest paper to the place, ring by ring.
  const cx = Math.round(x);
  const cy = Math.round(y);
  const near = Math.ceil(parameters.seedReach * radius);
  let seed = null;
  for (let ring = 0; ring <= near && !seed; ring++)
    for (let dy = -ring; dy <= ring && !seed; dy++)
      for (let dx = -ring; dx <= ring && !seed; dx++)
        if (Math.max(Math.abs(dx), Math.abs(dy)) === ring && isPaper(cx + dx, cy + dy))
          seed = [cx + dx, cy + dy];
  if (!seed) return { paper: false, hollow: null };

  // The paper connected to it, within reach; reaching past it, or the sheet's edge, is open.
  const side = 2 * Math.ceil(reach) + 3;
  const left = cx - (side >> 1);
  const top = cy - (side >> 1);
  const seen = new Uint8Array(side * side);
  const mark = (px, py) => (seen[(py - top) * side + (px - left)] = 1);
  const marked = (px, py) => seen[(py - top) * side + (px - left)] === 1;
  const stack = [seed];
  mark(...seed);
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  let open = false;
  while (stack.length) {
    const [px, py] = stack.pop();
    sumX += px;
    sumY += py;
    count += 1;
    for (const [nx, ny] of [
      [px + 1, py],
      [px - 1, py],
      [px, py + 1],
      [px, py - 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        open = true;
        continue;
      }
      if (Math.hypot(nx - x, ny - y) > reach) {
        if (isPaper(nx, ny)) open = true;
        continue;
      }
      if (marked(nx, ny) || !isPaper(nx, ny)) continue;
      mark(nx, ny);
      stack.push([nx, ny]);
    }
  }
  if (open) return { paper: true, hollow: null };
  return {
    paper: true,
    hollow: {
      offset: round(Math.hypot(sumX / count - x, sumY / count - y) / radius),
      radius: round(Math.sqrt(count / Math.PI) / radius),
    },
  };
}

/** Whether a body stands in a hollow of its own: a body's size, centred on its place. */
export function inOwnHollow({ hollow }, { accept } = HOLLOW) {
  return (
    !!hollow &&
    hollow.radius >= accept.radius[0] &&
    hollow.radius <= accept.radius[1] &&
    hollow.offset <= accept.offset
  );
}

/**
 * Whether a still bears out its bodies' places: every body stands on paper, since a body holds
 * no ink, and at least one stands in a hollow of its own. Bodies that end close together share
 * one hollow, and a body at the ink's edge leaves its hollow open to the paper beyond, so the
 * other two may do neither. Three places drawn at random bear a still out a few times in a
 * thousand; every work's own places do.
 */
export function bearsOut(bodies, parameters = HOLLOW) {
  return (
    bodies.length > 0 &&
    bodies.every((body) => body.paper) &&
    bodies.some((body) => inOwnHollow(body, parameters))
  );
}
