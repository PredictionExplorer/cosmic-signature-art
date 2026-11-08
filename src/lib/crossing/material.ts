/**
 * The Turn as a change of material (docs/first-light.md, "The Turn as a change of material, as
 * built"). The two stills are registered to one frame, so a Turn by time can leave everything
 * where it is and change what it is made of.
 *
 * - Toward paper the night's black warms to the sheet's own tone, the light's colour drains,
 *   and the ink blooms where the trails ran, in the order it came to rest.
 * - Toward night the ink lifts in the reverse of that order, the ground cools, and the light
 *   rises in the order its film drew it.
 *
 * Every stage is a share of the Turn's own time, so the Turn's clock carries them all, a
 * reversal retraces them, and the walls, the running head and the strip take the ground's colour
 * on the same frame. At either end the plate is the published still itself, exactly. The shader
 * in arrival-crossing.ts paints each pixel with the arithmetic of `materialPixel` below.
 */

export type Toward = 'night' | 'paper';
export type Rgb = readonly [number, number, number];

/** Where a stage begins and ends, as shares of the Turn's time from 0 to 1. */
export type Span = readonly [number, number];

/**
 * The Turns that change material: the Turn by time alone. A finger's Turn keeps the crossing
 * pixel by pixel, the venue's own gesture, and so does the Overture's landing.
 */
export const MATERIAL_MODES: readonly string[] = ['time'];

/** The soft edge of the ink's bloom and of the light's rise, in each order's own units. */
export const MATERIAL_EDGE = 0.08;

/** Toward paper. */
export const TOWARD_PAPER = {
  /** The night's black warms to the sheet's own tone. */
  ground: [0, 0.45],
  /** The light's colour drains, */
  drain: [0.1, 0.45],
  /** and what is left of it goes out, wherever the ink has not already taken its place. */
  fade: [0.35, 0.7],
  /** The ink blooms, in the order it came to rest. */
  ink: [0.35, 1],
} as const satisfies Record<string, Span>;

/** Toward night. */
export const TOWARD_NIGHT = {
  /** The ink lifts, the last of it to rest the first to go. */
  ink: [0, 0.45],
  /** The ground cools to the night. */
  ground: [0.25, 0.7],
  /** The light rises, in the order its film drew it. */
  light: [0.45, 1],
} as const satisfies Record<string, Span>;

/**
 * The strip's words change hands while the ground is about half-way between its two tones,
 * where either set of words has the least contrast to lose.
 */
export const WORDS: Span = [0.4, 0.6];

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

/** What counts as a mark when an order's span is read: ink this much darker than its sheet. */
export const INK_MARK = 0.15;
/** Light at least this bright on its black. */
export const LIGHT_MARK = 0.1;
/** An order runs over its marks from this share of them to its complement, so strays cannot stretch it. */
export const MARK_TAIL = 0.02;

/** Where each part of the change stands for one seam position. */
export interface Material {
  /** How far the Turn has come in its own time: 0 the departing still, 1 the arriving one. */
  progress: number;
  /** The ground: 0 the night's black, 1 the sheet's own tone. */
  ground: number;
  /** The light's colour: 0 its own, 1 drained to grey. */
  drain: number;
  /** How much of the light is still lit (toward paper; toward night the order decides). */
  lit: number;
  /** Where the Ink order stands, from just before its first mark to just past its last. */
  ink: number;
  /** Where the Light order stands (toward night). */
  light: number;
  /** The strip's words: 0 the departing layer's, 1 the arriving layer's. */
  words: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** GLSL's smoothstep. */
export function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** A stage's share at time `t`: 0 before its span, 1 after it, eased between. */
const stage = ([from, to]: Span, t: number) => smoothstep(from, to, t);

/** An order revealed across a span: from just before its first mark to just past its last. */
const order = ([from, to]: Span, t: number) =>
  -MATERIAL_EDGE + clamp01((t - from) / (to - from)) * (1 + 2 * MATERIAL_EDGE);

/** Whether a Turn travelling in this mode changes material. */
export function changesMaterial(mode: string | null) {
  return mode !== null && MATERIAL_MODES.includes(mode);
}

/** How far a Turn's seam has come (100 all paper, 0 all night), as a share of its travel. */
export function travelled(seam: number, toward: Toward) {
  return clamp01(toward === 'night' ? (100 - seam) / 100 : seam / 100);
}

/**
 * Every stage of the change at a seam position. `clock` gives the Turn's own time for the share
 * of the travel the seam has made: the inverse of the curve the seam travels on, so the stages
 * keep an even pace through the curve's slow start and slow end.
 */
export function materialAt(
  seam: number,
  toward: Toward,
  clock: (travel: number) => number = (travel) => travel,
): Material {
  const share = travelled(seam, toward);
  // The ends are the ends exactly, whatever the clock rounds them to.
  const progress = share <= 0 ? 0 : share >= 1 ? 1 : clamp01(clock(share));
  if (toward === 'paper') {
    const ground = stage(TOWARD_PAPER.ground, progress);
    return {
      progress,
      ground,
      drain: stage(TOWARD_PAPER.drain, progress),
      lit: 1 - stage(TOWARD_PAPER.fade, progress),
      ink: order(TOWARD_PAPER.ink, progress),
      light: 1 + MATERIAL_EDGE,
      words: stage(WORDS, ground),
    };
  }
  const ground = 1 - stage(TOWARD_NIGHT.ground, progress);
  return {
    progress,
    ground,
    drain: 0,
    lit: 1,
    ink: order(TOWARD_NIGHT.ink, progress),
    light: order(TOWARD_NIGHT.light, progress),
    words: stage(WORDS, 1 - ground),
  };
}

/** How far the ground has come toward one of its two tones. */
export function groundToward(change: Material, ground: 'night' | 'paper') {
  return ground === 'paper' ? change.ground : 1 - change.ground;
}

/** Rec. 709 weights, on the stills' own encoded values as the shader reads them. */
export function luma([r, g, b]: Rgb) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** A pixel's place in an order, measured over the marks' own span. */
export function placeIn(time: number, [first, last]: Span) {
  return clamp01((time - first) / Math.max(last - first, 1e-3));
}

/**
 * The marks' own span in an order, from its first marks to its last. `times` is the arrival map
 * (0 the first arrival, 255 the last) and `rgba` the still at the map's size. A Light mark is
 * light on its black; an Ink mark is ink on its sheet, whose tone is the still's own (most of a
 * sheet is paper, so its fifth-brightest share is). The whole order where no marks are found.
 */
export function markSpan(
  times: Uint8Array,
  rgba: Uint8ClampedArray,
  material: 'ink' | 'light',
): Span {
  const pixels = Math.min(times.length, Math.floor(rgba.length / 4));
  // Brightness in bytes, counted once: the sheet's tone is read from the counts.
  const lums = new Uint8Array(pixels);
  const tones = new Uint32Array(256);
  for (let p = 0; p < pixels; p++) {
    const level = Math.round(
      luma([rgba[p * 4] / 255, rgba[p * 4 + 1] / 255, rgba[p * 4 + 2] / 255]) * 255,
    );
    lums[p] = level;
    tones[level] += 1;
  }
  const paper = material === 'ink' ? Math.max(rank(tones, pixels, 0.8), 1) / 255 : 1;
  const counts = new Uint32Array(256);
  let marks = 0;
  for (let p = 0; p < pixels; p++) {
    const lum = lums[p] / 255;
    const marked = material === 'light' ? lum >= LIGHT_MARK : (paper - lum) / paper >= INK_MARK;
    if (!marked) continue;
    counts[times[p]] += 1;
    marks += 1;
  }
  if (marks < 16) return [0, 1];
  return [rank(counts, marks, MARK_TAIL) / 255, rank(counts, marks, 1 - MARK_TAIL) / 255];
}

/** The value at a share of a count of byte values, from the lowest. */
function rank(counts: Uint32Array, total: number, share: number) {
  const place = share * (total - 1);
  let seen = 0;
  for (let value = 0; value < counts.length; value++) {
    seen += counts[value];
    if (seen > place) return value;
  }
  return counts.length - 1;
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
 * One pixel of the change, channels from 0 to 1. `ink` is the Ink still (the sheet's tone beyond
 * the work), `light` the Light still (black beyond it), and `at` the pixel's time in each map,
 * placed in its order by the marks' own `spans`. The ground is the paper beneath the ink at the
 * ground's share of its tone; the light is lit on it as light adds; the ink is a transmittance on
 * its paper whose density grows as it blooms (Beer–Lambert), so a bloomed pixel is the Ink still.
 */
export function materialPixel(
  ink: Rgb,
  light: Rgb,
  paper: Rgb,
  at: { ink: number; light: number },
  change: Material,
  toward: Toward,
  spans: { ink: Span; light: Span } = { ink: [0, 1], light: [0, 1] },
): [number, number, number] {
  if (change.progress <= 0) return [...(toward === 'night' ? ink : light)];
  if (change.progress >= 1) return [...(toward === 'night' ? light : ink)];
  const bare = paperBeneath(ink, paper);
  const inkAt = placeIn(at.ink, spans.ink);
  let inkOn: number;
  let lightOn: number;
  if (toward === 'night') {
    inkOn = smoothstep(change.ink - MATERIAL_EDGE, change.ink + MATERIAL_EDGE, 1 - inkAt);
    lightOn =
      1 -
      smoothstep(
        change.light - MATERIAL_EDGE,
        change.light + MATERIAL_EDGE,
        placeIn(at.light, spans.light),
      );
  } else {
    inkOn = 1 - smoothstep(change.ink - MATERIAL_EDGE, change.ink + MATERIAL_EDGE, inkAt);
    lightOn = change.lit * (1 - inkOn);
  }
  const grey = luma(light);
  return [0, 1, 2].map((c) => {
    const glow = (light[c] + (grey - light[c]) * change.drain) * lightOn;
    const lit = 1 - (1 - bare[c] * change.ground) * (1 - glow);
    const transmit = Math.max(ink[c], FLOOR) / Math.max(bare[c], FLOOR);
    return lit * Math.pow(transmit, inkOn);
  }) as [number, number, number];
}

/** The ground's colour for the page's own surfaces, in the bytes the canvas rounds it to. */
export function groundColour(paper: Rgb, ground: number) {
  const [r, g, b] = paper.map((channel) => Math.round(channel * clamp01(ground) * 255));
  return `rgb(${r}, ${g}, ${b})`;
}
