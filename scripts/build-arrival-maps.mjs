import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { log, error } from 'node:console';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import sharp from 'sharp';
import {
  SEED,
  cachedAsset,
  eachConcurrently,
  hashBytes,
  hashFile,
  manifest,
  parseRequestedIds,
  publishContentAddressed,
  readRegistry,
  uniqueAsset,
  withLock,
  writeAtomically,
} from './lib/origin.mjs';

/**
 * Arrival maps: for every published film, when each part of the still first arrived.
 *
 * Light is a long exposure, so a pixel's mark arrives the first time it reaches half its
 * final brightness, and stays (the camera drift moves the trajectory, not the exposure). Ink
 * is carried by a current, so a pixel's mark has arrived once it stops changing. The bare
 * ground between marks takes the time of the nearest mark plus a short travel, so a front
 * leaves the marks as a soft shape; the whole field is then normalised to 0–255 and kept as
 * a lossless 576 × 372 WebP, a few kilobytes, beside its source film's hash.
 *
 * The maps order a crossing between the two published stills; they are never shown as the
 * work. Each film is read whole once (approved 2026-10-30) through the verified cache, so a
 * rebuild with unchanged sources rereads nothing from the origin.
 */
const USAGE = 'Usage: npm run art:arrival -- [tokenId ...]';
const indexPath = fileURLToPath(new URL('../src/lib/art/collection-index.json', import.meta.url));
const registryPath = fileURLToPath(new URL('../src/lib/art/arrival-maps.json', import.meta.url));
const publicRoot = fileURLToPath(new URL('../public', import.meta.url));
export const SCHEMA_VERSION = 1;
export const PARAMETERS = Object.freeze({
  width: 576,
  height: 372,
  fps: 30,
  /** Light: a mark arrives at half its final brightness; dimmer pixels are ground. */
  lightHalf: 0.5,
  lightFloor: 8,
  lightFigure: 14,
  /** Ink: a mark has arrived once it stays within this many levels of the final frame. */
  inkTolerance: 10,
  /** The ground is reached this share of the film after its nearest mark, per frame diagonal. */
  spread: 0.35,
  /** How much of a mark's own time survives the softening; the rest is its neighbourhood's. */
  figureWeight: 0.5,
  blurRadius: 4,
  blurPasses: 3,
  /** The ground's distance metric: a 5 × 5 chamfer with Euclidean steps. */
  chamfer: 5,
});
const ROLES = {
  ink: {
    film: ['ember_web', 'videos/web/ember.mp4'],
    still: ['ember_web_full', 'images/web/ember_full.webp'],
  },
  light: { film: ['main_web', 'videos/web/main.mp4'], still: ['web_full', 'images/web/full.webp'] },
};

// ───────────────────────── Measurement (pure, tested) ─────────────────────────

/** Light: the first frame at which each pixel reaches half its final brightness. */
export function createLightMeasure(final, parameters = PARAMETERS) {
  const n = final.length;
  const threshold = new Float64Array(n);
  const time = new Float64Array(n).fill(-1);
  for (let p = 0; p < n; p++)
    threshold[p] =
      final[p] < parameters.lightFigure
        ? Infinity
        : Math.max(parameters.lightFloor, final[p] * parameters.lightHalf);
  let frames = 0;
  return {
    push(frame) {
      for (let p = 0; p < n; p++) if (time[p] < 0 && frame[p] >= threshold[p]) time[p] = frames;
      frames += 1;
    },
    finish() {
      const figure = new Uint8Array(n);
      const field = new Float64Array(n).fill(Infinity);
      const span = Math.max(1, frames - 1);
      for (let p = 0; p < n; p++)
        if (time[p] >= 0) {
          figure[p] = 1;
          field[p] = time[p] / span;
        }
      return { field, figure, frames };
    },
  };
}

/** The most common value of a frame: the sheet's own paper, for Ink. */
export function modeTone(frame) {
  const histogram = new Uint32Array(256);
  for (const value of frame) histogram[value] += 1;
  let best = 0;
  for (let value = 1; value < 256; value++) if (histogram[value] > histogram[best]) best = value;
  return best;
}

/** Ink: the frame after which each marked pixel stays within tolerance of the final frame. */
export function createInkMeasure(final, parameters = PARAMETERS) {
  const n = final.length;
  const paper = modeTone(final);
  const marked = new Uint8Array(n);
  for (let p = 0; p < n; p++)
    marked[p] = Math.abs(final[p] - paper) >= parameters.inkTolerance ? 1 : 0;
  const lastDeparture = new Float64Array(n).fill(-1);
  let frames = 0;
  return {
    paper,
    push(frame) {
      for (let p = 0; p < n; p++)
        if (marked[p] && Math.abs(frame[p] - final[p]) > parameters.inkTolerance)
          lastDeparture[p] = frames;
      frames += 1;
    },
    finish() {
      const field = new Float64Array(n).fill(Infinity);
      const span = Math.max(1, frames - 1);
      for (let p = 0; p < n; p++)
        if (marked[p]) field[p] = Math.min(frames - 1, lastDeparture[p] + 1) / span;
      return { field, figure: marked, frames };
    },
  };
}

/**
 * Weighted distance seeded with the marks' times: every pixel takes the earliest (time of a mark
 * + spread × its distance in frame diagonals). A 5 × 5 chamfer with true Euclidean steps (1, √2,
 * √5) in two raster passes keeps the fronts round rather than octagonal.
 */
const FORWARD = [
  [-1, 0],
  [0, -1],
  [-1, -1],
  [1, -1],
  [-2, -1],
  [2, -1],
  [-1, -2],
  [1, -2],
];
export function spreadFromMarks(field, width, height, spread) {
  const out = Float64Array.from(field);
  const unit = spread / Math.hypot(width, height);
  const pass = (offsets) => (x, y) => {
    const p = y * width + x;
    let v = out[p];
    for (const [dx, dy] of offsets) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      v = Math.min(v, out[ny * width + nx] + unit * Math.hypot(dx, dy));
    }
    out[p] = v;
  };
  const forward = pass(FORWARD);
  const backward = pass(FORWARD.map(([dx, dy]) => [-dx, -dy]));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) forward(x, y);
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) backward(x, y);
  return out;
}

/** One separable box blur of radius r, edges clamped by shrinking the window. */
export function boxBlur(source, width, height, radius) {
  const across = new Float64Array(source.length);
  const out = new Float64Array(source.length);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    let count = 0;
    for (let x = -radius; x < width + radius; x++) {
      if (x + radius < width) {
        sum += source[y * width + Math.min(width - 1, x + radius)];
        count += 1;
      }
      if (x - radius - 1 >= 0) {
        sum -= source[y * width + x - radius - 1];
        count -= 1;
      }
      if (x >= 0 && x < width) across[y * width + x] = sum / count;
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    let count = 0;
    for (let y = -radius; y < height + radius; y++) {
      if (y + radius < height) {
        sum += across[Math.min(height - 1, y + radius) * width + x];
        count += 1;
      }
      if (y - radius - 1 >= 0) {
        sum -= across[(y - radius - 1) * width + x];
        count -= 1;
      }
      if (y >= 0 && y < height) out[y * width + x] = sum / count;
    }
  }
  return out;
}

/**
 * The map: marks keep part of their own time, the rest and the whole ground are softened, and
 * the result spans 0–255. A film with no marks at all has no order to give and is refused.
 */
export function arrivalMap({ field, figure }, parameters = PARAMETERS) {
  const { width, height } = parameters;
  if (!figure.some(Boolean)) throw new Error('the film left no marks to order');
  let soft = spreadFromMarks(field, width, height, parameters.spread);
  const spread = Float64Array.from(soft);
  for (let pass = 0; pass < parameters.blurPasses; pass++)
    soft = boxBlur(soft, width, height, parameters.blurRadius);
  const mixed = new Float64Array(soft.length);
  for (let p = 0; p < mixed.length; p++)
    mixed[p] = figure[p]
      ? parameters.figureWeight * spread[p] + (1 - parameters.figureWeight) * soft[p]
      : soft[p];
  let lo = Infinity;
  let hi = -Infinity;
  for (const value of mixed) {
    lo = Math.min(lo, value);
    hi = Math.max(hi, value);
  }
  const map = new Uint8Array(mixed.length);
  for (let p = 0; p < mixed.length; p++)
    map[p] = Math.round((255 * (mixed[p] - lo)) / (hi - lo || 1));
  return map;
}

export function figureShare(figure) {
  let marks = 0;
  for (const value of figure) marks += value;
  return Math.round((marks / figure.length) * 10_000) / 10_000;
}

// ───────────────────────── Decoding ─────────────────────────

/** Grey frames of a film at the map's size, streamed from ffmpeg one whole frame at a time. */
export async function eachFrame(path, onFrame, { parameters = PARAMETERS, fromEnd } = {}) {
  const { width, height, fps } = parameters;
  const size = width * height;
  const input = fromEnd ? ['-sseof', String(-fromEnd), '-i', path] : ['-i', path];
  const filter = `${fromEnd ? '' : `fps=${fps},`}scale=${width}:${height}:flags=area,format=gray`;
  const ffmpeg = spawn('ffmpeg', ['-v', 'error', ...input, '-vf', filter, '-f', 'rawvideo', '-'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  ffmpeg.stderr.on('data', (chunk) => (stderr = `${stderr}${chunk}`.slice(-4000)));
  let pending = Buffer.alloc(0);
  let frames = 0;
  for await (const chunk of ffmpeg.stdout) {
    pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    while (pending.length >= size) {
      onFrame(new Uint8Array(pending.buffer, pending.byteOffset, size), frames);
      frames += 1;
      pending = pending.subarray(size);
    }
  }
  const code = await new Promise((resolveCode) => ffmpeg.once('close', resolveCode));
  if (code !== 0) throw new Error(`ffmpeg failed (${code}) on ${path}: ${stderr}`);
  return frames;
}

/** The film's own last frame: decode the final second and keep the last whole frame. */
async function finalFrame(path) {
  let last = null;
  await eachFrame(path, (frame) => (last = Uint8Array.from(frame)), { fromEnd: 1 });
  if (!last) throw new Error(`no final frame in ${path}`);
  return last;
}

async function measureFilm(path, expression) {
  const final = await finalFrame(path);
  const measure = expression === 'light' ? createLightMeasure(final) : createInkMeasure(final);
  await eachFrame(path, (frame) => measure.push(frame));
  return measure.finish();
}

// ───────────────────────── The registry ─────────────────────────

export function mapRecord(entry) {
  return {
    id: entry.id,
    seed: entry.seed,
    expression: entry.expression,
    src: entry.src,
    sha256: entry.sha256,
    bytes: entry.bytes,
    width: entry.width,
    height: entry.height,
    sourceSha256: entry.sourceSha256,
    stillSha256: entry.stillSha256,
    frames: entry.frames,
    figureShare: entry.figureShare,
  };
}

export function mergeMaps(existing, measured) {
  const key = (map) => `${map.id}:${map.expression}`;
  const byKey = new Map(existing.map((map) => [key(map), mapRecord(map)]));
  for (const map of measured) byKey.set(key(map), mapRecord(map));
  return [...byKey.values()].sort(
    (a, b) => a.id - b.id || a.expression.localeCompare(b.expression),
  );
}

/** Re-running on unchanged films keeps the previous date, so the file stays byte-identical. */
export function decideMeasuredOn(previous, previousMaps, nextMaps, today) {
  return JSON.stringify(previousMaps) === JSON.stringify(nextMaps) && typeof previous === 'string'
    ? previous
    : today;
}

/** The registry as the repository's formatter writes it, so a rebuild leaves the check clean. */
export function serializeRegistry({ measuredOn, maps }) {
  return format(
    JSON.stringify(
      { schemaVersion: SCHEMA_VERSION, measuredOn, parameters: PARAMETERS, maps },
      null,
      2,
    ),
    { parser: 'json', printWidth: 100 },
  );
}

/** Map files the registry no longer names, left behind by an earlier build. */
export function orphans(files, maps) {
  const referenced = new Set(maps.map((map) => map.src.split('/').pop()));
  return files.filter((file) => file.endsWith('.webp') && !referenced.has(file));
}

/** A recorded map still serves when its film and still are unchanged and its file is intact. */
async function reusable(existing, film, still) {
  if (!existing || existing.sourceSha256 !== film.sha256 || existing.stillSha256 !== still.sha256)
    return false;
  const path = resolve(publicRoot, `.${existing.src}`);
  try {
    return (await stat(path)).size === existing.bytes && (await hashFile(path)) === existing.sha256;
  } catch (failure) {
    if (failure.code === 'ENOENT') return false;
    throw failure;
  }
}

async function buildMap({ id, seed }, expression, existing) {
  const document = await manifest(seed);
  const roles = ROLES[expression];
  const film = uniqueAsset(document, ...roles.film, 'video');
  const still = uniqueAsset(document, ...roles.still, 'image');
  if (!film || !still) return null;
  if (await reusable(existing, film, still)) return existing;
  const path = await cachedAsset(seed, film, { log });
  const started = performance.now();
  const measured = await measureFilm(path, expression);
  if (measured.frames < PARAMETERS.fps * 10)
    throw new Error(`only ${measured.frames} frames decoded`);
  const map = arrivalMap(measured);
  const webp = await sharp(Buffer.from(map), {
    raw: { width: PARAMETERS.width, height: PARAMETERS.height, channels: 1 },
  })
    .webp({ lossless: true, effort: 6 })
    .toBuffer();
  const sha256 = hashBytes(webp);
  const src = `/art/arrival/${id}-${expression}-${sha256.slice(0, 16)}.webp`;
  const destination = resolve(publicRoot, `.${src}`);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await writeFile(temporary, webp);
  await publishContentAddressed(temporary, destination, sha256).catch(async (failure) => {
    await rm(temporary, { force: true });
    throw failure;
  });
  log(
    `Signature ${id} ${expression}: ${measured.frames} frames, ${(figureShare(measured.figure) * 100).toFixed(1)} % marks, ` +
      `${webp.length} bytes, ${((performance.now() - started) / 1000).toFixed(1)} s`,
  );
  return {
    id,
    seed,
    expression,
    src,
    sha256,
    bytes: webp.length,
    width: PARAMETERS.width,
    height: PARAMETERS.height,
    sourceSha256: film.sha256,
    stillSha256: still.sha256,
    frames: measured.frames,
    figureShare: figureShare(measured.figure),
  };
}

async function main() {
  const requestedIds = parseRequestedIds(process.argv.slice(2), USAGE);
  await withLock(`${registryPath}.lock`, async () => {
    const index = JSON.parse(await readFile(indexPath, 'utf8'));
    if (index.schemaVersion !== 1 || !Array.isArray(index.works))
      throw new Error('Invalid collection index; run npm run art:index first');
    const registry = await readRegistry(registryPath, SCHEMA_VERSION, 'maps');
    const selected = requestedIds.length
      ? index.works.filter((work) => requestedIds.includes(work.id))
      : index.works;
    if (requestedIds.some((id) => !selected.some((work) => work.id === id)))
      throw new Error('Requested token is not indexed');
    // A map measured under other parameters is measured again, whatever its sources.
    const sameParameters = JSON.stringify(registry.parameters) === JSON.stringify(PARAMETERS);
    if (!sameParameters && requestedIds.length && registry.maps.length)
      throw new Error('The parameters changed since the last build; rebuild every map');
    const existing = new Map(
      sameParameters ? registry.maps.map((map) => [`${map.id}:${map.expression}`, map]) : [],
    );
    // Light first: the films are a few megabytes, so every work has its Light map early.
    const jobs = ['light', 'ink'].flatMap((expression) =>
      selected.map((work) => ({ work, expression })),
    );
    const measured = [];
    const failures = await eachConcurrently(jobs, 2, async ({ work, expression }) => {
      if (!SEED.test(work.seed ?? '')) throw new Error('malformed seed');
      const map = await buildMap(work, expression, existing.get(`${work.id}:${expression}`));
      if (map) measured.push(map);
    });
    for (const { item, failure } of failures)
      error(`Signature ${item.work.id} ${item.expression}: ${failure.message}`);
    if (failures.length)
      throw new Error(
        `${failures.length} map(s) could not be measured; the registry was not written`,
      );
    const maps = requestedIds.length ? mergeMaps(registry.maps, measured) : mergeMaps([], measured);
    const measuredOn = decideMeasuredOn(
      registry.measuredOn,
      registry.maps.map(mapRecord),
      maps,
      new Date().toISOString().slice(0, 10),
    );
    await writeAtomically(registryPath, await serializeRegistry({ measuredOn, maps }));
    if (requestedIds.length === 0) {
      const directory = resolve(publicRoot, 'art/arrival');
      for (const file of orphans(await readdir(directory), maps)) {
        await rm(resolve(directory, file));
        log(`Removed orphaned map ${file}`);
      }
    }
    log(`${maps.length} arrival maps; measured on ${measuredOn}.`);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
