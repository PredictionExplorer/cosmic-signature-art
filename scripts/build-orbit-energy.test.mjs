import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  SCHEMA_VERSION,
  deriveEnergies,
  energyEntry,
  fateDifferences,
  serializeEnergies,
} from './build-orbit-energy.mjs';

const { ENERGY_HELD_WITHIN } = await import('../src/lib/physics/orbit.ts');

const text = (name) => readFile(new URL(`../src/lib/art/${name}`, import.meta.url), 'utf8');
const read = async (name) => JSON.parse(await text(name));

const record = { id: 7, seed: `0x${'a'.repeat(64)}`, traitsSha256: 'b'.repeat(64) };
const kept = { first: -1.2345678901234567, windowChange: 3.1e-13, change: 4e-13, broken: null };
const lost = { ...kept, change: 7.8, broken: { step: 1_535_000, change: 7.8, closest: 0.11 } };

test('an entry keeps every double as its exact decimal, bound to the record it was run from', () => {
  assert.deepEqual(energyEntry(record, kept), {
    id: 7,
    seed: record.seed,
    traitsSha256: record.traitsSha256,
    first: '-1.2345678901234567',
    windowChange: '3.1e-13',
    change: '4e-13',
    broken: null,
  });
  const entry = energyEntry(record, lost);
  assert.deepEqual(entry.broken, { step: 1_535_000, change: '7.8', closest: '0.11' });
  // Each decimal gives its double back, to the bit.
  assert.equal(Number(entry.first), lost.first);
  assert.equal(Number(entry.windowChange), lost.windowChange);
  assert.equal(Number(entry.broken.closest), lost.broken.closest);
  // A run whose energy never moved is still a measure.
  assert.equal(energyEntry(record, { ...kept, windowChange: 0, change: 0 }).change, '0');
});

test('what the watch could not have found is refused, and named', () => {
  assert.throws(() => energyEntry(record, { ...kept, first: NaN }), /first energy is not finite/);
  assert.throws(
    () => energyEntry(record, { ...kept, windowChange: -1e-9 }),
    /change inside the window is not a share/,
  );
  assert.throws(
    () => energyEntry(record, { ...kept, change: Infinity }),
    /change over the run is not a share/,
  );
  assert.throws(
    () => energyEntry(record, { ...lost, broken: { ...lost.broken, step: 0 } }),
    /break has no step/,
  );
  assert.throws(
    () => energyEntry(record, { ...lost, broken: { ...lost.broken, change: '7.8' } }),
    /change at the break is not a share/,
  );
  assert.throws(
    () => energyEntry(record, { ...lost, broken: { ...lost.broken, closest: NaN } }),
    /closest pass at the break is not a share/,
  );
});

test('the measures serialize stably, under the tolerance they were taken against', async () => {
  const energies = [energyEntry(record, kept), energyEntry({ ...record, id: 8 }, lost)];
  const written = await serializeEnergies({ derivedOn: '2026-11-10', energies });
  const parsed = JSON.parse(written);
  assert.equal(parsed.schemaVersion, SCHEMA_VERSION);
  assert.equal(parsed.derivedOn, '2026-11-10');
  assert.equal(Number(parsed.heldWithin), ENERGY_HELD_WITHIN);
  assert.deepEqual(parsed.energies, energies);
  assert.equal(await serializeEnergies(parsed), written);
});

test('a run that failed, or met another fate than the record’s, is listed, and no other', () => {
  const published = { outcome: 'ejection', escaper: 1, ejectionStep: 1_090_000 };
  const derived = { outcome: 'ejection', escaper: 2, ejectionStep: 1_090_000 };
  assert.deepEqual(
    fateDifferences([
      { id: 1, comparison: { exact: true, published, derived: published }, energy: kept },
      { id: 2, failure: 'no window is bound to this record' },
      { id: 3, comparison: { exact: false, published, derived }, energy: kept },
    ]),
    [
      { id: 2, failure: 'no window is bound to this record' },
      { id: 3, published, derived },
    ],
  );
});

test('the committed measures are one for each record, bound to it, and set as this script sets them', async () => {
  const { records } = await read('orbit-records.json');
  const stored = await read('orbit-energy.json');
  assert.deepEqual(
    stored.energies.map((entry) => entry.id),
    records.map((entry) => entry.id),
  );
  for (const entry of stored.energies) {
    const bound = records.find((candidate) => candidate.id === entry.id);
    assert.equal(entry.seed, bound.seed);
    assert.equal(entry.traitsSha256, bound.traitsSha256);
  }
  assert.equal(Number(stored.heldWithin), ENERGY_HELD_WITHIN);
  assert.equal(await serializeEnergies(stored), await text('orbit-energy.json'));
});

// One work of each kind the audit found (docs/after-the-frame.md §1.3), run as the script runs
// them, from the stored windows. All 72 are held against the derivation from the seed in
// build-orbit-records.test.mjs, whose fate runs carry the same watch. Two workers at most: each
// run is seconds of arithmetic, and the other script tests are timed beside it.
const KINDS = [
  { id: 54, what: 'keeps its energy to its ejection' },
  { id: 31, what: 'keeps it to the record’s horizon' },
  { id: 4, what: 'loses it past its window, before its dated ejection' },
  { id: 22, what: 'loses it inside its window' },
];

test('fate runs from the stored windows meet the published fates and give the committed measures', async () => {
  const { records } = await read('orbit-records.json');
  const { windows } = await read('orbit-windows.json');
  const stored = await read('orbit-energy.json');
  const ids = KINDS.map((kind) => kind.id);
  const chosen = records.filter((entry) => ids.includes(entry.id));
  const results = await deriveEnergies(chosen, windows, { width: 2 });
  assert.deepEqual(fateDifferences(results), []);
  const entries = results.map((result) =>
    energyEntry(
      chosen.find((entry) => entry.id === result.id),
      result.energy,
    ),
  );
  assert.deepEqual(
    entries,
    stored.energies.filter((entry) => ids.includes(entry.id)),
  );
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const steps = (id) => chosen.find((entry) => entry.id === id).generation.steps;
  assert.equal(byId.get(54).broken, null);
  assert.equal(byId.get(31).broken, null);
  assert.ok(byId.get(4).broken.step > steps(4));
  assert.ok(byId.get(22).broken.step <= steps(22));
  for (const id of [54, 31]) assert.ok(Number(byId.get(id).change) <= ENERGY_HELD_WITHIN);
  for (const id of [4, 22]) assert.ok(Number(byId.get(id).broken.change) > ENERGY_HELD_WITHIN);
});

test('a record with no window bound to it fails its run, and is listed', async () => {
  const { records } = await read('orbit-records.json');
  const { windows } = await read('orbit-windows.json');
  const record = records.find((entry) => entry.id === 54);
  const another = [{ ...record, seed: `0x${'0'.repeat(64)}` }];
  assert.deepEqual(fateDifferences(await deriveEnergies(another, windows, { width: 1 })), [
    { id: 54, failure: 'no window is bound to this record' },
  ]);
});
