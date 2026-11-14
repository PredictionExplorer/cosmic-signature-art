import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  CLIP_HEIGHT,
  CLIP_WIDTH,
  CRF,
  FIRST_MARK,
  FRAME_RATE,
  KINDS,
  MAX_CLIP_BYTES,
  SETTLING_RUNGS,
  STILL_MATCH,
  clipEntry,
  clipKey,
  clipSource,
  createFirstMark,
  cutStart,
  encode,
  encodeArguments,
  endsOnStill,
  lastFrameArguments,
  orphans,
  probe as probeFile,
  recordedRungIsCurrent,
  rungEntry,
  rungSource,
  sameCut,
  serializeRegistry,
  stillMatchOf,
  validateClip,
  validateSource,
} from './build-plate-clips.mjs';
import { command } from './lib/origin.mjs';

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
  // A rung is validated at its own size, and is refused at any other.
  const rung = { ...probe, streams: [{ ...probe.streams[0], width: 640, height: 414 }] };
  assert.deepEqual(validateClip(rung, 480, 1_200_000, SETTLING_RUNGS.ink[0]), {
    durationSeconds: 8,
    frames: 480,
  });
  assert.throws(() => validateClip(rung, 480, 1_200_000));
  assert.throws(() => validateClip(probe, 480, 4_000_000, SETTLING_RUNGS.ink[0]));
});

test("an opening's first mark is the first frame that departs from its first frame's ground", () => {
  // At 10,000 pixels the share allows five: a sixth departing pixel is a mark.
  const size = 10_000;
  const sheet = (marks, ground = 236, tone = 40) => {
    const frame = new Uint8Array(size).fill(ground);
    frame.fill(tone, 0, marks);
    return frame;
  };
  const measure = createFirstMark();
  // Bare paper, a sheet whose tone shifts only as far as the levels allow, a speck within the
  // share, then the first ink.
  for (const frame of [
    sheet(0),
    sheet(0),
    sheet(0, 236 - FIRST_MARK.levels),
    sheet(5),
    sheet(6),
    sheet(9),
  ])
    measure.push(frame);
  assert.equal(measure.finish(), 4);
  // Light: the night is the ground, and the light departs upward from it.
  const night = createFirstMark();
  for (const frame of [sheet(0, 0), sheet(0, 0, 255), sheet(30, 0, 255)]) night.push(frame);
  assert.equal(night.finish(), 2);
  // An opening that never shows the work has no mark.
  const empty = createFirstMark();
  empty.push(sheet(0));
  assert.equal(empty.finish(), null);
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
  // An opening's first mark follows the source's timing, and only a whole frame is kept.
  assert.equal(clipEntry({ ...opening, firstMarkFrame: 71 }).firstMarkFrame, 71);
  assert.equal(Object.keys(clipEntry({ ...opening, firstMarkFrame: 71 })).at(-1), 'firstMarkFrame');
  assert.equal('firstMarkFrame' in clipEntry({ ...opening, firstMarkFrame: 1.5 }), false);
  assert.equal('firstMarkFrame' in clipEntry(opening), false);
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

/** 031's Ink settling clip as the registry records it, and its 640 rung. */
const settled = clipEntry({
  id: 31,
  seed: `0x${'a'.repeat(64)}`,
  expression: 'ink',
  kind: 'settling',
  src: '/art/clips/31-ink-settling-0123456789abcdef.mp4',
  sourceUrl: 'https://a1.cosmicsignature.com/x.mp4',
  sourceSha256: 'b'.repeat(64),
  stillSha256: 'c'.repeat(64),
  sha256: `0123456789abcdef${'d'.repeat(48)}`,
  bytes: 4_301_788,
  frames: 480,
  durationSeconds: 8,
  startSeconds: 1322 / 60,
  sourceDurationSeconds: 1802 / 60,
  stillMatch: { mean: 2.958, max: 41, over: 0 },
});
const rungHash = `fedcba9876543210${'e'.repeat(48)}`;
const rung = rungEntry({
  src: rungSource(settled, 640, rungHash),
  sha256: rungHash,
  bytes: 2_163_765,
  width: 640,
  height: 414,
  crf: 22,
  stillMatch: { mean: 3.1, max: 52, over: 0.00002 },
});

test("each settling rung is the clip's frame at a smaller width, ascending", () => {
  for (const expression of ['ink', 'light']) {
    const rungs = SETTLING_RUNGS[expression];
    assert.ok(rungs.length > 0, `${expression} has a rung`);
    rungs.forEach((size, index) => {
      assert.ok(size.width < CLIP_WIDTH);
      // The clip's own aspect, to the pixel, in the even sides that 4:2:0 needs.
      assert.equal(size.height, Math.round((size.width * CLIP_HEIGHT) / CLIP_WIDTH));
      assert.equal(size.width % 2, 0);
      assert.equal(size.height % 2, 0);
      if (index > 0) assert.ok(size.width > rungs[index - 1].width);
    });
  }
  assert.deepEqual(SETTLING_RUNGS.ink, [{ width: 640, height: 414, crf: 22 }]);
  // A card shows a rung at up to its own size, where the clip was shrunk by half and its codec
  // noise with it, so the dense sheet's rung is encoded finer than its clip, and none coarser.
  assert.ok(SETTLING_RUNGS.ink[0].crf < CRF.ink);
  assert.ok(SETTLING_RUNGS.light.every((size) => size.crf <= CRF.light));
  assert.equal(clipSource(settled, settled.sha256), settled.src);
  // A rung names its width before its hash, as the still ladder's rungs do.
  assert.equal(rung.src, '/art/clips/31-ink-settling-640-fedcba9876543210.mp4');
});

test('a rung is cut exactly as its clip is: the same frames of the same film, only smaller', () => {
  const source = validateSource(stream, { size: '100' }, 100);
  const cut = cutStart('settling', source.frames);
  const clip = encodeArguments(
    {
      input: 'http://127.0.0.1:4100/source.mp4',
      cut,
      size: { width: CLIP_WIDTH, height: CLIP_HEIGHT },
      crf: CRF.ink,
      color: source.color,
    },
    'clip.mp4',
  );
  const local = encodeArguments(
    {
      input: '/cache/0xaa/videos/web/ember.mp4',
      cut,
      size: SETTLING_RUNGS.ink[0],
      crf: SETTLING_RUNGS.ink[0].crf,
      color: source.color,
    },
    'rung.mp4',
  );
  const value = (args, flag) => args[args.indexOf(flag) + 1];
  // The relay is read over HTTP with a timeout; the verified local copy only as a file.
  assert.equal(value(clip, '-protocol_whitelist'), 'http,tcp');
  assert.equal(value(clip, '-rw_timeout'), '15000000');
  assert.equal(value(local, '-protocol_whitelist'), 'file');
  assert.equal(local.includes('-rw_timeout'), false);
  // The same seek, half a frame before frame 1322, and the same 480 frames to the film's last.
  assert.equal(value(local, '-ss'), (1321.5 / 60).toFixed(6));
  assert.equal(value(local, '-frames:v'), '480');
  assert.equal(
    value(local, '-vf'),
    'scale=640:414:flags=lanczos,setdar=ratio=3456/2234:max=1000000',
  );
  assert.equal(
    value(clip, '-vf'),
    'scale=1280:828:flags=lanczos,setdar=ratio=3456/2234:max=1000000',
  );
  assert.equal(value(clip, '-crf'), '26');
  assert.equal(value(local, '-crf'), '22');
  // Nothing else differs: the codec, its preset, the key interval, the colour tags.
  const varying = new Set(['-protocol_whitelist', '-rw_timeout', '-i', '-vf', '-crf']);
  const common = (args) =>
    args
      .slice(0, -1)
      .filter((argument, index) => !varying.has(argument) && !varying.has(args[index - 1]));
  assert.deepEqual(common(local), common(clip));
  assert.equal(value(local, '-color_trc'), 'iec61966-2-1');
  assert.equal(local.at(-1), 'rung.mp4');
  // The rung's last frame, the one compared with the still, is the film's last.
  assert.equal(
    value(lastFrameArguments('rung.mp4', cut.frames, 'last.png'), '-vf'),
    'select=eq(n\\,479)',
  );
});

test('a rung belongs to its clip only when it cuts the same frames of the same film', () => {
  const film = { frames: 1802 };
  assert.equal(sameCut(settled, cutStart('settling', 1802), film), true);
  // The recorded seconds survive the registry's JSON as the same frames.
  const recorded = JSON.parse(serializeRegistry([settled])).clips[0];
  assert.equal(sameCut(recorded, cutStart('settling', 1802), film), true);
  // A film a frame longer starts its cut a frame later; a clip recorded a frame early is another cut.
  assert.equal(sameCut(settled, cutStart('settling', 1803), { frames: 1803 }), false);
  assert.equal(
    sameCut({ ...settled, startSeconds: 1321 / 60 }, cutStart('settling', 1802), film),
    false,
  );
  assert.equal(sameCut(settled, cutStart('opening', 1802), film), false);
});

test('a recorded rung is kept when current, cut again at another size, refused when unproven', () => {
  const size = SETTLING_RUNGS.ink[0];
  assert.equal(recordedRungIsCurrent(rung, settled, size), true);
  assert.equal(recordedRungIsCurrent(undefined, settled, size), false);
  assert.equal(recordedRungIsCurrent({ ...rung, height: 416 }, settled, size), false);
  // A rung encoded at another quality, or recorded before its quality was, is cut again.
  assert.equal(recordedRungIsCurrent({ ...rung, crf: 26 }, settled, size), false);
  assert.equal(recordedRungIsCurrent({ ...rung, crf: undefined }, settled, size), false);
  for (const change of [
    { sha256: 'not-a-hash' },
    { src: rungSource(settled, 640, 'f'.repeat(64)) },
    { src: rungSource({ ...settled, id: 32 }, 640, rungHash) },
    { src: rungSource({ ...settled, expression: 'light' }, 640, rungHash) },
    { src: clipSource(settled, rungHash) },
    { stillMatch: undefined },
    { stillMatch: { mean: 16, max: 240, over: 0.097 } },
    { stillMatch: { mean: 3, max: 60, over: 0.01 } },
  ])
    assert.throws(
      () => recordedRungIsCurrent({ ...rung, ...change }, settled, size),
      /ends on the still/,
    );
});

test('a settling entry records its rungs ascending in a stable shape, and keeps their files', () => {
  const wider = { ...rung, width: 960, height: 621, src: rungSource(settled, 960, rungHash) };
  const entry = clipEntry({ ...settled, rungs: [wider, { ...rung, extra: true }] });
  assert.equal(Object.keys(entry).at(-1), 'rungs');
  assert.deepEqual(
    entry.rungs.map((each) => each.width),
    [640, 960],
  );
  assert.deepEqual(Object.keys(entry.rungs[0]), [
    'src',
    'sha256',
    'bytes',
    'width',
    'height',
    'crf',
    'stillMatch',
  ]);
  // No rungs, no field; an opening never carries any.
  assert.equal('rungs' in clipEntry({ ...settled, rungs: [] }), false);
  assert.equal('rungs' in clipEntry({ ...settled, kind: 'opening', rungs: [rung] }), false);
  // A full run keeps every file a record or its rungs name, and removes the rest.
  assert.deepEqual(
    orphans(
      [
        '31-ink-settling-0123456789abcdef.mp4',
        '31-ink-settling-640-fedcba9876543210.mp4',
        '31-ink-settling-960-fedcba9876543210.mp4',
        '31-ink-settling-640-0000000000000000.mp4',
      ],
      [entry],
    ),
    ['31-ink-settling-640-0000000000000000.mp4'],
  );
});

// The pipeline's own encode and still match, on a synthetic film. The CI runner has no ffmpeg,
// so there the arguments above stand for it.
const hasFfmpeg = ['ffmpeg', 'ffprobe'].every(
  (tool) => spawnSync(tool, ['-version'], { stdio: 'ignore' }).status === 0,
);
test(
  'a rung cut from a film ends on its still, and is told from a frame before the end',
  { skip: hasFfmpeg ? false : 'ffmpeg is not installed', timeout: 60_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'plate-rung-'));
    try {
      // A second of film at the clip's size whose every frame differs: smooth waves travelling
      // at unrelated rates.
      const film = join(directory, 'film.mp4');
      await command('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-y',
        '-f',
        'lavfi',
        '-i',
        "color=s=640x414:r=60:d=1,geq=r='128+96*sin(2*PI*(X/320+N/37))':g='128+96*sin(2*PI*(Y/207+N/53))':b='128+96*sin(2*PI*((X+Y)/400-N/29))',scale=1280:828",
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-qp',
        '0',
        '-pix_fmt',
        'yuv420p',
        film,
      ]);
      const still = join(directory, 'still.png');
      const earlier = join(directory, 'earlier.png');
      await command('ffmpeg', lastFrameArguments(film, 60, still));
      await command('ffmpeg', lastFrameArguments(film, 48, earlier));
      // The settling cut of this film: its last 30 frames, at the rung's size.
      const cut = { firstFrame: 30, seekSeconds: 29.5 / FRAME_RATE, frames: 30 };
      const size = SETTLING_RUNGS.ink[0];
      const color = { primaries: 'bt709', transfer: 'bt709', space: 'bt709', range: 'tv' };
      const output = join(directory, 'rung.mp4');
      await encode({ input: film, cut, size, crf: size.crf, color }, output);
      const bytes = (await stat(output)).size;
      assert.deepEqual(validateClip(await probeFile(output), cut.frames, bytes, size), {
        durationSeconds: 0.5,
        frames: 30,
      });
      const match = await stillMatchOf(output, cut.frames, still);
      assert.ok(endsOnStill(match), JSON.stringify(match));
      // Twelve frames before the end is another picture, and the match says so.
      const before = await stillMatchOf(output, cut.frames, earlier);
      assert.equal(endsOnStill(before), false, JSON.stringify(before));
      assert.ok(before.mean > 4 * match.mean, JSON.stringify({ match, before }));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
