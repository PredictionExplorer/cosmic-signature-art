import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';

/**
 * Re-derive orbit records with src/lib/physics/orbit.ts, the same file the browser runs, and
 * report every published measurement beside the re-derived one. Each orbit takes about a
 * second of arithmetic, so the records are shared across worker threads. Node strips the
 * module's types (on by default from 22.18; the npm scripts pass the flag for earlier 22s).
 */

/** The inputs orbit.ts needs: the record's generation, its seed and its published masses. */
export function generationOf(record) {
  return {
    seed: record.seed,
    candidatesPerAttempt: record.generation.candidatesPerAttempt,
    selectedIndex: record.generation.selectedIndex,
    retryCount: record.generation.retryCount,
    weightsRandomized: record.generation.weightsRandomized,
    dt: Number(record.generation.dt),
    steps: record.generation.steps,
    warmupSteps: record.generation.warmupSteps,
    masses: record.physics.masses.map(Number),
  };
}

/** The record's measurements as numbers; the registry keeps each double as its exact decimal. */
export function publishedOf(record) {
  const { physics } = record;
  return {
    masses: physics.masses.map(Number),
    totalEnergy: Number(physics.totalEnergy),
    angularMomentum: Number(physics.angularMomentum),
    closestApproach: {
      ...physics.closestApproach,
      distance: Number(physics.closestApproach.distance),
    },
    syzygyCount: physics.syzygyCount,
    braid: physics.braid,
  };
}

export async function verifyOrbits(records, { width = availableParallelism(), onResult } = {}) {
  const queue = [...records];
  const results = [];
  const run = () =>
    new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./orbit-verify-worker.mjs', import.meta.url));
      const next = () => {
        const record = queue.shift();
        if (!record) return worker.terminate().then(() => resolve());
        worker.postMessage(record);
      };
      worker.on('message', (result) => {
        results.push(result);
        onResult?.(result);
        next();
      });
      worker.on('error', reject);
      next();
    });
  await Promise.all(Array.from({ length: Math.max(1, Math.min(width, records.length)) }, run));
  return results.sort((a, b) => a.id - b.id);
}
