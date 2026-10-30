import { parentPort } from 'node:worker_threads';
import { generationOf, publishedOf } from './orbit-verify.mjs';

const { compare, rederive } = await import('../../src/lib/physics/orbit.ts');
const { principalPlane } = await import('../../src/lib/physics/plane.ts');

/** Re-derive one orbit at the work page's stride, and report its window start and plane. */
parentPort.on('message', ({ record, stride }) => {
  try {
    const derived = rederive(generationOf(record), { stride });
    const plane = principalPlane(derived.samples.positions, derived.samples.count);
    parentPort.postMessage({
      id: record.id,
      comparisons: compare(publishedOf(record), derived),
      positions: [...derived.windowStart.positions],
      velocities: [...derived.windowStart.velocities],
      plane: {
        mean: plane.mean,
        axes: plane.axes,
        bounds: [plane.bounds.u0, plane.bounds.u1, plane.bounds.v0, plane.bounds.v1],
      },
    });
  } catch (failure) {
    parentPort.postMessage({ id: record.id, failure: failure.message });
  }
});
