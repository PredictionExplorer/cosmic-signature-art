/**
 * The sheet: one field for the whole first screen of a work. It says, for every point of the
 * plate, of the walls beside it, of the strip beneath it, of the running head above it and of
 * the page beyond them, when the Turn's front reaches that point. Everything that turns reads
 * this one field: the canvas that paints the two grounds and the work, the head's and the page's
 * own grounds, and every word that stands on them. Two functions are the whole of it:
 *
 * - `sheetTime(sheet, x, y)`: when the front reaches a point;
 * - `frontAt(sheet, share)`: where the front stands for a share of the Turn's travel.
 *
 * A point has turned when its time is earlier than the front (`passed`).
 *
 * On the work the field is the work's own arrival map (`npm run art:arrival`): Light where its
 * film first drew it, Ink where its film came to rest. The maps spread each mark's time over the
 * bare ground at one pace, so the sheet carries the same front on, past the work's edge, at that
 * pace: the walls, the strip, the head and the page turn as one sheet with the plate.
 *
 * Nothing here knows of a page or a canvas, so the same file lays a sheet in a worker
 * (`sheet.worker.ts`), reads it on the main thread and is tested as plain arithmetic.
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** An arrival map as numbers, 0 the first arrival and 255 the last, a row at a time. */
export interface Order {
  data: Float32Array;
  width: number;
  height: number;
}

export interface Sheet {
  /** The front's time at each cell, a row at a time: 0 the work's first mark, 1 its last. */
  time: Float32Array;
  cols: number;
  rows: number;
  /** A cell's side, in the pixels the region is measured in. */
  cell: number;
  /** What the cells cover, in the same pixels as the work's own box. */
  region: Box;
  /** The work's own box on the sheet. */
  art: Box;
  /** The earliest and the latest time anywhere on the sheet. */
  first: number;
  last: number;
  /** The latest time on the work itself: the last place a mark can arrive. */
  lastOnWork: number;
  /** How much later the front is one pixel further on, on bare ground. */
  pace: number;
}

/** Half the soft edge of the front, in CSS pixels: the two grounds meet across twice this. */
export const EDGE_PX = 5;
/**
 * A mark arrives on its ground a little after the ground itself: the front travels this share of
 * the work's height in between.
 */
export const TRAIL_SHARE = 0.1;
/**
 * How much of the map's own pace the sheet's fronts keep. A little under it, so that the front
 * from an early mark always reaches its neighbours before their own bytes would turn them. The
 * map's eight-bit steps and the corners of its chamfered distances then never show, and what is
 * left is the map's own order, its fronts drawn round.
 */
export const PACE_SHARE = 0.94;
/** The most cells a sheet is laid on: past it a cell grows, and the fronts stay as smooth. */
const MAX_CELLS = 320_000;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** GLSL's smoothstep. */
export function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** One box blur of the given radius, the edges held. */
function blur(source: Float32Array, width: number, height: number, radius: number) {
  const across = new Float32Array(source.length);
  const out = new Float32Array(source.length);
  const span = 2 * radius + 1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += source[row + clamp(x, 0, width - 1)];
    for (let x = 0; x < width; x++) {
      across[row + x] = sum / span;
      sum +=
        source[row + Math.min(width - 1, x + radius + 1)] - source[row + Math.max(0, x - radius)];
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += across[clamp(y, 0, height - 1) * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum / span;
      sum +=
        across[Math.min(height - 1, y + radius + 1) * width + x] -
        across[Math.max(0, y - radius) * width + x];
    }
  }
  return out;
}

/**
 * A published map is eight bits deep, and its values were rounded to whole steps. This gives
 * back a smooth field that still rounds to the published bytes: it is smoothed a few times, and
 * after each pass no value may lie further than half a step from the byte it was read as.
 */
export function unstep(
  bytes: ArrayLike<number>,
  width: number,
  height: number,
  { radius = 2, passes = 3 }: { radius?: number; passes?: number } = {},
): Order {
  let data = Float32Array.from(bytes);
  for (let pass = 0; pass < passes; pass++) {
    data = blur(data, width, height, radius);
    for (let p = 0; p < data.length; p++) data[p] = clamp(data[p], bytes[p] - 0.5, bytes[p] + 0.5);
  }
  return { data, width, height };
}

/** The slopes the pace is read from: bins of a sixty-fourth of a step per texel, up to 32. */
const SLOPE_BINS = 2048;
const SLOPE_BIN = 1 / 64;
/** How far apart the two readings of a slope lie, in texels either side. */
const SLOPE_REACH = 4;

/**
 * The front's pace on bare ground, in steps of the map per texel. The maps let no place turn
 * later than its neighbour's time plus the way between them at one pace, so that pace is the
 * steepest slope a map holds; its smoothing only ever made a slope gentler. The pace is read as
 * the slope nineteen twentieths of the map lie under: in a map of a few broad fronts nearly
 * every place has it, and in a map of many small ones only the places between two fronts do.
 */
export function groundPace({ data, width, height }: Order) {
  const bins = new Uint32Array(SLOPE_BINS);
  const reach = Math.min(SLOPE_REACH, Math.floor((Math.min(width, height) - 1) / 2));
  if (reach < 1) return 0;
  let read = 0;
  for (let y = reach; y < height - reach; y++)
    for (let x = reach; x < width - reach; x++) {
      const p = y * width + x;
      const across = (data[p + reach] - data[p - reach]) / (2 * reach);
      const down = (data[p + reach * width] - data[p - reach * width]) / (2 * reach);
      const slope = Math.sqrt(across * across + down * down);
      bins[Math.min(SLOPE_BINS - 1, Math.floor(slope / SLOPE_BIN))] += 1;
      read += 1;
    }
  let under = 0;
  for (let bin = 0; bin < SLOPE_BINS; bin++) {
    under += bins[bin];
    if (under >= read * 0.95) return (bin + 0.5) * SLOPE_BIN;
  }
  return SLOPE_BINS * SLOPE_BIN;
}

/** The order as a GPU samples it: bilinear between texel centres, held at the edges. */
function orderAt({ data, width, height }: Order, u: number, v: number) {
  const fx = clamp(u * width - 0.5, 0, width - 1);
  const fy = clamp(v * height - 0.5, 0, height - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const top = data[y0 * width + x0] + (data[y0 * width + x1] - data[y0 * width + x0]) * (fx - x0);
  const bottom =
    data[y1 * width + x0] + (data[y1 * width + x1] - data[y1 * width + x0]) * (fx - x0);
  return (top + (bottom - top) * (fy - y0)) / 255;
}

/**
 * Lay the sheet: the order over the work, carried on past its edge. `region` is everything that
 * turns with the plate and `art` the work inside it, in the same pixels.
 *
 * A map is, very nearly, the earliest of (a mark's time plus the way from it at the ground's
 * pace). The sheet is laid as exactly that. Every cell on the work is a source with the map's
 * own time, and every cell of the sheet, on the work or beyond it, takes the earliest of (a
 * source's time plus the straight way from that source). A cell remembers where its front set
 * out from, and offers that same source to its neighbours, so the way is measured whole and
 * never summed step by step: the fronts are round, wherever they began.
 */
export function laySheet(order: Order, region: Box, art: Box): Sheet {
  const texel = art.width / order.width;
  const cell = Math.max(1, texel, Math.sqrt((region.width * region.height) / MAX_CELLS));
  const cols = Math.max(2, Math.ceil(region.width / cell));
  const rows = Math.max(2, Math.ceil(region.height / cell));
  const cells = cols * rows;
  const time = new Float32Array(cells).fill(Infinity);
  /** Where each cell's front set out from, and when: none yet beyond the work. */
  const fromCol = new Int16Array(cells).fill(-1);
  const fromRow = new Int16Array(cells).fill(-1);
  const fromTime = new Float32Array(cells);
  const onWork = new Uint8Array(cells);
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++) {
      const u = (region.x + (col + 0.5) * cell - art.x) / art.width;
      const v = (region.y + (row + 0.5) * cell - art.y) / art.height;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      const p = row * cols + col;
      time[p] = fromTime[p] = orderAt(order, u, v);
      fromCol[p] = col;
      fromRow[p] = row;
      onWork[p] = 1;
    }
  const pace = (PACE_SHARE * groundPace(order)) / 255 / texel;
  const perCell = pace * cell;
  /** Offer cell `q`'s source to cell `p`, at (`col`, `row`): taken if its front comes sooner. */
  const offer = (p: number, col: number, row: number, q: number) => {
    const sourceCol = fromCol[q];
    if (sourceCol < 0) return;
    const sourceRow = fromRow[q];
    if (sourceCol === fromCol[p] && sourceRow === fromRow[p]) return;
    const across = col - sourceCol;
    const down = row - sourceRow;
    const reached = fromTime[q] + perCell * Math.sqrt(across * across + down * down);
    if (reached >= time[p]) return;
    time[p] = reached;
    fromCol[p] = sourceCol;
    fromRow[p] = sourceRow;
    fromTime[p] = fromTime[q];
  };
  // A sweep down the sheet and a sweep back up, each row read both ways, carry every source to
  // every cell it reaches first. The second pair mends what the first met out of order.
  for (let sweep = 0; sweep < 2; sweep++) {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const p = row * cols + col;
        if (col > 0) offer(p, col, row, p - 1);
        if (row > 0) {
          offer(p, col, row, p - cols);
          if (col > 0) offer(p, col, row, p - cols - 1);
          if (col < cols - 1) offer(p, col, row, p - cols + 1);
        }
      }
      for (let col = cols - 2; col >= 0; col--)
        offer(row * cols + col, col, row, row * cols + col + 1);
    }
    for (let row = rows - 1; row >= 0; row--) {
      for (let col = cols - 1; col >= 0; col--) {
        const p = row * cols + col;
        if (col < cols - 1) offer(p, col, row, p + 1);
        if (row < rows - 1) {
          offer(p, col, row, p + cols);
          if (col < cols - 1) offer(p, col, row, p + cols + 1);
          if (col > 0) offer(p, col, row, p + cols - 1);
        }
      }
      for (let col = 1; col < cols; col++) offer(row * cols + col, col, row, row * cols + col - 1);
    }
  }
  let first = Infinity;
  let last = -Infinity;
  let lastOnWork = -Infinity;
  for (let p = 0; p < cells; p++) {
    const value = time[p];
    if (value < first) first = value;
    if (value > last) last = value;
    if (onWork[p] && value > lastOnWork) lastOnWork = value;
  }
  // A region that holds none of the work has no order to give: it turns at once.
  if (!Number.isFinite(first)) {
    time.fill(0);
    first = last = lastOnWork = 0;
  } else if (!Number.isFinite(lastOnWork)) lastOnWork = last;
  return { time, cols, rows, cell, region, art, first, last, lastOnWork, pace };
}

/** A work's two arrival maps as their bytes, each 0 the first arrival and 255 the last. */
export interface Maps {
  width: number;
  height: number;
  ink: Uint8Array;
  light: Uint8Array;
}

/** A work's two orders, with the maps' steps taken out. */
export interface Orders {
  ink: Order;
  light: Order;
}

/** The sheet for each ground a Turn can bring. */
export interface Sheets {
  night: Sheet;
  paper: Sheet;
}

export function ordersOf({ width, height, ink, light }: Maps): Orders {
  return { ink: unstep(ink, width, height), light: unstep(light, width, height) };
}

/**
 * Both sheets for one layout. Toward the night the front follows the order the Light film drew
 * the work in; toward the paper, the order the Ink film came to rest in.
 */
export function laySheets(orders: Orders, region: Box, art: Box): Sheets {
  return { night: laySheet(orders.light, region, art), paper: laySheet(orders.ink, region, art) };
}

/**
 * When the front reaches a point, in the region's pixels: the sheet read between its cells, as
 * the canvas reads it. Past the region's own edge the front goes on from the nearest point of it
 * at the ground's pace, so whatever of the page shows beyond the sheet turns with it.
 */
export function sheetTime(sheet: Sheet, x: number, y: number) {
  const { time, cols, rows, cell, region, pace } = sheet;
  const inX = clamp(x, region.x, region.x + region.width);
  const inY = clamp(y, region.y, region.y + region.height);
  const fx = clamp((inX - region.x) / cell - 0.5, 0, cols - 1);
  const fy = clamp((inY - region.y) / cell - 0.5, 0, rows - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(cols - 1, x0 + 1);
  const y1 = Math.min(rows - 1, y0 + 1);
  const top = time[y0 * cols + x0] + (time[y0 * cols + x1] - time[y0 * cols + x0]) * (fx - x0);
  const bottom = time[y1 * cols + x0] + (time[y1 * cols + x1] - time[y1 * cols + x0]) * (fx - x0);
  const here = top + (bottom - top) * (fy - y0);
  if (inX === x && inY === y) return here;
  return here + pace * Math.sqrt((x - inX) * (x - inX) + (y - inY) * (y - inY));
}

/** Half the front's soft edge, in the sheet's own time. */
export function edgeOf(sheet: Sheet) {
  return EDGE_PX * sheet.pace;
}

/** How long after its ground a mark arrives, in the sheet's own time. */
export function trailOf(sheet: Sheet) {
  return TRAIL_SHARE * sheet.art.height * sheet.pace;
}

/**
 * Where the front stands for a share of the Turn's travel: at 0 nothing has turned, and at 1
 * the whole sheet has, with the last mark arrived on the work. `reach` is the latest time of
 * anything else the front must pass, where the page shows beyond the sheet.
 */
export function frontAt(sheet: Sheet, share: number, reach = sheet.last) {
  const edge = edgeOf(sheet);
  const from = sheet.first - edge;
  const to = Math.max(Math.max(sheet.last, reach) + edge, sheet.lastOnWork + edge + trailOf(sheet));
  return from + clamp(share, 0, 1) * (to - from);
}

/** How far the front has passed a place with this time: 0 not reached, 1 wholly turned. */
export function passed(time: number, front: number, edge: number) {
  return 1 - smoothstep(front - edge, front + edge, time);
}

/** How far a mark has arrived on a place the front passed: 0 at the front, 1 a trail behind it. */
export function arrived(time: number, front: number, trail: number) {
  return smoothstep(0, 1, (front - time) / Math.max(trail, 1e-9));
}

/**
 * The sheet as a texture's bytes: each cell's time in sixteen bits, across the red and the green
 * channel, from `first` to `last`. A canvas reads it back as `first + (last − first) × value`.
 */
export function sheetBytes(sheet: Sheet) {
  const bytes = new Uint8Array(sheet.time.length * 4);
  const span = Math.max(1e-9, sheet.last - sheet.first);
  for (let p = 0; p < sheet.time.length; p++) {
    const value = Math.round(clamp((sheet.time[p] - sheet.first) / span, 0, 1) * 65535);
    bytes[p * 4] = value >> 8;
    bytes[p * 4 + 1] = value & 255;
    bytes[p * 4 + 3] = 255;
  }
  return bytes;
}
