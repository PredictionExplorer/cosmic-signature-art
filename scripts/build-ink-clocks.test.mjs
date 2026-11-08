import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  PARAMETERS,
  certificateClock,
  clockEntry,
  decideDerivedOn,
  firstInkingStep,
  mergeClocks,
  refusal,
  scheduleSha256,
  serializeClocks,
  settle,
} from './build-ink-clocks.mjs';
import { createDerivativeMatch, createInkClockMeasure } from './lib/ink-clock-measure.mjs';
import { hashFile } from './lib/origin.mjs';

const { inkFilmFirstInked, inkFilmSchedule } = await import('../src/lib/physics/ink-film.ts');
const { lightFilmFrames } = await import('../src/lib/physics/light-film.ts');

const read = async (name) =>
  JSON.parse(await readFile(new URL(`../src/lib/art/${name}`, import.meta.url), 'utf8'));
const copy = (value) => JSON.parse(JSON.stringify(value));

const SEED = `0x${'4a0d5b57e13cf40c56cddb4ee2c10f50ab7aff755e24c61a687855663713f5b5'}`;
const STEPS = 1_000_000;
/** № 031's published Ink certificate, as far as the clock reads it (metadata/ember.json). */
const certificate = {
  schema_version: 5,
  edition: 'ember',
  algorithm: 'ember-v4',
  inputs: {
    seed: SEED.slice(2),
    steps: STEPS,
    frames: {
      count: 1802,
      first_step: 555,
      last_step: 999_999,
      frame_rate: 60,
      sha256: 'd73149826e5d03cdd1d8b6b9ce75060a60bfadc82df3fc2a6ede406cff55e885',
      slow_factors: [4, 10],
    },
  },
  config: { contact: { pre_roll: 0.5, valve_lead: 0.25 } },
  derived: { duration: 12.578588931086504, valve_time: 12.328588931086504 },
  outputs: {
    frames_emitted: 1802,
    slow_films: [
      { factor: 4, first_frame: 64, frames_emitted: 6949 },
      { factor: 10, first_frame: 64, frames_emitted: 17371 },
    ],
  },
};

test('the schedule’s digest is the generator’s: steps as little-endian 64-bit integers', () => {
  // № 031's certificate states this digest of its film's schedule; the Light film's checkpoints
  // over a million steps give it, to the bit.
  assert.equal(scheduleSha256(inkFilmSchedule(STEPS)), certificate.inputs.frames.sha256);
  assert.notEqual(
    scheduleSha256(inkFilmSchedule(STEPS).slice(1)),
    certificate.inputs.frames.sha256,
  );
});

test('the first step inked is the first whose fluid time reaches the pre-roll, within the window', () => {
  const T = 12.578588931086504;
  const step = firstInkingStep({ steps: STEPS, duration: T, preRoll: 0.5 });
  assert.equal(step, 39_751);
  assert.ok((T * (step - 1)) / (STEPS - 1) < 0.5 && (T * step) / (STEPS - 1) >= 0.5);
  assert.equal(firstInkingStep({ steps: STEPS, duration: T, preRoll: 0 }), 0);
  // A pre-roll longer than the window: the window's last step, never one past it.
  assert.equal(firstInkingStep({ steps: STEPS, duration: 0.25, preRoll: 0.5 }), STEPS - 1);
});

test('a certificate’s clock is the Light film’s checkpoints, inked from where its pre-roll ends', () => {
  const clock = certificateClock(certificate, { seed: SEED, steps: STEPS });
  assert.deepEqual(clock, {
    algorithm: 'ember-v4',
    steps: STEPS,
    frames: 1802,
    scheduleSha256: certificate.inputs.frames.sha256,
    duration: 12.578588931086504,
    preRoll: 0.5,
    valveLead: 0.25,
    firstInked: 71,
    slowFilms: 2,
  });
  const refused = (change, pattern) => {
    const tampered = copy(certificate);
    change(tampered);
    assert.throws(() => certificateClock(tampered, { seed: SEED, steps: STEPS }), pattern);
  };
  refused((c) => (c.edition = 'main'), /not an Ink certificate/);
  refused((c) => (c.algorithm = 'tidal'), /names no Ink algorithm/);
  refused((c) => (c.inputs.seed = 'f'.repeat(64)), /another work’s/);
  refused((c) => (c.inputs.steps = 999_999), /window is not/);
  refused((c) => (c.inputs.frames.sha256 = 'f'.repeat(64)), /not on the Light film’s checkpoints/);
  refused((c) => (c.inputs.frames.frame_rate = 30), /not on the Light film’s checkpoints/);
  refused((c) => (c.outputs.frames_emitted = 1801), /not every scheduled frame/);
  refused((c) => (c.derived.valve_time += 1e-12), /times do not agree/);
  // A pre-roll the slow films do not start before is another clock.
  refused((c) => (c.config.contact.pre_roll = 0.51), /slow films do not start 7 frames before/);
  refused((c) => (c.outputs.slow_films[1].frames_emitted += 10), /slow films/);
  assert.throws(() => certificateClock(certificate, { seed: SEED, steps: 2 }), /window is not/);
});

/*
  A small film: a sheet 300 × 200 of paper at 230, bodies of radius 5 px (2.5 % of 200) moving
  3 px a frame. From the first inked frame each body stands in a hollow of paper 6 px in
  radius, ringed with ink, which is where it lays its ink.
*/
const W = 300;
const H = 200;
const FRAMES = 24;
const placesFor = (frames = FRAMES) => {
  const places = new Float64Array(frames * 6);
  for (let f = 0; f < frames; f++)
    for (let b = 0; b < 3; b++) {
      places[f * 6 + b * 2] = 40 + 3 * f + 0.5;
      places[f * 6 + b * 2 + 1] = 40 + 60 * b + 0.5;
    }
  return places;
};
function sheet(places, frame, { inked = frame >= 6, ring = [6, 9] } = {}) {
  const pixels = new Uint8Array(W * H).fill(230);
  if (!inked) return pixels;
  for (let b = 0; b < 3; b++) {
    const x = places[frame * 6 + b * 2];
    const y = places[frame * 6 + b * 2 + 1];
    for (let py = 0; py < H; py++)
      for (let px = 0; px < W; px++) {
        const d = Math.hypot(px + 0.5 - x, py + 0.5 - y);
        if (d >= ring[0] && d <= ring[1]) pixels[py * W + px] = 20;
      }
  }
  return pixels;
}
/** The bodies' path since the pre-roll ended: here, their places at the first inked frame. */
const pathAt = (places, frame) => places.slice(frame * 6, frame * 6 + 6);
const measureFilm = (draw, { firstInked = 6, frames = FRAMES } = {}) => {
  const places = placesFor(frames);
  const measure = createInkClockMeasure(
    { places, path: pathAt(places, firstInked), frames, firstInked, width: W, height: H },
    { ...PARAMETERS, hollow: { reach: 2, radius: [0.8, 1.6] } },
  );
  for (let f = 0; f < frames; f++) measure.push(draw(places, f));
  return measure.finish();
};

test('the measure finds the first ink on its frame, beside the bodies, and each body in its hollow', () => {
  const result = measureFilm((places, f) => sheet(places, f));
  assert.equal(result.paper, 230);
  const { firstInk, farthest } = result.preRoll;
  assert.deepEqual(result.preRoll, { inkedBefore: 0, firstInk, beside: firstInk, farthest });
  assert.ok(firstInk > 0);
  // The ring's outer edge, 9 px from a body of radius 5.
  assert.ok(farthest > 1.6 && farthest <= 1.8, `${farthest}`);
  assert.deepEqual(result.bodies, { placed: 3 * (FRAMES - 6), onInk: 0 });
  assert.equal(result.hollows.measured, 3 * (FRAMES - 6));
  const [, , before, own, after] = result.hollows.distance;
  assert.ok(own < 0.01 && before > 2.9 && after > 2.9, `${result.hollows.distance}`);
  assert.ok(Math.abs(result.hollows.offset) < 0.01);
  assert.equal(
    refusal(
      { ...result, derivatives: [] },
      { frames: FRAMES, firstInked: 6 },
      { hollows: 1, offset: 0.25 },
    ),
    null,
  );
});

test('a film a frame off its clock, or inked early, or holding a body on ink, is refused', () => {
  const clock = { frames: FRAMES, firstInked: 6 };
  const accept = { hollows: 1, offset: 0.25 };
  const reason = (result) => refusal({ ...result, derivatives: [] }, clock, accept);
  // The hollows a frame ahead: the bodies are where the clock puts the next frame.
  const ahead = measureFilm((places, f) =>
    sheet(places, Math.min(f + 1, FRAMES - 1), { inked: f >= 6 }),
  );
  assert.ok(ahead.hollows.offset > 0.75, `${ahead.hollows.offset}`);
  assert.match(reason(ahead), /better a frame away/);
  // Ink a frame before the pre-roll ends.
  assert.match(
    reason(measureFilm((places, f) => sheet(places, f, { inked: f >= 5 }))),
    /ink shows before frame 6/,
  );
  // No ink at the frame the clock inks.
  assert.match(
    reason(measureFilm((places, f) => sheet(places, f, { inked: f >= 7 }))),
    /no ink shows at frame 6/,
  );
  // Ink far from where the bodies went.
  assert.match(
    reason(
      measureFilm((places, f) => {
        const pixels = sheet(places, f);
        if (f >= 6) pixels.fill(20, 150 * W + 200, 150 * W + 210);
        return pixels;
      }),
    ),
    /10 pixels of the first ink lie away from the bodies/,
  );
  // Ink over a body's place.
  assert.match(
    reason(measureFilm((places, f) => sheet(places, f, { ring: [0, 9] }))),
    /places lie on ink/,
  );
  // A frame repeated.
  const repeated = measureFilm((places, f) => sheet(places, f === 12 ? 11 : f));
  assert.match(
    reason({
      ...repeated,
      hollows: { ...repeated.hollows, offset: 0, distance: [3, 2, 1, 0, 1, 2, 3] },
    }),
    /1 frames repeat/,
  );
  assert.match(reason({ failure: 'unreadable' }), /unreadable/);
  assert.match(reason({ ...ahead, frames: 23 }), /23 frames, not its schedule’s 24/);
});

test('the measure refuses a film of another length or size', () => {
  const places = placesFor();
  const path = pathAt(places, 6);
  const measure = createInkClockMeasure(
    { places, path, frames: FRAMES, firstInked: 6, width: W, height: H },
    PARAMETERS,
  );
  assert.throws(() => measure.push(new Uint8Array(10)), /not the film’s size/);
  measure.push(sheet(places, 0));
  assert.throws(() => measure.finish(), /ended after 1 of its 24 frames/);
  assert.throws(
    () =>
      createInkClockMeasure(
        { places, path, frames: 3, firstInked: 0, width: W, height: H },
        PARAMETERS,
      ),
    /one set for each frame/,
  );
  assert.throws(
    () =>
      createInkClockMeasure(
        { places, path: new Float64Array(0), frames: FRAMES, firstInked: 6, width: W, height: H },
        PARAMETERS,
      ),
    /path since the pre-roll is empty/,
  );
});

test('a derivative keeps its place when each of its frames is the film’s frame the clock says', () => {
  const film = Array.from({ length: 12 }, (_, f) => new Uint8Array(16).fill(10 * f));
  const matched = (start, every, frames, pick = (j) => start + j * every) => {
    const match = createDerivativeMatch({ start, every, frames }, { tolerance: 0.05 });
    for (let j = 0; j < frames; j++) match.pushDerivative(film[pick(j)]);
    film.forEach((frame) => match.pushSource(frame));
    return match.finish();
  };
  // Every other frame from the first, and the last four.
  assert.deepEqual(matched(0, 2, 6), { frames: 6, displaced: 0, worst: 0, meanDifference: 0 });
  assert.equal(matched(8, 1, 4).displaced, 0);
  // Cut a frame late: every frame is its neighbour's.
  assert.equal(matched(7, 1, 4, (j) => 8 + j).displaced, 4);
  // Every other frame, but the odd ones: each is a frame off the clock's.
  assert.equal(matched(0, 2, 5, (j) => 2 * j + 1).displaced, 5);
  // Bare paper matches every frame of bare paper: a tie keeps its place.
  const paper = createDerivativeMatch({ start: 0, every: 1, frames: 2 }, { tolerance: 0.05 });
  const blank = new Uint8Array(16).fill(230);
  paper.pushDerivative(blank);
  paper.pushDerivative(blank);
  [blank, blank, blank].forEach((frame) => paper.pushSource(frame));
  assert.equal(paper.finish().displaced, 0);
  const short = createDerivativeMatch({ start: 0, every: 1, frames: 2 }, { tolerance: 0.05 });
  short.pushDerivative(blank);
  assert.throws(() => short.pushSource(blank), /ended after 1 of its 2 frames/);
});

test('an entry binds the record, certificate and films, and settles when measured the same', async () => {
  const record = { id: 31, seed: SEED, traitsSha256: 'a'.repeat(64) };
  const clock = certificateClock(certificate, { seed: SEED, steps: STEPS });
  const reply = {
    preRoll: { inkedBefore: 0, firstInk: 7370, beside: 7370, farthest: 1.6213 },
    bodies: { placed: 5193, onInk: 0 },
    hollows: {
      measured: 4755,
      open: 438,
      offset: -0.06261,
      distance: [24.1, 16.5, 8.922, 4.677, 9.106, 16.1, 23.7],
    },
  };
  const derivatives = [
    {
      kind: 'settling',
      src: '/art/clips/31-ink-settling-0123456789abcdef.mp4',
      sha256: 'b'.repeat(64),
      start: 1322,
      every: 1,
      frames: 480,
      fps: 60,
      path: '/x',
    },
  ];
  const entry = clockEntry(
    record,
    { sha256: 'c'.repeat(64) },
    { sha256: 'd'.repeat(64), bytes: 100 },
    clock,
    derivatives,
    reply,
  );
  assert.deepEqual(entry, {
    id: 31,
    seed: SEED,
    traitsSha256: 'a'.repeat(64),
    certificate: { sha256: 'c'.repeat(64), algorithm: 'ember-v4' },
    steps: STEPS,
    frames: 1802,
    scheduleSha256: certificate.inputs.frames.sha256,
    duration: '12.578588931086504',
    preRoll: '0.5',
    valveLead: '0.25',
    firstInked: 71,
    film: { sha256: 'd'.repeat(64), bytes: 100 },
    derivatives: [
      {
        kind: 'settling',
        src: derivatives[0].src,
        sha256: 'b'.repeat(64),
        start: 1322,
        every: 1,
        frames: 480,
      },
    ],
    measured: {
      firstInk: 7370,
      farthest: 1.62,
      bodies: 5193,
      hollows: 4755,
      offset: -0.063,
      distance: [8.92, 4.68, 9.11],
    },
  });
  const nudged = copy(entry);
  nudged.measured.offset += 0.001;
  nudged.measured.distance[1] += 0.01;
  assert.equal(settle(entry, nudged), entry);
  assert.equal(settle(undefined, nudged), nudged);
  const moved = copy(entry);
  moved.firstInked = 72;
  assert.equal(settle(entry, moved), moved);
  const text = await serializeClocks({ derivedOn: '2026-11-07', clocks: [entry] });
  const parsed = JSON.parse(text);
  assert.deepEqual(parsed.parameters, JSON.parse(JSON.stringify(PARAMETERS)));
  assert.equal(await serializeClocks(parsed), text);
  assert.equal(decideDerivedOn('2026-11-07', [entry], [entry], '2027-01-01'), '2026-11-07');
  assert.equal(decideDerivedOn('2026-11-07', [], [entry], '2027-01-01'), '2027-01-01');
  assert.deepEqual(
    mergeClocks([entry, { id: 9 }], [{ id: 9, again: true }, { id: 1 }]).map((clock) => clock.id),
    [1, 9, 31],
  );
});

/*
  The committed clocks, re-derived: every work's entry binds to its orbit record; its schedule's
  digest is the Light film's checkpoints'; its first inked frame follows from the certificate's
  duration and pre-roll as the generator plans it; and the films it names are the published
  film and, byte for byte, every Ink derivative the venue plays in its place.
*/
test('every committed Ink clock is re-derived: its schedule, its first ink and its films', async () => {
  const { clocks, parameters } = await read('ink-clocks.json');
  const { records } = await read('orbit-records.json');
  const { clips } = await read('plate-clips.json');
  const curated = await read('curated-media.json');
  assert.deepEqual(parameters, JSON.parse(JSON.stringify(PARAMETERS)));
  assert.deepEqual(
    clocks.map((entry) => entry.id),
    records.map((record) => record.id),
  );
  for (const entry of clocks) {
    const record = records.find((candidate) => candidate.id === entry.id);
    assert.equal(entry.seed, record.seed);
    assert.equal(entry.traitsSha256, record.traitsSha256);
    assert.equal(entry.steps, record.generation.steps);
    assert.equal(entry.frames, lightFilmFrames(entry.steps));
    assert.equal(entry.scheduleSha256, scheduleSha256(inkFilmSchedule(entry.steps)));
    assert.equal(
      entry.firstInked,
      inkFilmFirstInked(entry.steps, Number(entry.duration), Number(entry.preRoll)),
      `№ ${entry.id}`,
    );
    const expected = clips
      .filter(
        (clip) =>
          clip.id === entry.id &&
          clip.expression === 'ink' &&
          clip.sourceSha256 === entry.film.sha256,
      )
      .map((clip) => clip.sha256);
    const local = curated
      .find((work) => work.id === entry.id)
      ?.media.find((item) => item.id === 'ink')?.film;
    if (local?.sourceSha256 === entry.film.sha256) expected.push(local.sha256);
    assert.deepEqual(
      entry.derivatives.map((derivative) => derivative.sha256).sort(),
      expected.sort(),
      `№ ${entry.id}`,
    );
    // The settling clip is always among them: every plate plays one.
    assert.ok(entry.derivatives.some((derivative) => derivative.kind === 'settling'));
    for (const derivative of entry.derivatives) {
      const path = fileURLToPath(new URL(`../public${derivative.src}`, import.meta.url));
      assert.equal(await hashFile(path), derivative.sha256, derivative.src);
    }
  }
  // № 031: inked from frame 71, its schedule the digest its certificate states.
  const thirtyOne = clocks.find((entry) => entry.id === 31);
  assert.equal(thirtyOne.firstInked, 71);
  assert.equal(thirtyOne.scheduleSha256, certificate.inputs.frames.sha256);
});
