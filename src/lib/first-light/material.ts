/*
  The materials the orbit is drawn in (docs/first-light.md §14): light added on night, or ink laid
  on paper. The two-dimensional drawing sets them as CSS colours (orbit-picture.ts); the light
  engine needs the same colours as numbers in linear light. This module turns the one into the
  other, so both draw one palette.

  The engine's light and paper use a plain 2.2 gamma, as its shaders read the still and write the
  canvas. A paper with no ink on it therefore comes back as exactly the tone it was given.
*/

/** The plate's material: light added on night, or ink laid on paper. */
export type Material = 'light' | 'ink';

export type Rgb = readonly [number, number, number];

/** The gamma the engine reads and writes with. */
export const GAMMA = 2.2;

/** A CSS hex colour (#rgb or #rrggbb) in the engine's linear light, or null for anything else. */
export function hexToLinear(hex: string): Rgb | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const digits =
    match[1].length === 3
      ? [...match[1]].map((digit) => digit + digit)
      : [match[1].slice(0, 2), match[1].slice(2, 4), match[1].slice(4, 6)];
  const [r, g, b] = digits.map((pair) => (parseInt(pair, 16) / 255) ** GAMMA);
  return [r, g, b];
}

/**
 * An OKLCH colour (lightness 0–1, chroma, hue in degrees) in linear sRGB, by Björn Ottosson's
 * matrices. Channels outside the gamut are clipped to it.
 */
export function oklchToLinear(lightness: number, chroma: number, hue: number): Rgb {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clip = (value: number) => Math.min(1, Math.max(0, value));
  return [
    clip(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clip(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clip(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** The same colour through the engine's gamma rather than sRGB's curve: what its canvas shows. */
export function oklchToEngine(lightness: number, chroma: number, hue: number): Rgb {
  const linear = oklchToLinear(lightness, chroma, hue);
  // Back to sRGB's own encoding, then into the engine's plain gamma.
  const encode = (channel: number) =>
    channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
  return [encode(linear[0]) ** GAMMA, encode(linear[1]) ** GAMMA, encode(linear[2]) ** GAMMA];
}

/**
 * The absorbance of a pigment, channel by channel: how much of the light under it a unit of its
 * density takes, as ink does (Beer–Lambert). Laid on any paper, a layer of density d leaves
 * paper × e^(−d × absorbance). Scaled so its strongest channel is 1, so the engine's density
 * reads the same whatever the hue.
 */
export function absorbance(pigment: Rgb): Rgb {
  const taken = pigment.map((channel) => -Math.log(Math.max(1e-4, channel)));
  const strongest = Math.max(...taken, 1e-6);
  return [taken[0] / strongest, taken[1] / strongest, taken[2] / strongest];
}

/** What the 2D drawing's sumi leaves for a body of this hue (orbit-picture.ts MATERIALS.ink). */
export function inkTrail(hue: number): Rgb {
  return absorbance(oklchToEngine(0.32, 0.02, hue));
}

/** A body's outline and centre in sumi, as the 2D drawing marks it. */
export function inkBody(hue: number): Rgb {
  return absorbance(oklchToEngine(0.22, 0.02, hue));
}

/** The paper a density lies on, as the engine's composite gives it back: e^(−d) of each channel. */
export function inkOnPaper(paper: Rgb, density: Rgb): Rgb {
  return [
    paper[0] * Math.exp(-density[0]),
    paper[1] * Math.exp(-density[1]),
    paper[2] * Math.exp(-density[2]),
  ];
}

/** Linear light back to a 0–1 channel, through the engine's gamma. */
export function encode(channel: number): number {
  return Math.min(1, Math.max(0, channel)) ** (1 / GAMMA);
}
