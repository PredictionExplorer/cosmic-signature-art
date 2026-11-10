import { readFile } from 'node:fs/promises';
import { log, error } from 'node:console';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import { readRegistry, withLock, writeAtomically } from './lib/origin.mjs';
import { overWorkers, publishedFateOf } from './lib/orbit-verify.mjs';
import { decimal } from './build-orbit-records.mjs';
import { decideDerivedOn, orbitWindowOf } from './build-orbit-windows.mjs';

const { ENERGY_HELD_WITHIN } = await import('../src/lib/physics/orbit.ts');

/**
 * The energy each work's computation keeps, from the first step of its recorded window to its
 * published fate (docs/after-the-frame.md §1.3). The generator steps every orbit with a fixed
 * step. At a pass closer than that step can follow, the computed energy jumps, and what is
 * computed afterwards is no motion gravity allows from that start. The record publishes no such
 * measure, so the venue takes it itself: the fate run of src/lib/physics/orbit.ts, the file the
 * browser runs, from each stored window. It is kept only when that run meets the published fate
 * to the body and the step.
 *
 * The server words the line under each still from this file (src/lib/art/fate-line.ts); the
 * page's own worker finds the same numbers again and says them in the record. Every double is
 * its shortest exact decimal, as in the other registries.
 */
const recordsPath = fileURLToPath(new URL('../src/lib/art/orbit-records.json', import.meta.url));
const windowsPath = fileURLToPath(new URL('../src/lib/art/orbit-windows.json', import.meta.url));
const energyPath = fileURLToPath(new URL('../src/lib/art/orbit-energy.json', import.meta.url));
export const SCHEMA_VERSION = 1;

/** One work's entry: what the energy watch found, bound to the record it was run from. */
export function energyEntry(record, energy) {
  const share = (value, name) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
      throw new Error(`${name} is not a share`);
    return decimal(value);
  };
  if (typeof energy.first !== 'number' || !Number.isFinite(energy.first))
    throw new Error('the first energy is not finite');
  const { broken } = energy;
  if (broken && !(Number.isInteger(broken.step) && broken.step > 0))
    throw new Error('the break has no step');
  return {
    id: record.id,
    seed: record.seed,
    traitsSha256: record.traitsSha256,
    first: decimal(energy.first),
    windowChange: share(energy.windowChange, 'the change inside the window'),
    change: share(energy.change, 'the change over the run'),
    broken: broken
      ? {
          step: broken.step,
          change: share(broken.change, 'the change at the break'),
          closest: share(broken.closest, 'the closest pass at the break'),
        }
      : null,
  };
}

export function serializeEnergies({ derivedOn, energies }) {
  return format(
    JSON.stringify(
      {
        schemaVersion: SCHEMA_VERSION,
        derivedOn,
        heldWithin: decimal(ENERGY_HELD_WITHIN),
        energies,
      },
      null,
      2,
    ),
    { parser: 'json', printWidth: 100 },
  );
}

/**
 * Run each record's orbit from its stored window to its published fate, in worker threads. A
 * record without a window bound to it (another seed, another trait file) is a failure.
 */
export function deriveEnergies(records, windows, options) {
  const byId = new Map(windows.map((entry) => [entry.id, entry]));
  return overWorkers(
    records,
    new URL('./lib/orbit-energy-worker.mjs', import.meta.url),
    (record) => {
      const entry = byId.get(record.id);
      const bound =
        entry && entry.seed === record.seed && entry.traitsSha256 === record.traitsSha256;
      return {
        id: record.id,
        // A missing window reaches the worker as nothing, and comes back as its failure.
        window: bound ? orbitWindowOf(record, entry) : null,
        fate: publishedFateOf(record),
      };
    },
    options,
  );
}

/** The works whose fate run failed, or met another fate than the record's. */
export function fateDifferences(results) {
  return results.flatMap((result) =>
    result.failure
      ? [{ id: result.id, failure: result.failure }]
      : result.comparison.exact
        ? []
        : [
            {
              id: result.id,
              published: result.comparison.published,
              derived: result.comparison.derived,
            },
          ],
  );
}

async function main() {
  await withLock(`${energyPath}.lock`, async () => {
    const registry = JSON.parse(await readFile(recordsPath, 'utf8'));
    if (registry.schemaVersion !== 1 || !Array.isArray(registry.records))
      throw new Error('Invalid orbit registry; run npm run art:orbits first');
    const stored = JSON.parse(await readFile(windowsPath, 'utf8'));
    if (stored.schemaVersion !== 1 || !Array.isArray(stored.windows))
      throw new Error('Invalid orbit windows; run npm run art:windows first');
    const previous = await readRegistry(energyPath, SCHEMA_VERSION, 'energies');
    log(`Running ${registry.records.length} orbits on to their fates, watching the energy…`);
    const started = performance.now();
    const results = await deriveEnergies(registry.records, stored.windows);
    const differing = fateDifferences(results);
    for (const entry of differing) error(`Signature ${entry.id}: ${JSON.stringify(entry)}`);
    if (differing.length)
      throw new Error(
        `${differing.length} orbit(s) did not meet the published fate; nothing was written`,
      );
    const byId = new Map(registry.records.map((record) => [record.id, record]));
    const energies = results.map((result) => energyEntry(byId.get(result.id), result.energy));
    const derivedOn = decideDerivedOn(
      previous.derivedOn,
      previous.energies,
      energies,
      new Date().toISOString().slice(0, 10),
    );
    await writeAtomically(energyPath, await serializeEnergies({ derivedOn, energies }));
    const broken = energies.filter((entry) => entry.broken);
    const inside = broken.filter(
      (entry) => entry.broken.step <= byId.get(entry.id).generation.steps,
    );
    log(
      `${energies.length} fate runs, each meeting its published fate, in ` +
        `${((performance.now() - started) / 1000).toFixed(1)} s; ${broken.length} lost their ` +
        `energy on the way (${inside.length} inside the window); derived on ${derivedOn}.`,
    );
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
