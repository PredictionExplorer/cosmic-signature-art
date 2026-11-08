/*
  First Light's pace (docs/first-light.md §7, adaptive quality). The light is drawn at the screen's
  own density where the device keeps up. Where the frames come slowly the drawing buffer gives
  way, down to the CSS pixels themselves, rather than the motion stuttering: a softer light that
  moves is better than a sharp one that jumps.
*/

/** Frames a verdict is taken over, and the frame time above which the density gives way. */
const WINDOW = 24;
const SLOW_MS = 22;
/** Each step down keeps two thirds of the density, never below one device pixel per CSS pixel. */
const STEP = 2 / 3;
const FLOOR = 1;

/** Watches the frames as they come, and lowers the density once or twice when they are slow. */
export class Pace {
  private readonly frames: number[] = [];
  private steps = 0;

  /** The density to draw at, given the last frame's time and the density it was drawn at. */
  next(frameMs: number, ratio: number): number {
    // A frame held up by a tab coming back, or by the first compile, says nothing of the pace.
    if (!(frameMs > 0) || frameMs > 250) return ratio;
    this.frames.push(frameMs);
    if (this.frames.length < WINDOW) return ratio;
    const sorted = [...this.frames].sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    this.frames.length = 0;
    if (median <= SLOW_MS || ratio <= FLOOR || this.steps >= 2) return ratio;
    this.steps += 1;
    return Math.max(FLOOR, ratio * STEP);
  }
}
