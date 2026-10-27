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

/**
 * Plate clips: the two short derivatives that let every plate move honestly.
 *
 * The settling clip is the final eight seconds of a published film at 1280 × 828, 60 fps,
 * cut frame-exactly so its last frame is the film's last frame, which is the published still.
 * The cut is proved, not assumed: the last frame is decoded and compared with the still, and
 * a clip whose end is not the still is refused. The opening clip is the first ten seconds of
 * the same film, for the works the home may open on. Both are cut from the published source
 * over the same bounded range relay as the catalogue excerpts; nothing is tinted, cropped or
 * re-timed, and every output is content-addressed and recorded with its source hashes.
 */
const USAGE =
  'Usage: node scripts/build-plate-clips.mjs [--settling] [--opening] [--ink] [--light] [tokenId ...]';
export const CLIP_WIDTH = 1280;
export const CLIP_HEIGHT = 828;
export const FRAME_RATE = 60;
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

/** What the encoded clip must be before it is published. */
export function validateClip(probe, expectedFrames, bytes) {
  const stream = probe.streams?.[0];
  const durationSeconds = Number(probe.format?.duration);
  const aspect = stream?.display_aspect_ratio?.split(':').map(Number);
  if (
    probe.streams?.length !== 1 ||
    stream.codec_name !== 'h264' ||
    stream.pix_fmt !== 'yuv420p' ||
    stream.width !== CLIP_WIDTH ||
    stream.height !== CLIP_HEIGHT ||
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

export function endsOnStill(match, limits = STILL_MATCH) {
  return match.mean <= limits.mean && match.over <= limits.over;
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
  return entry;
}

export function serializeRegistry(clips) {
  const sorted = [...clips].sort(
    (a, b) =>
      a.id - b.id || a.expression.localeCompare(b.expression) || a.kind.localeCompare(b.kind),
  );
  return `${JSON.stringify({ schemaVersion: 1, clips: sorted }, null, 2)}\n`;
}

/** Files in the output directory that no registry entry names; a full run removes them. */
export function orphans(files, clips) {
  const referenced = new Set(clips.map((clip) => clip.src.split('/').pop()));
  return files.filter((file) => file.endsWith('.mp4') && !referenced.has(file));
}

async function probe(input, timeout = 30_000) {
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
  if (
    !SHA256.test(existing.sha256) ||
    existing.src !==
      `/art/clips/${existing.id}-${existing.expression}-${existing.kind}-${existing.sha256.slice(0, 16)}.mp4`
  )
    throw new Error('Existing registry path is not a content-addressed clip');
  const path = fileURLToPath(new URL(`../public${existing.src}`, import.meta.url));
  try {
    if ((await stat(path)).size === existing.bytes && (await hashFile(path)) === existing.sha256)
      return true;
  } catch (failure) {
    if (failure.code !== 'ENOENT') throw failure;
  }
  throw new Error(`Existing clip integrity check failed for ${existing.src}`);
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
    return existing;
  }
  await mkdir(outputDirectory, { recursive: true });
  const temporary = `${outputDirectory}.partial-${randomUUID()}.mp4`;
  const lastFrame = `${outputDirectory}.partial-${randomUUID()}.png`;
  const relay = await rangeRelay(sourceUrl, film.bytes);
  const started = Date.now();
  try {
    const sourceProbe = await probe(relay.url);
    const source = validateSource(sourceProbe.streams?.[0], sourceProbe.format, film.bytes);
    const cut = cutStart(kind, source.frames);
    await command(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-y',
        '-protocol_whitelist',
        'http,tcp',
        '-rw_timeout',
        '15000000',
        '-ss',
        cut.seekSeconds.toFixed(6),
        '-i',
        relay.url,
        '-frames:v',
        String(cut.frames),
        '-map',
        '0:v:0',
        '-an',
        '-vf',
        `scale=${CLIP_WIDTH}:${CLIP_HEIGHT}:flags=lanczos,setdar=ratio=${ART_WIDTH}/${ART_HEIGHT}:max=1000000`,
        '-c:v',
        'libx264',
        '-preset',
        'slow',
        '-crf',
        String(CRF[expression]),
        '-g',
        String(2 * FRAME_RATE),
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        '-color_primaries',
        source.color.primaries,
        '-color_trc',
        source.color.transfer,
        '-colorspace',
        source.color.space,
        '-color_range',
        source.color.range,
        '-map_metadata',
        '-1',
        '-threads',
        '4',
        temporary,
      ],
      600_000,
    );
    const bytesRead = relay.result();
    const bytes = (await stat(temporary)).size;
    const clip = validateClip(await probe(temporary, 15_000), cut.frames, bytes);
    let stillMatch;
    if (kind === 'settling') {
      await command('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-y',
        '-i',
        temporary,
        '-vf',
        `select=eq(n\\,${cut.frames - 1})`,
        '-fps_mode',
        'passthrough',
        '-frames:v',
        '1',
        lastFrame,
      ]);
      const stillPath = await cachedAsset(seed, still, { log });
      const size = { width: COMPARE_WIDTH, height: COMPARE_HEIGHT };
      stillMatch = meanAbsoluteDifference(
        await decodeRaw(lastFrame, size),
        await decodeRaw(stillPath, size),
      );
      if (!endsOnStill(stillMatch))
        throw new Error(
          `The settling clip does not end on the published still: ${JSON.stringify(stillMatch)}`,
        );
    }
    const sha256 = await hashFile(temporary);
    const src = `/art/clips/${id}-${expression}-${kind}-${sha256.slice(0, 16)}.mp4`;
    await publishContentAddressed(
      temporary,
      fileURLToPath(new URL(`../public${src}`, import.meta.url)),
      sha256,
    );
    log(
      `Signature ${id} ${expression} ${kind}: ${bytes} bytes; ${(bytesRead / 1024 / 1024).toFixed(1)} MiB of source; ${((Date.now() - started) / 1000).toFixed(1)}s${stillMatch ? `; still match ${stillMatch.mean} mean, ${(stillMatch.over * 100).toFixed(2)} % over` : ''}`,
    );
    return clipEntry({
      ...expected,
      src,
      sha256,
      bytes,
      durationSeconds: clip.durationSeconds,
      startSeconds: cut.firstFrame / FRAME_RATE,
      sourceDurationSeconds: source.durationSeconds,
      stillMatch,
    });
  } finally {
    await relay.close();
    await rm(temporary, { force: true });
    await rm(lastFrame, { force: true });
  }
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
