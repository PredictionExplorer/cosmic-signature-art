import { Buffer } from 'node:buffer';
import { log, error } from 'node:console';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import sharp from 'sharp';
import {
  ORIGIN,
  collection,
  eachConcurrently,
  hashBytes,
  manifest,
  parseRequestedIds,
  readRegistry,
  seedPackageUrl,
  uniqueAsset,
  withLock,
  writeAtomically,
} from './lib/origin.mjs';

/**
 * Sweep spans: where each work's spectral sweep travels, so the Wavelength lens can say which
 * wavelength a frame of the published film holds.
 *
 * The generator sweeps only the part of its 64 five-nanometre bins (380 to 700 nm) that the
 * render put light in: from the first bin with any light to the last, each widened by two and
 * clamped to the spectrum (BinBuffers::active_bin_range in CS-Image-Generation's
 * src/render/spectral_output.rs). Seventeen of the first seventy-two works sweep a narrower band
 * than the whole spectrum. The span itself is not published, but the bins are: the
 * spectral_bins image set holds one 16-bit PNG per bin, each normalised to its own brightest
 * pixel, so a bin without light is an all-zero image and a bin with light is not.
 *
 * Each bin is read by its size first. Anything larger than LIT_BYTES holds light (the all-zero
 * bin is 50,531 bytes); anything smaller is read whole and decoded, unless its bytes are a dark
 * bin already decoded here. Each span binds to the token, its seed and the hash of the sweep
 * film the manifest names, so a re-rendered film can never be read with a stale span.
 */
const USAGE = 'Usage: node scripts/build-sweep-spans.mjs [tokenId ...]';
const registryPath = fileURLToPath(new URL('../src/lib/art/sweep-spans.json', import.meta.url));
export const SCHEMA_VERSION = 1;
export const BINS = 64;
/** active_bin_range's PAD, and SWEEP_BIN_START..=SWEEP_BIN_END when no bin has light. */
export const PAD = 2;
export const FALLBACK = { start: 4, end: 59 };
/** A bin larger than this cannot be dark; a smaller one is decoded to be sure. */
export const LIT_BYTES = 512 * 1024;
const SWEEP = ['spectral_sweep_web', 'videos/web/spectral_sweep.mp4', 'video'];
const ATTEMPTS = 4;
const { fetch, AbortSignal } = globalThis;

/**
 * The generator's name for a bin's PNG, `{bin:02}_{wavelength:.0}nm.png`: Rust rounds a
 * printed tie to even, so 382.5 nm is written 382 and 387.5 nm is written 388.
 */
export function binFileName(bin) {
  if (!Number.isInteger(bin) || bin < 0 || bin >= BINS) throw new Error(`No bin ${bin}`);
  const nm = 380 + ((bin + 0.5) * 320) / BINS;
  const floor = Math.floor(nm);
  const whole = nm - floor === 0.5 ? (floor % 2 === 0 ? floor : floor + 1) : Math.round(nm);
  return `${String(bin).padStart(2, '0')}_${whole}nm.png`;
}

/** active_bin_range, from the first and last bins with light (null when none has any). */
export function spanOf(firstLit, lastLit) {
  if (firstLit === null || lastLit === null) return { ...FALLBACK };
  if (!(Number.isInteger(firstLit) && Number.isInteger(lastLit) && firstLit <= lastLit))
    throw new Error('The lit bins are out of order');
  return { start: Math.max(0, firstLit - PAD), end: Math.min(BINS - 1, lastLit + PAD) };
}

export function spanEntry({ id, seed, sweepSha256, firstLit, lastLit }) {
  return { id, seed, sweepSha256, firstLit, lastLit, ...spanOf(firstLit, lastLit) };
}

/** Re-running on unchanged bins keeps the previous date, so the file stays byte-identical. */
export function decideMeasuredOn(previous, previousSpans, nextSpans, today) {
  const same = JSON.stringify(previousSpans) === JSON.stringify(nextSpans);
  return same && typeof previous === 'string' ? previous : today;
}

export function serializeSpans({ measuredOn, spans }) {
  return format(
    JSON.stringify(
      {
        schemaVersion: SCHEMA_VERSION,
        measuredOn,
        parameters: { bins: BINS, pad: PAD, fallback: FALLBACK, litBytes: LIT_BYTES },
        spans,
      },
      null,
      2,
    ),
    { parser: 'json', printWidth: 100 },
  );
}

/**
 * Whether a decoded bin has any light at all, read at its own 16 bits: without the rgb16
 * colourspace the decoder would round to 8 bits first and lose the faintest samples.
 */
export async function decodedLit(bytes) {
  const { data } = await sharp(bytes, { limitInputPixels: 50_000_000 })
    .toColourspace('rgb16')
    .raw({ depth: 'ushort' })
    .toBuffer({ resolveWithObject: true });
  // Any non-zero byte is a non-zero sample, whatever the byte order.
  for (let index = 0; index < data.length; index += 1) if (data[index] !== 0) return true;
  return false;
}

async function request(url, init) {
  if (!url.startsWith(`${ORIGIN}/`)) throw new Error(`Refusing to read outside ${ORIGIN}`);
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      });
      if ((response.status === 429 || response.status >= 500) && attempt < ATTEMPTS) {
        await response.body?.cancel();
        await delay(1000 * 2 ** attempt);
        continue;
      }
      return response;
    } catch (failure) {
      if (attempt >= ATTEMPTS) throw failure;
      await delay(1000 * 2 ** attempt);
    }
  }
}

/** Reads a work's bins, one at a time, deciding whether each holds light. */
function binReader(seed, darkHashes) {
  return async (bin) => {
    const url = seedPackageUrl(seed, `spectral/${binFileName(bin)}`);
    const head = await request(url, { method: 'HEAD' });
    if (!head.ok) throw new Error(`Bin ${bin} is unavailable (${head.status})`);
    const size = Number(head.headers.get('content-length'));
    if (!Number.isSafeInteger(size) || size <= 0) throw new Error(`Bin ${bin} has no size`);
    if (size > LIT_BYTES) return true;
    const response = await request(url, { headers: { 'accept-encoding': 'identity' } });
    if (!response.ok) throw new Error(`Bin ${bin} could not be read (${response.status})`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== size) throw new Error(`Bin ${bin} changed while it was read`);
    const sha256 = hashBytes(bytes);
    if (darkHashes.has(sha256)) return false;
    if (await decodedLit(bytes)) return true;
    darkHashes.add(sha256);
    return false;
  };
}

/** The first and last bins with light, read from either end of the spectrum inward. */
export async function litBins(isLit) {
  let firstLit = null;
  for (let bin = 0; bin < BINS; bin += 1) {
    if (await isLit(bin)) {
      firstLit = bin;
      break;
    }
  }
  if (firstLit === null) return { firstLit: null, lastLit: null };
  let lastLit = firstLit;
  for (let bin = BINS - 1; bin > firstLit; bin -= 1) {
    if (await isLit(bin)) {
      lastLit = bin;
      break;
    }
  }
  return { firstLit, lastLit };
}

async function measure(work, darkHashes) {
  const document = await manifest(work.seed);
  const sweep = uniqueAsset(document, ...SWEEP);
  const bins = document.assets.filter((asset) => asset.role === 'spectral_bins');
  if (!sweep) return { skipped: 'no spectral sweep' };
  if (
    bins.length !== 1 ||
    bins[0].path !== 'spectral/' ||
    bins[0].kind !== 'image_set' ||
    bins[0].file_count !== BINS
  )
    return { skipped: 'no spectral bins' };
  const lit = await litBins(binReader(work.seed, darkHashes));
  return { entry: spanEntry({ id: work.id, seed: work.seed, sweepSha256: sweep.sha256, ...lit }) };
}

async function main() {
  const requested = parseRequestedIds(process.argv.slice(2), USAGE);
  await withLock(`${registryPath}.lock`, async () => {
    const previous = await readRegistry(registryPath, SCHEMA_VERSION, 'spans');
    const works = (await collection()).filter(
      (work) => !requested.length || requested.includes(work.id),
    );
    log(`Reading the spectral bins of ${works.length} works…`);
    const started = performance.now();
    const darkHashes = new Set();
    const measured = new Map();
    const failures = await eachConcurrently(works, 6, async (work) => {
      const result = await measure(work, darkHashes);
      if (result.skipped) log(`Signature ${work.id}: ${result.skipped}`);
      else measured.set(work.id, result.entry);
    });
    for (const { item, failure } of failures) error(`Signature ${item.id}: ${failure.message}`);
    if (failures.length) throw new Error(`${failures.length} work(s) failed; nothing was written`);
    const kept = previous.spans.filter(
      (entry) => requested.length && !requested.includes(entry.id) && !measured.has(entry.id),
    );
    const spans = [...kept, ...measured.values()].sort((a, b) => a.id - b.id);
    const measuredOn = decideMeasuredOn(
      previous.measuredOn,
      previous.spans,
      spans,
      new Date().toISOString().slice(0, 10),
    );
    await writeAtomically(registryPath, await serializeSpans({ measuredOn, spans }));
    const narrow = spans.filter((entry) => entry.start > 0 || entry.end < BINS - 1).length;
    log(
      `${spans.length} sweep spans (${narrow} narrower than the spectrum) in ` +
        `${((performance.now() - started) / 1000).toFixed(1)} s; measured on ${measuredOn}.`,
    );
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
