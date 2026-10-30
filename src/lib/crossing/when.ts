/**
 * The When lens: a still with each mark coloured by when its film reached it, on a dark ground.
 * A derived view, labelled analysis, never the work and never a sharing card. The ramp is
 * stated, not drawn from the work: blue for the first marks, rose, then pale gold for the last.
 */

/** The ramp's three stops, first to last, in sRGB bytes. */
export const WHEN_RAMP = [
  [77, 92, 242],
  [237, 102, 140],
  [255, 224, 158],
] as const;
/** The ground beneath the marks: near black, a breath of blue. */
export const WHEN_GROUND = [9, 9, 10] as const;

/** The ramp at `t` from 0 (first) to 1 (last). */
export function rampAt(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t)) * 2;
  const [a, b] = x < 1 ? [WHEN_RAMP[0], WHEN_RAMP[1]] : [WHEN_RAMP[1], WHEN_RAMP[2]];
  const k = x < 1 ? x : x - 1;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** Rec. 709 luminance of an sRGB byte triple, 0–1. */
export function luminance(r: number, g: number, b: number) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * How much of a pixel is a mark: in Light, its brightness on black; in Ink, its darkness on
 * the sheet's own paper. Faint veils count a little, the ground not at all.
 */
export function markWeight(material: 'ink' | 'light', lum: number, paper: number) {
  return material === 'light'
    ? smoothstep(0.025, 0.45, lum)
    : smoothstep(0.03, 0.55, (paper - lum) / Math.max(paper, 1e-3));
}

/**
 * Paint the lens. `still` and `map` are RGBA pixels of one size (the map already scaled to the
 * still); the map's red channel is the time, 0 first and 255 last. The ramp spans the marks'
 * own times, so the first mark is blue and the last pale gold whatever the ground's spread.
 */
export function paintWhen(
  still: Uint8ClampedArray,
  map: Uint8ClampedArray,
  out: Uint8ClampedArray,
  material: 'ink' | 'light',
  paper: number,
) {
  const weights = new Float32Array(256);
  for (let level = 0; level < 256; level++)
    weights[level] = markWeight(material, level / 255, paper);
  let first = 255;
  let last = 0;
  const pixels = still.length / 4;
  const lums = new Uint8Array(pixels);
  for (let p = 0, i = 0; p < pixels; p++, i += 4) {
    const lum = Math.round(luminance(still[i], still[i + 1], still[i + 2]) * 255);
    lums[p] = lum;
    if (weights[lum] < 0.5) continue;
    const time = map[i];
    if (time < first) first = time;
    if (time > last) last = time;
  }
  const span = Math.max(1, last - first);
  const colours = Array.from({ length: 256 }, (_, time) => rampAt((time - first) / span));
  for (let p = 0, i = 0; p < pixels; p++, i += 4) {
    const weight = weights[lums[p]];
    const colour = colours[map[i]];
    out[i] = colour[0] * weight + WHEN_GROUND[0] * (1 - weight);
    out[i + 1] = colour[1] * weight + WHEN_GROUND[1] * (1 - weight);
    out[i + 2] = colour[2] * weight + WHEN_GROUND[2] * (1 - weight);
    out[i + 3] = 255;
  }
  return { first: first / 255, last: last / 255 };
}

/** `#f1ebdf` as luminance, 0–1; paper white when unreadable. */
export function hexLuminance(hex: string) {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!match) return luminance(241, 235, 223);
  return luminance(
    ...(match.slice(1).map((part) => parseInt(part, 16)) as [number, number, number]),
  );
}
