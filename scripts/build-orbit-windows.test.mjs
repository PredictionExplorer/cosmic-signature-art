import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  STRIDE,
  decideDerivedOn,
  orbitWindowOf,
  replayDifferences,
  serializeWindows,
  windowEntry,
} from './build-orbit-windows.mjs';

const read = async (name) =>
  JSON.parse(await readFile(new URL(`../src/lib/art/${name}`, import.meta.url), 'utf8'));

const record = {
  id: 7,
  seed: `0x${'a'.repeat(64)}`,
  traitsSha256: 'b'.repeat(64),
  generation: { dt: '0.001', steps: 1000 },
  physics: { masses: ['1.5', '2', '3.25'] },
};
const derived = {
  positions: [0.1, 0.2, 0.30000000000000004, -1, -2, -3, 4, 5, 6],
  velocities: [1e-7, -2.5, 3, 0, 0, 0, -1, 1, 0.5],
  plane: {
    mean: [0.1, 0, -0],
    axes: [
      [1, 0, 0],
      [0, 1, 0],
    ],
    bounds: [-10, 10, -5, 5],
  },
};

test('a window keeps every double as its exact decimal and refuses what is not a window', () => {
  const entry = windowEntry(record, derived);
  assert.equal(entry.positions[2], '0.30000000000000004');
  assert.equal(entry.velocities[0], '1e-7');
  assert.deepEqual(entry.plane.bounds, ['-10', '10', '-5', '5']);
  assert.equal(entry.seed, record.seed);
  assert.equal(entry.traitsSha256, record.traitsSha256);
  const window = orbitWindowOf(record, entry);
  assert.deepEqual(window.positions, derived.positions);
  assert.deepEqual(window.masses, [1.5, 2, 3.25]);
  assert.equal(window.dt, 0.001);
  assert.throws(() => windowEntry(record, { ...derived, positions: derived.positions.slice(1) }));
  assert.throws(() =>
    windowEntry(record, { ...derived, velocities: [...derived.velocities.slice(1), NaN] }),
  );
  assert.throws(
    () => windowEntry(record, { ...derived, plane: { ...derived.plane, bounds: [1, 1, 0, 2] } }),
    /no extent/,
  );
});

test('the windows serialize stably and keep their date while unchanged', async () => {
  const windows = [windowEntry(record, derived)];
  const text = await serializeWindows({ derivedOn: '2026-10-30', windows });
  const parsed = JSON.parse(text);
  assert.equal(parsed.stride, STRIDE);
  assert.equal(await serializeWindows(parsed), text);
  assert.equal(decideDerivedOn('2026-10-30', windows, windows, '2027-01-01'), '2026-10-30');
  assert.equal(decideDerivedOn('2026-10-30', [], windows, '2027-01-01'), '2027-01-01');
});

test('every committed window replays its recorded window to the published closest approach', async () => {
  const { records } = await read('orbit-records.json');
  const { windows } = await read('orbit-windows.json');
  assert.deepEqual(
    windows.map((entry) => entry.id),
    records.map((entry) => entry.id),
  );
  for (const entry of windows) {
    const bound = records.find((candidate) => candidate.id === entry.id);
    assert.equal(entry.seed, bound.seed);
    assert.equal(entry.traitsSha256, bound.traitsSha256);
  }
  assert.deepEqual(await replayDifferences(records, windows), []);
});
