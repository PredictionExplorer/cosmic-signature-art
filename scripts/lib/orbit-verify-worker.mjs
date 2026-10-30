import { parentPort } from 'node:worker_threads';
import { generationOf, publishedOf } from './orbit-verify.mjs';

const { compare, rederive } = await import('../../src/lib/physics/orbit.ts');

parentPort.on('message', (record) => {
  try {
    const derived = rederive(generationOf(record), { stride: 1_000_000 });
    parentPort.postMessage({
      id: record.id,
      comparisons: compare(publishedOf(record), derived),
      profileDraws: derived.profileDraws,
      attempt: derived.attempt,
      milliseconds: derived.milliseconds,
    });
  } catch (failure) {
    parentPort.postMessage({ id: record.id, failure: failure.message });
  }
});
