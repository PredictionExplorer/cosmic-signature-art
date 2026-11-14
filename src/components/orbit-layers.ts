/*
  The canvases the orbit section draws on (orbit-score.tsx), laid out afresh for one drawing.

  Four lie over the still, one above another: the recorded window's trails, the trails past it,
  the bodies, and the bodies' numbers while a visitor chooses among them. The fifth is the strip
  beneath the picture, where the score is drawn, or the growth of the gap between the work and
  its twin.

  A canvas is drawn at the display's own pixels, two to a CSS pixel at most: a phone at three
  would draw more than twice the pixels for a line no eye can tell apart.
*/

/** The section's five canvases, as its refs hold them when a drawing begins. */
export interface Canvases {
  trails: HTMLCanvasElement | null;
  continued: HTMLCanvasElement | null;
  marks: HTMLCanvasElement | null;
  events: HTMLCanvasElement | null;
  names: HTMLCanvasElement | null;
}

/** The strip beneath the picture: its context, its size in device pixels, and its lane. */
export interface Strip {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  /** The band the lines are drawn in: the strip's height less the 12 px the ticks rise in. */
  lane: number;
  /** Device pixels to a CSS pixel. */
  ratio: number;
}

/** The canvases laid out for one drawing. */
export interface Layers {
  /** The recorded window's trails. */
  trail: CanvasRenderingContext2D;
  /** The trails past the window. */
  continued: CanvasRenderingContext2D;
  /** The bodies. */
  mark: CanvasRenderingContext2D;
  /** The bodies' numbers. */
  names: CanvasRenderingContext2D;
  /** The picture's size in device pixels, and device pixels to a CSS pixel. */
  width: number;
  height: number;
  ratio: number;
  strip: Strip;
  /** The face the numbers are set in: read from the page when the numbers are drawn. */
  face(): string;
}

/** The ticks of the score rise this far beneath its lane, in CSS pixels. */
const TICKS = 12;

/**
 * Sizes each canvas to its box, which wipes it, and takes its context. Nothing is sized while a
 * canvas is missing, and null is returned; null too where the browser gives no context.
 */
export function layers(canvases: Canvases): Layers | null {
  const { trails, continued, marks, events, names } = canvases;
  if (!trails || !continued || !marks || !events || !names) return null;
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const all = [trails, continued, marks, events, names];
  for (const canvas of all) {
    const box = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(box.width * ratio));
    canvas.height = Math.max(1, Math.round(box.height * ratio));
  }
  const [trail, past, mark, score, numbers] = all.map((canvas) => canvas.getContext('2d'));
  if (!trail || !past || !mark || !score || !numbers) return null;
  return {
    trail,
    continued: past,
    mark,
    names: numbers,
    width: trails.width,
    height: trails.height,
    ratio,
    strip: {
      context: score,
      width: events.width,
      height: events.height,
      lane: events.height - TICKS * ratio,
      ratio,
    },
    face: () => getComputedStyle(names).getPropertyValue('--font-mono').trim() || 'monospace',
  };
}
