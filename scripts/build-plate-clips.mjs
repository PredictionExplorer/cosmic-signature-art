import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { log, error } from 'node:console';
import {
  ART_HEIGHT,
  ART_WIDTH,
  SHA256,
  cachedAsset,
  collection,
  command,
  eachConcurrently,
  hasFlag,
  hashFile,
  manifest,
  parseRequestedIds,
  publishContentAddressed,
  rangeRelay,
  readRegistry,
  seedPackageUrl,
  uniqueAsset,
  withLock,
  writeAtomically,
} from './lib/origin.mjs';
import { COMPARE_HEIGHT, COMPARE_WIDTH, decodeRaw, meanAbsoluteDifference } from './lib/raster.mjs';
import { PARAMETERS as ARRIVAL, eachFrame, modeTone } from './build-arrival-maps.mjs';

/**
 * Plate clips: the two short derivatives that let every plate move honestly.
 *
 * The settling clip is the final eight seconds of a published film at 1280 × 828, 60 fps,
 * cut frame-exactly so its last frame is the film's last frame, which is the published still.
 * The cut is proved, not assumed: the last frame is decoded and compared with the still, and
 * a clip whose end is not the still is refused. The opening clip is the first ten seconds of
 * the same film, for the works the home may open on, and it records the frame at which the
 * work first shows: Ink opens on bare paper and Light on black, so a plate that performs from
 * the beginning starts there, never on the empty sheet. Both are cut from the published source
 * over the same bounded range relay as the catalogue excerpts; nothing is tinted, cropped or
 * re-timed, and every output is content-addressed and recorded with its source hashes.
 *
 * A settling clip also has card-sized rungs: the same 480 frames of the same film at a smaller
 * width, for a card that shows no more, each proved to end on the still as its clip is. A rung
 * is cut from the verified local copy of the published film (`cachedAsset`, hashed against the
 * manifest on every use), never from the clip, so it is one encode from the source, not two.
 */
const USAGE =
  'Usage: node scripts/build-plate-clips.mjs [--settling] [--opening] [--ink] [--light] [tokenId ...]';
export const CLIP_WIDTH = 1280;
export const CLIP_HEIGHT = 828;
export const FRAME_RATE = 60;
/**
 * The rungs below each settling clip, ascending: half its width exactly, for a card that needs
 * no more. At 1440 CSS px a pair's card is 288 px and its lead 634; a phone's half-width card is
 * 195 px, 585 at three device pixels to the CSS pixel. A rung is shown at up to its own size,
 * where the clip it replaces was shrunk by half and its codec noise with it, so the Ink rung is
 * encoded finer than its clip: at CRF 26, 047's held last frame measured SSIM 0.89 against the
 * still at 640 px, where the clip measures 0.95, and rang around the strokes; at CRF 22 it
 * measures 0.93, and 0.974 against the clip's 0.982 at 331 px, for about half the clip's bytes.
 * Light's sparse field loses nothing visible at its clip's own CRF 22.
 */
export const SETTLING_RUNGS = {
  ink: [{ width: 640, height: 414, crf: 22 }],
  light: [{ width: 640, height: 414, crf: 22 }],
};
export const KINDS = {
  settling: { frames: 8 * FRAME_RATE, fromEnd: true },
  opening: { frames: 10 * FRAME_RATE, fromEnd: false },
};
/** Constant-quality encodes: the sumi sheet is dense and textured; the ribbons on black are sparse. */
export const CRF = { ink: 26, light: 22 };
export const MAX_CLIP_BYTES = 8 * 1024 * 1024;
/**
 * A settling clip ends on the still when its last frame departs from the published still, at
 * 320 × 207, by no more than this mean and with no more than this share of channel samples
 * off by more than the raster threshold. Measured on 031: 2.9 mean, 0 % over, against a
 * film frame half a second earlier at 16 mean and 10 % over.
 */
export const STILL_MATCH = { mean: 6, over: 0.005 };
/**
 * An opening's first mark: the first frame in which more than `share` of the pixels, read in
 * grey at the comparison size, depart by more than `levels` from the ground of the clip's first
 * frame (the bare sheet for Ink, the night for Light). Measured on 023's Ink opening: no pixel
 * departs before 2.5 s, then 0.56 % at once as the current brings the first ink; Light's first
 * light is drawn within a few frames.
 */
export const FIRST_MARK = { levels: 24, share: 0.0005 };
const FILM_ROLES = {
  ink: {
    film: ['ember_web', 'videos/web/ember.mp4'],
    still: ['ember_web_full', 'images/web/ember_full.webp'],
  },
  light: { film: ['main_web', 'videos/web/main.mp4'], still: ['web_full', 'images/web/full.webp'] },
};

const outputDirectory = fileURLToPath(new URL('../public/art/clips/', import.meta.url));
const registryPath = fileURLToPath(new URL('../src/lib/art/plate-clips.json', import.meta.url));

export function clipKey({ id, expression, kind }) {
  return `${id}:${expression}:${kind}`;
}

/** The first frame of a cut, and the half-frame-early seek that keeps it without a float's doubt. */
export function cutStart(kind, sourceFrames, frameRate = FRAME_RATE) {
  const { frames, fromEnd } = KINDS[kind];
  if (!Number.isSafeInteger(sourceFrames) || sourceFrames < frames)
    throw new Error(`The source has ${sourceFrames} frames; a ${kind} clip needs ${frames}`);
  const firstFrame = fromEnd ? sourceFrames - frames : 0;
  return { firstFrame, seekSeconds: Math.max(0, (firstFrame - 0.5) / frameRate), frames };
}

/** What the source stream must be for the cut to be an honest excerpt of the published film. */
export function validateSource(stream, format, expectedBytes) {
  const [numerator, denominator] = (stream?.r_frame_rate ?? '').split('/').map(Number);
  const frameRate = numerator / denominator;
  const frames = Number(stream?.nb_frames);
  if (
    stream?.codec_name !== 'h264' ||
    stream.pix_fmt !== 'yuv420p' ||
    stream.width !== ART_WIDTH ||
    stream.height !== ART_HEIGHT ||
    frameRate !== FRAME_RATE ||
    !Number.isSafeInteger(frames) ||
    frames <= 0 ||
    Number(format?.size) !== expectedBytes ||
    !stream.color_primaries ||
    !stream.color_transfer ||
    !stream.color_space ||
    !stream.color_range
  )
    throw new Error(`Source stream is not the published 60 fps plate: ${JSON.stringify(stream)}`);
  return {
    frames,
    durationSeconds: frames / FRAME_RATE,
    color: {
      primaries: stream.color_primaries,
      transfer: stream.color_transfer,
      space: stream.color_space,
      range: stream.color_range,
    },
  };
}

/** What the encoded clip, or one of its rungs, must be before it is published. */
export function validateClip(
  probe,
  expectedFrames,
  bytes,
  size = { width: CLIP_WIDTH, height: CLIP_HEIGHT },
) {
  const stream = probe.streams?.[0];
  const durationSeconds = Number(probe.format?.duration);
  const aspect = stream?.display_aspect_ratio?.split(':').map(Number);
  if (
    probe.streams?.length !== 1 ||
    stream.codec_name !== 'h264' ||
    stream.pix_fmt !== 'yuv420p' ||
    stream.width !== size.width ||
    stream.height !== size.height ||
    stream.r_frame_rate !== `${FRAME_RATE}/1` ||
    Number(stream.nb_frames) !== expectedFrames ||
    Math.abs(durationSeconds - expectedFrames / FRAME_RATE) > 1 / FRAME_RATE ||
    !Number.isSafeInteger(bytes) ||
    bytes === 0 ||
    bytes > MAX_CLIP_BYTES ||
    !aspect ||
    Math.abs(aspect[0] / aspect[1] - ART_WIDTH / ART_HEIGHT) > 0.000001
  )
    throw new Error(
      `Encoded clip failed validation: ${JSON.stringify({ stream, durationSeconds, bytes })}`,
    );
  return { durationSeconds, frames: expectedFrames };
}

/** The first-mark measure, fed an opening's grey frames in order; null if the work never shows. */
export function createFirstMark(limits = FIRST_MARK) {
  let ground = -1;
  let found = null;
  let frames = 0;
  return {
    push(frame) {
      if (ground < 0) ground = modeTone(frame);
      if (found === null) {
        let marked = 0;
        for (const value of frame) if (Math.abs(value - ground) > limits.levels) marked += 1;
        if (marked > limits.share * frame.length) found = frames;
      }
      frames += 1;
    },
    finish: () => found,
  };
}

/** The first mark of a local opening clip, as a frame of the clip (and so of its film). */
export async function measureFirstMark(path, { timeout = 120_000 } = {}) {
  const measure = createFirstMark();
  const parameters = {
    ...ARRIVAL,
    width: COMPARE_WIDTH,
    height: COMPARE_HEIGHT,
    fps: FRAME_RATE,
  };
  await eachFrame(path, (frame) => measure.push(frame), { parameters, timeout });
  return measure.finish();
}

export function endsOnStill(match, limits = STILL_MATCH) {
  return match.mean <= limits.mean && match.over <= limits.over;
}

/** A clip's content-addressed path; a rung names its width before its hash, as the stills do. */
export function clipSource({ id, expression, kind }, sha256) {
  return `/art/clips/${id}-${expression}-${kind}-${sha256.slice(0, 16)}.mp4`;
}
export function rungSource({ id, expression }, width, sha256) {
  return `/art/clips/${id}-${expression}-settling-${width}-${sha256.slice(0, 16)}.mp4`;
}

/**
 * A rung is its clip's own cut only when it begins on the same frame of a film of the same
 * length: the clip records the cut in seconds, and a frame is the unit it was made in.
 */
export function sameCut(entry, cut, source) {
  return (
    cut.frames === entry.frames &&
    cut.firstFrame === Math.round(entry.startSeconds * FRAME_RATE) &&
    source.frames === Math.round(entry.sourceDurationSeconds * FRAME_RATE)
  );
}

/** Stable key order for a rung of a settling clip. */
export function rungEntry(fields) {
  return {
    src: fields.src,
    sha256: fields.sha256,
    bytes: fields.bytes,
    width: fields.width,
    height: fields.height,
    crf: fields.crf,
    stillMatch: fields.stillMatch,
  };
}

/** Stable key order for a registry entry. */
export function clipEntry(fields) {
  const entry = {
    id: fields.id,
    seed: fields.seed,
    expression: fields.expression,
    kind: fields.kind,
    src: fields.src,
    sourceUrl: fields.sourceUrl,
    sourceSha256: fields.sourceSha256,
    stillSha256: fields.stillSha256,
    sha256: fields.sha256,
    bytes: fields.bytes,
    width: CLIP_WIDTH,
    height: CLIP_HEIGHT,
    frameRate: FRAME_RATE,
    frames: fields.frames,
    durationSeconds: fields.durationSeconds,
    startSeconds: fields.startSeconds,
    sourceDurationSeconds: fields.sourceDurationSeconds,
  };
  if (fields.stillMatch) entry.stillMatch = fields.stillMatch;
  if (Number.isSafeInteger(fields.firstMarkFrame)) entry.firstMarkFrame = fields.firstMarkFrame;
  if (fields.kind === 'settling' && fields.rungs?.length)
    entry.rungs = [...fields.rungs].sort((a, b) => a.width - b.width).map(rungEntry);
  return entry;
}

export function serializeRegistry(clips) {
  const sorted = [...clips].sort(
    (a, b) =>
      a.id - b.id || a.expression.localeCompare(b.expression) || a.kind.localeCompare(b.kind),
  );
  return `${JSON.stringify({ schemaVersion: 1, clips: sorted }, null, 2)}\n`;
}

/** Files in the output directory that no registry entry or rung names; a full run removes them. */
export function orphans(files, clips) {
  const referenced = new Set(
    clips
      .flatMap((clip) => [clip.src, ...(clip.rungs ?? []).map((rung) => rung.src)])
      .map((src) => src.split('/').pop()),
  );
  return files.filter((file) => file.endsWith('.mp4') && !referenced.has(file));
}

export async function probe(input, timeout = 30_000) {
  return JSON.parse(
    await command(
      'ffprobe',
      [
        '-v',
        'error',
        '-protocol_whitelist',
        'file,http,tcp',
        '-rw_timeout',
        '15000000',
        '-show_entries',
        'stream=codec_name,width,height,pix_fmt,display_aspect_ratio,r_frame_rate,nb_frames,color_primaries,color_transfer,color_space,color_range:format=duration,size',
        '-of',
        'json',
        input,
      ],
      timeout,
    ),
  );
}

async function existingIsSound(existing, expected) {
  if (!existing) return false;
  const same = Object.entries(expected).every(([key, value]) => existing[key] === value);
  if (!same) return false;
  if (!SHA256.test(existing.sha256) || existing.src !== clipSource(existing, existing.sha256))
    throw new Error('Existing registry path is not a content-addressed clip');
  return verifiedFile(existing.src, existing.bytes, existing.sha256, 'clip');
}

/** A recorded file must still be there, byte for byte; anything else stops the run. */
async function verifiedFile(src, bytes, sha256, what) {
  const path = fileURLToPath(new URL(`../public${src}`, import.meta.url));
  try {
    if ((await stat(path)).size === bytes && (await hashFile(path)) === sha256) return true;
  } catch (failure) {
    if (failure.code !== 'ENOENT') throw failure;
  }
  throw new Error(`Existing ${what} integrity check failed for ${src}`);
}

/**
 * A recorded rung is kept when it is the size asked for, is content-addressed, ends on the still
 * and its file is intact. A rung of another size is cut again; a damaged one stops the run.
 */
/**
 * What a recorded rung asks of a run: none recorded, or one of another size or quality, is cut;
 * one that is not content-addressed or does not end on the still stops the run; any other is
 * kept once its file is verified.
 */
export function recordedRungIsCurrent(rung, entry, size) {
  if (!rung || rung.width !== size.width || rung.height !== size.height || rung.crf !== size.crf)
    return false;
  if (
    !SHA256.test(rung.sha256) ||
    rung.src !== rungSource(entry, size.width, rung.sha256) ||
    !rung.stillMatch ||
    !endsOnStill(rung.stillMatch)
  )
    throw new Error(
      `Existing rung is not a content-addressed rung that ends on the still: ${rung.src}`,
    );
  return true;
}

async function existingRungIsSound(rung, entry, size) {
  return (
    recordedRungIsCurrent(rung, entry, size) &&
    verifiedFile(rung.src, rung.bytes, rung.sha256, 'rung')
  );
}

/** An opening's first mark, logged; an opening that never shows the work records none. */
async function openingMark(path, id, expression) {
  const frame = await measureFirstMark(path);
  log(
    frame === null
      ? `Signature ${id} ${expression} opening: no mark in its ten seconds; none recorded`
      : `Signature ${id} ${expression} opening: first mark at frame ${frame} (${(frame / FRAME_RATE).toFixed(2)} s)`,
  );
  return frame ?? undefined;
}

/**
 * One frame-exact cut of a published film, read over the relay or from the verified local copy,
 * scaled to `size` and encoded at the constant quality `crf` with the source's colour
 * tags. A clip and its rungs differ in nothing but size, quality and where the bytes are read from.
 */
export function encodeArguments({ input, cut, size, crf, color }, output) {
  const remote = /^https?:\/\//.test(input);
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-y',
    '-protocol_whitelist',
    remote ? 'http,tcp' : 'file',
    ...(remote ? ['-rw_timeout', '15000000'] : []),
    '-ss',
    cut.seekSeconds.toFixed(6),
    '-i',
    input,
    '-frames:v',
    String(cut.frames),
    '-map',
    '0:v:0',
    '-an',
    '-vf',
    `scale=${size.width}:${size.height}:flags=lanczos,setdar=ratio=${ART_WIDTH}/${ART_HEIGHT}:max=1000000`,
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    String(crf),
    '-g',
    String(2 * FRAME_RATE),
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-color_primaries',
    color.primaries,
    '-color_trc',
    color.transfer,
    '-colorspace',
    color.space,
    '-color_range',
    color.range,
    '-map_metadata',
    '-1',
    '-threads',
    '4',
    output,
  ];
}

export async function encode(job, output) {
  await command('ffmpeg', encodeArguments(job, output), 600_000);
}

/** The clip's last frame, which for a settling clip or a rung is the film's last frame. */
export function lastFrameArguments(clip, frames, output) {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-y',
    '-i',
    clip,
    '-vf',
    `select=eq(n\\,${frames - 1})`,
    '-fps_mode',
    'passthrough',
    '-frames:v',
    '1',
    output,
  ];
}

/** How far a clip's last frame departs from a still on disk, at the comparison size. */
export async function stillMatchOf(clip, frames, stillPath) {
  const lastFrame = `${clip}.last-${randomUUID()}.png`;
  try {
    await command('ffmpeg', lastFrameArguments(clip, frames, lastFrame));
    const size = { width: COMPARE_WIDTH, height: COMPARE_HEIGHT };
    return meanAbsoluteDifference(
      await decodeRaw(lastFrame, size),
      await decodeRaw(stillPath, size),
    );
  } finally {
    await rm(lastFrame, { force: true });
  }
}

function describeMatch(match) {
  return `still match ${match.mean} mean, ${(match.over * 100).toFixed(2)} % over`;
}

/** The verified local copy of a clip's film, probed and cut exactly as the clip was. */
async function localCut(entry, film) {
  const input = await cachedAsset(entry.seed, film, { log });
  const sourceProbe = await probe(input);
  const source = validateSource(sourceProbe.streams?.[0], sourceProbe.format, film.bytes);
  const cut = cutStart(entry.kind, source.frames);
  if (!sameCut(entry, cut, source))
    throw new Error(
      `The local film does not cut as the clip did: ${JSON.stringify({ cut, frames: source.frames })}`,
    );
  return { input, cut, color: source.color };
}

/** A rung: the clip's own cut of the local film at `size`, proved to end on the still first. */
async function cutRung(entry, still, local, size) {
  const temporary = `${outputDirectory}.partial-${randomUUID()}.mp4`;
  const started = Date.now();
  try {
    await encode({ ...local, size, crf: size.crf }, temporary);
    const bytes = (await stat(temporary)).size;
    validateClip(await probe(temporary, 15_000), local.cut.frames, bytes, size);
    const stillMatch = await stillMatchOf(
      temporary,
      local.cut.frames,
      await cachedAsset(entry.seed, still, { log }),
    );
    if (!endsOnStill(stillMatch))
      throw new Error(
        `The ${size.width} px rung does not end on the published still: ${JSON.stringify(stillMatch)}`,
      );
    const sha256 = await hashFile(temporary);
    const src = rungSource(entry, size.width, sha256);
    await publishContentAddressed(
      temporary,
      fileURLToPath(new URL(`../public${src}`, import.meta.url)),
      sha256,
    );
    log(
      `Signature ${entry.id} ${entry.expression} settling ${size.width}: ${bytes} bytes, ${Math.round((bytes / entry.bytes) * 100)} % of the clip; ${((Date.now() - started) / 1000).toFixed(1)}s; ${describeMatch(stillMatch)}`,
    );
    return rungEntry({ src, sha256, bytes, ...size, stillMatch });
  } finally {
    await rm(temporary, { force: true });
  }
}

/** A settling clip with its rungs: each recorded rung verified and kept, each missing one cut. */
async function withRungs(entry, film, still) {
  const rungs = [];
  let local;
  for (const size of SETTLING_RUNGS[entry.expression]) {
    const recorded = entry.rungs?.find((rung) => rung.width === size.width);
    if (await existingRungIsSound(recorded, entry, size)) {
      log(
        `Signature ${entry.id} ${entry.expression} settling ${size.width}: verified existing ${recorded.bytes} byte rung`,
      );
      rungs.push(recorded);
    } else {
      local ??= await localCut(entry, film);
      rungs.push(await cutRung(entry, still, local, size));
    }
  }
  return clipEntry({ ...entry, rungs });
}

async function generate({ id, seed }, expression, kind, existing) {
  const document = await manifest(seed);
  const roles = FILM_ROLES[expression];
  const film = uniqueAsset(document, ...roles.film, 'video');
  const still = uniqueAsset(document, ...roles.still, 'image');
  if (!film || !still) {
    log(`Signature ${id} ${expression}: no published film and still; nothing to cut`);
    return null;
  }
  const sourceUrl = seedPackageUrl(seed, film.path);
  const expected = {
    id,
    seed,
    expression,
    kind,
    sourceUrl,
    sourceSha256: film.sha256,
    stillSha256: still.sha256,
    width: CLIP_WIDTH,
    height: CLIP_HEIGHT,
    frameRate: FRAME_RATE,
    frames: KINDS[kind].frames,
  };
  if (await existingIsSound(existing, expected)) {
    log(`Signature ${id} ${expression} ${kind}: verified existing ${existing.bytes} byte clip`);
    if (kind === 'settling') return withRungs(existing, film, still);
    if (existing.firstMarkFrame !== undefined) return existing;
    // An opening recorded before its first mark was: read the verified local clip, not the source.
    const local = fileURLToPath(new URL(`../public${existing.src}`, import.meta.url));
    return clipEntry({ ...existing, firstMarkFrame: await openingMark(local, id, expression) });
  }
  await mkdir(outputDirectory, { recursive: true });
  const temporary = `${outputDirectory}.partial-${randomUUID()}.mp4`;
  const relay = await rangeRelay(sourceUrl, film.bytes);
  const started = Date.now();
  let entry;
  try {
    const sourceProbe = await probe(relay.url);
    const source = validateSource(sourceProbe.streams?.[0], sourceProbe.format, film.bytes);
    const cut = cutStart(kind, source.frames);
    const size = { width: CLIP_WIDTH, height: CLIP_HEIGHT };
    await encode(
      { input: relay.url, cut, size, crf: CRF[expression], color: source.color },
      temporary,
    );
    const bytesRead = relay.result();
    const bytes = (await stat(temporary)).size;
    const clip = validateClip(await probe(temporary, 15_000), cut.frames, bytes);
    let stillMatch;
    if (kind === 'settling') {
      stillMatch = await stillMatchOf(
        temporary,
        cut.frames,
        await cachedAsset(seed, still, { log }),
      );
      if (!endsOnStill(stillMatch))
        throw new Error(
          `The settling clip does not end on the published still: ${JSON.stringify(stillMatch)}`,
        );
    }
    const firstMarkFrame =
      kind === 'opening' ? await openingMark(temporary, id, expression) : undefined;
    const sha256 = await hashFile(temporary);
    const src = clipSource({ id, expression, kind }, sha256);
    await publishContentAddressed(
      temporary,
      fileURLToPath(new URL(`../public${src}`, import.meta.url)),
      sha256,
    );
    log(
      `Signature ${id} ${expression} ${kind}: ${bytes} bytes; ${(bytesRead / 1024 / 1024).toFixed(1)} MiB of source; ${((Date.now() - started) / 1000).toFixed(1)}s${stillMatch ? `; ${describeMatch(stillMatch)}` : ''}`,
    );
    entry = clipEntry({
      ...expected,
      src,
      sha256,
      bytes,
      durationSeconds: clip.durationSeconds,
      startSeconds: cut.firstFrame / FRAME_RATE,
      sourceDurationSeconds: source.durationSeconds,
      stillMatch,
      firstMarkFrame,
    });
  } finally {
    await relay.close();
    await rm(temporary, { force: true });
  }
  // A new clip's rungs follow it, cut from the verified local film rather than over the relay.
  return kind === 'settling' ? withRungs(entry, film, still) : entry;
}

async function main() {
  const arguments_ = process.argv.slice(2);
  const requestedIds = parseRequestedIds(arguments_, USAGE);
  const kinds = ['settling', 'opening'].filter((kind) => hasFlag(arguments_, kind));
  if (kinds.length === 0) kinds.push('settling');
  if (kinds.includes('opening') && requestedIds.length === 0)
    throw new Error('Opening clips are cut for named works only: pass their token ids');
  const expressions = ['ink', 'light'].filter((expression) => hasFlag(arguments_, expression));
  if (expressions.length === 0) expressions.push('ink', 'light');
  await mkdir(outputDirectory, { recursive: true });
  await withLock(`${registryPath}.lock`, async () => {
    const registry = await readRegistry(registryPath, 1, 'clips');
    const all = await collection();
    const selected = requestedIds.length
      ? all.filter((record) => requestedIds.includes(record.id))
      : all;
    if (requestedIds.some((id) => !selected.some((record) => record.id === id)))
      throw new Error('Requested token is not indexed');
    const clips = new Map(registry.clips.map((clip) => [clipKey(clip), clip]));
    let writeQueue = Promise.resolve();
    const save = () => {
      writeQueue = writeQueue.then(() =>
        writeAtomically(registryPath, serializeRegistry([...clips.values()])),
      );
      return writeQueue;
    };
    const jobs = selected.flatMap((record) =>
      expressions.flatMap((expression) => kinds.map((kind) => ({ record, expression, kind }))),
    );
    log(`Cutting ${jobs.length} clips with at most three encoders.`);
    const failures = await eachConcurrently(jobs, 3, async ({ record, expression, kind }) => {
      const key = clipKey({ id: record.id, expression, kind });
      const clip = await generate(record, expression, kind, clips.get(key));
      if (clip) clips.set(key, clip);
      else clips.delete(key);
      await save();
    });
    await writeQueue;
    for (const { item, failure } of failures)
      error(`Signature ${item.record.id} ${item.expression} ${item.kind}: ${failure.message}`);
    if (requestedIds.length === 0 && failures.length === 0) {
      const stale = orphans(await readdir(outputDirectory), [...clips.values()]);
      for (const file of stale) {
        await rm(resolve(outputDirectory, file));
        log(`Removed orphaned clip ${file}`);
      }
    }
    log(`${clips.size} verified clip records; ${failures.length} failures.`);
    if (failures.length)
      throw new Error(
        `Retry failed tokens: ${[...new Set(failures.map(({ item }) => item.record.id))].join(' ')}`,
      );
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
