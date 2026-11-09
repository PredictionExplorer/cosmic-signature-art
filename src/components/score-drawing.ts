import { SCORE_PAIRS } from '@/lib/physics/film-score';

/*
  The score as it is drawn (third-physics.md §5.5), by the orbit beneath the plate and by the
  films' transports alike: the three pairs' separations on a logarithmic scale, apart upward,
  each in the hue between its two bodies' own; and ticks rising from the base at each braid
  crossing, each syzygy and the closest approach, so an encounter dips to the tick that marks
  it. Colour comes from the work's published hues, in the material of the ground the score lies
  on; the ticks keep the type's colour.
*/

/**
 * The pairs' lines in each material: light on night, and on paper graphite with a trace of the
 * pair's hue, as the orbit section draws the Ink plate (orbit-picture.ts).
 */
export const SCORE_LINES = {
  light: (hue: number, alpha: number) => `oklch(0.8 0.07 ${hue} / ${alpha})`,
  ink: (hue: number, alpha: number) => `oklch(0.32 0.02 ${hue} / ${alpha})`,
} as const;

/** What the drawing needs of a score: separations sampled `stride` steps apart, and events. */
export interface ScoreTrace {
  /** The three separations at each sample, in SCORE_PAIRS order. */
  separations: ArrayLike<number>;
  count: number;
  stride: number;
  closestApproach: { step: number };
  syzygies: readonly number[];
  /** The step of each braid crossing. */
  crossings: readonly number[];
}

export interface ScoreLayout {
  /** The canvas's pixels per CSS pixel. */
  ratio: number;
  /** Where a step of the window falls across the canvas, in its pixels. */
  x: (step: number) => number;
  /** The band the separations are drawn in, in the canvas's pixels from its top. */
  lane: { top: number; height: number };
  /** The base the ticks rise from, in the canvas's pixels from its top. */
  base: number;
  /** Each tick's length in CSS pixels. */
  ticks: { crossing: number; syzygy: number; closest: number };
  /** The opacity of the separations' lines. */
  lineAlpha: number;
  /** The separations' lines' colour for a hue and an opacity: light on night unless told. */
  line?: (hue: number, alpha: number) => string;
  /** The ticks' colour, any CSS colour. */
  ink: string;
  /** Draw every this many samples. */
  every?: number;
}

/** The hue halfway between two bodies' hues, the short way round the circle. */
export function pairHue(hues: readonly number[], [a, b]: readonly [number, number]): number {
  const difference = ((((hues[b] - hues[a]) % 360) + 540) % 360) - 180;
  return (((hues[a] + difference / 2) % 360) + 360) % 360;
}

/** The separations' extent on the logarithmic scale every score is drawn against. */
function logExtent(trace: ScoreTrace) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < trace.count * 3; i++) {
    const value = Math.log(trace.separations[i]);
    if (value < lo) lo = value;
    if (value > hi) hi = value;
  }
  return { lo, span: hi - lo || 1 };
}

/** Draws a score into `context`, over whatever it already holds. */
export function drawScore(
  context: CanvasRenderingContext2D,
  trace: ScoreTrace,
  hues: readonly number[],
  layout: ScoreLayout,
) {
  const {
    ratio,
    x,
    lane,
    base,
    ticks,
    lineAlpha,
    ink,
    every = 1,
    line = SCORE_LINES.light,
  } = layout;
  const { lo, span } = logExtent(trace);
  context.lineWidth = ratio;
  SCORE_PAIRS.forEach((pair, k) => {
    context.strokeStyle = line(pairHue(hues, pair), lineAlpha);
    context.beginPath();
    for (let sample = 0; sample < trace.count; sample += every) {
      const px = x(sample * trace.stride);
      const py =
        lane.top + (1 - (Math.log(trace.separations[sample * 3 + k]) - lo) / span) * lane.height;
      if (sample === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.stroke();
  });
  context.fillStyle = ink;
  const tick = (step: number, length: number, alpha: number) => {
    context.globalAlpha = alpha;
    context.fillRect(Math.round(x(step)), base - length * ratio, ratio, length * ratio);
  };
  for (const step of trace.crossings) tick(step, ticks.crossing, 0.4);
  for (const step of trace.syzygies) tick(step, ticks.syzygy, 0.8);
  tick(trace.closestApproach.step, ticks.closest, 1);
  context.globalAlpha = 1;
}
