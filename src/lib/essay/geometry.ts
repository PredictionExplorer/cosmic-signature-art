/*
  The geometry of the essay's figures (src/app/[locale]/process/essay-figures.tsx). Pure: each
  function turns numbers the essay's registry holds into the lines a figure draws, and says
  nothing of colour or type.
*/

/** Coordinates as a path writes them: a tenth of a unit is finer than any figure is drawn. */
export const round = (value: number) => Math.round(value * 10) / 10;

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A box a drawing must fit, and the box it is given. */
interface Box {
  readonly width: number;
  readonly height: number;
  readonly pad: number;
}

/** Places points given in their own units inside a box, to one scale both ways, centred. */
function fit(points: readonly Point[], { width, height, pad }: Box) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const [left, right] = [Math.min(...xs), Math.max(...xs)];
  const [low, high] = [Math.min(...ys), Math.max(...ys)];
  const scale = Math.min(
    (width - 2 * pad) / Math.max(right - left, Number.EPSILON),
    (height - 2 * pad) / Math.max(high - low, Number.EPSILON),
  );
  // The drawing's y runs up; the page's runs down.
  return {
    scale,
    place: ({ x, y }: Point): Point => ({
      x: width / 2 + (x - (left + right) / 2) * scale,
      y: height / 2 - (y - (low + high) / 2) * scale,
    }),
  };
}

/** Two bodies alone, as the registry describes the pair (EssayWork['pairs']). */
export interface PairAlone {
  readonly bound: boolean;
  readonly eccentricity: number;
  readonly semiLatus: number;
  readonly anomaly: number;
  readonly semiMajor: number | null;
}

export interface PairDrawing {
  /** Where each body stands, in the box. */
  readonly bodies: readonly [Point, Point];
  /** Each body's ellipse about the centre the two share; nothing for a pair that is not bound. */
  readonly ellipses: readonly { cx: number; cy: number; rx: number; ry: number }[];
  /** The open curve one body follows past the other; nothing for a bound pair. */
  readonly path: string | null;
  /** The point the figure marks: the centre the two share, or the body the other passes. */
  readonly centre: Point;
  readonly scale: number;
}

/** How far out an open curve is drawn, in semi-latus recta, unless the body stands further. */
const OPEN_REACH = 5;
const OPEN_SAMPLES = 64;

/**
 * Two bodies alone, to scale. A bound pair: each body's ellipse about their common centre, the
 * heavier body's the smaller, and the two where they stand on them. A pair that is not bound:
 * the open curve the second body follows past the first, and where on it the second stands.
 */
export function pairDrawing(
  pair: PairAlone,
  masses: readonly [number, number],
  box: Box,
): PairDrawing {
  const { eccentricity: e, semiLatus: p, anomaly } = pair;
  const distance = p / (1 + e * Math.cos(anomaly));
  const toward: Point = { x: Math.cos(anomaly), y: Math.sin(anomaly) };
  if (pair.bound && pair.semiMajor !== null) {
    const total = masses[0] + masses[1];
    // Each body's own ellipse is the pair's, shrunk by the other body's share of the mass.
    const shares = [masses[1] / total, masses[0] / total] as const;
    const minor = Math.sqrt(Math.max(0, 1 - e * e));
    const raw = shares.map((share, index) => {
      const a = pair.semiMajor! * share;
      // The second body's nearest approach lies along +x; the first body's is opposite.
      const side = index === 0 ? -1 : 1;
      return {
        a,
        b: a * minor,
        centre: { x: -side * a * e, y: 0 },
        body: { x: side * share * distance * toward.x, y: side * share * distance * toward.y },
      };
    });
    const extent = raw.flatMap(({ a, b, centre }) => [
      { x: centre.x - a, y: -b },
      { x: centre.x + a, y: b },
    ]);
    const { scale, place } = fit(extent, box);
    return {
      bodies: [place(raw[0].body), place(raw[1].body)],
      ellipses: raw.map(({ a, b, centre }) => {
        const at = place(centre);
        return { cx: round(at.x), cy: round(at.y), rx: round(a * scale), ry: round(b * scale) };
      }),
      path: null,
      centre: place({ x: 0, y: 0 }),
      scale,
    };
  }
  // Not bound: the first body at the focus, the second on its open curve, drawn out to where
  // it is OPEN_REACH semi-latus recta away, or a little past where it stands if that is further.
  const reach = Math.max(OPEN_REACH * p, 1.25 * distance);
  // Never as far round as the asymptote, where the curve runs off without end.
  const asymptote = e > 1 ? Math.acos(-1 / e) : Math.PI;
  const limit = Math.min(Math.acos(Math.max(-1, (p / reach - 1) / e)), asymptote * 0.999);
  const curve: Point[] = [];
  for (let sample = 0; sample <= OPEN_SAMPLES; sample++) {
    const angle = -limit + (2 * limit * sample) / OPEN_SAMPLES;
    const r = p / (1 + e * Math.cos(angle));
    curve.push({ x: r * Math.cos(angle), y: r * Math.sin(angle) });
  }
  const focus: Point = { x: 0, y: 0 };
  const second: Point = { x: distance * toward.x, y: distance * toward.y };
  const { scale, place } = fit([...curve, focus, second], box);
  return {
    bodies: [place(focus), place(second)],
    ellipses: [],
    path: curve
      .map(place)
      .map(({ x, y }, index) => `${index ? 'L' : 'M'}${round(x)} ${round(y)}`)
      .join(''),
    centre: place(focus),
    scale,
  };
}

/** One crossing of a plait: 1 or 2 for the rows that change places, negative for the other sense. */
export type Crossing = 1 | -1 | 2 | -2;

export interface Strand {
  /** Which strand this is: 0, 1 or 2, by where it began. */
  readonly id: number;
  readonly d: string;
}

export interface Plait {
  /** The three strands, each one line from end to end. */
  readonly strands: readonly Strand[];
  /** At each crossing, the stretch of the strand that passes across, drawn again on top. */
  readonly over: readonly Strand[];
  /** The strand on each row where the drawing ends: where the next drawing begins. */
  readonly order: readonly [number, number, number];
  readonly width: number;
}

/** Where a plait is drawn: its first crossing's left edge, its top row, and its spacings. */
export interface PlaitLayout {
  readonly x: number;
  readonly y: number;
  /** The room one crossing takes along the plait. */
  readonly slot: number;
  /** The gap between rows. */
  readonly row: number;
  /** The straight run before the first crossing and after the last. */
  readonly lead: number;
}

/**
 * A plait of three strands, drawn left to right. `order` names the strand on each row at the
 * start, from the top. A positive crossing draws the upper row's strand across the lower's;
 * a negative one, the lower across the upper.
 */
export function plait(
  word: readonly Crossing[],
  order: readonly [number, number, number],
  { x, y, slot, row, lead }: PlaitLayout,
): Plait {
  const rows = [...order] as [number, number, number];
  const lines = new Map<number, string>(
    rows.map((id, at) => [id, `M${round(x - lead)} ${round(y + at * row)}`]),
  );
  const over: Strand[] = [];
  let at = x;
  for (const crossing of word) {
    const upper = Math.abs(crossing) - 1;
    const lower = upper + 1;
    const still = 3 - upper - lower;
    const sweep = (from: number, to: number) =>
      `C${round(at + slot / 2)} ${round(y + from * row)} ${round(at + slot / 2)} ${round(y + to * row)} ${round(at + slot)} ${round(y + to * row)}`;
    const down = sweep(upper, lower);
    const up = sweep(lower, upper);
    over.push(
      crossing > 0
        ? { id: rows[upper], d: `M${round(at)} ${round(y + upper * row)}${down}` }
        : { id: rows[lower], d: `M${round(at)} ${round(y + lower * row)}${up}` },
    );
    lines.set(
      rows[upper],
      `${lines.get(rows[upper])}L${round(at)} ${round(y + upper * row)}${down}`,
    );
    lines.set(rows[lower], `${lines.get(rows[lower])}L${round(at)} ${round(y + lower * row)}${up}`);
    lines.set(
      rows[still],
      `${lines.get(rows[still])}L${round(at + slot)} ${round(y + still * row)}`,
    );
    [rows[upper], rows[lower]] = [rows[lower], rows[upper]];
    at += slot;
  }
  rows.forEach((id, last) =>
    lines.set(id, `${lines.get(id)}L${round(at + lead)} ${round(y + last * row)}`),
  );
  return {
    strands: [...lines].map(([id, d]) => ({ id, d })).sort((a, b) => a.id - b.id),
    over,
    order: rows,
    width: at + lead,
  };
}

/** A long plait in lengths a narrow screen holds: each begins on the rows the last ended on. */
export function plaitLengths(
  word: readonly Crossing[],
  order: readonly [number, number, number],
  crossingsEach: number,
  layout: PlaitLayout,
): Plait[] {
  const lengths: Plait[] = [];
  let rows = order;
  for (let from = 0; from < word.length || !lengths.length; from += crossingsEach) {
    const length = plait(word.slice(from, from + crossingsEach), rows, layout);
    lengths.push(length);
    rows = length.order;
  }
  return lengths;
}

/** A chart's plot: a square of a thousand units that the page stretches to its own shape. */
export const PLOT = 1000;

/** Where a value stands on a scale of powers of ten, from the plot's foot (0) to its head (1). */
export function onLogScale(value: number, low: number, high: number): number {
  const power = value > 0 ? Math.log10(value) : low;
  return Math.min(1, Math.max(0, (power - low) / (high - low)));
}

/** A series on a scale of powers of ten, as a line across the plot. */
export function logLine(
  points: readonly (readonly [at: number, value: number])[],
  low: number,
  high: number,
): string {
  return points
    .map(
      ([at, value], index) =>
        `${index ? 'L' : 'M'}${round(at * PLOT)} ${round((1 - onLogScale(value, low, high)) * PLOT)}`,
    )
    .join('');
}

/**
 * Steady doubling, as a straight line on a scale of powers of ten: through the middle of the
 * gaps the doubling time was fitted to (between 10⁻¹¹ and 10⁻³), at that pace. Nothing when no
 * gap drawn lies in that range.
 */
export function doublingLine(
  gaps: { readonly every: number; readonly values: readonly number[] },
  doubling: number,
): { from: readonly [number, number]; to: readonly [number, number] } | null {
  const fitted = gaps.values
    .map((gap, index) => [index * gaps.every, gap] as const)
    .filter(([, gap]) => gap > 1e-11 && gap < 1e-3);
  if (!fitted.length) return null;
  const step = fitted.reduce((sum, [at]) => sum + at, 0) / fitted.length;
  const power = fitted.reduce((sum, [, gap]) => sum + Math.log10(gap), 0) / fitted.length;
  const slope = Math.LOG10E * (Math.LN2 / doubling);
  const at = (where: number) => [where, 10 ** (power + slope * (where - step))] as const;
  return { from: at(fitted[0][0]), to: at(fitted[fitted.length - 1][0]) };
}

/** Seconds between a time line's marks, so that a line of `seconds` carries three to five. */
export function clockMarks(seconds: number): number[] {
  const every = [5, 10, 15, 30, 60, 120].find((gap) => seconds / gap <= 4.5) ?? 300;
  const marks: number[] = [];
  for (let at = 0; at <= seconds + 1e-9; at += every) marks.push(at);
  return marks;
}
