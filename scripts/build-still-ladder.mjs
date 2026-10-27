import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { log, error } from 'node:console';
import {
  ART_HEIGHT,
  ART_WIDTH,
  SHA256,
  cachedAsset,
  collection,
  eachConcurrently,
  hasFlag,
  hashBytes,
  hashFile,
  manifest,
  parseRequestedIds,
  publishContentAddressed,
  readRegistry,
  seedPackageUrl,
  uniqueAsset,
  withLock,
  writeAtomically,
} from './lib/origin.mjs';
import { decodeRaw, meanAbsoluteDifference } from './lib/raster.mjs';

/**
 * The still ladder: 1280 and 1920 px rungs of every published still, cut from the 16-bit
 * master PNG with a Lanczos-3 kernel, never from the lossy web derivative. The rungs are
 * what a phone rests on and what the loupe opens first.
 *
 * Colour is carried through as the publisher carries it: raw values, no profile. The Light
 * masters declare Display P3 chromaticities and the published WebP ignores them, so a rung
 * made with a conversion would not match the plate beside it. Each rung is proved against
 * both parents before it is published: the master's own downsample (fidelity) and the
 * published still's downsample (consistency with the publisher's pipeline).
 *
 * Lossy WebP is 4:2:0; `smartSubsample` keeps chroma edges sharp, and at quality 92 the
 * 1280 rung departs from the master's downsample by about 1.6 of 255 on average.
 */
const USAGE = 'Usage: node scripts/build-still-ladder.mjs [--ink] [--light] [tokenId ...]';
export const RUNGS = [
  { width: 1280, height: 828 },
  { width: 1920, height: 1242 },
];
export const QUALITY = 92;
export const MAX_RUNG_BYTES = 1536 * 1024;
/** Fidelity: a decoded rung against the master's downsample at the rung's own size. */
export const MASTER_MATCH_MEAN = 3;
/** Consistency: the master's 64 px downsample against the published still's; measured 1.9 and 1.0 on 031. */
export const PUBLISHED_MATCH_MEAN = 4;
const CONSISTENCY_SIZE = { width: 64, height: 41 };
const ROLES = {
  ink: {
    master: ['ember_source_master', 'images/source/ember.png'],
    still: ['ember_web_full', 'images/web/ember_full.webp'],
  },
  light: {
    master: ['source_master', 'images/source/master.png'],
    still: ['web_full', 'images/web/full.webp'],
  },
};

const outputDirectory = fileURLToPath(new URL('../public/art/stills/', import.meta.url));
const registryPath = fileURLToPath(new URL('../src/lib/art/still-ladder.json', import.meta.url));

export function rungKey({ id, expression, width }) {
  return `${id}:${expression}:${width}`;
}

export function rungEntry(fields) {
  return {
    id: fields.id,
    seed: fields.seed,
    expression: fields.expression,
    width: fields.width,
    height: fields.height,
    src: fields.src,
    sha256: fields.sha256,
    bytes: fields.bytes,
    masterUrl: fields.masterUrl,
    masterSha256: fields.masterSha256,
    stillSha256: fields.stillSha256,
    masterMatch: fields.masterMatch,
    publishedMatch: fields.publishedMatch,
  };
}

export function serializeRegistry(rungs) {
  const sorted = [...rungs].sort(
    (a, b) => a.id - b.id || a.expression.localeCompare(b.expression) || a.width - b.width,
  );
  return `${JSON.stringify({ schemaVersion: 1, rungs: sorted }, null, 2)}\n`;
}

export function orphans(files, rungs) {
  const referenced = new Set(rungs.map((rung) => rung.src.split('/').pop()));
  return files.filter((file) => file.endsWith('.webp') && !referenced.has(file));
}

export function consistent(match, limit = PUBLISHED_MATCH_MEAN) {
  return match.mean <= limit;
}
export function faithful(match, limit = MASTER_MATCH_MEAN) {
  return match.mean <= limit;
}

async function existingIsSound(existing, expected) {
  if (!existing) return false;
  if (!Object.entries(expected).every(([key, value]) => existing[key] === value)) return false;
  if (
    !SHA256.test(existing.sha256) ||
    existing.src !==
      `/art/stills/${existing.id}-${existing.expression}-${existing.width}-${existing.sha256.slice(0, 16)}.webp`
  )
    throw new Error('Existing registry path is not a content-addressed rung');
  const path = fileURLToPath(new URL(`../public${existing.src}`, import.meta.url));
  try {
    if ((await stat(path)).size === existing.bytes && (await hashFile(path)) === existing.sha256)
      return true;
  } catch (failure) {
    if (failure.code !== 'ENOENT') throw failure;
  }
  throw new Error(`Existing rung integrity check failed for ${existing.src}`);
}

async function generate({ id, seed }, expression, existing) {
  const document = await manifest(seed);
  const roles = ROLES[expression];
  const master = uniqueAsset(document, ...roles.master, 'image');
  const still = uniqueAsset(document, ...roles.still, 'image');
  if (!master || !still) {
    log(`Signature ${id} ${expression}: no published master and still; no rungs`);
    return [];
  }
  if (master.width !== ART_WIDTH || master.height !== ART_HEIGHT)
    throw new Error(`The ${expression} master is not ${ART_WIDTH} × ${ART_HEIGHT}`);
  const masterUrl = seedPackageUrl(seed, master.path);
  const expected = RUNGS.map((rung) => ({
    id,
    seed,
    expression,
    width: rung.width,
    height: rung.height,
    masterUrl,
    masterSha256: master.sha256,
    stillSha256: still.sha256,
  }));
  const sound = await Promise.all(
    expected.map((fields) => existingIsSound(existing.get(rungKey(fields)), fields)),
  );
  if (sound.every(Boolean)) {
    log(`Signature ${id} ${expression}: verified ${expected.length} existing rungs`);
    return expected.map((fields) => existing.get(rungKey(fields)));
  }
  const started = Date.now();
  const { default: sharp } = await import('sharp');
  const [masterPath, stillPath] = await Promise.all([
    cachedAsset(seed, master, { log }),
    cachedAsset(seed, still, { log }),
  ]);
  const publishedMatch = meanAbsoluteDifference(
    await decodeRaw(masterPath, CONSISTENCY_SIZE),
    await decodeRaw(stillPath, CONSISTENCY_SIZE),
  );
  if (!consistent(publishedMatch))
    throw new Error(
      `The master and the published still disagree (${JSON.stringify(publishedMatch)}); the colour pipeline question must be answered before a rung is cut`,
    );
  const metadata = await sharp(masterPath, { limitInputPixels: 50_000_000 }).metadata();
  if (metadata.width !== ART_WIDTH || metadata.height !== ART_HEIGHT || metadata.depth !== 'ushort')
    throw new Error(`The decoded master is not a 16-bit ${ART_WIDTH} × ${ART_HEIGHT} raster`);
  const entries = [];
  for (const [index, rung] of RUNGS.entries()) {
    const fields = expected[index];
    const resized = () =>
      sharp(masterPath, { limitInputPixels: 50_000_000 }).resize(rung.width, rung.height, {
        kernel: 'lanczos3',
        fit: 'fill',
      });
    const encoded = await resized()
      .webp({ quality: QUALITY, smartSubsample: true, effort: 6 })
      .toBuffer();
    if (encoded.length === 0 || encoded.length > MAX_RUNG_BYTES)
      throw new Error(`The ${rung.width} rung is ${encoded.length} bytes`);
    const decoded = await decodeRaw(encoded);
    if (decoded.width !== rung.width || decoded.height !== rung.height)
      throw new Error(`The ${rung.width} rung decoded to ${decoded.width} × ${decoded.height}`);
    const reference = {
      ...(await resized().removeAlpha().raw().toBuffer({ resolveWithObject: true })),
    };
    const masterMatch = meanAbsoluteDifference(decoded, {
      data: reference.data,
      width: reference.info.width,
      height: reference.info.height,
      channels: reference.info.channels,
    });
    if (!faithful(masterMatch))
      throw new Error(
        `The ${rung.width} rung departs from the master: ${JSON.stringify(masterMatch)}`,
      );
    const sha256 = hashBytes(encoded);
    const src = `/art/stills/${id}-${expression}-${rung.width}-${sha256.slice(0, 16)}.webp`;
    await mkdir(outputDirectory, { recursive: true });
    const temporary = `${outputDirectory}.partial-${randomUUID()}.webp`;
    try {
      await writeFile(temporary, encoded);
      await publishContentAddressed(
        temporary,
        fileURLToPath(new URL(`../public${src}`, import.meta.url)),
        sha256,
      );
    } finally {
      await rm(temporary, { force: true });
    }
    entries.push(
      rungEntry({ ...fields, src, sha256, bytes: encoded.length, masterMatch, publishedMatch }),
    );
  }
  log(
    `Signature ${id} ${expression}: ${entries.map((entry) => `${entry.width} px ${entry.bytes} bytes`).join(', ')}; master match ${entries.map((entry) => entry.masterMatch.mean).join('/')}; published match ${publishedMatch.mean}; ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
  return entries;
}

async function main() {
  const arguments_ = process.argv.slice(2);
  const requestedIds = parseRequestedIds(arguments_, USAGE);
  const expressions = ['ink', 'light'].filter((expression) => hasFlag(arguments_, expression));
  if (expressions.length === 0) expressions.push('ink', 'light');
  await mkdir(outputDirectory, { recursive: true });
  await withLock(`${registryPath}.lock`, async () => {
    const registry = await readRegistry(registryPath, 1, 'rungs');
    const all = await collection();
    const selected = requestedIds.length
      ? all.filter((record) => requestedIds.includes(record.id))
      : all;
    if (requestedIds.some((id) => !selected.some((record) => record.id === id)))
      throw new Error('Requested token is not indexed');
    const rungs = new Map(registry.rungs.map((rung) => [rungKey(rung), rung]));
    let writeQueue = Promise.resolve();
    const save = () => {
      writeQueue = writeQueue.then(() =>
        writeAtomically(registryPath, serializeRegistry([...rungs.values()])),
      );
      return writeQueue;
    };
    const jobs = selected.flatMap((record) =>
      expressions.map((expression) => ({ record, expression })),
    );
    log(`Cutting rungs for ${jobs.length} expressions with at most three decoders.`);
    const failures = await eachConcurrently(jobs, 3, async ({ record, expression }) => {
      const entries = await generate(record, expression, rungs);
      for (const rung of RUNGS)
        rungs.delete(rungKey({ id: record.id, expression, width: rung.width }));
      for (const entry of entries) rungs.set(rungKey(entry), entry);
      await save();
    });
    await writeQueue;
    for (const { item, failure } of failures)
      error(`Signature ${item.record.id} ${item.expression}: ${failure.message}`);
    if (requestedIds.length === 0 && failures.length === 0) {
      const stale = orphans(await readdir(outputDirectory), [...rungs.values()]);
      for (const file of stale) {
        await rm(resolve(outputDirectory, file));
        log(`Removed orphaned rung ${file}`);
      }
    }
    log(`${rungs.size} verified rungs; ${failures.length} failures.`);
    if (failures.length)
      throw new Error(
        `Retry failed tokens: ${[...new Set(failures.map(({ item }) => item.record.id))].join(' ')}`,
      );
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
