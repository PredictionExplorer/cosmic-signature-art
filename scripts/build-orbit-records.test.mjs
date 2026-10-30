import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  SCHEMA_VERSION,
  decideReadOn,
  decimal,
  differences,
  mergeRecords,
  orbitRecord,
  serializeRegistry,
} from './build-orbit-records.mjs';
import { generationOf, publishedOf, verifyOrbits } from './lib/orbit-verify.mjs';

const registryUrl = new URL('../src/lib/art/orbit-records.json', import.meta.url);
const seed = '0x4a0d5b57e13cf40c56cddb4ee2c10f50ab7aff755e24c61a687855663713f5b5';
const hash = 'a'.repeat(64);
const work = {
  id: 31,
  seed,
  masses: [130.67371638058603, 250.9920858730805, 124.96327743951707],
};

/** № 031's published trait file, reduced to what the record reads. */
function traits(overrides = {}) {
  const base = {
    schema_version: '1.0.0',
    seed,
    pipeline_version: '1.0.0',
    simulation: {
      masses: [...work.masses],
      total_energy: -2142.8907060284882,
      angular_momentum: 45072.95196766655,
      closest_approach: { distance: 80.20379580764032, pair: [0, 2], step: 255842 },
      syzygy_count: 0,
      braid: {
        word: "s2' s1' s1' s2' s1 s2' s1' s2 s1' s2' s1 s2' s1' s2 s1' s2' s2' s1' s2 s2 s1' s2' s1 s2' s1'",
        crossings: 25,
        truncated: false,
      },
      fate: { outcome: 'eternal_dance', horizon_steps: 8000000 },
      integrator: 'yoshida4',
      dt: 0.001,
      steps: 1000000,
      warmup_steps: 1000000,
    },
    generation: {
      borda: {
        selected_index: 77741,
        total_candidates: 100000,
        retry_count: 0,
        weights_randomized: true,
      },
      palette: { body_base_hues_deg: [19.21141290942327, 22.54815743077184, 9.168090395189965] },
    },
  };
  return JSON.parse(JSON.stringify({ ...base, ...overrides }));
}

test('keeps the inputs and the measurements, every double as its exact decimal', () => {
  const record = orbitRecord(work, traits(), hash);
  assert.deepEqual(record.generation, {
    candidatesPerAttempt: 100000,
    selectedIndex: 77741,
    retryCount: 0,
    weightsRandomized: true,
    integrator: 'yoshida4',
    dt: '0.001',
    steps: 1000000,
    warmupSteps: 1000000,
  });
  assert.deepEqual(record.physics.masses, [
    '130.67371638058603',
    '250.9920858730805',
    '124.96327743951707',
  ]);
  assert.equal(record.physics.totalEnergy, '-2142.8907060284882');
  assert.deepEqual(record.fate, {
    outcome: 'eternal_dance',
    escaper: null,
    ejectionStep: null,
    horizonSteps: 8000000,
  });
  assert.equal(record.traitsSha256, hash);
  assert.deepEqual(generationOf(record).masses, work.masses);
  assert.equal(publishedOf(record).closestApproach.distance, 80.20379580764032);
});

test('keeps who escapes and when, for an ejection', () => {
  const ejection = traits();
  ejection.simulation.fate = {
    outcome: 'ejection',
    escaper: 1,
    ejection_step: 2310000,
    horizon_steps: 8000000,
  };
  assert.deepEqual(orbitRecord(work, ejection, hash).fate, {
    outcome: 'ejection',
    escaper: 1,
    ejectionStep: 2310000,
    horizonSteps: 8000000,
  });
});

test('refuses a trait file it cannot vouch for', () => {
  const refuse = (mutate, pattern) => {
    const document = traits();
    mutate(document);
    assert.throws(() => orbitRecord(work, document, hash), pattern);
  };
  refuse((d) => (d.seed = `0x${'b'.repeat(64)}`), /another seed/);
  refuse((d) => (d.simulation.masses[2] = 125), /differ from the indexed record/);
  refuse((d) => (d.simulation.integrator = 'rk4'), /integrator/);
  refuse((d) => (d.simulation.braid.word = 's3'), /braid word/);
  refuse((d) => (d.simulation.fate.outcome = 'collision'), /fate/);
  refuse((d) => (d.simulation.closest_approach.step = 1000000), /closest step/);
  refuse((d) => (d.simulation.closest_approach.pair = [2, 0]), /pair/);
  refuse((d) => (d.generation.borda.retry_count = 2), /divide/);
  refuse((d) => (d.generation.borda.selected_index = 100000), /outside the search/);
  refuse((d) => (d.schema_version = '2.0.0'), /schema/);
  refuse((d) => (d.generation.palette.body_base_hues_deg = [1, 2]), /hues/);
  assert.throws(() => orbitRecord(work, traits(), 'nope'), /hash/);
});

test('writes each double as the shortest decimal that parses back to it', () => {
  assert.equal(decimal(124.96327743951707), '124.96327743951707');
  assert.equal(decimal(-0.001), '-0.001');
  assert.equal(decimal(-0), '-0');
  assert.ok(Object.is(Number(decimal(-0)), -0));
  assert.equal(Number(decimal(1 / 3)), 1 / 3);
});

test('merges by id, keeps the date when nothing changed, and serializes as the formatter does', async () => {
  const committed = await readFile(registryUrl, 'utf8');
  const registry = JSON.parse(committed);
  assert.equal(registry.schemaVersion, SCHEMA_VERSION);
  assert.equal(await serializeRegistry(registry), committed);
  const merged = mergeRecords(registry.records, [{ ...registry.records[0], pipelineVersion: 'x' }]);
  assert.equal(merged.length, registry.records.length);
  assert.equal(merged[0].pipelineVersion, 'x');
  assert.equal(
    decideReadOn('2026-10-29', registry.records, registry.records, '2027-01-01'),
    '2026-10-29',
  );
  assert.equal(decideReadOn('2026-10-29', registry.records, merged, '2027-01-01'), '2027-01-01');
});

test('every committed record re-derives from its seed to the last bit', async () => {
  const { records } = JSON.parse(await readFile(registryUrl, 'utf8'));
  const results = await verifyOrbits(records);
  assert.equal(results.length, records.length);
  assert.deepEqual(differences(results), []);
  for (const result of results) assert.ok([23, 24].includes(result.profileDraws));
});

test('names a work whose derivation differs', () => {
  const rows = [
    { key: 'mass1', exact: true },
    { key: 'totalEnergy', exact: false, derived: '1', published: '2' },
  ];
  assert.deepEqual(
    differences([
      { id: 1, comparisons: rows },
      { id: 2, comparisons: [rows[0]] },
      { id: 3, failure: 'boom' },
    ]),
    [
      { id: 1, rows: [rows[1]] },
      { id: 3, failure: 'boom' },
    ],
  );
});
