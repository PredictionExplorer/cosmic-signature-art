import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { log, error } from 'node:console';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import {
  SEED,
  SHA256,
  cachedAsset,
  hashBytes,
  jsonDocument,
  manifest,
  parseRequestedIds,
  publishContentAddressed,
  readRegistry,
  seedPackagePath,
  uniqueAsset,
  withLock,
  writeAtomically,
} from './lib/origin.mjs';
import { overWorkers } from './lib/orbit-verify.mjs';
import { decimal } from './build-orbit-records.mjs';
import { orbitWindowOf } from './build-orbit-windows.mjs';

const { frameDifferences } = await import('../src/lib/physics/frame-derivation.ts');

/**
 * Orbit frames: where each work's recorded window falls on its Light film, so the Overture's
 * bodies can draw the plate itself (third-physics.md §5.8, version 2).
 *
 * For every indexed work the frame is re-derived from the seed by
 * src/lib/physics/frame-derivation.ts, the generator's own path from the simulation to the film:
 * the projection, the best of four seeded views by the generator's proxy score, the camera's
 * elliptical drift and the fit. The trait file (bounded, hashed, and the very file the orbit
 * record was read from) checks every choice: the stacks, the symmetry, the projection, and the
 * drift's size, sweep and eccentricity to the last bit.
 *
 * Then the frame is checked against the film itself. The published Light film is decoded once,
 * through the verified cache, at 576 × 372; the frame and the three views the generator passed
 * over each replay the window in lockstep with it, and the registry is written only when, for
 * every work, the frame's bodies stand where the film gains light frame by frame, far more often
 * than any other view's. What the film gained, and when, is kept as the work's trace: a lossless
 * 576 × 372 WebP of a few kilobytes, sixteen bits a cell, one for each sixteenth of the film, so
 * Node and every browser can make the same comparison without the film (framing.ts). The traces
 * are never shown.
 *
 * Every double is kept as its shortest exact decimal: the bundler's JSON loader does not
 * round-trip every double, while Number() of the string is exact by definition.
 */
const USAGE = 'Usage: npm run art:frames -- [tokenId ...]';
const indexPath = fileURLToPath(new URL('../src/lib/art/collection-index.json', import.meta.url));
const recordsPath = fileURLToPath(new URL('../src/lib/art/orbit-records.json', import.meta.url));
const windowsPath = fileURLToPath(new URL('../src/lib/art/orbit-windows.json', import.meta.url));
const registryPath = fileURLToPath(new URL('../src/lib/art/orbit-frames.json', import.meta.url));
const publicRoot = fileURLToPath(new URL('../public', import.meta.url));
export const SCHEMA_VERSION = 1;
const TRAITS_PATH = 'metadata/nft_traits.json';

export const PARAMETERS = Object.freeze({
  /** The film is decoded at every one of its 60 frames a second. */
  fps: 60,
  trace: Object.freeze({ width: 576, height: 372, slices: 16, threshold: 2 }),
  /** Steps between the bodies placed against each frame of the film, and against the trace. */
  filmStride: 37,
  traceStride: 97,
  /**
   * A frame is the film's when its bodies stand where the film gains light in at least `film`
   * of the samples, frame by frame, and `lead` times as often as any other view's; and meet the
   * trace `traceLead` times as often as any other view's. How often the right view meets the
   * film depends on the work (chords spread their light away from the bodies, symmetry copies
   * share it out), so the views are told apart by their lead, not by a level.
   */
  accept: Object.freeze({ film: 0.25, lead: 3, traceLead: 1.5 }),
});

const finite = (value, name) => {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`${name} is not a number`);
  return value;
};
const text = (value, name) => {
  if (typeof value !== 'string' || !/^[a-z0-9_.+@]{1,120}$/.test(value))
    throw new Error(`${name} is not a label`);
  return value;
};
const size = (value, name) => {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 16_384)
    throw new Error(`${name} is not a size`);
  return value;
};

/** What the trait file states about the framing, each value checked for shape. */
export function framingTraitsOf(traits) {
  const generation = traits?.generation ?? {};
  const drift = generation.drift ?? {};
  if (typeof generation.wildcard !== 'boolean') throw new Error('wildcard is not a flag');
  if (typeof drift.enabled !== 'boolean') throw new Error('drift.enabled is not a flag');
  return {
    projection: text(generation.projection, 'projection'),
    symmetry: text(generation.symmetry, 'symmetry'),
    stack: text(generation.structure?.stack_label, 'stack'),
    preferredStack: text(generation.structure?.preferred_stack_label, 'preferred stack'),
    wildcard: generation.wildcard,
    drift: {
      enabled: drift.enabled,
      mode: text(drift.mode, 'drift.mode'),
      scale: finite(drift.scale, 'drift.scale'),
      arcFraction: finite(drift.arc_fraction, 'drift.arc_fraction'),
      eccentricity: finite(drift.orbit_eccentricity, 'drift.orbit_eccentricity'),
    },
    width: size(generation.resolution?.width, 'width'),
    height: size(generation.resolution?.height, 'height'),
  };
}

const round = (value) => Math.round(value * 10_000) / 10_000;

/** The registry entry: the inputs the trait file stated, the frame, and how it met the film. */
export function frameEntry(record, traits, derived, measured) {
  const { frame, view } = derived;
  const decimals = (values) => values.map(decimal);
  const object = (values) =>
    Object.fromEntries(Object.entries(values).map(([key, value]) => [key, decimal(value)]));
  const { config, orientation, semiMajor, semiMinor } = frame.drift;
  const others = (agreements) =>
    round(Math.max(...agreements.filter((_, k) => k !== view.candidate)));
  return {
    id: record.id,
    seed: record.seed,
    traitsSha256: record.traitsSha256,
    projection: traits.projection,
    symmetry: traits.symmetry,
    stack: traits.stack,
    preferredStack: traits.preferredStack,
    wildcard: traits.wildcard,
    width: traits.width,
    height: traits.height,
    view: {
      candidate: view.candidate,
      triple: decimals(frame.view),
      scores: decimals(view.scores),
    },
    velocityScale: decimal(frame.velocityScale),
    drift: object({ ...config, ...orientation, semiMajor, semiMinor }),
    box: object(frame.box),
    film: {
      sha256: measured.film.sha256,
      frames: measured.film.frames,
      agreement: round(measured.film.agreements[view.candidate]),
      otherViews: others(measured.film.agreements),
    },
    trace: {
      src: measured.trace.src,
      sha256: measured.trace.sha256,
      bytes: measured.trace.bytes,
      agreement: round(measured.trace.agreements[view.candidate]),
      otherViews: others(measured.trace.agreements),
    },
  };
}

/** A stored entry as framing.ts draws with it. */
export function plateFrameOf(entry) {
  const n = Number;
  const { drift } = entry;
  return {
    width: entry.width,
    height: entry.height,
    projection: entry.projection,
    velocityScale: n(entry.velocityScale),
    view: entry.view.triple.map(n),
    drift: {
      config: {
        scale: n(drift.scale),
        arcFraction: n(drift.arcFraction),
        eccentricity: n(drift.eccentricity),
      },
      orientation: {
        inclination: n(drift.inclination),
        ascendingNode: n(drift.ascendingNode),
        argumentOfPeriapsis: n(drift.argumentOfPeriapsis),
        initialMeanAnomaly: n(drift.initialMeanAnomaly),
      },
      semiMajor: n(drift.semiMajor),
      semiMinor: n(drift.semiMinor),
    },
    box: Object.fromEntries(Object.entries(entry.box).map(([key, value]) => [key, n(value)])),
    symmetry: entry.symmetry,
  };
}

/** A stored entry's trait statements, as frame-derivation.ts checks them. */
export function framingTraitsOfEntry(entry) {
  const n = Number;
  return {
    projection: entry.projection,
    symmetry: entry.symmetry,
    stack: entry.stack,
    preferredStack: entry.preferredStack,
    wildcard: entry.wildcard,
    drift: {
      enabled: true,
      mode: 'elliptical',
      scale: n(entry.drift.scale),
      arcFraction: n(entry.drift.arcFraction),
      eccentricity: n(entry.drift.eccentricity),
    },
    width: entry.width,
    height: entry.height,
  };
}

/** The record's generation as the stream needs it. */
export const generationOf = (record) => ({
  seed: record.seed,
  candidatesPerAttempt: record.generation.candidatesPerAttempt,
  weightsRandomized: record.generation.weightsRandomized,
});

/**
 * Why a measured frame is not the film's, or nothing: every choice the trait file states must
 * match, and the frame must meet the film well, and far better than the views passed over.
 */
export function refusal(reply, accept = PARAMETERS.accept) {
  if (reply.failure) return reply.failure;
  const differing = reply.checks.filter((row) => !row.exact).map((row) => row.key);
  if (differing.length) return `${differing.join(', ')} differ from the trait file`;
  const { candidate } = reply.view;
  const film = reply.film.agreements[candidate];
  const others = Math.max(...reply.film.agreements.filter((_, k) => k !== candidate));
  if (!(film >= accept.film))
    return `its bodies meet the film's new light in ${(film * 100).toFixed(1)} % of samples`;
  if (!(film >= accept.lead * others))
    return `another view meets the film nearly as well (${(others * 100).toFixed(1)} %)`;
  const trace = reply.trace.agreements[candidate];
  const traceOthers = Math.max(...reply.trace.agreements.filter((_, k) => k !== candidate));
  if (!(trace >= accept.traceLead * traceOthers))
    return `another view meets the trace nearly as well (${(traceOthers * 100).toFixed(1)} %)`;
  return null;
}

/** A stored entry as frame-derivation.ts compares frames: the frame, its view and the scores. */
export const frameRecordOf = (entry) => ({
  frame: plateFrameOf(entry),
  candidate: entry.view.candidate,
  scores: entry.view.scores.map(Number),
});

/** An agreement measured again may move by a sample or two of the tens of thousands taken. */
const AGREEMENT_TOLERANCE = 2e-4;

/**
 * The stored entry, when a rebuild frames the same work the same: the same record, film and
 * trace, every choice and draw exact, the fit within FIT_TOLERANCE (frame-derivation.ts) and the
 * agreements within a sample or two. Otherwise the rebuilt entry. Another machine's V8 rounds
 * sines and cosines apart in the last bit, so without this a rebuild there would rewrite digits
 * that mean nothing.
 */
export function settle(previous, next) {
  if (!previous) return next;
  const labels = (entry) =>
    JSON.stringify([
      entry.id,
      entry.seed,
      entry.traitsSha256,
      entry.projection,
      entry.symmetry,
      entry.stack,
      entry.preferredStack,
      entry.wildcard,
      entry.width,
      entry.height,
      entry.film.sha256,
      entry.film.frames,
      entry.trace.src,
      entry.trace.sha256,
      entry.trace.bytes,
    ]);
  const agreements = ['film', 'trace'].every((source) =>
    ['agreement', 'otherViews'].every(
      (key) => Math.abs(previous[source][key] - next[source][key]) <= AGREEMENT_TOLERANCE,
    ),
  );
  const same =
    labels(previous) === labels(next) &&
    agreements &&
    frameDifferences(frameRecordOf(previous), frameRecordOf(next)).length === 0;
  return same ? previous : next;
}

export function mergeFrames(existing, measured) {
  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  for (const entry of measured) byId.set(entry.id, entry);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/** Re-running on unchanged sources keeps the previous date, so the file stays byte-identical. */
export function decideDerivedOn(previous, previousFrames, nextFrames, today) {
  return JSON.stringify(previousFrames) === JSON.stringify(nextFrames) &&
    typeof previous === 'string'
    ? previous
    : today;
}

export function serializeFrames({ derivedOn, frames }) {
  return format(
    JSON.stringify(
      { schemaVersion: SCHEMA_VERSION, derivedOn, parameters: PARAMETERS, frames },
      null,
      2,
    ),
    { parser: 'json', printWidth: 100 },
  );
}

/** Trace files no entry names, left behind by an earlier build. */
export function orphans(files, frames) {
  const referenced = new Set(frames.map((entry) => entry.trace.src.split('/').pop()));
  return files.filter((file) => file.endsWith('.webp') && !referenced.has(file));
}

/**
 * Derive and measure frames in worker threads, one work at a time each; the replies carry the
 * frame, the trait checks, and the agreements with the film and its trace.
 */
export function measureFrames(jobs, options) {
  return overWorkers(
    jobs,
    new URL('./lib/orbit-frame-worker.mjs', import.meta.url),
    (job) => ({ ...job, parameters: PARAMETERS }),
    { width: Math.min(availableParallelism(), 6), ...options },
  );
}

async function publishTrace(id, webp) {
  const sha256 = hashBytes(webp);
  const src = `/art/traces/${id}-light-${sha256.slice(0, 16)}.webp`;
  const destination = resolve(publicRoot, `.${src}`);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await writeFile(temporary, webp);
  await publishContentAddressed(temporary, destination, sha256).catch(async (failure) => {
    await rm(temporary, { force: true });
    throw failure;
  });
  return { src, sha256, bytes: webp.length };
}

async function main() {
  const requestedIds = parseRequestedIds(process.argv.slice(2), USAGE);
  await withLock(`${registryPath}.lock`, async () => {
    const index = JSON.parse(await readFile(indexPath, 'utf8'));
    const { records } = JSON.parse(await readFile(recordsPath, 'utf8'));
    const { windows } = JSON.parse(await readFile(windowsPath, 'utf8'));
    if (index.schemaVersion !== 1 || !Array.isArray(index.works))
      throw new Error('Invalid collection index; run npm run art:index first');
    const registry = await readRegistry(registryPath, SCHEMA_VERSION, 'frames');
    const selected = requestedIds.length
      ? index.works.filter((work) => requestedIds.includes(work.id))
      : index.works;
    if (requestedIds.some((id) => !selected.some((work) => work.id === id)))
      throw new Error('Requested token is not indexed');
    const sameParameters = JSON.stringify(registry.parameters) === JSON.stringify(PARAMETERS);
    if (!sameParameters && requestedIds.length && registry.frames.length)
      throw new Error('The parameters changed since the last build; rebuild every frame');

    // The trait file the record was read from, the film, and the window, for each work.
    const jobs = [];
    const traitsById = new Map();
    for (const work of selected) {
      if (!SEED.test(work.seed ?? '')) throw new Error(`Signature ${work.id}: malformed seed`);
      const record = records.find((entry) => entry.id === work.id);
      const window = windows.find((entry) => entry.id === work.id);
      if (!record || record.seed !== work.seed)
        throw new Error(`Signature ${work.id}: no orbit record; run npm run art:orbits first`);
      if (!window || window.seed !== record.seed || window.traitsSha256 !== record.traitsSha256)
        throw new Error(`Signature ${work.id}: no window; run npm run art:windows first`);
      const document = await jsonDocument(seedPackagePath(work.seed, TRAITS_PATH));
      if (!SHA256.test(document.sha256) || document.sha256 !== record.traitsSha256)
        throw new Error(`Signature ${work.id}: the trait file changed; run npm run art:orbits`);
      const traits = framingTraitsOf(document.value);
      const film = uniqueAsset(
        await manifest(work.seed),
        'main_web',
        'videos/web/main.mp4',
        'video',
      );
      if (!film) throw new Error(`Signature ${work.id}: no Light film is published`);
      traitsById.set(work.id, { traits, film });
      jobs.push({
        id: work.id,
        generation: generationOf(record),
        start: orbitWindowOf(record, window),
        traits,
        film: await cachedAsset(work.seed, film, { log }),
      });
    }

    log(`Deriving ${jobs.length} frames and measuring them against their films…`);
    const started = performance.now();
    const replies = await measureFrames(jobs, {
      onResult: (reply) =>
        log(
          reply.failure
            ? `Signature ${reply.id}: ${reply.failure}`
            : `Signature ${reply.id}: view ${reply.view.candidate}, the film ` +
                `${reply.film.agreements.map((a) => (a * 100).toFixed(1)).join(' / ')} %, the trace ` +
                `${reply.trace.agreements.map((a) => (a * 100).toFixed(1)).join(' / ')} %`,
        ),
    });
    const refused = replies.flatMap((reply) => {
      const reason = refusal(reply);
      return reason ? [{ id: reply.id, reason }] : [];
    });
    for (const { id, reason } of refused) error(`Signature ${id}: ${reason}`);
    if (refused.length)
      throw new Error(
        `${refused.length} frame(s) are not their films'; the registry was not written`,
      );

    const measured = [];
    for (const reply of replies) {
      const record = records.find((entry) => entry.id === reply.id);
      const { traits, film } = traitsById.get(reply.id);
      const trace = await publishTrace(reply.id, Buffer.from(reply.trace.webp));
      measured.push(
        frameEntry(record, traits, reply, {
          film: {
            sha256: film.sha256,
            frames: reply.film.frames,
            agreements: reply.film.agreements,
          },
          trace: { ...trace, agreements: reply.trace.agreements },
        }),
      );
    }
    const stored = new Map(registry.frames.map((entry) => [entry.id, entry]));
    const settled = measured.map((entry) => settle(stored.get(entry.id), entry));
    const frames = requestedIds.length ? mergeFrames(registry.frames, settled) : settled;
    const derivedOn = decideDerivedOn(
      registry.derivedOn,
      registry.frames,
      frames,
      new Date().toISOString().slice(0, 10),
    );
    await writeAtomically(registryPath, await serializeFrames({ derivedOn, frames }));
    if (requestedIds.length === 0) {
      const directory = resolve(publicRoot, 'art/traces');
      for (const file of orphans(await readdir(directory), frames)) {
        await rm(resolve(directory, file));
        log(`Removed orphaned trace ${file}`);
      }
    }
    log(
      `${frames.length} frames, each its film's, in ${((performance.now() - started) / 1000).toFixed(1)} s; derived on ${derivedOn}.`,
    );
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
