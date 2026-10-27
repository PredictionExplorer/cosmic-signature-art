import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { log, error } from 'node:console';
import {
  ORIGIN as origin,
  SHA256 as shaPattern,
  collection,
  command,
  hashFile as hash,
  json,
  parseRequestedIds as parseIds,
  rangeRelay,
  uniqueAsset,
} from './lib/origin.mjs';

/**
 * The catalogue excerpts: eight seconds of each published Ink film at 640 px, 30 fps, for
 * hover, focus and the phone's ambient motion. Cut over the bounded range relay that
 * scripts/lib/origin.mjs shares with the plate clips and the still ladder.
 */
export { sourceByteLimit, validateSourceRange } from './lib/origin.mjs';
const outputDirectory = fileURLToPath(new URL('../public/art/previews/', import.meta.url));
const registryPath = fileURLToPath(
  new URL('../src/lib/art/collection-previews.json', import.meta.url),
);
const lockPath = `${registryPath}.lock`;
const maxOutputBytes = 2 * 1024 * 1024;
export function parseRequestedIds(arguments_) {
  return parseIds(arguments_, 'Usage: node scripts/build-collection-previews.mjs [tokenId ...]');
}

async function generate(record, existing) {
  const basePath = `/images/new/cosmicsignature/${record.seed}`;
  const manifest = await json(`${basePath}/metadata/assets.json`);
  if (
    manifest.schema_version !== 2 ||
    !Array.isArray(manifest.assets) ||
    manifest.assets.length > 500
  )
    throw new Error('Invalid asset manifest');
  const film = uniqueAsset(manifest, 'ember_web', 'videos/web/ember.mp4', 'video');
  if (!film) {
    log(`Signature ${record.id}: no published Ink film; retain the original still`);
    return null;
  }
  const still = uniqueAsset(manifest, 'ember_web_full', 'images/web/ember_full.webp', 'image');
  if (
    !still ||
    film.format !== 'mp4' ||
    film.codec !== 'h264' ||
    film.pixel_format !== 'yuv420p' ||
    film.color_space !== 'srgb' ||
    !Number.isFinite(film.duration_seconds) ||
    film.duration_seconds < 8
  )
    throw new Error('Ink source is unsuitable for an eight-second browser excerpt');
  const sourceUrl = `${origin}${basePath}/${film.path}`;
  if (
    existing?.seed === record.seed &&
    existing.sourceSha256 === film.sha256 &&
    existing.stillSha256 === still.sha256 &&
    existing.sourceUrl === sourceUrl &&
    existing.startSeconds === 6 &&
    existing.durationSeconds === 8
  ) {
    if (
      !shaPattern.test(existing.sha256) ||
      existing.src !== `/art/previews/${record.id}-${existing.sha256.slice(0, 16)}.mp4`
    )
      throw new Error('Existing registry path is not a content-addressed preview');
    const path = fileURLToPath(new URL(`../public${existing.src}`, import.meta.url));
    if ((await stat(path)).size === existing.bytes && (await hash(path)) === existing.sha256) {
      log(`Signature ${record.id}: verified existing ${existing.bytes} byte preview`);
      return existing;
    }
    throw new Error(`Existing preview integrity check failed for ${record.id}`);
  }
  const startSeconds = Math.min(6, film.duration_seconds - 8);
  const temporary = `${outputDirectory}/.partial-${randomUUID()}.mp4`;
  const relay = await rangeRelay(sourceUrl, film.bytes);
  const started = Date.now();
  try {
    await command('ffmpeg', [
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
      String(startSeconds),
      '-i',
      relay.url,
      '-t',
      '8',
      '-map',
      '0:v:0',
      '-an',
      '-vf',
      `scale=640:-2:flags=lanczos,setdar=ratio=${film.width}/${film.height}:max=1000000,fps=30`,
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '29',
      '-maxrate',
      '850k',
      '-bufsize',
      '1700k',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-color_primaries',
      'bt709',
      '-color_trc',
      'iec61966-2-1',
      '-colorspace',
      'bt709',
      '-color_range',
      'tv',
      '-map_metadata',
      '-1',
      '-threads',
      '2',
      temporary,
    ]);
    const bytesRead = relay.result();
    const probe = JSON.parse(
      await command(
        'ffprobe',
        [
          '-v',
          'error',
          '-show_entries',
          'stream=codec_name,width,height,pix_fmt,display_aspect_ratio,r_frame_rate:format=duration,size',
          '-of',
          'json',
          temporary,
        ],
        15_000,
      ),
    );
    const stream = probe.streams?.[0];
    const durationSeconds = Number(probe.format?.duration);
    const bytes = (await stat(temporary)).size;
    const aspect = stream?.display_aspect_ratio?.split(':').map(Number);
    if (
      probe.streams?.length !== 1 ||
      stream.codec_name !== 'h264' ||
      stream.pix_fmt !== 'yuv420p' ||
      stream.width !== 640 ||
      stream.height > 768 ||
      stream.r_frame_rate !== '30/1' ||
      Math.abs(durationSeconds - 8) > 1 / 30 ||
      bytes > maxOutputBytes ||
      bytes === 0 ||
      !aspect ||
      !Number.isFinite(aspect[0] / aspect[1]) ||
      Math.abs(aspect[0] / aspect[1] - film.width / film.height) > 0.000001
    )
      throw new Error(
        `Encoded preview failed validation: ${JSON.stringify({ stream, durationSeconds, bytes, expectedAspect: film.width / film.height })}`,
      );
    const sha256 = await hash(temporary);
    const src = `/art/previews/${record.id}-${sha256.slice(0, 16)}.mp4`;
    const destination = fileURLToPath(new URL(`../public${src}`, import.meta.url));
    try {
      await stat(destination);
      if ((await hash(destination)) !== sha256) throw new Error('Content-address collision');
      await rm(temporary);
    } catch (cause) {
      if (cause.code !== 'ENOENT') throw cause;
      await rename(temporary, destination);
    }
    log(
      `Signature ${record.id}: ${bytes} bytes; ${(bytesRead / 1024 / 1024).toFixed(1)} MiB of source; ${((Date.now() - started) / 1000).toFixed(1)}s`,
    );
    return {
      ...record,
      src,
      sourceUrl,
      sourceSha256: film.sha256,
      stillSha256: still.sha256,
      sha256,
      bytes,
      width: stream.width,
      height: stream.height,
      durationSeconds,
      startSeconds,
      sourceDurationSeconds: film.duration_seconds,
    };
  } finally {
    await relay.close();
    await rm(temporary, { force: true });
  }
}

async function main() {
  const requestedIds = parseRequestedIds(process.argv.slice(2));
  await mkdir(outputDirectory, { recursive: true });
  const lock = await open(lockPath, 'wx');
  try {
    const registry = JSON.parse(await readFile(registryPath, 'utf8'));
    if (registry.schemaVersion !== 1 || !Array.isArray(registry.previews))
      throw new Error('Invalid preview registry');
    const all = await collection();
    const selected = requestedIds.length
      ? all.filter((record) => requestedIds.includes(record.id))
      : all;
    if (requestedIds.some((id) => !selected.some((record) => record.id === id)))
      throw new Error('Requested token is not indexed');
    const previews = new Map(registry.previews.map((preview) => [preview.id, preview]));
    let next = 0;
    let writeQueue = Promise.resolve();
    const failures = [];
    const save = () => {
      writeQueue = writeQueue.then(async () => {
        const temporary = `${registryPath}.${randomUUID()}.tmp`;
        await writeFile(
          temporary,
          `${JSON.stringify({ schemaVersion: 1, previews: [...previews.values()].sort((a, b) => a.id - b.id) }, null, 2)}\n`,
        );
        await rename(temporary, registryPath);
      });
      return writeQueue;
    };
    log(`Preparing ${selected.length} indexed works with at most two encoders.`);
    await Promise.all(
      Array.from({ length: Math.min(2, selected.length) }, async () => {
        while (next < selected.length) {
          const record = selected[next++];
          try {
            const preview = await generate(record, previews.get(record.id));
            if (preview) previews.set(record.id, preview);
            else previews.delete(record.id);
            await save();
          } catch (cause) {
            failures.push(record.id);
            error(`Signature ${record.id}: ${cause.message}`);
          }
        }
      }),
    );
    await writeQueue;
    log(`${previews.size} verified output records; ${failures.length} failures.`);
    if (failures.length) throw new Error(`Retry failed tokens: ${failures.join(' ')}`);
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
