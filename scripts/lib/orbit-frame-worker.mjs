import { Buffer } from 'node:buffer';
import { parentPort } from 'node:worker_threads';
import sharp from 'sharp';
import { eachFrame } from '../build-arrival-maps.mjs';
import { createFilmMeasure } from './film-measure.mjs';

const { deriveFrame } = await import('../../src/lib/physics/frame-derivation.ts');
const { traceAgreement } = await import('../../src/lib/physics/framing.ts');

/**
 * One work's frame: derived from its seed by src/lib/physics/frame-derivation.ts, framed from
 * the views the generator passed over beside it, and every one of them measured against the
 * work's Light film, frame by frame, as the film is decoded once at the trace's size. Without a
 * film the frame is only derived, as the scripts' test re-derives the committed registry.
 */
parentPort.on('message', async ({ id, generation, start, traits, film, parameters }) => {
  try {
    const derived = deriveFrame(generation, start, traits, { everyView: Boolean(film) });
    const reply = { id, frame: derived.frame, view: derived.view, checks: derived.checks };
    if (!film) return parentPort.postMessage(reply);
    const { width, height } = parameters.trace;
    const measure = createFilmMeasure(start, derived.views, parameters);
    await eachFrame(film, (frame) => measure.push(frame), {
      parameters: { width, height, fps: parameters.fps },
    });
    const { trace, film: agreements } = measure.finish();
    const traceAgreements = derived.views.map((frame) =>
      traceAgreement(trace, start, frame, { stride: parameters.traceStride }),
    );
    // The low byte of each cell's slices in red, the high in green; lossless.
    const rgb = Buffer.alloc(width * height * 3);
    for (let p = 0; p < trace.bits.length; p++) {
      rgb[p * 3] = trace.bits[p] & 255;
      rgb[p * 3 + 1] = trace.bits[p] >> 8;
    }
    const webp = await sharp(rgb, { raw: { width, height, channels: 3 } })
      .webp({ lossless: true, effort: 6 })
      .toBuffer();
    parentPort.postMessage({
      ...reply,
      film: { frames: trace.frames, agreements },
      trace: { agreements: traceAgreements, webp: new Uint8Array(webp) },
    });
  } catch (failure) {
    parentPort.postMessage({ id, failure: failure.message });
  }
});
