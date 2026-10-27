import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIFFERENCE_THRESHOLD, luminance, meanAbsoluteDifference } from './raster.mjs';

function raster(width, height, fill) {
  const data = new Uint8Array(width * height * 3);
  for (let i = 0; i < data.length; i += 3) {
    data[i] = fill[0];
    data[i + 1] = fill[1];
    data[i + 2] = fill[2];
  }
  return { data, width, height, channels: 3 };
}

test('measures the mean, the maximum and the share of samples over the threshold', () => {
  const a = raster(4, 2, [100, 100, 100]);
  const b = raster(4, 2, [100, 100, 100]);
  assert.deepEqual(meanAbsoluteDifference(a, b), { mean: 0, max: 0, over: 0 });
  b.data[0] = 200; // one sample of 24 departs by 100
  b.data[4] = 110; // one departs by 10
  const result = meanAbsoluteDifference(a, b);
  assert.equal(result.max, 100);
  assert.equal(result.mean, Math.round((110 / 24) * 1000) / 1000);
  assert.equal(result.over, Math.round((1 / 24) * 100_000) / 100_000);
  assert.equal(meanAbsoluteDifference(a, b, 5).over, Math.round((2 / 24) * 100_000) / 100_000);
  assert.equal(DIFFERENCE_THRESHOLD, 48);
});

test('refuses rasters that differ in size', () => {
  assert.throws(() => meanAbsoluteDifference(raster(2, 2, [0, 0, 0]), raster(2, 3, [0, 0, 0])));
  const short = raster(2, 2, [0, 0, 0]);
  short.data = short.data.subarray(0, 6);
  assert.throws(() => meanAbsoluteDifference(short, raster(2, 2, [0, 0, 0])));
});

test('luminance follows Rec. 709', () => {
  assert.ok(Math.abs(luminance(255, 255, 255) - 255) < 1e-9);
  assert.equal(luminance(0, 0, 0), 0);
  assert.ok(Math.abs(luminance(0, 255, 0) - 182.376) < 0.001);
});
