/**
 * The front beyond the plate. The shader turns a wall at the time of the nearest edge of the
 * work plus a short travel; the running head above the plate and the strip below it are walls
 * too, so each column of them turns when the same front reaches it. The same arithmetic as the
 * shader, on the CPU, for the few dozen columns a clip-path needs.
 */

/** An arrival map as bytes, 0 the first arrival and 255 the last. */
export interface Field {
  data: Uint8Array;
  width: number;
  height: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** The map as the GPU samples it: bilinear between texel centres, clamped at the edges. */
export function sampleField(field: Field, u: number, v: number) {
  const fx = Math.min(field.width - 1, Math.max(0, u * field.width - 0.5));
  const fy = Math.min(field.height - 1, Math.max(0, v * field.height - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(field.width - 1, x0 + 1);
  const y1 = Math.min(field.height - 1, y0 + 1);
  const at = (x: number, y: number) => field.data[y * field.width + x];
  const top = at(x0, y0) + (at(x1, y0) - at(x0, y0)) * (fx - x0);
  const bottom = at(x0, y1) + (at(x1, y1) - at(x0, y1)) * (fx - x0);
  return (top + (bottom - top) * (fy - y0)) / 255;
}

/**
 * A point's time, as the shader gives it: on the work, the map's own; beyond it, the nearest
 * edge's, averaged along that edge more widely the further away, plus `spread` per plate height.
 */
export function timeAt(field: Field, x: number, y: number, art: Box, spread: number) {
  const u = (x - art.x) / art.width;
  const v = (y - art.y) / art.height;
  const uc = clamp01(u);
  const vc = clamp01(v);
  const away = Math.hypot((u - uc) * art.width, (v - vc) * art.height) / art.height;
  if (away <= 0) return sampleField(field, uc, vc);
  const reach = Math.min(0.3, away * 0.6);
  let sum = 0;
  for (let i = -4; i <= 4; i++) {
    const offset = (i * reach) / 4;
    sum += sampleField(field, clamp01(uc + offset), vc);
    sum += sampleField(field, uc, clamp01(vc + offset));
  }
  return sum / 18 + spread * away;
}

export interface BandFront {
  /** The band's edge nearest the work, and its far edge. */
  nearY: number;
  farY: number;
  /** Where the front stands in each column: past it, toward the work, the reveal has passed. */
  points: { x: number; y: number }[];
}

/**
 * Where the front stands in each column of a band beside the work: the running head above it,
 * the strip below. A band is a few dozen pixels deep, so the time is read at its two edges and
 * the front placed between them.
 */
export function bandFront(
  field: Field,
  band: Box,
  art: Box,
  reveal: number,
  spread: number,
  columns = 48,
): BandFront {
  const above = band.y + band.height / 2 < art.y + art.height / 2;
  const nearY = above ? band.y + band.height : band.y;
  const farY = above ? band.y : band.y + band.height;
  const points = Array.from({ length: columns + 1 }, (_, column) => {
    const x = band.x + (band.width * column) / columns;
    const near = timeAt(field, x, nearY, art, spread);
    const far = timeAt(field, x, farY, art, spread);
    const share = far > near ? (reveal - near) / (far - near) : reveal >= near ? 1 : 0;
    return { x, y: nearY + (farY - nearY) * clamp01(share) };
  });
  return { nearY, farY, points };
}

const px = (value: number) => `${Math.round(value * 10) / 10}px`;

/**
 * One side of the front as a clip-path, in the pixels of the element it clips: `near` is the
 * part of the band the front has passed, `far` the part it has yet to reach.
 */
export function bandClip(
  front: BandFront,
  side: 'near' | 'far',
  element: { x: number; y: number },
) {
  const edge = side === 'near' ? front.nearY : front.farY;
  const first = front.points[0];
  const last = front.points[front.points.length - 1];
  const outline = [{ x: first.x, y: edge }, { x: last.x, y: edge }, ...[...front.points].reverse()];
  return `polygon(${outline.map(({ x, y }) => `${px(x - element.x)} ${px(y - element.y)}`).join(', ')})`;
}
