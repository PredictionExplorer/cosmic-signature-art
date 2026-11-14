import { parentPort } from 'node:worker_threads';
import { generationOf, publishedFateOf, publishedOf } from './orbit-verify.mjs';

const { compare, compareFate, deriveFate, rederive } =
  await import('../../src/lib/physics/orbit.ts');

parentPort.on('message', (record) => {
  try {
    const generation = generationOf(record);
    const derived = rederive(generation, { stride: 1_000_000 });
    // The fate runs on from the window's first step to the record's horizon.
    const published = publishedFateOf(record);
    const fate = deriveFate(
      {
        masses: derived.masses,
        dt: generation.dt,
        positions: derived.windowStart.positions,
        velocities: derived.windowStart.velocities,
      },
      {
        steps: generation.steps,
        threshold: published.escapeThreshold,
        horizonSteps: published.horizonSteps,
      },
    );
    parentPort.postMessage({
      id: record.id,
      comparisons: [...compare(publishedOf(record), derived), compareFate(published, fate)],
      // What the energy watch found on the way to that fate: the venue's own measure, which
      // the record does not publish (scripts/build-orbit-energy.mjs keeps it).
      energy: fate.energy,
      profileDraws: derived.profileDraws,
      attempt: derived.attempt,
      milliseconds: derived.milliseconds,
    });
  } catch (failure) {
    parentPort.postMessage({ id: record.id, failure: failure.message });
  }
});
