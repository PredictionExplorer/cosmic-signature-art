import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { log } from 'node:console';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import sharp from 'sharp';
import {
  hashBytes,
  hashFile,
  publishContentAddressed,
  readRegistry,
  withLock,
  writeAtomically,
} from './lib/origin.mjs';

/**
 * All the light: every Light still of the collection added as light adds, built offline.
 *
 * The published Light stills, as the venue's hash-verified rungs, are summed in linear light at
 * float precision and brought back to the screen with a soft shoulder (1 − e^(−exposure·sum)),
 * so where orbits crowd the sky turns white and their edges keep their colour. The sky is kept
 * at two widths, whole and as it stood after each cycle, so a page can show the collection
 * filling cycle by cycle without summing anything itself. Beside it, a coarse grid per work
 * records how bright that work is in each cell, so a page can name the orbits under a pointer.
 *
 * Nothing here alters a still: the skies are new images, derived views labelled as such, and
 * the stills themselves are what a page shows when one orbit is chosen.
 */
const ladderPath = fileURLToPath(new URL('../src/lib/art/still-ladder.json', import.meta.url));
const indexPath = fileURLToPath(new URL('../src/lib/art/collection-index.json', import.meta.url));
const registryPath = fileURLToPath(new URL('../src/lib/art/all-the-light.json', import.meta.url));
const publicRoot = fileURLToPath(new URL('../public', import.meta.url));
const outputDirectory = resolve(publicRoot, 'art/light');
export const SCHEMA_VERSION = 1;
export const PARAMETERS = Object.freeze({
  /** How much light a full-white still adds before the shoulder: 0.42, as in the study. */
  exposure: 0.42,
  widths: [1280, 1920],
  /** The naming grid: cells across and down, each the mean of its block's brightest channel. */
  grid: [128, 83],
  /** Lossy WebP for the skies; the grid is lossless. */
  quality: 90,
});

/** sRGB byte to linear light, as a table. */
export const SRGB_TO_LINEAR = Float64Array.from({ length: 256 }, (_, level) => {
  const c = level / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

/** Linear light to an sRGB byte, rounded. */
export function linearToSrgb(value) {
  const c = Math.min(1, Math.max(0, value));
  const encoded = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(encoded * 255);
}

/** Add one still's light (RGB bytes) to a linear accumulator of the same size. */
export function addLight(sum, pixels) {
  if (sum.length !== pixels.length) throw new Error('a still and the sky differ in size');
  for (let i = 0; i < pixels.length; i++) sum[i] += SRGB_TO_LINEAR[pixels[i]];
}

/** The accumulated light as sRGB bytes, through the soft shoulder. */
export function exposeSky(sum, exposure = PARAMETERS.exposure) {
  const bytes = new Uint8Array(sum.length);
  for (let i = 0; i < sum.length; i++) bytes[i] = linearToSrgb(1 - Math.exp(-exposure * sum[i]));
  return bytes;
}

/**
 * How much of a still's light lies in each cell of the naming grid: the mean of the brightest
 * channel over the cell's block. A ribbon crossing the cell counts; a lone star in it does not,
 * and levels below `floor` are written as none, so the grid is mostly empty and compresses.
 */
export function brightnessGrid(
  pixels,
  width,
  height,
  [columns, rows] = PARAMETERS.grid,
  floor = 4,
) {
  const grid = new Uint8Array(columns * rows);
  for (let row = 0; row < rows; row++) {
    const y0 = Math.floor((row * height) / rows);
    const y1 = Math.floor(((row + 1) * height) / rows);
    for (let column = 0; column < columns; column++) {
      const x0 = Math.floor((column * width) / columns);
      const x1 = Math.floor(((column + 1) * width) / columns);
      let total = 0;
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 3;
          total += Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
        }
      const mean = Math.round(total / ((x1 - x0) * (y1 - y0)));
      grid[row * columns + column] = mean < floor ? 0 : mean;
    }
  }
  return grid;
}

/** The works in the order the sky is filled: cycle by cycle, and by number within a cycle. */
export function fillingOrder(works) {
  return works
    .filter((work) => Number.isSafeInteger(work.cycle))
    .sort((a, b) => a.cycle - b.cycle || a.id - b.id);
}

/** The Light rungs of one work at the sky's widths, from the still ladder, or nothing. */
export function lightRungs(ladder, id) {
  const rungs = {};
  for (const width of PARAMETERS.widths) {
    const matches = ladder.rungs.filter(
      (rung) => rung.id === id && rung.expression === 'light' && rung.width === width,
    );
    if (matches.length !== 1) return null;
    rungs[width] = matches[0];
  }
  return rungs;
}

/**
 * The works the sky holds: every indexed work whose Light still the ladder holds at every width,
 * in filling order. A cycle minted before its stills are published waits, and does not stop the
 * sky the published works make.
 */
export function skyWorks(indexWorks, ladder) {
  const works = [];
  const waiting = [];
  for (const work of fillingOrder(indexWorks)) {
    const rungs = lightRungs(ladder, work.id);
    if (rungs) works.push({ work, rungs });
    else waiting.push(work.id);
  }
  return { works, waiting };
}

/** Files the registry no longer names, left by an earlier build. */
export function orphans(files, registry) {
  const referenced = new Set(
    [...registry.skies, registry.grid].map((entry) => entry.src.split('/').pop()),
  );
  return files.filter((file) => file.endsWith('.webp') && !referenced.has(file));
}

export async function serializeRegistry(registry) {
  return format(
    JSON.stringify({ schemaVersion: SCHEMA_VERSION, ...registry, parameters: PARAMETERS }, null, 2),
    { parser: 'json', printWidth: 100 },
  );
}

async function rgb(path) {
  const { data, info } = await sharp(path)
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 3) throw new Error(`${path} is not RGB`);
  return { pixels: data, width: info.width, height: info.height };
}

/** Write bytes under a content address beside the venue's other derived art. */
async function publish(bytes, name) {
  const sha256 = hashBytes(bytes);
  const src = `/art/light/${name}-${sha256.slice(0, 16)}.webp`;
  const destination = resolve(publicRoot, `.${src}`);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes);
  await publishContentAddressed(temporary, destination, sha256).catch(async (failure) => {
    await rm(temporary, { force: true });
    throw failure;
  });
  return { src, sha256, bytes: bytes.length };
}

async function main() {
  await withLock(`${registryPath}.lock`, async () => {
    const started = performance.now();
    const ladder = JSON.parse(await readFile(ladderPath, 'utf8'));
    const index = JSON.parse(await readFile(indexPath, 'utf8'));
    const previous = await readRegistry(registryPath, SCHEMA_VERSION, 'works');
    const { works, waiting } = skyWorks(index.works, ladder);
    if (!works.length) throw new Error('No indexed work has a Light still at every width');
    if (waiting.length) log(`Waiting for their Light stills: ${waiting.join(', ')}`);
    // Every rung is read from disk and checked against the ladder's hash before it adds light.
    for (const { rungs } of works)
      for (const rung of Object.values(rungs)) {
        const actual = await hashFile(resolve(publicRoot, `.${rung.src}`));
        if (actual !== rung.sha256) throw new Error(`${rung.src} does not match its hash`);
      }
    const cycles = [...new Set(works.map(({ work }) => work.cycle))];
    const skies = [];
    let grid = null;
    const [columns, rows] = PARAMETERS.grid;
    for (const width of PARAMETERS.widths) {
      let sum = null;
      let size = null;
      const tiles = [];
      for (const [k, { work, rungs }] of works.entries()) {
        const still = await rgb(resolve(publicRoot, `.${rungs[width].src}`));
        size ??= { width: still.width, height: still.height };
        if (still.width !== size.width || still.height !== size.height)
          throw new Error(`Signature ${work.id}'s ${width} rung differs in size`);
        sum ??= new Float64Array(still.pixels.length);
        addLight(sum, still.pixels);
        if (width === 1280) tiles.push(brightnessGrid(still.pixels, still.width, still.height));
        const last = k === works.length - 1 || works[k + 1].work.cycle !== work.cycle;
        if (!last) continue;
        const bytes = await sharp(Buffer.from(exposeSky(sum)), {
          raw: { width: size.width, height: size.height, channels: 3 },
        })
          .webp({ quality: PARAMETERS.quality, effort: 6, smartSubsample: true })
          .toBuffer();
        const upTo = work.cycle;
        const published = await publish(bytes, `sky-${upTo}-${width}`);
        skies.push({ upTo, width: size.width, height: size.height, ...published });
        log(`The sky through cycle ${upTo} at ${width}: ${published.bytes} bytes`);
      }
      if (width === 1280) {
        // One tile per work, eight across, in the order the sky is filled.
        const across = 8;
        const down = Math.ceil(tiles.length / across);
        const atlas = new Uint8Array(across * columns * down * rows);
        tiles.forEach((tile, n) => {
          const ox = (n % across) * columns;
          const oy = Math.floor(n / across) * rows;
          for (let row = 0; row < rows; row++)
            atlas.set(
              tile.subarray(row * columns, (row + 1) * columns),
              (oy + row) * across * columns + ox,
            );
        });
        const bytes = await sharp(Buffer.from(atlas), {
          raw: { width: across * columns, height: down * rows, channels: 1 },
        })
          .webp({ lossless: true, effort: 6 })
          .toBuffer();
        grid = { ...(await publish(bytes, 'grid')), across, columns, rows };
      }
    }
    const registry = {
      builtOn: new Date().toISOString().slice(0, 10),
      works: works.map(({ work, rungs }) => ({
        id: work.id,
        cycle: work.cycle,
        rungs: Object.fromEntries(
          Object.entries(rungs).map(([width, rung]) => [
            width,
            { src: rung.src, sha256: rung.sha256 },
          ]),
        ),
      })),
      cycles,
      skies,
      grid,
    };
    // Unchanged sources keep the previous date, so a rebuild leaves the file byte-identical.
    if (
      JSON.stringify({
        ...previous,
        builtOn: undefined,
        schemaVersion: undefined,
        parameters: undefined,
      }) === JSON.stringify({ ...registry, builtOn: undefined })
    )
      registry.builtOn = previous.builtOn;
    await writeAtomically(registryPath, await serializeRegistry(registry));
    for (const file of orphans(await readdir(outputDirectory), registry)) {
      await rm(resolve(outputDirectory, file));
      log(`Removed orphaned file ${file}`);
    }
    log(
      `All the light: ${works.length} Light stills, ${skies.length} skies and one naming grid in ` +
        `${((performance.now() - started) / 1000).toFixed(1)} s.`,
    );
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
