import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { crc32, deflateSync } from 'node:zlib';
import sharp from 'sharp';
import {
  BINS,
  binFileName,
  decideMeasuredOn,
  decodedLit,
  litBins,
  serializeSpans,
  spanEntry,
  spanOf,
} from './build-sweep-spans.mjs';

const seed = `0x${'a'.repeat(64)}`;

test('a bin is named as the generator prints it, a tie rounded to even', () => {
  assert.equal(binFileName(0), '00_382nm.png');
  assert.equal(binFileName(1), '01_388nm.png');
  assert.equal(binFileName(2), '02_392nm.png');
  assert.equal(binFileName(50), '50_632nm.png');
  assert.equal(binFileName(63), '63_698nm.png');
  assert.throws(() => binFileName(BINS));
  assert.throws(() => binFileName(-1));
});

test('a span is the lit bins widened by two and clamped, or the generator’s fallback', () => {
  assert.deepEqual(spanOf(2, 63), { start: 0, end: 63 });
  assert.deepEqual(spanOf(16, 26), { start: 14, end: 28 });
  assert.deepEqual(spanOf(null, null), { start: 4, end: 59 });
  assert.throws(() => spanOf(30, 20), /out of order/);
  assert.deepEqual(
    spanEntry({ id: 43, seed, sweepSha256: 'b'.repeat(64), firstLit: 16, lastLit: 26 }),
    {
      id: 43,
      seed,
      sweepSha256: 'b'.repeat(64),
      firstLit: 16,
      lastLit: 26,
      start: 14,
      end: 28,
    },
  );
});

test('the lit bins are read from either end inward, each at most once', async () => {
  const read = [];
  const lit = new Set([16, 20, 26]);
  const bins = await litBins(async (bin) => {
    read.push(bin);
    return lit.has(bin);
  });
  assert.deepEqual(bins, { firstLit: 16, lastLit: 26 });
  assert.equal(new Set(read).size, read.length);
  assert.ok(!read.includes(20), 'a bin between the lit ends is never read');
  assert.deepEqual(await litBins(async () => false), { firstLit: null, lastLit: null });
  assert.deepEqual(await litBins(async (bin) => bin === 9), { firstLit: 9, lastLit: 9 });
});

/** A 16-bit RGB PNG, written as the generator writes its bins: big-endian samples, filter 0. */
function png16(width, height, samples) {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 16;
  header[9] = 2;
  const stride = 1 + width * 6;
  const rows = Buffer.alloc(height * stride);
  samples.forEach((sample, index) => {
    const row = Math.floor(index / (width * 3));
    rows.writeUInt16BE(sample, row * stride + 1 + (index % (width * 3)) * 2);
  });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('a decoded 16-bit bin is dark only when every sample is zero', async () => {
  const dark = png16(2, 2, new Array(12).fill(0));
  const faint = png16(2, 2, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7]);
  assert.equal((await sharp(faint).metadata()).depth, 'ushort');
  assert.equal(await decodedLit(dark), false);
  assert.equal(await decodedLit(faint), true);
});

test('the registry serializes stably and keeps its date while unchanged', async () => {
  const committed = await readFile(
    new URL('../src/lib/art/sweep-spans.json', import.meta.url),
    'utf8',
  );
  const parsed = JSON.parse(committed);
  assert.equal(await serializeSpans(parsed), committed);
  assert.equal(
    decideMeasuredOn('2026-11-05', parsed.spans, parsed.spans, '2027-01-01'),
    '2026-11-05',
  );
  assert.equal(decideMeasuredOn('2026-11-05', [], parsed.spans, '2027-01-01'), '2027-01-01');
  for (const entry of parsed.spans)
    assert.deepEqual({ start: entry.start, end: entry.end }, spanOf(entry.firstLit, entry.lastLit));
});
