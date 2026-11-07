import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parentPort } from 'node:worker_threads';
import sharp from 'sharp';
import { hollowAt, paperLevel } from './ink-hollows.mjs';

const { FramedWindow } = await import('../../src/lib/physics/framing.ts');

/**
 * One work's bodies at rest on its Ink still: the window replayed from its verified first step
 * in its frame (src/lib/physics/framing.ts) to the step the still shows, the window's last; the
 * primary copy's three bodies placed on the still; and the hollow each left in the ink, read off
 * the still's rung once its bytes are the ladder's. Places are in the frame's pixels.
 */
parentPort.on('message', async ({ id, start, frame, rung }) => {
  try {
    const bytes = await readFile(rung.path);
    if (createHash('sha256').update(bytes).digest('hex') !== rung.sha256)
      throw new Error(`the Ink rung ${rung.src} is not the one the still ladder recorded`);
    const { data, info } = await sharp(bytes)
      .removeAlpha()
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const framed = new FramedWindow(start, frame);
    framed.run(start.steps - 1, start.steps);
    const pixels = framed.place();
    const paper = paperLevel(data);
    const scaleX = info.width / frame.width;
    const scaleY = info.height / frame.height;
    const bodies = [0, 1, 2].map((body) => {
      const x = pixels[body * 2];
      const y = pixels[body * 2 + 1];
      return { x, y, ...hollowAt(data, info.width, info.height, x * scaleX, y * scaleY, paper) };
    });
    parentPort.postMessage({ id, step: framed.step, bodies });
  } catch (failure) {
    parentPort.postMessage({ id, failure: failure.message });
  }
});
