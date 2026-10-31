import { parentPort } from 'node:worker_threads';

const { closestApproachOf } = await import('../../src/lib/physics/orbit.ts');

/** Replay one stored window from its first step and report its closest approach. */
parentPort.on('message', ({ id, window }) => {
  try {
    parentPort.postMessage({ id, closest: closestApproachOf(window) });
  } catch (failure) {
    parentPort.postMessage({ id, failure: failure.message });
  }
});
