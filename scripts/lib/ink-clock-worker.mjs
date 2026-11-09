import { parentPort } from 'node:worker_threads';
import { eachFrame } from '../build-arrival-maps.mjs';
import { createDerivativeMatch, createInkClockMeasure } from './ink-clock-measure.mjs';

const { FramedWindow } = await import('../../src/lib/physics/framing.ts');
const { inkFilmStep } = await import('../../src/lib/physics/ink-film.ts');
const { lightFilmFrames } = await import('../../src/lib/physics/light-film.ts');

/**
 * One work's Ink film against its clock (scripts/build-ink-clocks.mjs). The window is replayed
 * from its verified first step in the work's frame, and the primary copy's three bodies placed at
 * the step each frame of the film shows. The published film is then decoded once, whole, at its
 * own size and rate, and measured against those places; and each derivative the venue plays
 * (the settling and opening clips, a local complete film) is matched, frame by frame, at a small
 * size, with the film's frames the clock says it holds.
 */
parentPort.on(
  'message',
  async ({ id, start, frame, film, firstInked, inkedFrom, derivatives, parameters }) => {
    try {
      const frames = lightFilmFrames(start.steps);
      const places = new Float64Array(frames * 6);
      // The bodies' path from the first step the pre-roll lets ink, through the first inked frame.
      const path = [];
      const window = new FramedWindow(start, frame);
      for (let index = 0; index < frames; index++) {
        const step = inkFilmStep(index, start.steps);
        if (index === firstInked)
          window.run(step, 1, (at, pixels) => {
            if (at >= inkedFrom) path.push(...pixels.subarray(0, 6));
          });
        else window.run(step, start.steps);
        places.set(window.place().subarray(0, 6), index * 6);
        if (index === firstInked) path.push(...places.subarray(index * 6, index * 6 + 6));
      }
      const { width, height } = frame;
      const measure = createInkClockMeasure(
        { places, path: Float64Array.from(path), frames, firstInked, width, height },
        parameters,
      );
      await eachFrame(film, (pixels) => measure.push(pixels), {
        parameters: { width, height, fps: parameters.fps },
      });
      const measured = measure.finish();

      const compare = parameters.derivatives;
      const matches = [];
      for (const derivative of derivatives) {
        const match = createDerivativeMatch(derivative, compare);
        await eachFrame(derivative.path, (pixels) => match.pushDerivative(pixels), {
          parameters: { width: compare.width, height: compare.height, fps: derivative.fps },
        });
        matches.push(match);
      }
      if (matches.length)
        await eachFrame(film, (pixels) => matches.forEach((match) => match.pushSource(pixels)), {
          parameters: { width: compare.width, height: compare.height, fps: parameters.fps },
        });
      parentPort.postMessage({
        id,
        ...measured,
        derivatives: matches.map((match, k) => ({
          sha256: derivatives[k].sha256,
          ...match.finish(),
        })),
      });
    } catch (failure) {
      parentPort.postMessage({ id, failure: failure.message });
    }
  },
);
