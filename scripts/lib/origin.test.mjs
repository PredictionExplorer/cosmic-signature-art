import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  SEED,
  SHA256,
  eachConcurrently,
  hasFlag,
  hashBytes,
  normalizeSeed,
  parseRequestedIds,
  publishContentAddressed,
  readRegistry,
  seedPackagePath,
  seedPackageUrl,
  sourceByteLimit,
  uniqueAsset,
  validateSourceRange,
  withLock,
  writeAtomically,
} from './origin.mjs';

const seed = `0x${'ab'.repeat(32)}`;

test('builds package paths only for well-formed seeds', () => {
  assert.equal(
    seedPackagePath(seed, 'videos/web/ember.mp4'),
    `/images/new/cosmicsignature/${seed}/videos/web/ember.mp4`,
  );
  assert.ok(seedPackageUrl(seed, 'x').startsWith('https://a1.cosmicsignature.com/'));
  assert.throws(() => seedPackagePath('0x12', 'x'));
  assert.equal(normalizeSeed(seed.slice(2).toUpperCase()), seed);
  assert.equal(normalizeSeed('0x12'), undefined);
  assert.ok(SEED.test(seed) && SHA256.test('a'.repeat(64)));
});

test('parses token ids, skips flags and rejects anything else', () => {
  assert.deepEqual(parseRequestedIds(['23', '--opening', '31'], 'usage'), [23, 31]);
  assert.throws(() => parseRequestedIds(['x'], 'usage'), /usage/);
  assert.throws(() => parseRequestedIds(['-1'], 'usage'));
  assert.throws(() => parseRequestedIds(['99999999999999999999'], 'usage'));
  assert.equal(hasFlag(['--opening'], 'opening'), true);
  assert.equal(hasFlag(['opening'], 'opening'), false);
});

test('accepts one well-formed asset per role and refuses ambiguity or malformation', () => {
  const asset = {
    role: 'ember_web',
    path: 'videos/web/ember.mp4',
    kind: 'video',
    sha256: 'a'.repeat(64),
    bytes: 10,
    width: 3456,
    height: 2234,
  };
  const document = { assets: [asset, { role: 'other' }] };
  assert.equal(uniqueAsset(document, 'ember_web', asset.path, 'video'), asset);
  assert.equal(uniqueAsset(document, 'missing', 'x', 'video'), null);
  assert.throws(() => uniqueAsset({ assets: [asset, asset] }, 'ember_web', asset.path, 'video'));
  assert.throws(() => uniqueAsset(document, 'ember_web', 'videos/web/other.mp4', 'video'));
  assert.throws(() => uniqueAsset(document, 'ember_web', asset.path, 'image'));
  for (const change of [
    { sha256: 'short' },
    { bytes: 0 },
    { width: 0 },
    { height: 9000 },
    { bytes: 1.5 },
  ])
    assert.throws(() =>
      uniqueAsset({ assets: [{ ...asset, ...change }] }, 'ember_web', asset.path, 'video'),
    );
});

test('bounds the bytes a source may stream and validates every range', () => {
  assert.equal(sourceByteLimit(1000), 8 * 1024 * 1024);
  assert.equal(sourceByteLimit(100 * 1024 * 1024), 90 * 1024 * 1024);
  assert.equal(sourceByteLimit(10 ** 9), 96 * 1024 * 1024);
  assert.throws(() => sourceByteLimit(0));
  const request = {
    status: 206,
    contentRange: 'bytes 200-999/1000',
    requestRange: 'bytes=200-',
    expectedBytes: 1000,
    expectedEtag: '"original"',
    etag: '"original"',
  };
  assert.deepEqual(validateSourceRange(request), {
    start: 200,
    end: 999,
    total: 1000,
    length: 800,
  });
  for (const change of [
    { status: 200 },
    { contentRange: 'bytes 200-999/1001' },
    { etag: '"changed"' },
    { contentRange: 'bytes 201-999/1000' },
    { requestRange: 'bytes=200-500' },
  ])
    assert.throws(() => validateSourceRange({ ...request, ...change }));
});

test('hashes bytes, writes registries atomically and publishes content-addressed files once', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'origin-'));
  try {
    const registryPath = join(directory, 'registry.json');
    assert.deepEqual(await readRegistry(registryPath, 1, 'clips'), { schemaVersion: 1, clips: [] });
    await writeAtomically(registryPath, JSON.stringify({ schemaVersion: 1, clips: [1] }));
    assert.deepEqual(await readRegistry(registryPath, 1, 'clips'), {
      schemaVersion: 1,
      clips: [1],
    });
    await assert.rejects(readRegistry(registryPath, 2, 'clips'));
    await assert.rejects(readRegistry(registryPath, 1, 'rungs'));

    const bytes = Buffer.from('plate');
    const sha256 = hashBytes(bytes);
    assert.match(sha256, SHA256);
    const temporary = join(directory, 'a.tmp');
    const destination = join(directory, 'out', `x-${sha256.slice(0, 16)}.bin`);
    await writeFile(temporary, bytes);
    await publishContentAddressed(temporary, destination, sha256);
    assert.equal((await readFile(destination)).toString(), 'plate');
    await writeFile(temporary, bytes);
    await publishContentAddressed(temporary, destination, sha256);
    // A destination already holding other bytes under this address is a collision, never overwritten.
    const foreign = join(directory, 'out', `y-${sha256.slice(0, 16)}.bin`);
    await writeFile(foreign, 'other');
    await writeFile(temporary, bytes);
    await assert.rejects(publishContentAddressed(temporary, foreign, sha256), /collision/);
    assert.equal((await readFile(foreign)).toString(), 'other');

    const lockPath = join(directory, 'registry.lock');
    const result = await withLock(lockPath, async () => {
      await assert.rejects(
        withLock(lockPath, async () => 'inner'),
        /Stale lock/,
      );
      return 'outer';
    });
    assert.equal(result, 'outer');
    assert.equal(await withLock(lockPath, async () => 'again'), 'again');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('runs work concurrently, bounded, and collects failures instead of throwing', async () => {
  const seen = [];
  let inFlight = 0;
  let peak = 0;
  const failures = await eachConcurrently([1, 2, 3, 4, 5], 2, async (item) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await delay(5);
    inFlight -= 1;
    seen.push(item);
    if (item === 3) throw new Error('three');
  });
  assert.deepEqual(seen.sort(), [1, 2, 3, 4, 5]);
  assert.equal(peak, 2);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].item, 3);
  assert.equal(failures[0].failure.message, 'three');
});
