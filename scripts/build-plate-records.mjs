import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { log, error } from 'node:console';
import {
  SEED,
  SHA256,
  cachedAsset,
  eachConcurrently,
  parseRequestedIds,
  readRegistry,
  withLock,
  writeAtomically,
} from './lib/origin.mjs';
import { decodeRaw, luminance } from './lib/raster.mjs';

/**
 * Plate records: offline measurements of every published still's own ground and weight.
 *
 * The Ink sheet's kozo tone letterboxes the plate without an edge; the Light field is
 * asserted to be true black. The luminance-weighted centre of each expression sets the eye
 * line a sheet hangs on, and the densest windows of the plate are the loupe's detail views.
 * A measurement is keyed to the sha256 of the exact still it was taken from, so a
 * re-rendered still never inherits a stale ground. Nothing here alters a still: the
 * published files are fetched into the cache, hash-verified and read, never written.
 */
const USAGE = 'Usage: node scripts/build-plate-records.mjs [tokenId ...]';
const indexPath = fileURLToPath(new URL('../src/lib/art/collection-index.json', import.meta.url));
const registryPath = fileURLToPath(new URL('../src/lib/art/plate-records.json', import.meta.url));
const groundsPath = fileURLToPath(new URL('../src/lib/art/plate-grounds.json', import.meta.url));
export const SCHEMA_VERSION = 2;
const STILL_ROLES = { ink: 'images/web/ember_full.webp', light: 'images/web/full.webp' };

/** Width of the sampled frame around the still, in pixels. */
export const BORDER_PX = 8;
/**
 * A mark reaches the sheet edge when some border pixel departs from the mean border
 * tone by at least this much luminance (of 255): darker ink on paper, or brighter
 * light on black. 64 is well below the 160+ departure of the curated Ink sheets and
 * well above WebP ringing or paper grain, which stays within a few units.
 */
export const EDGE_CONTRAST = 64;
/** The weight grid's cell, in pixels of the published still. */
export const CELL_PX = 32;
/** A detail window: a third of the plate on each side, at the still's native scale. */
export const DETAIL_CELLS = { columns: 36, rows: 23 };
/** At most three windows, none sharing more than a tenth of its area with another, each holding at least this share of the plate's weight. */
export const DETAIL_LIMITS = { count: 3, maxOverlap: 0.1, minShare: 0.04 };

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

/**
 * The weight of every pixel, summed on a coarse grid and as a centroid. Ink weighs by its
 * darkness against the sheet's own tone; Light weighs by its luminance against black. A
 * sheet with no weight at all (an empty plate) centres geometrically.
 */
export function measureWeight(
  { data, width, height, channels },
  expression,
  paperLuminance,
  cell = CELL_PX,
) {
  if (![3, 4].includes(channels)) throw new Error('Expected an RGB or RGBA raster');
  if (data.length !== width * height * channels) throw new Error('Raster size mismatch');
  const columns = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const sums = new Float64Array(columns * rows);
  let total = 0;
  let momentX = 0;
  let momentY = 0;
  const dark = expression === 'ink';
  const paper = dark ? Math.max(1, paperLuminance) : 255;
  for (let y = 0; y < height; y += 1) {
    const row = Math.floor(y / cell) * columns;
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      const lum = luminance(data[offset], data[offset + 1], data[offset + 2]);
      const weight = dark ? Math.max(0, (paper - lum) / paper) : lum / 255;
      if (weight === 0) continue;
      sums[row + Math.floor(x / cell)] += weight;
      total += weight;
      momentX += weight * (x + 0.5);
      momentY += weight * (y + 0.5);
    }
  }
  const centre =
    total > 0
      ? { x: round(momentX / total / width, 4), y: round(momentY / total / height, 4) }
      : { x: 0.5, y: 0.5 };
  return { centre, total, grid: { columns, rows, cell, sums }, width, height };
}

function round(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function overlapShare(a, b) {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return (x * y) / (a.width * a.height);
}

/**
 * The windows that hold the most weight, chosen greedily over the grid: the heaviest window
 * first, then the heaviest that overlaps the chosen ones by no more than `maxOverlap` of its
 * area, until `count` windows are found or the next holds less than `minShare` of the whole.
 * Rectangles are in pixels of the still, clamped inside it.
 */
export function detailWindows(weight, window = DETAIL_CELLS, limits = DETAIL_LIMITS) {
  const { columns, rows, cell, sums } = weight.grid;
  if (weight.total <= 0) return [];
  const windowColumns = Math.min(window.columns, columns);
  const windowRows = Math.min(window.rows, rows);
  // Two-dimensional prefix sums make every window's weight one subtraction.
  const prefix = new Float64Array((columns + 1) * (rows + 1));
  for (let r = 0; r < rows; r += 1)
    for (let c = 0; c < columns; c += 1) {
      prefix[(r + 1) * (columns + 1) + (c + 1)] =
        sums[r * columns + c] +
        prefix[r * (columns + 1) + (c + 1)] +
        prefix[(r + 1) * (columns + 1) + c] -
        prefix[r * (columns + 1) + c];
    }
  const windowWeight = (c, r) =>
    prefix[(r + windowRows) * (columns + 1) + (c + windowColumns)] -
    prefix[r * (columns + 1) + (c + windowColumns)] -
    prefix[(r + windowRows) * (columns + 1) + c] +
    prefix[r * (columns + 1) + c];
  const candidates = [];
  for (let r = 0; r + windowRows <= rows; r += 1)
    for (let c = 0; c + windowColumns <= columns; c += 1)
      candidates.push({ c, r, weight: windowWeight(c, r) });
  candidates.sort((a, b) => b.weight - a.weight || a.r - b.r || a.c - b.c);
  const chosen = [];
  for (const candidate of candidates) {
    if (chosen.length >= limits.count) break;
    const share = candidate.weight / weight.total;
    if (share < limits.minShare) break;
    const rect = {
      x: candidate.c * cell,
      y: candidate.r * cell,
      width: Math.min(windowColumns * cell, weight.width - candidate.c * cell),
      height: Math.min(windowRows * cell, weight.height - candidate.r * cell),
    };
    if (chosen.some((other) => overlapShare(rect, other) > limits.maxOverlap)) continue;
    chosen.push({ ...rect, share: round(share, 3) });
  }
  return chosen;
}

export function ground(stillSha256, border, weight, detail) {
  return {
    stillSha256,
    tone: hexColor(...border.mean),
    edge: reachesEdge(border),
    centre: weight.centre,
    detail,
  };
}

/** Stable key order; expressions are absent rather than null when unmeasured. */
export function plateRecord({ id, seed, ink, light }) {
  const record = { id, seed };
  const copy = (value) => ({
    stillSha256: value.stillSha256,
    tone: value.tone,
    edge: value.edge,
    centre: value.centre,
    detail: value.detail,
  });
  if (ink) record.ink = copy(ink);
  if (light) record.light = copy(light);
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
  return `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, measuredOn, records }, null, 2)}\n`;
}

/**
 * The client's projection of the records: what every plate needs to hang (tone, edge, centre),
 * keyed to the still hash, without the seeds or the detail windows the server attaches to a
 * work's own media. About a third of the full file compressed.
 */
export function serializeGrounds({ measuredOn, records }) {
  const lean = (ground) =>
    ground && {
      stillSha256: ground.stillSha256,
      tone: ground.tone,
      edge: ground.edge,
      centre: ground.centre,
    };
  const grounds = records.map(({ id, ink, light }) => {
    const entry = { id };
    if (ink) entry.ink = lean(ink);
    if (light) entry.light = lean(light);
    return entry;
  });
  return `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, measuredOn, grounds }, null, 2)}\n`;
}

async function measureWork(work) {
  const grounds = {};
  for (const expression of ['ink', 'light']) {
    const still = work.media[expression]?.still;
    if (!still) continue;
    if (still.path !== STILL_ROLES[expression] || !SHA256.test(still.sha256 ?? ''))
      throw new Error(
        `Signature ${work.id}: the indexed ${expression} still is not the published full still`,
      );
    const path = await cachedAsset(work.seed, still, { log });
    const raster = await decodeRaw(path);
    if (raster.width !== still.width || raster.height !== still.height)
      throw new Error(`Signature ${work.id}: ${still.path} is not ${still.width}×${still.height}`);
    const border = measureBorder(raster);
    if (expression === 'light') assertLightBlack(work.id, border);
    const weight = measureWeight(raster, expression, luminance(...border.mean));
    const detail = detailWindows(weight);
    grounds[expression] = ground(still.sha256, border, weight, detail);
    log(
      `Signature ${work.id} ${expression}: tone ${grounds[expression].tone}; edge ${grounds[expression].edge}; centre ${weight.centre.x}, ${weight.centre.y}; ${detail.length} detail window(s)`,
    );
  }
  return plateRecord({ id: work.id, seed: work.seed, ...grounds });
}

async function main() {
  const requestedIds = parseRequestedIds(process.argv.slice(2), USAGE);
  await withLock(`${registryPath}.lock`, async () => {
    const { readFile } = await import('node:fs/promises');
    const index = JSON.parse(await readFile(indexPath, 'utf8'));
    if (index.schemaVersion !== 1 || !Array.isArray(index.works))
      throw new Error('Invalid collection index; run npm run art:index first');
    // A registry of an earlier schema is remeasured whole; a partial run cannot merge into it.
    const registry = await readRegistry(registryPath, SCHEMA_VERSION, 'records').catch(
      (failure) => {
        if (requestedIds.length) throw failure;
        log(`${failure.message}; measuring every work afresh`);
        return { schemaVersion: SCHEMA_VERSION, measuredOn: null, records: [] };
      },
    );
    const selected = requestedIds.length
      ? index.works.filter((work) => requestedIds.includes(work.id))
      : index.works;
    if (requestedIds.some((id) => !selected.some((work) => work.id === id)))
      throw new Error('Requested token is not indexed');
    const measured = [];
    const failures = await eachConcurrently(selected, 3, async (work) => {
      if (!SEED.test(work.seed ?? '')) throw new Error(`Signature ${work.id}: malformed seed`);
      measured.push(await measureWork(work));
    });
    for (const { item, failure } of failures) error(`Signature ${item.id}: ${failure.message}`);
    if (failures.length)
      throw new Error(
        `${failures.length} work(s) could not be measured; the registry was not written`,
      );
    const records = requestedIds.length
      ? mergeRecords(registry.records, measured)
      : mergeRecords([], measured);
    const measuredOn = decideMeasuredOn(
      registry.measuredOn,
      mergeRecords(registry.records, []),
      records,
      new Date().toISOString().slice(0, 10),
    );
    await writeAtomically(registryPath, serializeRegistry({ measuredOn, records }));
    await writeAtomically(groundsPath, serializeGrounds({ measuredOn, records }));
    log(`${records.length} plate records; measured on ${measuredOn}.`);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
