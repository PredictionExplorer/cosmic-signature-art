import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { setTimeout, clearTimeout } from 'node:timers';
import { log, error } from 'node:console';

const { fetch, AbortController, AbortSignal, Buffer } = globalThis;
const origin = 'https://a1.cosmicsignature.com';
const outputDirectory = fileURLToPath(new URL('../public/art/previews/', import.meta.url));
const registryPath = fileURLToPath(
  new URL('../src/lib/art/collection-previews.json', import.meta.url),
);
const lockPath = `${registryPath}.lock`;
const maxJsonBytes = 2 * 1024 * 1024;
const maxOutputBytes = 2 * 1024 * 1024;
const shaPattern = /^[a-f0-9]{64}$/;
const seedPattern = /^0x[a-f0-9]{64}$/;
export function parseRequestedIds(arguments_) {
  return arguments_.map((argument) => {
    if (!/^\d+$/.test(argument) || !Number.isSafeInteger(Number(argument)))
      throw new Error('Usage: node scripts/build-collection-previews.mjs [tokenId ...]');
    return Number(argument);
  });
}

export function sourceByteLimit(expectedBytes) {
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0)
    throw new Error('Invalid original byte size');
  return Math.min(96 * 1024 * 1024, Math.floor(expectedBytes * 0.9));
}

export function validateSourceRange({
  status,
  contentRange,
  requestRange,
  expectedBytes,
  etag,
  expectedEtag,
}) {
  const requested = /^bytes=(\d+)-(\d*)$/.exec(requestRange ?? '');
  const received = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange ?? '');
  if (!requested || !received) throw new Error('Malformed source byte range');
  const [, start, end, total] = received.map(Number);
  const requestedStart = Number(requested[1]);
  const requestedEnd = requested[2] ? Number(requested[2]) : expectedBytes - 1;
  if (
    status !== 206 ||
    ![start, end, total, requestedStart, requestedEnd, expectedBytes].every(Number.isSafeInteger) ||
    total !== expectedBytes ||
    start !== requestedStart ||
    end < start ||
    end >= total ||
    requestedEnd < requestedStart ||
    end !== Math.min(requestedEnd, expectedBytes - 1) ||
    (expectedEtag && etag !== expectedEtag)
  )
    throw new Error('Source range or object validator changed during generation');
  return { start, end, total, length: end - start + 1 };
}

async function json(path) {
  const response = await fetch(`${origin}${path}`, {
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok || Number(response.headers.get('content-length')) > maxJsonBytes) {
    await response.body?.cancel();
    throw new Error(`Invalid JSON response: ${path}`);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maxJsonBytes) throw new Error(`Oversized JSON: ${path}`);
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function collection() {
  const records = new Map();
  for (let offset = 0; offset < 10_000; offset += 18) {
    const page = await json(`/api/cosmicgame/cst/list/all/${offset}/18`);
    if (page.status !== 1 || page.error || !Array.isArray(page.CosmicSignatureTokenList))
      throw new Error('Collection index is unavailable');
    for (const row of page.CosmicSignatureTokenList) {
      const seed = `0x${typeof row.Seed === 'string' ? row.Seed.replace(/^0x/i, '').toLowerCase() : ''}`;
      if (!Number.isSafeInteger(row.TokenId) || row.TokenId < 0 || !seedPattern.test(seed))
        throw new Error('Malformed token identity');
      if (records.has(row.TokenId))
        throw new Error('Collection changed during pagination; rerun to obtain a consistent list');
      records.set(row.TokenId, { id: row.TokenId, seed });
    }
    if (page.CosmicSignatureTokenList.length < 18) return [...records.values()];
  }
  throw new Error('Collection exceeds the ingestion safety limit');
}

function uniqueAsset(manifest, role, path, kind) {
  const candidates = manifest.assets.filter((asset) => asset.role === role);
  if (candidates.length === 0) return null;
  if (candidates.length !== 1) throw new Error(`Duplicate manifest role: ${role}`);
  const asset = candidates[0];
  if (
    asset.path !== path ||
    asset.kind !== kind ||
    !shaPattern.test(asset.sha256) ||
    !Number.isSafeInteger(asset.bytes) ||
    asset.bytes <= 0 ||
    !Number.isSafeInteger(asset.width) ||
    !Number.isSafeInteger(asset.height) ||
    asset.width <= 0 ||
    asset.height <= 0 ||
    asset.width > 8192 ||
    asset.height > 8192
  )
    throw new Error(`Malformed manifest asset: ${role}`);
  return asset;
}

function command(program, arguments_, timeout = 120_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, arguments_, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.stdout.on('data', (chunk) => (stdout = `${stdout}${chunk}`.slice(-128_000)));
    child.stderr.on('data', (chunk) => (stderr = `${stderr}${chunk}`.slice(-128_000)));
    child.once('error', (failure) => {
      clearTimeout(timer);
      reject(failure);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`${program} failed (${signal ?? code}): ${stderr.slice(-4000)}`));
    });
  });
}

async function hash(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}

/**
 * Fixed-origin range relay: FFmpeg cannot follow upstream redirects or fetch a whole original.
 * A token's aggregate bytes are capped, and every request must match the probed object size.
 */
async function rangeRelay(sourceUrl, expectedBytes) {
  const probe = await fetch(sourceUrl, {
    headers: { range: 'bytes=0-0', 'accept-encoding': 'identity' },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  const etag = probe.headers.get('etag');
  const modified = probe.headers.get('last-modified');
  try {
    validateSourceRange({
      status: probe.status,
      contentRange: probe.headers.get('content-range'),
      requestRange: 'bytes=0-0',
      expectedBytes,
    });
  } catch {
    await probe.body?.cancel();
    throw new Error('Source must support bounded byte ranges with its advertised size');
  }
  await probe.body?.cancel();
  const limit = sourceByteLimit(expectedBytes);
  let bytesRead = 0;
  let failure;
  const controllers = new Set();
  const server = createServer(async (request, response) => {
    const range = request.headers.range;
    if (
      request.url !== '/source.mp4' ||
      request.method !== 'GET' ||
      !/^bytes=\d+-\d*$/.test(range ?? '')
    ) {
      response.writeHead(400).end();
      return;
    }
    const controller = new AbortController();
    controllers.add(controller);
    response.once('close', () => controller.abort());
    try {
      const headers = { range, 'accept-encoding': 'identity' };
      if (etag && !etag.startsWith('W/')) headers['if-match'] = etag;
      else if (modified) headers['if-unmodified-since'] = modified;
      const upstream = await fetch(sourceUrl, {
        headers,
        redirect: 'error',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
      });
      const contentRange = upstream.headers.get('content-range') ?? '';
      let validatedRange;
      try {
        validatedRange = validateSourceRange({
          status: upstream.status,
          contentRange,
          requestRange: range,
          expectedBytes,
          etag: upstream.headers.get('etag'),
          expectedEtag: etag,
        });
      } catch (cause) {
        await upstream.body?.cancel();
        throw cause;
      }
      response.writeHead(206, {
        'content-type': 'video/mp4',
        'accept-ranges': 'bytes',
        'content-range': contentRange,
        'content-length': validatedRange.length,
      });
      for await (const chunk of upstream.body) {
        bytesRead += chunk.length;
        if (bytesRead > limit) throw new Error(`Source excerpt exceeded ${limit} bytes`);
        if (!response.write(chunk)) await once(response, 'drain', { signal: controller.signal });
      }
      response.end();
    } catch (cause) {
      if (!controller.signal.aborted) failure = cause;
      controller.abort();
      response.destroy();
    } finally {
      controllers.delete(controller);
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    url: `http://127.0.0.1:${server.address().port}/source.mp4`,
    result: () => {
      if (failure) throw failure;
      return bytesRead;
    },
    async close() {
      for (const controller of controllers) controller.abort();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
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
