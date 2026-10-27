import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CLIP_HEIGHT,
  CLIP_WIDTH,
  CRF,
  FRAME_RATE,
  KINDS,
  MAX_CLIP_BYTES,
  STILL_MATCH,
  clipEntry,
  clipKey,
  cutStart,
  endsOnStill,
  orphans,
  serializeRegistry,
  validateClip,
  validateSource,
} from './build-plate-clips.mjs';

const stream = {
  codec_name: 'h264',
  width: 3456,
  height: 2234,
  pix_fmt: 'yuv420p',
  r_frame_rate: '60/1',
  nb_frames: '1802',
  color_primaries: 'bt709',
  color_transfer: 'iec61966-2-1',
  color_space: 'bt709',
  color_range: 'tv',
};

test('cuts the settling clip from the last 480 frames and the opening clip from frame 0', () => {
  assert.deepEqual(cutStart('settling', 1802), {
    firstFrame: 1322,
    seekSeconds: 1321.5 / 60,
    frames: 480,
  });
  assert.deepEqual(cutStart('opening', 1802), { firstFrame: 0, seekSeconds: 0, frames: 600 });
  assert.throws(() => cutStart('settling', 479), /needs 480/);
  assert.throws(() => cutStart('opening', 1.5));
  assert.equal(KINDS.settling.frames, 8 * FRAME_RATE);
  assert.equal(KINDS.opening.frames, 10 * FRAME_RATE);
});

test('accepts only the published 60 fps plate as a source and carries its colour tags', () => {
  const source = validateSource(stream, { size: '100' }, 100);
  assert.equal(source.frames, 1802);
  assert.ok(Math.abs(source.durationSeconds - 30.0333) < 0.001);
  assert.deepEqual(source.color, {
    primaries: 'bt709',
    transfer: 'iec61966-2-1',
    space: 'bt709',
    range: 'tv',
  });
  for (const change of [
    { codec_name: 'hevc' },
    { pix_fmt: 'yuv422p10le' },
    { width: 1280 },
    { r_frame_rate: '30/1' },
    { nb_frames: undefined },
    { color_primaries: undefined },
  ])
    assert.throws(() => validateSource({ ...stream, ...change }, { size: '100' }, 100));
  assert.throws(() => validateSource(stream, { size: '99' }, 100), /published 60 fps plate/);
});

test('validates the encoded clip frame for frame and bounds its size', () => {
  const probe = {
    streams: [
      {
        codec_name: 'h264',
        pix_fmt: 'yuv420p',
        width: CLIP_WIDTH,
        height: CLIP_HEIGHT,
        r_frame_rate: '60/1',
        nb_frames: '480',
        display_aspect_ratio: '1728:1117',
      },
    ],
    format: { duration: '8.000000' },
  };
  assert.deepEqual(validateClip(probe, 480, 4_000_000), { durationSeconds: 8, frames: 480 });
  assert.throws(() => validateClip(probe, 600, 4_000_000));
  assert.throws(() => validateClip(probe, 480, MAX_CLIP_BYTES + 1));
  assert.throws(() => validateClip(probe, 480, 0));
  assert.throws(() => validateClip({ ...probe, format: { duration: '8.05' } }, 480, 4_000_000));
  assert.throws(() =>
    validateClip(
      { ...probe, streams: [{ ...probe.streams[0], display_aspect_ratio: '16:9' }] },
      480,
      4_000_000,
    ),
  );
  assert.throws(() => validateClip({ ...probe, streams: [...probe.streams, {}] }, 480, 4_000_000));
});

test('a settling clip ends on the still only within the measured limits', () => {
  assert.equal(endsOnStill({ mean: 2.958, over: 0 }), true);
  assert.equal(endsOnStill({ mean: STILL_MATCH.mean, over: STILL_MATCH.over }), true);
  assert.equal(endsOnStill({ mean: 16, over: 0.097 }), false);
  assert.equal(endsOnStill({ mean: 3, over: 0.01 }), false);
  assert.ok(
    CRF.ink > CRF.light,
    'the dense sheet is encoded at a higher CRF than the sparse field',
  );
});

test('registry entries keep a stable shape and order, and orphans are the unreferenced files', () => {
  const entry = clipEntry({
    id: 31,
    seed: `0x${'a'.repeat(64)}`,
    expression: 'ink',
    kind: 'settling',
    src: '/art/clips/31-ink-settling-0123456789abcdef.mp4',
    sourceUrl: 'https://a1.cosmicsignature.com/x.mp4',
    sourceSha256: 'b'.repeat(64),
    stillSha256: 'c'.repeat(64),
    sha256: `0123456789abcdef${'d'.repeat(48)}`,
    bytes: 100,
    frames: 480,
    durationSeconds: 8,
    startSeconds: 22.0333,
    sourceDurationSeconds: 30.0333,
    stillMatch: { mean: 2.9, max: 40, over: 0 },
  });
  assert.deepEqual(Object.keys(entry), [
    'id',
    'seed',
    'expression',
    'kind',
    'src',
    'sourceUrl',
    'sourceSha256',
    'stillSha256',
    'sha256',
    'bytes',
    'width',
    'height',
    'frameRate',
    'frames',
    'durationSeconds',
    'startSeconds',
    'sourceDurationSeconds',
    'stillMatch',
  ]);
  assert.equal(clipKey(entry), '31:ink:settling');
  const opening = {
    ...entry,
    kind: 'opening',
    src: '/art/clips/31-ink-opening-ffffffffffffffff.mp4',
  };
  delete opening.stillMatch;
  const light = {
    ...entry,
    id: 2,
    expression: 'light',
    src: '/art/clips/2-light-settling-eeeeeeeeeeeeeeee.mp4',
  };
  const registry = JSON.parse(serializeRegistry([entry, light, opening]));
  assert.equal(registry.schemaVersion, 1);
  assert.deepEqual(registry.clips.map(clipKey), [
    '2:light:settling',
    '31:ink:opening',
    '31:ink:settling',
  ]);
  assert.deepEqual(
    orphans(
      ['31-ink-settling-0123456789abcdef.mp4', 'stale.mp4', 'notes.txt', '.partial-x.mp4'],
      [entry],
    ),
    ['stale.mp4', '.partial-x.mp4'],
  );
});
