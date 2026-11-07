import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  PARAMETERS,
  decideDerivedOn,
  frameEntry,
  framingTraitsOf,
  framingTraitsOfEntry,
  generationOf,
  measureFrames,
  mergeFrames,
  orphans,
  plateFrameOf,
  refusal,
  serializeFrames,
} from './build-orbit-frames.mjs';
import { orbitWindowOf } from './build-orbit-windows.mjs';
import { createFilmMeasure } from './lib/film-measure.mjs';

const read = async (name) =>
  JSON.parse(await readFile(new URL(`../src/lib/art/${name}`, import.meta.url), 'utf8'));

const traitFile = {
  generation: {
    projection: 'position',
    symmetry: 'none',
    wildcard: false,
    structure: { stack_label: 'orbit_ribbons', preferred_stack_label: 'orbit_ribbons' },
    drift: {
      enabled: true,
      mode: 'elliptical',
      scale: 1.1421520212585938,
      arc_fraction: 0.9419131893349798,
      orbit_eccentricity: 0.4397686570247632,
    },
    resolution: { width: 3456, height: 2234 },
  },
};

test('the trait file’s framing is read by name, and refused when it is not what it says', () => {
  const traits = framingTraitsOf(traitFile);
  assert.deepEqual(traits.drift, {
    enabled: true,
    mode: 'elliptical',
    scale: 1.1421520212585938,
    arcFraction: 0.9419131893349798,
    eccentricity: 0.4397686570247632,
  });
  assert.equal(traits.width, 3456);
  const without = (change) => ({ generation: { ...traitFile.generation, ...change } });
  assert.throws(() => framingTraitsOf(without({ wildcard: 'no' })), /wildcard/);
  assert.throws(() => framingTraitsOf(without({ projection: '<script>' })), /projection/);
  assert.throws(
    () => framingTraitsOf(without({ drift: { enabled: true, mode: 'elliptical' } })),
    /scale/,
  );
  assert.throws(() => framingTraitsOf(without({ resolution: { width: 0, height: 9 } })), /width/);
  assert.throws(() => framingTraitsOf(null), /wildcard/);
});

const record = { id: 23, seed: `0x${'a'.repeat(64)}`, traitsSha256: 'b'.repeat(64) };
const frame = {
  width: 3456,
  height: 2234,
  projection: 'position',
  velocityScale: 1,
  view: [0.1, 0.30000000000000004, 1e-7],
  drift: {
    // As the build has it: the drift the stream gives is the one the trait file states.
    config: {
      scale: 1.1421520212585938,
      arcFraction: 0.9419131893349798,
      eccentricity: 0.4397686570247632,
    },
    orientation: {
      inclination: 1,
      ascendingNode: 2,
      argumentOfPeriapsis: 3,
      initialMeanAnomaly: -0,
    },
    semiMajor: 300,
    semiMinor: 268,
  },
  box: { minX: -1, maxX: 1, minY: -0.5, maxY: 0.5, width: 2, height: 1 },
  symmetry: 'none',
};
const reply = {
  frame,
  view: { candidate: 1, scores: [0.9, 0.95, 0.5, 0.94] },
  checks: [{ key: 'symmetry', derived: 'none', published: 'none', exact: true }],
  film: { frames: 1802, agreements: [0.02, 0.9, 0.03, 0.01] },
  trace: { agreements: [0.1, 0.95, 0.2, 0.05] },
};

test('an entry keeps every double as its exact decimal and gives back the frame it was', () => {
  const traits = framingTraitsOf(traitFile);
  const entry = frameEntry(record, traits, reply, {
    film: { sha256: 'c'.repeat(64), ...reply.film },
    trace: {
      src: '/art/traces/23-light-dddddddddddddddd.webp',
      sha256: 'd'.repeat(64),
      bytes: 4096,
      ...reply.trace,
    },
  });
  assert.deepEqual(entry.view.triple, ['0.1', '0.30000000000000004', '1e-7']);
  assert.equal(entry.drift.initialMeanAnomaly, '-0');
  assert.deepEqual(entry.film, {
    sha256: 'c'.repeat(64),
    frames: 1802,
    agreement: 0.9,
    otherViews: 0.03,
  });
  assert.deepEqual([entry.trace.agreement, entry.trace.otherViews], [0.95, 0.2]);
  assert.deepEqual(plateFrameOf(entry), frame);
  assert.ok(Object.is(plateFrameOf(entry).drift.orientation.initialMeanAnomaly, -0));
  assert.deepEqual(framingTraitsOfEntry(entry), traits);
  assert.deepEqual(
    generationOf({ seed: 's', generation: { candidatesPerAttempt: 7, weightsRandomized: true } }),
    {
      seed: 's',
      candidatesPerAttempt: 7,
      weightsRandomized: true,
    },
  );
});

test('a frame is the film’s only when it leads every other view, on the film and the trace', () => {
  assert.equal(refusal(reply), null);
  assert.match(refusal({ id: 1, failure: 'the stream ran dry' }), /ran dry/);
  assert.match(
    refusal({ ...reply, checks: [{ key: 'driftScale', exact: false }] }),
    /driftScale differ/,
  );
  assert.match(
    refusal({ ...reply, film: { agreements: [0.02, 0.2, 0.03, 0.01] } }),
    /meet the film's new light in 20\.0 %/,
  );
  assert.match(
    refusal({ ...reply, film: { agreements: [0.4, 0.9, 0.03, 0.01] } }),
    /another view meets the film/,
  );
  assert.match(
    refusal({ ...reply, trace: { agreements: [0.7, 0.95, 0.2, 0.05] } }),
    /another view meets the trace/,
  );
});

/**
 * A film of 16 × 10 cells over a still window: bodies at rest a frame wide apart, so the
 * window's every step stands where it started, and each frame of `film(frame)` is drawn there.
 */
function measured(film, plate = {}) {
  const start = {
    masses: [1e-12, 1e-12, 1e-12],
    dt: 0.001,
    steps: 1800,
    positions: [2.5, 2.5, 0, 8.5, 5.5, 0, 13.5, 7.5, 0],
    velocities: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  };
  const still = {
    width: 16,
    height: 10,
    projection: 'position',
    velocityScale: 1,
    view: [1, 0, 0],
    drift: {
      config: { scale: 1, arcFraction: 0, eccentricity: 0.4 },
      orientation: {
        inclination: 0,
        ascendingNode: 0,
        argumentOfPeriapsis: 0,
        initialMeanAnomaly: 0,
      },
      semiMajor: 1,
      semiMinor: 1,
    },
    box: { minX: 0, maxX: 16, minY: 0, maxY: 10, width: 16, height: 10 },
    symmetry: 'none',
    ...plate,
  };
  const measure = createFilmMeasure(start, [still], {
    trace: { width: 16, height: 10, slices: 16, threshold: 2 },
    filmStride: 7,
  });
  for (let index = 0; index < 1799; index++) measure.push(film(index));
  return { measure, result: measure.finish() };
}
const lit = (cells, level) => {
  const frame = new Uint8Array(160);
  for (const [x, y] of cells) frame[y * 16 + x] = level;
  return frame;
};
const bodies = [
  [2, 2],
  [8, 5],
  [13, 7],
];

test('the film’s measure finds the bodies where the film gains light, and keeps when', () => {
  // The bodies' cells light up on every other frame, and nothing else ever does.
  const blinking = (index) => lit(bodies, index % 2 ? 255 : 0);
  const here = measured(blinking);
  assert.ok(here.result.film[0] > 0.45 && here.result.film[0] < 0.55, `${here.result.film[0]}`);
  const { trace } = here.result;
  assert.equal(trace.frames, 1799);
  // Every part of the film lit the bodies' cells, and nothing lit the rest.
  assert.equal(trace.bits[2 * 16 + 2], 0xffff);
  assert.equal(trace.bits[0], 0);
  // A frame that places the bodies elsewhere meets none of that light.
  const elsewhere = measured(blinking, {
    box: { minX: 8, maxX: 24, minY: 5, maxY: 15, width: 16, height: 10 },
  });
  assert.deepEqual(elsewhere.result.film, [0]);
  // Light that arrives once, in the third part of the film, is kept there.
  const once = measured((index) => lit(bodies, index >= 240 ? 200 : 0));
  assert.equal(once.result.trace.bits[5 * 16 + 8], 1 << 2);
  assert.ok(once.result.film[0] < 0.01);
});

test('the film’s measure refuses a film of another length', () => {
  const { measure } = measured((index) => lit(bodies, index));
  assert.throws(() => measure.push(lit(bodies, 0)), /more than its 1799 frames/);
  const start = {
    masses: [1, 1, 1],
    dt: 0.001,
    steps: 1800,
    positions: Array(9).fill(0),
    velocities: Array(9).fill(0),
  };
  const short = createFilmMeasure(start, [], {
    trace: { width: 1, height: 1, slices: 16, threshold: 2 },
    filmStride: 7,
  });
  short.push(new Uint8Array(1));
  assert.throws(() => short.finish(), /ended after 1 of its 1799 frames/);
});

test('the frames serialize stably, keep their date while unchanged, and name their orphans', async () => {
  const entry = { id: 3, trace: { src: '/art/traces/3-light-0123456789abcdef.webp' } };
  const text = await serializeFrames({ derivedOn: '2026-11-06', frames: [entry] });
  const parsed = JSON.parse(text);
  assert.deepEqual(parsed.parameters, JSON.parse(JSON.stringify(PARAMETERS)));
  assert.equal(await serializeFrames(parsed), text);
  assert.equal(decideDerivedOn('2026-11-06', [entry], [entry], '2027-01-01'), '2026-11-06');
  assert.equal(decideDerivedOn('2026-11-06', [], [entry], '2027-01-01'), '2027-01-01');
  assert.deepEqual(
    mergeFrames([entry, { id: 9, old: true }], [{ id: 9 }, { id: 1 }]).map((frame) => frame.id),
    [1, 3, 9],
  );
  assert.deepEqual(
    orphans(
      ['3-light-0123456789abcdef.webp', '4-light-ffffffffffffffff.webp', 'notes.txt'],
      [entry],
    ),
    ['4-light-ffffffffffffffff.webp'],
  );
});

test('every committed frame is re-derived from its seed, to the last bit', async () => {
  const { records } = await read('orbit-records.json');
  const { windows } = await read('orbit-windows.json');
  const { frames } = await read('orbit-frames.json');
  assert.deepEqual(
    frames.map((entry) => entry.id),
    records.map((entry) => entry.id),
  );
  const byId = (list) => new Map(list.map((entry) => [entry.id, entry]));
  const recordOf = byId(records);
  const windowOf = byId(windows);
  const jobs = frames.map((entry) => {
    const bound = recordOf.get(entry.id);
    assert.equal(entry.seed, bound.seed);
    assert.equal(entry.traitsSha256, bound.traitsSha256);
    return {
      id: entry.id,
      generation: generationOf(bound),
      start: orbitWindowOf(bound, windowOf.get(entry.id)),
      traits: framingTraitsOfEntry(entry),
      film: null,
    };
  });
  // Two threads, not every core: the other pipelines' tests run beside this one, and some of
  // them time a decoder in fractions of a second.
  const replies = await measureFrames(jobs, { width: 2 });
  const differing = replies.flatMap((answer) => {
    const entry = frames.find((frame) => frame.id === answer.id);
    if (answer.failure) return [{ id: answer.id, failure: answer.failure }];
    const derived = frameEntry(recordOf.get(answer.id), framingTraitsOfEntry(entry), answer, {
      film: { ...entry.film, agreements: [0, 0, 0, 0] },
      trace: { ...entry.trace, agreements: [0, 0, 0, 0] },
    });
    const keep = ({ view, velocityScale, drift, box }) => ({ view, velocityScale, drift, box });
    return JSON.stringify(keep(derived)) === JSON.stringify(keep(entry))
      ? []
      : [{ id: answer.id, stored: keep(entry), derived: keep(derived) }];
  });
  assert.deepEqual(differing, []);
});
