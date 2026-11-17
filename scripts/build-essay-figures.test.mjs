import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  EXEMPLAR,
  LOST,
  beginningRanges,
  clockOf,
  closePass,
  energyCounts,
  energySeries,
} from './build-essay-figures.mjs';
import {
  SheetWatch,
  pairAlone,
  plaitStretch,
  spread,
  yoshidaWeights,
} from './lib/essay-figures.mjs';
import { generationOf } from './lib/orbit-verify.mjs';
import { orbitWindowOf } from './build-orbit-windows.mjs';
import { plateFrameOf } from './build-orbit-frames.mjs';

register('./lib/source-imports.mjs', import.meta.url, {
  data: { root: fileURLToPath(new URL('..', import.meta.url)) },
});
const { G } = await import('../src/lib/physics/orbit.ts');
const { twinRun } = await import('../src/lib/physics/twin.ts');

const read = async (name) =>
  JSON.parse(await readFile(new URL(`../src/lib/art/${name}`, import.meta.url), 'utf8'));
const figures = await read('essay-figures.json');
const { records } = await read('orbit-records.json');
const { windows } = await read('orbit-windows.json');
const { frames } = await read('orbit-frames.json');
const { energies } = await read('orbit-energy.json');
const windowOf = (id) =>
  orbitWindowOf(
    records.find((record) => record.id === id),
    windows.find((entry) => entry.id === id),
  );
const near = (actual, expected, share = 1e-12) =>
  assert.ok(Math.abs(actual - expected) <= Math.abs(expected) * share, `${actual} ≠ ${expected}`);

test('two bodies alone keep to Newton’s conic: a circle laps, a fast pair parts', () => {
  // Two equal masses a distance 2 apart on a circle about their centre: v² = G·m / (2·d).
  const speed = Math.sqrt((G * 100) / 4);
  const circle = pairAlone(
    G,
    [100, 100, 1],
    [-1, 0, 0, 1, 0, 0, 9, 9, 9],
    [0, -speed, 0, 0, speed, 0, 0, 0, 0],
    0,
    1,
  );
  assert.equal(circle.bound, true);
  near(circle.semiMajor, 2, 1e-9);
  assert.ok(circle.eccentricity < 1e-7);
  near(circle.period, 2 * Math.PI * Math.sqrt(8 / (G * 200)), 1e-9);
  const open = pairAlone(
    G,
    [100, 100, 1],
    [-1, 0, 0, 1, 0, 0, 9, 9, 9],
    [0, -90, 0, 0, 90, 0, 0, 0, 0],
    0,
    1,
  );
  assert.deepEqual([open.bound, open.semiMajor, open.period], [false, null, null]);
  assert.ok(open.eccentricity > 1);
  // The size of the conic, closed or open: h² / μ, with h the pair's turning about each other.
  near(circle.semiLatus, 2, 1e-9);
  near(open.semiLatus, (2 * 180) ** 2 / (G * 200), 1e-12);
  // Both stand at their nearest: the angle from it is nothing.
  assert.ok(Math.abs(open.anomaly) < 1e-7);
});

test('a pair’s place on its conic is the angle from its nearest approach, signed by its drift', () => {
  // The same pair a quarter of the way round a circle-like ellipse, drawing apart, then closing.
  const at = (radial) =>
    pairAlone(
      G,
      [100, 100, 1],
      [0, 0, 0, 3, 0, 0, 9, 9, 9],
      [0, 0, 0, radial, 20, 0, 0, 0, 0],
      0,
      1,
    );
  const apart = at(4);
  const closing = at(-4);
  assert.equal(apart.bound, true);
  assert.ok(apart.anomaly > 0 && apart.anomaly < Math.PI);
  near(closing.anomaly, -apart.anomaly, 1e-12);
  near(closing.eccentricity, apart.eccentricity, 1e-12);
  // The conic's own equation holds where the pair stands: r = p / (1 + e·cos ν).
  near(apart.semiLatus / (1 + apart.eccentricity * Math.cos(apart.anomaly)), 3, 1e-12);
  near(apart.semiLatus, apart.semiMajor * (1 - apart.eccentricity ** 2), 1e-12);
});

test('the integrator’s weights are Yoshida’s, and its three pushes make one step', async () => {
  const { w1, w0 } = yoshidaWeights();
  near(w1 + w0 + w1, 1, 1e-15);
  assert.ok(w0 < 0 && w1 > 1);
  near(figures.integrator.w1, w1, 1e-15);
  near(figures.integrator.w0, w0, 1e-15);
});

test('a plait of three must stretch a line by the golden ratio squared; a twist need not', () => {
  near(plaitStretch([1, -2]), (3 + Math.sqrt(5)) / 2);
  near(plaitStretch([1, -2, 1, -2]), ((3 + Math.sqrt(5)) / 2) ** 2);
  assert.equal(plaitStretch([1, 2]), 1);
  assert.equal(plaitStretch([1, -1]), 1);
  assert.equal(plaitStretch([]), 1);
  // A plait read in a mirror stretches as much.
  near(plaitStretch([-1, 2]), plaitStretch([1, -2]));
  assert.throws(() => plaitStretch([3]), /No crossing 3/);
  assert.deepEqual(figures.plait, { pigtail: plaitStretch([1, -2]), plain: 1 });
});

test('the sheet’s watch reads changes of place, their sense, and discs that overlap', () => {
  const watch = new SheetWatch(10);
  // Bodies 0 and 1 change places with 0 above; then 0 and 2, with 2 above.
  for (const pixels of [
    [0, 0, 20, 0, 40, 0],
    [9, -3, 11, 3, 40, 0],
    [12, -3, 8, 3, 40, 0],
    [29, 3, 8, 0, 31, -3],
    [32, 3, 8, 0, 28, -3],
  ])
    watch.observe(pixels);
  const found = watch.found;
  assert.deepEqual(found.startOrder, [0, 1, 2]);
  assert.deepEqual(found.word, [1, -2]);
  assert.equal(found.crossings, 2);
  near(found.stretch, (3 + Math.sqrt(5)) / 2);
  // Four of the five samples hold two centres nearer than a diameter; none nearer than a radius.
  assert.equal(found.overlapShare, 4 / 5);
  assert.equal(found.insideShare, 0);
  near(found.closestInDiameters, Math.hypot(2, 6) / 10);
});

test('the middle and the ends of a list', () => {
  assert.deepEqual(spread([3, 1, 2]), { least: 1, median: 2, most: 3 });
  assert.deepEqual(spread([4, 1, 2, 3]), { least: 1, median: 2.5, most: 4 });
  assert.equal(spread([]), null);
});

test('the stored clock and counts are the registries’ own', () => {
  assert.deepEqual(figures.clock, clockOf(records));
  assert.equal(
    figures.clock.film.stepsPerSecond * figures.clock.film.seconds > figures.clock.steps,
    true,
  );
  const counted = energyCounts(records, energies);
  for (const key of Object.keys(counted)) assert.deepEqual(figures.energy[key], counted[key], key);
  assert.equal(counted.kept.length + counted.lost.length, records.length);
  assert.throws(
    () => clockOf([...records, { ...records[0], fate: { horizonSteps: 9 } }]),
    /one horizon/,
  );
  assert.throws(() => energyCounts(records, energies.slice(1)), /No energy for work/);
  assert.deepEqual(figures.fates, {
    ejection: records.filter((record) => record.fate.outcome === 'ejection').length,
    boundAtHorizon: records.filter((record) => record.fate.outcome === 'eternal_dance').length,
  });
});

test('the exemplar’s beginnings, twin and pairs are derived again and are the stored ones', () => {
  const record = records.find((entry) => entry.id === EXEMPLAR);
  const ranges = beginningRanges(generationOf(record));
  assert.deepEqual(figures.beginnings, { of: EXEMPLAR, ...ranges });
  assert.ok(ranges.mass.least >= 100 && ranges.mass.most <= 300);
  assert.ok(ranges.place.least >= -300 && ranges.place.most <= 300);
  assert.ok(ranges.velocity.least >= -1 && ranges.velocity.most <= 1);
  const window = windowOf(EXEMPLAR);
  const stored = figures.works.find((work) => work.id === EXEMPLAR);
  const run = twinRun(window, plateFrameOf(frames.find((frame) => frame.id === EXEMPLAR)), {
    horizon: record.fate.horizonSteps,
  });
  assert.equal(run.parted, stored.twin.parted);
  assert.equal(run.doubling, stored.twin.doubling);
  assert.deepEqual(
    stored.pairs,
    [
      [0, 1],
      [0, 2],
      [1, 2],
    ].map(([a, b]) => ({
      pair: [a, b],
      ...pairAlone(G, window.masses, window.positions, window.velocities, a, b),
    })),
  );
});

test('the lost energy the essay tells is found again at the same pass', () => {
  const stored = figures.energy.lostExample;
  const entry = energies.find((energy) => energy.id === LOST);
  assert.equal(stored.step, entry.broken.step);
  // Replayed to the step the record dates the ejection, as the build replays it.
  const record = records.find((item) => item.id === LOST);
  assert.deepEqual(stored.ejected, { body: record.fate.escaper, step: record.fate.ejectionStep });
  const pass = closePass(
    windowOf(LOST),
    { step: stored.step },
    { after: stored.ejected.step - stored.step },
  );
  assert.deepEqual(pass, stored.pass);
  assert.equal(pass.until, stored.ejected.step);
  assert.ok(pass.passes > 2);
  near(pass.distance, Number(entry.broken.closest), 1e-12);
  // In the one step through the pass the pair travels further than the gap between them.
  assert.ok(pass.travelInGaps > 1);
  // Bound before, flying apart after: the sign of the computed energy has turned.
  assert.ok(pass.energyBefore < 0 && pass.energyAfter > 0);
  // Asked five thousand steps before the loss was found, and five thousand after.
  const series = energySeries(windowOf(LOST), stored.step + 5_000, 5_000);
  assert.equal(series.values.length, (stored.step + 5_000) / 5_000);
  assert.ok(series.values.at(-3) < 1e-9 && series.values.at(-1) > 1);
});

test('what the essay counts across the collection adds up', () => {
  const { twins, past, sheets, pictures, works } = figures;
  assert.equal(works.length, records.length);
  assert.equal(twins.measured, works.filter((work) => work.twin.doubling !== null).length);
  assert.equal(twins.parted, works.filter((work) => work.twin.parted !== null).length);
  assert.ok(twins.differentOutcome.every((id) => twins.differentFate.includes(id)));
  assert.equal(past.looked, figures.fates.boundAtHorizon);
  assert.equal(past.lostABody.length + past.stillThree.length, past.looked);
  assert.equal(pictures.positions + pictures.otherSpace + pictures.symmetry >= works.length, true);
  assert.ok(
    sheets.plaitForcesNothing.every(
      (id) => works.find((work) => work.id === id).sheet.stretch === 1,
    ),
  );
  for (const work of works) assert.equal(work.sheet.word.length, work.sheet.crossings);
  // Where both computations keep their energy, the twin's fate is set beside the work's.
  const lost = new Set(figures.energy.lost);
  const clean = works.filter((work) => !lost.has(work.id) && work.twin.fate.energyBroken === null);
  assert.deepEqual(twins.clean, {
    works: clean.length,
    differ: clean.filter((work) => !work.twin.sameFate).length,
    outcome: clean.filter((work) => !work.twin.sameOutcome).length,
  });
  // Past the horizon: only the runs that keep their energy say anything of the bodies.
  const looked = works.filter((work) => work.beyond);
  const kept = looked.filter((work) => work.beyond.energyBroken === null);
  const losses = kept.filter((work) => work.beyond.outcome === 'ejection');
  assert.equal(looked.length, past.looked);
  assert.deepEqual(past.clean, {
    runs: kept.length,
    lost: losses.length,
    still: kept.length - losses.length,
    earliest: Math.min(...losses.map((work) => work.beyond.ejectionStep)),
  });
  assert.equal(past.energyBroken.length, looked.length - kept.length);
});

test('every work’s Ink certificate was read, and they share the settings the essay states', () => {
  const { ink, works } = figures;
  assert.ok(works.every((work) => /^[a-f0-9]{64}$/.test(work.ink.sha256)));
  for (const key of Object.keys(ink.shared))
    assert.deepEqual([...new Set(works.map((work) => work.ink[key]))], [ink.shared[key]], key);
  assert.ok(ink.opens.seconds.least > 0 && ink.opens.seconds.most < 10);
  // Nine points of ink to each point of the picture: three each way.
  for (const work of works) {
    assert.equal(work.ink.supersample, 3);
    assert.ok(work.ink.inkGrid[0] > work.ink.fluidGrid[0]);
    assert.ok(work.ink.seconds > 3600);
  }
});
