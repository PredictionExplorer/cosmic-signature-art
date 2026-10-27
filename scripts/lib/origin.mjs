import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { setTimeout, clearTimeout } from 'node:timers';

/**
 * The one origin the derivative pipelines read from, and the discipline they share: every
 * read is bounded, every published byte is verified against the manifest's hash before it is
 * measured or cut, every output is content-addressed, and every registry is written by an
 * atomic rename under a lock. Nothing here writes a published asset; nothing here infers a
 * fact the publisher did not state.
 */
const { fetch, AbortController, AbortSignal, Buffer } = globalThis;

export const ORIGIN = 'https://a1.cosmicsignature.com';
export const SHA256 = /^[a-f0-9]{64}$/;
export const SEED = /^0x[a-f0-9]{64}$/;
/** The published plate: 3,456 × 2,234 px, approximately 1.547:1. */
export const ART_WIDTH = 3456;
export const ART_HEIGHT = 2234;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const ATTEMPTS = 4;

export function seedPackagePath(seed, path) {
  if (!SEED.test(seed)) throw new Error('Malformed seed');
  return `/images/new/cosmicsignature/${seed}/${path}`;
}
export function seedPackageUrl(seed, path) {
  return `${ORIGIN}${seedPackagePath(seed, path)}`;
}

/** The repository root; under a test runner whose module URLs are not file URLs, the working directory. */
export function repositoryRoot() {
  try {
    return resolve(new URL('../..', import.meta.url).pathname);
  } catch {
    return process.cwd();
  }
}

export function parseRequestedIds(arguments_, usage) {
  return arguments_
    .filter((argument) => !argument.startsWith('--'))
    .map((argument) => {
      if (!/^\d+$/.test(argument) || !Number.isSafeInteger(Number(argument)))
        throw new Error(usage);
      return Number(argument);
    });
}
export function hasFlag(arguments_, flag) {
  return arguments_.includes(`--${flag}`);
}

/** Wait out a 429 or a 5xx, honouring Retry-After, then try again; give up after ATTEMPTS. */
async function retrying(request, attempt = 1) {
  let response;
  try {
    response = await request();
  } catch (failure) {
    if (attempt >= ATTEMPTS) throw failure;
    await delay(1000 * 2 ** (attempt - 1));
    return retrying(request, attempt + 1);
  }
  if ((response.status === 429 || response.status >= 500) && attempt < ATTEMPTS) {
    await response.body?.cancel();
    const retryAfter = Number(response.headers.get('retry-after'));
    await delay(
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt,
    );
    return retrying(request, attempt + 1);
  }
  return response;
}

/** One bounded JSON read from the origin, by path or absolute URL. */
export async function json(pathOrUrl, { maxBytes = MAX_JSON_BYTES } = {}) {
  const url = pathOrUrl.startsWith('/') ? `${ORIGIN}${pathOrUrl}` : pathOrUrl;
  if (!url.startsWith(`${ORIGIN}/`)) throw new Error(`Refusing to read outside ${ORIGIN}`);
  const response = await retrying(() =>
    fetch(url, {
      redirect: 'error',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    }),
  );
  if (!response.ok || Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel();
    throw new Error(`Invalid JSON response (${response.status}): ${url}`);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maxBytes) throw new Error(`Oversized JSON: ${url}`);
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function normalizeSeed(value) {
  if (typeof value !== 'string') return undefined;
  const seed = `0x${value.replace(/^0x/i, '').toLowerCase()}`;
  return SEED.test(seed) ? seed : undefined;
}

/** Every indexed token's identity, paged from the origin; the list must be consistent across pages. */
export async function collection() {
  const records = new Map();
  for (let offset = 0; offset < 10_000; offset += 18) {
    const page = await json(`/api/cosmicgame/cst/list/all/${offset}/18`);
    if (page.status !== 1 || page.error || !Array.isArray(page.CosmicSignatureTokenList))
      throw new Error('Collection index is unavailable');
    for (const row of page.CosmicSignatureTokenList) {
      const seed = normalizeSeed(row.Seed);
      if (!Number.isSafeInteger(row.TokenId) || row.TokenId < 0 || !seed)
        throw new Error('Malformed token identity');
      if (records.has(row.TokenId))
        throw new Error('Collection changed during pagination; rerun to obtain a consistent list');
      records.set(row.TokenId, { id: row.TokenId, seed });
    }
    if (page.CosmicSignatureTokenList.length < 18)
      return [...records.values()].sort((a, b) => a.id - b.id);
  }
  throw new Error('Collection exceeds the ingestion safety limit');
}

/** A token's published asset manifest, schema 2, bounded. */
export async function manifest(seed) {
  const document = await json(seedPackagePath(seed, 'metadata/assets.json'));
  if (
    document.schema_version !== 2 ||
    !Array.isArray(document.assets) ||
    document.assets.length > 500
  )
    throw new Error('Invalid asset manifest');
  return document;
}

/**
 * The one asset a role names, or null when the manifest does not advertise it. A duplicate
 * role, a different path or kind, or a malformed hash or size is a refusal, never a guess.
 */
export function uniqueAsset(document, role, path, kind) {
  const candidates = document.assets.filter((asset) => asset.role === role);
  if (candidates.length === 0) return null;
  if (candidates.length !== 1) throw new Error(`Duplicate manifest role: ${role}`);
  const asset = candidates[0];
  if (
    asset.path !== path ||
    asset.kind !== kind ||
    !SHA256.test(asset.sha256) ||
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

export function command(program, arguments_, timeout = 120_000) {
  return new Promise((resolvePromise, reject) => {
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
      if (code === 0) resolvePromise(stdout);
      else reject(new Error(`${program} failed (${signal ?? code}): ${stderr.slice(-4000)}`));
    });
  });
}

export async function hashFile(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}
export function hashBytes(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * The most an excerpt may read of its source: nine tenths, so a cut never quietly pulls a
 * whole original, with a floor of 8 MiB because probing and seeking a small film can touch
 * most of it, and a ceiling of 96 MiB.
 */
export function sourceByteLimit(expectedBytes) {
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0)
    throw new Error('Invalid original byte size');
  return Math.min(96 * 1024 * 1024, Math.max(8 * 1024 * 1024, Math.floor(expectedBytes * 0.9)));
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

/**
 * Fixed-origin range relay: FFmpeg cannot follow upstream redirects or fetch a whole original.
 * A token's aggregate bytes are capped, and every request must match the probed object size.
 */
export async function rangeRelay(sourceUrl, expectedBytes, limit = sourceByteLimit(expectedBytes)) {
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
      await new Promise((resolvePromise) => server.close(resolvePromise));
    },
  };
}

/** Where verified copies of published assets live between runs; never committed. */
export const CACHE_DIRECTORY = resolve(repositoryRoot(), '.cache/art');

/**
 * A verified local copy of one published asset: downloaded once into the cache by seed and
 * path, hashed on every use, and re-fetched when the bytes no longer match the manifest.
 * The size is bounded by the manifest's own figure; a redirect is a refusal.
 */
export async function cachedAsset(seed, asset, { cacheDirectory = CACHE_DIRECTORY, log } = {}) {
  if (!SHA256.test(asset.sha256) || !Number.isSafeInteger(asset.bytes) || asset.bytes <= 0)
    throw new Error(`Malformed asset record for ${asset.path}`);
  if (!/^[a-z0-9_./-]+$/i.test(asset.path) || asset.path.includes('..'))
    throw new Error(`Unsafe asset path: ${asset.path}`);
  const path = resolve(cacheDirectory, seed, asset.path);
  if (!path.startsWith(`${resolve(cacheDirectory)}/`))
    throw new Error('Asset path escapes the cache');
  try {
    if ((await stat(path)).size === asset.bytes && (await hashFile(path)) === asset.sha256)
      return path;
    log?.(`${asset.path}: cached copy no longer matches its manifest hash; refetching`);
  } catch (failure) {
    if (failure.code !== 'ENOENT') throw failure;
  }
  const url = seedPackageUrl(seed, asset.path);
  const response = await retrying(() =>
    fetch(url, {
      redirect: 'error',
      headers: { 'accept-encoding': 'identity' },
      signal: AbortSignal.timeout(60_000),
    }),
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Asset unavailable (${response.status}): ${url}`);
  }
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  const handle = await open(temporary, 'wx');
  const digest = createHash('sha256');
  let size = 0;
  try {
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > asset.bytes)
        throw new Error(`${asset.path} exceeds its advertised ${asset.bytes} bytes`);
      digest.update(chunk);
      await handle.write(chunk);
    }
    await handle.close();
    const sha256 = digest.digest('hex');
    if (size !== asset.bytes || sha256 !== asset.sha256)
      throw new Error(
        `${asset.path} hashes to ${sha256.slice(0, 12)}… (${size} bytes), not the manifest's ${asset.sha256.slice(0, 12)}… (${asset.bytes} bytes)`,
      );
    await rename(temporary, path);
    return path;
  } catch (failure) {
    await handle.close().catch(() => {});
    await rm(temporary, { force: true });
    throw failure;
  }
}

/** Run `work` while holding an exclusive lock file; a stale lock is reported, never stolen. */
export async function withLock(lockPath, work) {
  let lock;
  try {
    lock = await open(lockPath, 'wx');
  } catch (failure) {
    if (failure.code === 'EEXIST')
      throw new Error(`Stale lock at ${lockPath}; remove it if no build is running`, {
        cause: failure,
      });
    throw failure;
  }
  try {
    return await work();
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

export async function writeAtomically(path, contents) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, contents);
    await rename(temporary, path);
  } catch (failure) {
    await rm(temporary, { force: true });
    throw failure;
  }
}

export async function readRegistry(path, schemaVersion, collectionKey) {
  let registry;
  try {
    registry = JSON.parse(await readFile(path, 'utf8'));
  } catch (failure) {
    if (failure.code !== 'ENOENT') throw failure;
    return { schemaVersion, [collectionKey]: [] };
  }
  if (registry.schemaVersion !== schemaVersion || !Array.isArray(registry[collectionKey]))
    throw new Error(`Invalid registry at ${path}`);
  return registry;
}

/**
 * Move a finished temporary into its content-addressed destination. A file already there
 * must hash identically; two different files can never share one address.
 */
export async function publishContentAddressed(temporary, destination, sha256) {
  await mkdir(dirname(destination), { recursive: true });
  try {
    await stat(destination);
    if ((await hashFile(destination)) !== sha256) throw new Error('Content-address collision');
    await rm(temporary);
  } catch (cause) {
    if (cause.code !== 'ENOENT') throw cause;
    await rename(temporary, destination);
  }
}

/** Run `work` over `items` with at most `width` in flight; failures are collected, not thrown. */
export async function eachConcurrently(items, width, work) {
  const failures = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(width, items.length) }, async () => {
      while (next < items.length) {
        const item = items[next++];
        try {
          await work(item);
        } catch (failure) {
          failures.push({ item, failure });
        }
      }
    }),
  );
  return failures;
}
