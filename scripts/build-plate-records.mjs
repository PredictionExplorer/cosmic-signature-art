import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, readFile, rename, rm } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { log } from 'node:console';

/**
 * Plate records: offline measurements of each curated still's own ground.
 *
 * The Ink sheet's kozo tone letterboxes the plate without an edge; the Light field
 * is asserted to be true black. A measurement is keyed to the sha256 of the exact
 * still it was taken from, so a re-rendered still never inherits a stale ground.
 * Nothing here alters a still: files are hashed and read, never written.
 */
const mediaPath = fileURLToPath(new URL('../src/lib/art/curated-media.json', import.meta.url));
const identityPath = fileURLToPath(new URL('../src/lib/art/curated-records.json', import.meta.url));
const registryPath = fileURLToPath(new URL('../src/lib/art/plate-records.json', import.meta.url));
const publicDirectory = fileURLToPath(new URL('../public', import.meta.url));
const lockPath = `${registryPath}.lock`;
const shaPattern = /^[a-f0-9]{64}$/;
const seedPattern = /^0x[a-f0-9]{64}$/;

/** Width of the sampled frame around the still, in pixels. */
export const BORDER_PX = 8;
/**
 * A mark reaches the sheet edge when some border pixel departs from the mean border
 * tone by at least this much luminance (of 255): darker ink on paper, or brighter
 * light on black. 64 is well below the 160+ departure of the curated Ink sheets and
 * well above WebP ringing or paper grain, which stays within a few units.
 */
export const EDGE_CONTRAST = 64;

export function parseRequestedIds(arguments_) {
  return arguments_.map((argument) => {
    if (!/^\d+$/.test(argument) || !Number.isSafeInteger(Number(argument)))
      throw new Error('Usage: node scripts/build-plate-records.mjs [tokenId ...]');
    return Number(argument);
  });
}

/** Rec. 709 relative luminance of an 8-bit sRGB triple, on the 0–255 scale. */
export function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function hexColor(r, g, b) {
  const channel = (value) =>
    Math.min(255, Math.max(0, Math.round(value)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/**
 * Mean colour and luminance extremes of the outer `border` pixels of a raw RGB(A)
 * image. Every border pixel is counted exactly once.
 */
export function measureBorder({ data, width, height, channels }, border = BORDER_PX) {
  if (![3, 4].includes(channels)) throw new Error('Expected an RGB or RGBA raster');
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < border * 2 + 1 ||
    height < border * 2 + 1
  )
    throw new Error('Raster is too small for the border measurement');
  if (data.length !== width * height * channels) throw new Error('Raster size mismatch');
  let count = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let y = 0; y < height; y += 1) {
    const edgeRow = y < border || y >= height - border;
    for (let x = 0; x < width; x += 1) {
      if (!edgeRow && x >= border && x < width - border) {
        x = width - border - 1;
        continue;
      }
      const offset = (y * width + x) * channels;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      sumR += r;
      sumG += g;
      sumB += b;
      const lum = luminance(r, g, b);
      if (lum < min) min = lum;
      if (lum > max) max = lum;
      count += 1;
    }
  }
  return {
    mean: [sumR / count, sumG / count, sumB / count],
    minLuminance: min,
    maxLuminance: max,
    count,
  };
}

/** True when ink or light reaches the border: see EDGE_CONTRAST. */
export function reachesEdge({ mean, minLuminance, maxLuminance }, contrast = EDGE_CONTRAST) {
  const tone = luminance(...mean);
  return Math.max(tone - minLuminance, maxLuminance - tone) >= contrast;
}

/** The Light field is authored black; any other mean border is a renderer or delivery change. */
export function assertLightBlack(id, measurement) {
  const tone = hexColor(...measurement.mean);
  if (tone !== '#000000')
    throw new Error(
      `Signature ${id}: the Light border measures ${tone}, not #000000. Refusing to record a ground.`,
    );
}

export function ground(stillSha256, measurement) {
  return { stillSha256, tone: hexColor(...measurement.mean), edge: reachesEdge(measurement) };
}

/** Stable key order; expressions are absent rather than null when unmeasured. */
export function plateRecord({ id, seed, ink, light }) {
  const record = { id, seed };
  if (ink) record.ink = { stillSha256: ink.stillSha256, tone: ink.tone, edge: ink.edge };
  if (light) record.light = { stillSha256: light.stillSha256, tone: light.tone, edge: light.edge };
  return record;
}

/** Measured records replace existing ones by id; unmeasured ids are retained; output is sorted. */
export function mergeRecords(existing, measured) {
  const byId = new Map(existing.map((record) => [record.id, plateRecord(record)]));
  for (const record of measured) byId.set(record.id, plateRecord(record));
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/** Re-running on unchanged stills keeps the previous date so the file stays byte-identical. */
export function decideMeasuredOn(previous, previousRecords, nextRecords, today) {
  const same = JSON.stringify(previousRecords) === JSON.stringify(nextRecords);
  return same && typeof previous === 'string' ? previous : today;
}

export function serializeRegistry({ measuredOn, records }) {
  return `${JSON.stringify({ schemaVersion: 1, measuredOn, records }, null, 2)}\n`;
}

async function hash(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}

async function decode(path) {
  const { default: sharp } = await import('sharp');
  const { data, info } = await sharp(path, { limitInputPixels: 50_000_000 })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

async function measureWork(work, seed) {
  const grounds = {};
  for (const entry of work.media) {
    if (!['ink', 'light'].includes(entry.id)) continue;
    if (!shaPattern.test(entry.stillSha256 ?? '') || !entry.still?.startsWith('/art/'))
      throw new Error(`Signature ${work.id}: malformed curated ${entry.id} record`);
    const path = resolve(publicDirectory, `.${entry.still}`);
    const digest = await hash(path);
    if (digest !== entry.stillSha256)
      throw new Error(
        `Signature ${work.id}: ${entry.still} hashes to ${digest.slice(0, 12)}…, not the curated ${entry.stillSha256.slice(0, 12)}…; refusing to measure`,
      );
    const raster = await decode(path);
    if (raster.width !== entry.width || raster.height !== entry.height)
      throw new Error(`Signature ${work.id}: ${entry.still} is not ${entry.width}×${entry.height}`);
    const measurement = measureBorder(raster);
    if (entry.id === 'light') assertLightBlack(work.id, measurement);
    grounds[entry.id] = ground(entry.stillSha256, measurement);
    log(
      `Signature ${work.id} ${entry.id}: tone ${grounds[entry.id].tone}; border luminance ${measurement.minLuminance.toFixed(1)}–${measurement.maxLuminance.toFixed(1)}; edge ${grounds[entry.id].edge}`,
    );
  }
  return plateRecord({ id: work.id, seed, ...grounds });
}

async function main() {
  const requestedIds = parseRequestedIds(process.argv.slice(2));
  const lock = await open(lockPath, 'wx');
  try {
    const media = JSON.parse(await readFile(mediaPath, 'utf8'));
    const identities = JSON.parse(await readFile(identityPath, 'utf8'));
    const seeds = new Map(identities.records.map((record) => [record.id, record.seed]));
    const registry = JSON.parse(await readFile(registryPath, 'utf8'));
    if (registry.schemaVersion !== 1 || !Array.isArray(registry.records))
      throw new Error('Invalid plate registry');
    const selected = requestedIds.length
      ? media.filter((work) => requestedIds.includes(work.id))
      : media;
    if (requestedIds.some((id) => !selected.some((work) => work.id === id)))
      throw new Error('Requested token is not in the curated archive');
    const measured = [];
    for (const work of selected) {
      const seed = seeds.get(work.id);
      if (!seedPattern.test(seed ?? ''))
        throw new Error(`Signature ${work.id}: no verified seed in curated-records.json`);
      measured.push(await measureWork(work, seed));
    }
    const records = requestedIds.length
      ? mergeRecords(registry.records, measured)
      : mergeRecords([], measured);
    const measuredOn = decideMeasuredOn(
      registry.measuredOn,
      mergeRecords(registry.records, []),
      records,
      new Date().toISOString().slice(0, 10),
    );
    const temporary = `${registryPath}.${randomUUID()}.tmp`;
    await writeFile(temporary, serializeRegistry({ measuredOn, records }));
    await rename(temporary, registryPath);
    log(`${records.length} plate records; measured on ${measuredOn}.`);
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
