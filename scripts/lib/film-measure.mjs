const { FramedWindow, sliceOf } = await import('../../src/lib/physics/framing.ts');
const { LIGHT_FILM, lightFilmFrames, stepsDrawnAt } =
  await import('../../src/lib/physics/light-film.ts');

/**
 * A Light film measured as it is decoded, frame by frame, at the trace's size (grey levels).
 *
 * - **The trace.** A cell gains light in a frame when it brightens by at least `threshold`
 *   levels over the frame before (over black, for the first). Each cell keeps one bit for each
 *   of `slices` equal parts of the film in which it gained light: where and when the film drew,
 *   in a few kilobytes, so Node and every browser can compare a frame with the film.
 * - **The agreement, frame by frame.** Each frame in `frames` replays the window in lockstep with
 *   the film: of the bodies it places at every `filmStride`-th step the frame first drew, in
 *   every symmetry copy, the share that stand on or beside a cell gaining light in that frame.
 *   The film's own frame measures most of its bodies there; a frame of another view, almost none.
 */
export function createFilmMeasure(start, frames, { trace, filmStride }) {
  const { width, height, slices, threshold } = trace;
  const total = lightFilmFrames(start.steps);
  const size = width * height;
  const bits = new Uint16Array(size);
  const gained = new Uint8Array(size);
  const placed = frames.map((frame) => new FramedWindow(start, frame));
  const hits = frames.map(() => 0);
  const samples = frames.map(() => 0);
  let previous = null;
  let index = 0;
  const near = (x, y) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const cx = x + dx;
        const cy = y + dy;
        if (cx >= 0 && cy >= 0 && cx < width && cy < height && gained[cy * width + cx]) return true;
      }
    return false;
  };
  return {
    push(frame) {
      if (index >= total) throw new Error(`the film has more than its ${total} frames`);
      const bit = 1 << sliceOf(index, total, slices);
      for (let p = 0; p < size; p++) {
        const lit = frame[p] >= (previous ? previous[p] : 0) + threshold;
        gained[p] = lit ? 1 : 0;
        if (lit) bits[p] |= bit;
      }
      // The steps this frame first drew: through the last step the film shows at its start.
      const end = stepsDrawnAt(index / LIGHT_FILM.fps, start.steps) + 1;
      placed.forEach((window, k) =>
        window.run(end, filmStride, (step, pixels) => {
          const { frame: plate } = window;
          for (let i = 0; i < pixels.length; i += 2) {
            samples[k] += 1;
            const x = Math.floor((pixels[i] / plate.width) * width);
            const y = Math.floor((pixels[i + 1] / plate.height) * height);
            if (near(x, y)) hits[k] += 1;
          }
        }),
      );
      previous = Uint8Array.from(frame);
      index += 1;
    },
    finish() {
      if (index !== total) throw new Error(`the film ended after ${index} of its ${total} frames`);
      return {
        trace: { width, height, slices, frames: total, bits },
        film: hits.map((hit, k) => (samples[k] ? hit / samples[k] : 0)),
      };
    },
  };
}
