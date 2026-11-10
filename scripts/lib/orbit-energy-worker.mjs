import { parentPort } from 'node:worker_threads';

const { compareFate, deriveFate } = await import('../../src/lib/physics/orbit.ts');

/**
 * Run one work's orbit from its window's first step to its published fate, as the browser's
 * worker does, and report the fate beside the record's and what the energy watch found.
 */
parentPort.on('message', ({ id, window, fate }) => {
  try {
    if (!window) throw new Error('no window is bound to this record');
    const derived = deriveFate(
      {
        masses: window.masses,
        dt: window.dt,
        positions: window.positions,
        velocities: window.velocities,
      },
      { steps: window.steps, threshold: fate.escapeThreshold, horizonSteps: fate.horizonSteps },
    );
    parentPort.postMessage({
      id,
      comparison: compareFate(fate, derived),
      energy: derived.energy,
    });
  } catch (failure) {
    parentPort.postMessage({ id, failure: failure.message });
  }
});
