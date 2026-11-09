import type { Field } from './front';
import { FRONT_EDGE } from './timing';

/*
  The run back. A plate that performs its film from the beginning does not cut from its still
  to the film's first frame, which is a bare sheet (Ink) or the night (Light). The still runs
  back to that frame first, in the reverse of the order the work was made: the marks that
  arrived last leave first, and the first marks leave last. The arrival map gives the order;
  every pixel shown is the still's or the film's own first frame, untouched, mixed only across
  the soft edge of the front as it passes. When the front has passed every mark the plate is
  the film's own frame, and the film plays on from it.
*/

/** How long the run back takes where the page sets no --t-rewind. */
export const REWIND_MS = 1600;
/** The film starts this long before its first mark, so the first mark arrives on a quiet sheet. */
export const REWIND_LEAD_S = 0.3;
/**
 * The bare ground the work never reached turns from the still's sheet to the film's over this
 * first share of the run back. The two sheets differ by a level or two (031's paper is 240, 235,
 * 222 in the still and 238, 233, 221 in the film), which a crossfade hides and a step would not.
 */
export const GROUND_TURN = 0.25;

/**
 * Where a plate's film starts when it performs from the beginning, in the player's own seconds:
 * the lead before the work's first mark, never before the player's first frame. A film whose
 * first frame is already past the mark (a settling clip) starts at its own first frame.
 */
export function openingAt(
  film: { startSeconds?: number } | undefined,
  firstMark: number | undefined,
  lead = REWIND_LEAD_S,
): number {
  const start = film?.startSeconds ?? 0;
  if (firstMark === undefined || !Number.isFinite(firstMark)) return 0;
  return Math.max(0, firstMark - lead - start);
}

/**
 * A still's departure from its sheet below this many grey levels is the sheet's own grain; from
 * there to MARK_FULL levels a pixel counts for more and more of a mark, and beyond it for one.
 */
export const MARK_FLOOR = 16;
export const MARK_FULL = 64;

/**
 * How much of the picture arrived at each of the map's 256 levels. Each pixel of the still, read
 * at the map's own size, weighs by how far it departs from the sheet's ground (its most common
 * tone: the paper, or the night); the bare ground weighs nothing, however late the map has it.
 */
export function markWeights(field: Field, rgba: Uint8ClampedArray): Float64Array {
  const count = field.data.length;
  const grey = new Uint8Array(count);
  const histogram = new Uint32Array(256);
  for (let p = 0, q = 0; p < count; p += 1, q += 4) {
    const value = Math.round((rgba[q] + rgba[q + 1] + rgba[q + 2]) / 3);
    grey[p] = value;
    histogram[value] += 1;
  }
  let ground = 0;
  for (let value = 1; value < 256; value += 1)
    if (histogram[value] > histogram[ground]) ground = value;
  const weights = new Float64Array(256);
  for (let p = 0; p < count; p += 1) {
    const departure = (Math.abs(grey[p] - ground) - MARK_FLOOR) / (MARK_FULL - MARK_FLOOR);
    if (departure > 0) weights[field.data[p]] += Math.min(1, departure);
  }
  return weights;
}

/**
 * Where the front stands once `share` of the picture has run back, in the map's 0–1: past the
 * last mark at 0 (every mark stands), before the first at 1 (none does). With the still's weights
 * it walks the levels so that equal shares take away equal shares of the marks, latest first, and
 * crosses the levels that hold only bare ground at once; without them it walks the levels evenly.
 */
export function frontAt(share: number, weights?: Float64Array | null): number {
  const s = Math.min(1, Math.max(0, share));
  let total = 0;
  if (weights) for (const weight of weights) total += weight;
  if (!weights || !(total > 0)) return 1 + FRONT_EDGE - s * (1 + 2 * FRONT_EDGE);
  // Each level's weight lies evenly across its own bin, so the walk is continuous within it.
  let remaining = s * total;
  let level = 255;
  while (level > 0 && !(weights[level] > 0)) level -= 1;
  let front = level + 0.5;
  for (; level >= 0; level -= 1) {
    const weight = weights[level];
    if (!(weight > 0)) continue;
    if (remaining <= weight) {
      front = level + 0.5 - remaining / weight;
      break;
    }
    remaining -= weight;
    front = level - 0.5;
  }
  // The soft edge leads in and trails out, so the first and last marks turn wholly inside the run.
  return front / 255 + FRONT_EDGE * (1 - 2 * s);
}

/** The latest level that holds any of the still's marks; the levels past it are bare ground. */
export function lastMark(weights?: Float64Array | null): number {
  if (weights) for (let level = 255; level >= 0; level -= 1) if (weights[level] > 0) return level;
  return 255;
}

/**
 * For a front standing at `front`, how much of the film's frame shows at each of the map's 256
 * arrival levels, as alpha: none where the mark arrived before the front (it still stands), all
 * where it arrived after (it has run back), and a smoothstep across the soft edge between, the
 * crossing's own front. The levels past `ground.above`, bare ground, show only `ground.share` of
 * that: they turn from one sheet to the other by a crossfade, not with the first frame.
 */
export function coverLevels(
  front: number,
  edge = FRONT_EDGE,
  out = new Uint8ClampedArray(256),
  ground: { above: number; share: number } = { above: 255, share: 1 },
) {
  const share = Math.min(1, Math.max(0, ground.share));
  for (let level = 0; level < 256; level++) {
    const t = Math.min(1, Math.max(0, (level / 255 - front + edge) / (2 * edge)));
    const cover = t * t * (3 - 2 * t);
    out[level] = Math.round(255 * (level > ground.above ? cover * share : cover));
  }
  return out;
}

/** The cover written into an RGBA mask's alpha, one map byte per pixel; colour is ignored. */
export function maskFrom(field: Field, levels: Uint8ClampedArray, rgba: Uint8ClampedArray) {
  const { data } = field;
  for (let p = 0, alpha = 3; p < data.length; p += 1, alpha += 4) rgba[alpha] = levels[data[p]];
  return rgba;
}

/**
 * Where `object-fit: contain` puts a source of one size in a box of another, as the plate's
 * <video> shows its frame, so the frame drawn on the canvas lies exactly where the film will.
 */
export function containRect(
  source: { width: number; height: number },
  box: { width: number; height: number },
) {
  const scale = Math.min(box.width / source.width, box.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height };
}

/** A duration token such as `1600ms` or `1.6s`; anything else is the fallback. */
export function parseDuration(value: string, fallback = REWIND_MS): number {
  const match = /^\s*([\d.]+)\s*(ms|s)\s*$/.exec(value);
  if (!match) return fallback;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return fallback;
  return match[2] === 's' ? amount * 1000 : amount;
}
