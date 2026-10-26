import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BORDER_PX,
  EDGE_CONTRAST,
  assertLightBlack,
  decideMeasuredOn,
  ground,
  hexColor,
  luminance,
  measureBorder,
  mergeRecords,
  parseRequestedIds,
  plateRecord,
  reachesEdge,
  serializeRegistry,
} from './build-plate-records.mjs';

/** A raster filled with one colour, with a one-pixel mark at (x, y). */
function raster({ width, height, channels = 3, fill, mark }) {
  const data = new Uint8Array(width * height * channels);
  for (let i = 0; i < width * height; i += 1) {
    data[i * channels] = fill[0];
    data[i * channels + 1] = fill[1];
    data[i * channels + 2] = fill[2];
    if (channels === 4) data[i * channels + 3] = 255;
  }
  if (mark) {
    const offset = (mark.y * width + mark.x) * channels;
    data[offset] = mark.color[0];
    data[offset + 1] = mark.color[1];
    data[offset + 2] = mark.color[2];
  }
  return { data, width, height, channels };
}

test('parses token ids and rejects anything else', () => {
  assert.deepEqual(parseRequestedIds(['23', '31']), [23, 31]);
  assert.throws(() => parseRequestedIds(['x']));
  assert.throws(() => parseRequestedIds(['-1']));
  assert.throws(() => parseRequestedIds(['99999999999999999999']));
});

test('luminance follows Rec. 709 and hex formatting rounds and clamps', () => {
  assert.ok(Math.abs(luminance(255, 255, 255) - 255) < 1e-9);
  assert.equal(luminance(0, 0, 0), 0);
  assert.ok(Math.abs(luminance(255, 0, 0) - 54.213) < 0.001);
  assert.equal(hexColor(240.4, 234.6, 222), '#f0ebde');
  assert.equal(hexColor(300, -5, 0), '#ff0000');
});

test('measures every border pixel exactly once and ignores the interior', () => {
  const image = raster({ width: 40, height: 30, fill: [240, 234, 222] });
  const measurement = measureBorder(image, BORDER_PX);
  const interior = (40 - 2 * BORDER_PX) * (30 - 2 * BORDER_PX);
  assert.equal(measurement.count, 40 * 30 - interior);
  assert.deepEqual(measurement.mean, [240, 234, 222]);
  assert.equal(measurement.minLuminance, measurement.maxLuminance);
  // An interior mark must not change the border reading.
  const marked = raster({
    width: 40,
    height: 30,
    fill: [240, 234, 222],
    mark: { x: 20, y: 15, color: [0, 0, 0] },
  });
  assert.deepEqual(measureBorder(marked, BORDER_PX), measurement);
});

test('reads RGBA rasters and rejects unusable ones', () => {
  const image = raster({ width: 20, height: 20, channels: 4, fill: [10, 20, 30] });
  assert.deepEqual(measureBorder(image, 4).mean, [10, 20, 30]);
  assert.throws(() => measureBorder({ ...image, channels: 2 }, 4));
  assert.throws(() => measureBorder(raster({ width: 8, height: 8, fill: [0, 0, 0] }), 4));
  assert.throws(() => measureBorder({ ...image, data: image.data.subarray(1) }, 4));
});

test('an edge mark flips the edge flag; a faint grain does not', () => {
  const paper = [240, 234, 222];
  const clean = measureBorder(raster({ width: 40, height: 30, fill: paper }));
  assert.equal(reachesEdge(clean), false);
  const inked = measureBorder(
    raster({ width: 40, height: 30, fill: paper, mark: { x: 0, y: 12, color: [30, 30, 28] } }),
  );
  assert.equal(reachesEdge(inked), true);
  const grain = measureBorder(
    raster({ width: 40, height: 30, fill: paper, mark: { x: 3, y: 3, color: [226, 220, 208] } }),
  );
  assert.equal(reachesEdge(grain), false);
  // Light on black is the symmetric case.
  const lit = measureBorder(
    raster({
      width: 40,
      height: 30,
      fill: [0, 0, 0],
      mark: { x: 39, y: 29, color: [120, 90, 200] },
    }),
  );
  assert.equal(reachesEdge(lit), true);
  assert.equal(reachesEdge(lit, EDGE_CONTRAST + 200), false);
});

test('a Light border must be pure black', () => {
  assert.doesNotThrow(() =>
    assertLightBlack(31, measureBorder(raster({ width: 40, height: 30, fill: [0, 0, 0] }))),
  );
  assert.throws(
    () => assertLightBlack(31, measureBorder(raster({ width: 40, height: 30, fill: [8, 10, 9] }))),
    /#08.*not #000000/,
  );
});

test('grounds and records keep a stable key order and omit unmeasured expressions', () => {
  const sha = 'a'.repeat(64);
  const measurement = measureBorder(raster({ width: 40, height: 30, fill: [239, 233, 221] }));
  assert.deepEqual(ground(sha, measurement), { stillSha256: sha, tone: '#efe9dd', edge: false });
  const record = plateRecord({
    id: 31,
    seed: `0x${'b'.repeat(64)}`,
    light: { edge: false, tone: '#000000', stillSha256: sha, extra: 'dropped' },
  });
  assert.deepEqual(Object.keys(record), ['id', 'seed', 'light']);
  assert.deepEqual(Object.keys(record.light), ['stillSha256', 'tone', 'edge']);
  assert.equal('ink' in record, false);
});

test('merging replaces measured ids, keeps the rest and sorts by id', () => {
  const seed = `0x${'c'.repeat(64)}`;
  const existing = [
    { id: 35, seed, ink: { stillSha256: 'd'.repeat(64), tone: '#ece6db', edge: true } },
    { id: 23, seed, ink: { stillSha256: 'e'.repeat(64), tone: '#f0eade', edge: true } },
  ];
  const merged = mergeRecords(existing, [
    { id: 35, seed, ink: { stillSha256: 'f'.repeat(64), tone: '#ece6dc', edge: false } },
  ]);
  assert.deepEqual(
    merged.map((record) => [record.id, record.ink.tone]),
    [
      [23, '#f0eade'],
      [35, '#ece6dc'],
    ],
  );
});

test('an unchanged measurement keeps the previous date; a change takes today', () => {
  const records = [{ id: 23, seed: `0x${'1'.repeat(64)}` }];
  assert.equal(decideMeasuredOn('2026-10-26', records, records, '2026-11-01'), '2026-10-26');
  assert.equal(decideMeasuredOn(null, records, records, '2026-11-01'), '2026-11-01');
  assert.equal(decideMeasuredOn('2026-10-26', records, [], '2026-11-01'), '2026-11-01');
});

test('the registry serializes with schema version 1 and a trailing newline', () => {
  const text = serializeRegistry({ measuredOn: '2026-10-26', records: [] });
  assert.deepEqual(JSON.parse(text), { schemaVersion: 1, measuredOn: '2026-10-26', records: [] });
  assert.ok(text.endsWith('\n'));
});
