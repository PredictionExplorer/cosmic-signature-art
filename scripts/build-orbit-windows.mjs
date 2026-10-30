import { readFile } from 'node:fs/promises';
import { log, error } from 'node:console';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import { readRegistry, withLock, writeAtomically } from './lib/origin.mjs';
import { overWorkers } from './lib/orbit-verify.mjs';
import { decimal, differences } from './build-orbit-records.mjs';

/**
 * Orbit windows: where each work's orbit stands at the first step of its recorded window, and
 * the plane it is drawn in, for a page that performs many orbits at once (the Orrery).
 *
 * The orbit registry keeps only what the publisher states, and these states are not published.
 * They are re-derived here from each seed by src/lib/physics/orbit.ts, the file the browser runs,
 * and kept only when the same derivation matches every published measurement exactly. From the
 * window's start, integrating the recorded window again replays it step for step. The plane is
 * the work page's own (principalPlane over every hundredth step), so a cell of the Orrery and
 * the work's section see the orbit from the same side. Every double is its shortest exact
 * decimal, as in the registry: the bundler's JSON loader does not round-trip every double.
 */
const recordsPath = fileURLToPath(new URL('../src/lib/art/orbit-records.json', import.meta.url));
const windowsPath = fileURLToPath(new URL('../src/lib/art/orbit-windows.json', import.meta.url));
export const SCHEMA_VERSION = 1;
/** The work page draws every hundredth step; the plane is found over the same samples. */
export const STRIDE = 100;

/** One work's window: the bodies at its first step and the plane, bound to the record. */
export function windowEntry(record, derived) {
  const vector = (values, length, name) => {
    if (!Array.isArray(values) || values.length !== length)
      throw new Error(`${name} is not ${length} numbers`);
    return values.map((value) => {
      if (typeof value !== 'number' || !Number.isFinite(value))
        throw new Error(`${name} is not finite`);
      return decimal(value);
    });
  };
  const [u0, u1, v0, v1] = derived.plane.bounds;
  if (!(u1 > u0 && v1 > v0)) throw new Error('the plane has no extent');
  return {
    id: record.id,
    seed: record.seed,
    traitsSha256: record.traitsSha256,
    positions: vector(derived.positions, 9, 'positions'),
    velocities: vector(derived.velocities, 9, 'velocities'),
    plane: {
      mean: vector(derived.plane.mean, 3, 'plane centre'),
      axes: derived.plane.axes.map((axis, index) => vector(axis, 3, `plane axis ${index + 1}`)),
      bounds: vector(derived.plane.bounds, 4, 'plane bounds'),
    },
  };
}

/** Re-running on unchanged records keeps the previous date, so the file stays byte-identical. */
export function decideDerivedOn(previous, previousWindows, nextWindows, today) {
  const same = JSON.stringify(previousWindows) === JSON.stringify(nextWindows);
  return same && typeof previous === 'string' ? previous : today;
}

export function serializeWindows({ derivedOn, windows }) {
  return format(
    JSON.stringify({ schemaVersion: SCHEMA_VERSION, derivedOn, stride: STRIDE, windows }, null, 2),
    { parser: 'json', printWidth: 100 },
  );
}

/** A stored window as orbit.ts performs it: the record's masses and step, the window's numbers. */
export function orbitWindowOf(record, entry) {
  const numbers = (values) => values.map(Number);
  return {
    masses: numbers(record.physics.masses),
    dt: Number(record.generation.dt),
    steps: record.generation.steps,
    positions: numbers(entry.positions),
    velocities: numbers(entry.velocities),
    plane: {
      mean: numbers(entry.plane.mean),
      axes: entry.plane.axes.map(numbers),
      bounds: numbers(entry.plane.bounds),
    },
  };
}

/**
 * Replay stored windows from their first step, in worker threads, and list every work whose
 * closest approach is not the published one to the last bit, pair and step.
 */
export async function replayDifferences(records, windows, options) {
  const byId = new Map(records.map((record) => [record.id, record]));
  const replies = await overWorkers(
    windows,
    new URL('./lib/orbit-replay-worker.mjs', import.meta.url),
    (entry) => ({ id: entry.id, window: orbitWindowOf(byId.get(entry.id), entry) }),
    options,
  );
  return replies.flatMap((reply) => {
    if (reply.failure) return [{ id: reply.id, failure: reply.failure }];
    const published = byId.get(reply.id).physics.closestApproach;
    const replayed = {
      distance: decimal(reply.closest.distance),
      pair: reply.closest.pair,
      step: reply.closest.step,
    };
    return JSON.stringify(replayed) === JSON.stringify(published)
      ? []
      : [{ id: reply.id, published, replayed }];
  });
}

/** Re-derive each record's orbit in worker threads; the replies carry the window and plane. */
export function deriveWindows(records, options) {
  return overWorkers(
    records,
    new URL('./lib/orbit-window-worker.mjs', import.meta.url),
    (record) => ({ record, stride: STRIDE }),
    options,
  );
}

async function main() {
  await withLock(`${windowsPath}.lock`, async () => {
    const registry = JSON.parse(await readFile(recordsPath, 'utf8'));
    if (registry.schemaVersion !== 1 || !Array.isArray(registry.records))
      throw new Error('Invalid orbit registry; run npm run art:orbits first');
    const previous = await readRegistry(windowsPath, SCHEMA_VERSION, 'windows');
    log(`Re-deriving ${registry.records.length} orbits for their windows…`);
    const started = performance.now();
    const results = await deriveWindows(registry.records);
    const differing = differences(results);
    for (const entry of differing)
      error(`Signature ${entry.id}: ${JSON.stringify(entry.failure ?? entry.rows)}`);
    if (differing.length)
      throw new Error(
        `${differing.length} orbit(s) did not re-derive exactly; the windows were not written`,
      );
    const byId = new Map(registry.records.map((record) => [record.id, record]));
    const windows = results.map((result) => windowEntry(byId.get(result.id), result));
    // The decimals as written must replay the recorded window, not only the doubles they came from.
    const replayed = await replayDifferences(registry.records, windows);
    for (const entry of replayed) error(`Signature ${entry.id}: ${JSON.stringify(entry)}`);
    if (replayed.length)
      throw new Error(`${replayed.length} window(s) did not replay exactly; nothing was written`);
    const derivedOn = decideDerivedOn(
      previous.derivedOn,
      previous.windows,
      windows,
      new Date().toISOString().slice(0, 10),
    );
    await writeAtomically(windowsPath, await serializeWindows({ derivedOn, windows }));
    log(
      `${windows.length} orbit windows, each re-derived exactly, in ` +
        `${((performance.now() - started) / 1000).toFixed(1)} s; derived on ${derivedOn}.`,
    );
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
