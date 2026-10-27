import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BORDER_PX,
  CELL_PX,
  EDGE_CONTRAST,
  SCHEMA_VERSION,
  assertLightBlack,
  decideMeasuredOn,
  detailWindows,
  ground,
  hexColor,
  measureBorder,
  measureWeight,
  mergeRecords,
  plateRecord,
  reachesEdge,
  serializeRegistry,
} from './build-plate-records.mjs';

/** A raster filled with one colour, with optional marks: single pixels or filled rectangles. */
function raster({ width, height, channels = 3, fill, marks = [] }) {
  const data = new Uint8Array(width * height * channels);
  for (let i = 0; i < width * height; i += 1) {
    data[i * channels] = fill[0];
    data[i * channels + 1] = fill[1];
    data[i * channels + 2] = fill[2];
    if (channels === 4) data[i * channels + 3] = 255;
  }
  for (const mark of marks) {
    const w = mark.width ?? 1;
    const h = mark.height ?? 1;
    for (let y = mark.y; y < mark.y + h; y += 1)
      for (let x = mark.x; x < mark.x + w; x += 1) {
        const offset = (y * width + x) * channels;
        data[offset] = mark.color[0];
        data[offset + 1] = mark.color[1];
        data[offset + 2] = mark.color[2];
      }
  }
  return { data, width, height, channels };
}
const paper = [240, 234, 222];

test('hex formatting rounds and clamps', () => {
  assert.equal(hexColor(240.4, 234.6, 222), '#f0ebde');
  assert.equal(hexColor(300, -5, 0), '#ff0000');
});

test('measures every border pixel exactly once and ignores the interior', () => {
  const image = raster({ width: 40, height: 30, fill: paper });
  const measurement = measureBorder(image, BORDER_PX);
  const interior = (40 - 2 * BORDER_PX) * (30 - 2 * BORDER_PX);
  assert.equal(measurement.count, 40 * 30 - interior);
  assert.deepEqual(measurement.mean, paper);
  assert.equal(measurement.minLuminance, measurement.maxLuminance);
  const marked = raster({
    width: 40,
    height: 30,
    fill: paper,
    marks: [{ x: 20, y: 15, color: [0, 0, 0] }],
  });
  assert.deepEqual(measureBorder(marked), measurement);
  assert.throws(() => measureBorder({ ...image, channels: 2 }));
  assert.throws(() => measureBorder(raster({ width: 16, height: 16, fill: paper })));
});

test('detects ink reaching the border and light reaching the border', () => {
  const clean = measureBorder(raster({ width: 40, height: 30, fill: paper }));
  assert.equal(reachesEdge(clean), false);
  const inked = measureBorder(
    raster({ width: 40, height: 30, fill: paper, marks: [{ x: 0, y: 10, color: [20, 20, 20] }] }),
  );
  assert.equal(reachesEdge(inked), true);
  const grain = measureBorder(
    raster({
      width: 40,
      height: 30,
      fill: paper,
      marks: [{ x: 0, y: 10, color: [230, 224, 212] }],
    }),
  );
  assert.equal(reachesEdge(grain), false);
  const lit = measureBorder(
    raster({
      width: 40,
      height: 30,
      fill: [0, 0, 0],
      marks: [{ x: 39, y: 29, color: [255, 255, 255] }],
    }),
  );
  assert.equal(reachesEdge(lit), true);
  assert.equal(EDGE_CONTRAST, 64);
});

test('refuses to record a Light ground that is not black', () => {
  assertLightBlack(31, measureBorder(raster({ width: 40, height: 30, fill: [0, 0, 0] })));
  assert.throws(
    () => assertLightBlack(31, measureBorder(raster({ width: 40, height: 30, fill: [8, 8, 8] }))),
    /#080808/,
  );
});

test('weighs ink by darkness against the sheet and light by luminance, centring on the marks', () => {
  const sheet = raster({
    width: 128,
    height: 96,
    fill: paper,
    marks: [{ x: 96, y: 64, width: 16, height: 16, color: [0, 0, 0] }],
  });
  const ink = measureWeight(sheet, 'ink', 233, CELL_PX);
  assert.deepEqual(ink.centre, { x: (96 + 8) / 128, y: (64 + 8) / 96 });
  assert.equal(ink.grid.columns, 4);
  assert.equal(ink.grid.rows, 3);
  // The whole mark sits in cell (3, 2); the paper weighs nothing.
  assert.ok(ink.grid.sums[2 * 4 + 3] > 0);
  assert.equal(
    ink.grid.sums.reduce((a, b) => a + b, 0),
    ink.total,
  );
  assert.equal(ink.grid.sums.filter((sum) => sum > 0).length, 1);
  const field = raster({
    width: 128,
    height: 96,
    fill: [0, 0, 0],
    marks: [{ x: 0, y: 0, width: 16, height: 16, color: [255, 255, 255] }],
  });
  const light = measureWeight(field, 'light', 0, CELL_PX);
  assert.deepEqual(light.centre, { x: 8 / 128, y: Math.round((8 / 96) * 10_000) / 10_000 });
  const empty = measureWeight(raster({ width: 64, height: 64, fill: paper }), 'ink', 233);
  assert.deepEqual(empty.centre, { x: 0.5, y: 0.5 });
  assert.equal(empty.total, 0);
});

test('chooses the heaviest detail windows without letting them overlap', () => {
  const sheet = raster({
    width: 320,
    height: 192,
    fill: paper,
    marks: [
      { x: 32, y: 32, width: 32, height: 32, color: [0, 0, 0] },
      { x: 256, y: 128, width: 32, height: 32, color: [0, 0, 0] },
      { x: 160, y: 96, width: 8, height: 8, color: [0, 0, 0] },
    ],
  });
  const weight = measureWeight(sheet, 'ink', 233, 32);
  const windows = detailWindows(
    weight,
    { columns: 2, rows: 2 },
    { count: 3, maxOverlap: 0.1, minShare: 0.04 },
  );
  assert.equal(windows.length, 2, 'the small mark holds under 4 % of the weight');
  for (const window of windows) {
    assert.equal(window.width, 64);
    assert.equal(window.height, 64);
    assert.equal(window.x % 32, 0);
  }
  const heavy = windows.map((window) => `${window.x},${window.y}`);
  assert.ok(
    heavy.includes('32,32') ||
      heavy.includes('0,0') ||
      heavy.includes('32,0') ||
      heavy.includes('0,32'),
  );
  assert.ok(windows[0].share >= windows[1].share);
  // Each large mark holds 1024 of the 2112 dark pixels; the small one holds the rest.
  assert.ok(Math.abs(windows[0].share - 1024 / 2112) < 0.001);
  assert.deepEqual(
    detailWindows(measureWeight(raster({ width: 64, height: 64, fill: paper }), 'ink', 233)),
    [],
  );
  // Windows wider than the grid clamp to it.
  const tiny = detailWindows(
    measureWeight(sheet, 'ink', 233, 32),
    { columns: 99, rows: 99 },
    { count: 1, maxOverlap: 0.1, minShare: 0 },
  );
  assert.deepEqual(tiny, [{ x: 0, y: 0, width: 320, height: 192, share: 1 }]);
});

test('records keep a stable shape, merge by id and keep their date when nothing changed', () => {
  const border = measureBorder(raster({ width: 40, height: 30, fill: paper }));
  const weight = { centre: { x: 0.5, y: 0.4 } };
  const detail = [{ x: 0, y: 0, width: 32, height: 32, share: 0.6 }];
  const inkGround = ground('a'.repeat(64), border, weight, detail);
  assert.deepEqual(inkGround, {
    stillSha256: 'a'.repeat(64),
    tone: '#f0eade',
    edge: false,
    centre: { x: 0.5, y: 0.4 },
    detail,
  });
  const record = plateRecord({
    id: 31,
    seed: '0x' + 'b'.repeat(64),
    ink: { ...inkGround, extra: 1 },
  });
  assert.deepEqual(Object.keys(record), ['id', 'seed', 'ink']);
  assert.deepEqual(Object.keys(record.ink), ['stillSha256', 'tone', 'edge', 'centre', 'detail']);
  const merged = mergeRecords(
    [
      { id: 35, seed: '0x' + 'c'.repeat(64) },
      { id: 31, seed: '0x' + 'd'.repeat(64) },
    ],
    [record],
  );
  assert.deepEqual(
    merged.map((entry) => [entry.id, entry.seed.slice(2, 3)]),
    [
      [31, 'b'],
      [35, 'c'],
    ],
  );
  assert.equal(decideMeasuredOn('2026-10-26', merged, merged, '2026-10-27'), '2026-10-26');
  assert.equal(decideMeasuredOn('2026-10-26', merged, [], '2026-10-27'), '2026-10-27');
  assert.equal(decideMeasuredOn(null, merged, merged, '2026-10-27'), '2026-10-27');
  const serialized = JSON.parse(serializeRegistry({ measuredOn: '2026-10-27', records: merged }));
  assert.equal(serialized.schemaVersion, SCHEMA_VERSION);
  assert.equal(SCHEMA_VERSION, 2);
});
