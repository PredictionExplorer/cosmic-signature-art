import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PARAMETERS,
  arrivalMap,
  boxBlur,
  createInkMeasure,
  createLightMeasure,
  decideMeasuredOn,
  eachFrame,
  figureShare,
  mergeMaps,
  modeTone,
  orphans,
  serializeRegistry,
  spreadFromMarks,
} from './build-arrival-maps.mjs';

const small = { ...PARAMETERS, width: 8, height: 4, blurPasses: 0 };
const at = (x, y) => y * small.width + x;

/** A film as a list of frames, each a copy of the last with some pixels set. */
function film(steps, base = 0) {
  const frames = [];
  let frame = new Uint8Array(small.width * small.height).fill(base);
  for (const changes of steps) {
    frame = Uint8Array.from(frame);
    for (const [x, y, value] of changes) frame[at(x, y)] = value;
    frames.push(frame);
  }
  return frames;
}

test('Light: a mark arrives the first time it reaches half its final brightness, and stays', () => {
  const frames = film([[], [[1, 1, 100]], [[1, 1, 200]], [[6, 2, 40]], [[6, 2, 200]], []]);
  const measure = createLightMeasure(frames.at(-1), small);
  frames.forEach((frame) => measure.push(frame));
  const { field, figure, frames: count } = measure.finish();
  assert.equal(count, 6);
  // 100 is half of 200 at frame 1; the second mark reaches 100 only at frame 4.
  assert.equal(field[at(1, 1)], 1 / 5);
  assert.equal(field[at(6, 2)], 4 / 5);
  assert.equal(figure[at(0, 0)], 0);
  assert.equal(field[at(0, 0)], Infinity);
});

test('Light: dim pixels are ground, not marks', () => {
  const frames = film([[[2, 2, 10]], [[2, 2, 12]]]);
  const measure = createLightMeasure(frames.at(-1), small);
  frames.forEach((frame) => measure.push(frame));
  assert.equal(measure.finish().figure[at(2, 2)], 0);
});

test('Ink: a mark has arrived once it stops changing, on the sheet’s own paper', () => {
  const paper = 235;
  const frames = film(
    [
      [],
      [[1, 1, 40]],
      [
        [1, 1, 90],
        [5, 2, 120],
      ],
      [[1, 1, 100]],
      [[5, 2, 60]],
      [],
    ],
    paper,
  );
  const measure = createInkMeasure(frames.at(-1), small);
  assert.equal(measure.paper, paper);
  frames.forEach((frame) => measure.push(frame));
  const { field, figure } = measure.finish();
  // (1,1) last departs from 100 at frame 2 (90 is within 10), so it rests from frame 2.
  assert.equal(field[at(1, 1)], 2 / 5);
  assert.equal(field[at(5, 2)], 4 / 5);
  assert.equal(figure[at(0, 0)], 0);
  assert.equal(modeTone(frames.at(-1)), paper);
});

test('the ground is reached after its nearest mark, later with distance', () => {
  const field = new Float64Array(small.width * small.height).fill(Infinity);
  field[at(0, 0)] = 0.2;
  const spread = spreadFromMarks(field, small.width, small.height, 0.35);
  assert.equal(spread[at(0, 0)], 0.2);
  assert.ok(spread[at(1, 0)] > 0.2);
  assert.ok(spread[at(7, 3)] > spread[at(3, 1)]);
  const step = 0.35 / Math.hypot(small.width, small.height);
  assert.ok(Math.abs(spread[at(1, 1)] - (0.2 + step * Math.SQRT2)) < 1e-12);
  // A knight's move is √5, not 1 + √2: the fronts stay round.
  assert.ok(Math.abs(spread[at(2, 1)] - (0.2 + step * Math.sqrt(5))) < 1e-12);
});

test('a box blur keeps a flat field flat and the mean of a step', () => {
  const flat = new Float64Array(32).fill(3);
  assert.deepEqual([...boxBlur(flat, 8, 4, 2)], [...flat]);
  const stepField = Float64Array.from({ length: 32 }, (_, p) => (p % 8 < 4 ? 0 : 1));
  const blurred = boxBlur(stepField, 8, 4, 1);
  assert.ok(blurred[at(3, 1)] > 0 && blurred[at(3, 1)] < 1);
});

test('the map spans 0–255 in arrival order and refuses a film with no marks', () => {
  const field = new Float64Array(small.width * small.height).fill(Infinity);
  const figure = new Uint8Array(field.length);
  field[at(1, 1)] = 0;
  figure[at(1, 1)] = 1;
  field[at(6, 2)] = 1;
  figure[at(6, 2)] = 1;
  const map = arrivalMap({ field, figure }, small);
  assert.equal(Math.min(...map), 0);
  assert.equal(Math.max(...map), 255);
  assert.ok(map[at(1, 1)] < map[at(6, 2)]);
  assert.ok(map[at(0, 0)] < map[at(7, 3)]);
  assert.throws(
    () => arrivalMap({ field, figure: new Uint8Array(field.length) }, small),
    /no marks/,
  );
  assert.equal(figureShare(figure), 0.0625);
});

test('the registry merges by work and expression, keeps its date and serializes stably', async () => {
  const entry = (id, expression, sha) => ({
    id,
    seed: `0x${'a'.repeat(64)}`,
    expression,
    src: `/art/arrival/${id}-${expression}-${sha.slice(0, 16)}.webp`,
    sha256: sha,
    bytes: 100,
    width: 576,
    height: 372,
    sourceSha256: 'b'.repeat(64),
    stillSha256: 'c'.repeat(64),
    frames: 901,
    figureShare: 0.156,
    extra: 'dropped',
  });
  const first = mergeMaps(
    [],
    [entry(31, 'light', 'd'.repeat(64)), entry(0, 'light', 'e'.repeat(64))],
  );
  assert.deepEqual(
    first.map((map) => `${map.id}:${map.expression}`),
    ['0:light', '31:light'],
  );
  assert.equal('extra' in first[0], false);
  const second = mergeMaps(first, [entry(31, 'ink', 'f'.repeat(64))]);
  assert.equal(second.length, 3);
  assert.equal(decideMeasuredOn('2026-10-30', first, first, '2027-01-01'), '2026-10-30');
  assert.equal(decideMeasuredOn('2026-10-30', first, second, '2027-01-01'), '2027-01-01');
  const text = await serializeRegistry({ measuredOn: '2026-10-30', maps: second });
  assert.equal(await serializeRegistry(JSON.parse(text)), text);
  assert.deepEqual(JSON.parse(text).parameters, PARAMETERS);
  assert.deepEqual(
    orphans(
      [`31-ink-${'f'.repeat(16)}.webp`, `31-ink-${'9'.repeat(16)}.webp`, '.DS_Store', 'x.webp.tmp'],
      second,
    ),
    [`31-ink-${'9'.repeat(16)}.webp`],
  );
});

test('a decoder that is missing or stalls rejects instead of crashing or hanging the build', async () => {
  await assert.rejects(
    eachFrame('/nowhere.mp4', () => {}, { program: 'cosmic-no-such-decoder' }),
    /ENOENT/,
  );
  // `yes` never ends on its own: the kill timer stops it, and the read rejects.
  let frames = 0;
  await assert.rejects(
    eachFrame('/nowhere.mp4', () => (frames += 1), {
      parameters: small,
      program: 'yes',
      timeout: 200,
    }),
    /failed \(SIGKILL\)/,
  );
  assert.ok(frames > 0);
});

test('a reader that throws leaves no decoder running', async () => {
  await assert.rejects(
    eachFrame(
      '/nowhere.mp4',
      () => {
        throw new Error('measure failed');
      },
      { parameters: small, program: 'yes', timeout: 60_000 },
    ),
    /measure failed/,
  );
});
