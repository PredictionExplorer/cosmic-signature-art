/*
  A body's light, as the Orrery draws it. The generator plans each body's colour in OKLCh around
  the body's published base hue (CS-Image-Generation src/render/color.rs: `body_base_hues_deg`,
  "per-body base hues in OKLCh degrees"), at as much chroma as Display P3 holds there. A page's
  canvas is sRGB, so the venue takes as much chroma as sRGB holds at the lightness it draws in,
  found here, rather than naming a chroma some hues cannot reach and leaving the browser to bend
  the hue back into gamut. The colours are the work's own hues; the lightness and the share of
  the gamut are the Orrery's, stated in its table (src/lib/physics/orrery.ts).
*/

const RADIANS = Math.PI / 180;
/** The most chroma any sRGB colour has in OKLCh is about 0.32; the search starts above it. */
const CHROMA_CEILING = 0.4;
/** Bisection to well under the 0.001 the colour is written to. */
const STEPS = 24;

/** Whether an OKLCh colour lies inside sRGB (Björn Ottosson's OKLab, linear sRGB in [0, 1]). */
export function inSrgb(lightness: number, chroma: number, hue: number): boolean {
  const a = chroma * Math.cos(hue * RADIANS);
  const b = chroma * Math.sin(hue * RADIANS);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const red = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const green = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const blue = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const lower = -1e-9;
  const upper = 1 + 1e-9;
  return (
    red >= lower &&
    red <= upper &&
    green >= lower &&
    green <= upper &&
    blue >= lower &&
    blue <= upper
  );
}

/** The most chroma sRGB shows at an OKLCh lightness and hue. */
export function srgbChroma(lightness: number, hue: number): number {
  if (!inSrgb(lightness, 0, hue)) return 0;
  let inside = 0;
  let outside = CHROMA_CEILING;
  for (let step = 0; step < STEPS; step++) {
    const middle = (inside + outside) / 2;
    if (inSrgb(lightness, middle, hue)) inside = middle;
    else outside = middle;
  }
  return inside;
}

/** How a body's light is drawn: its lightness, its share of the gamut there, and its alpha. */
export interface LightTone {
  lightness: number;
  /** The share of the most chroma sRGB holds at this lightness and the body's hue. */
  share: number;
  alpha: number;
}

/**
 * A body's light in its own hue, as a CSS colour a canvas takes: OKLCh, its chroma rounded down
 * to the thousandth so it never leaves sRGB, its hue as published.
 */
export function bodyLight(hue: number, { lightness, share, alpha }: LightTone): string {
  const chroma = Math.floor(srgbChroma(lightness, hue) * share * 1000) / 1000;
  return `oklch(${lightness} ${chroma} ${hue} / ${alpha})`;
}

/*
  A body itself, drawn in light: the work page's orbit section draws the three bodies so
  (orbit-painter.ts), and the Orrery draws each at the head of its trail (orrery.ts). A core near
  white, tinged with the body's hue, inside a halo of the hue that fades to nothing at its reach.
*/

/** On a plate, a body's light reaches no further than this share of the plate's height. */
export const BODY_REACH_SHARE = 0.035;

/** How far a body's light reaches, in CSS pixels: by the cube root of its mass. */
export function bodyReach(mass: number): number {
  return Math.cbrt(mass) * 0.6 * 4;
}

/** A body's light as radial-gradient stops, from its centre to its reach. */
export function bodyGlow(hue: number): [offset: number, colour: string][] {
  return [
    [0, `oklch(0.96 0.04 ${hue})`],
    [0.22, `oklch(0.9 0.08 ${hue} / 0.55)`],
    [1, 'transparent'],
  ];
}
