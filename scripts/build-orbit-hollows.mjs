import { log, error } from 'node:console';
import { readFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import {
  SHA256,
  parseRequestedIds,
  readRegistry,
  withLock,
  writeAtomically,
} from './lib/origin.mjs';
import { overWorkers } from './lib/orbit-verify.mjs';
import { BODY_RADIUS, HOLLOW, bearsOut, inOwnHollow } from './lib/ink-hollows.mjs';
import { plateFrameOf } from './build-orbit-frames.mjs';

/**
 * Orbit hollows: where each body came to rest on its work's Ink still, so that the orbit section
 * can draw the orbit on the Ink plate as well as on the Light (third-physics-phase-d.md §7).
 *
 * The Ink edition stirs its sumi with the bodies where the Light film draws the heads of their
 * trails, so a work's frame (src/lib/art/orbit-frames.json) places them on the Ink sheet too. For
 * every framed work the window is replayed from its verified first step (orbit-windows.json) in
 * its frame, to the step the still shows, the window's last, and the primary copy's three bodies
 * are placed on the still. A body holds no ink, so each leaves a hollow where it stood: the Ink
 * still's 1,920 px rung, read only when its bytes are the ones the still ladder recorded, is
 * searched for it (scripts/lib/ink-hollows.mjs). The registry is written only when every work's
 * still bears its bodies out, and each entry binds to the frame's film and the Ink still's hash.
 */
const USAGE = 'Usage: npm run art:hollows -- [tokenId ...]';
const art = (name) => fileURLToPath(new URL(`../src/lib/art/${name}`, import.meta.url));
const registryPath = art('orbit-hollows.json');
const publicRoot = fileURLToPath(new URL('../public', import.meta.url));
export const SCHEMA_VERSION = 1;

export const PARAMETERS = Object.freeze({
  /** The Ink still's rung that is read, from the still ladder. */
  rungWidth: 1920,
  bodyRadius: BODY_RADIUS,
  hollow: HOLLOW,
});

const hundredth = (value) => Math.round(value * 100) / 100;

/** The registry entry: what it binds to, where each body stands, and the hollow it stands in. */
export function hollowEntry(frameEntry, rung, reply) {
  return {
    id: frameEntry.id,
    seed: frameEntry.seed,
    traitsSha256: frameEntry.traitsSha256,
    filmSha256: frameEntry.film.sha256,
    ink: {
      stillSha256: rung.stillSha256,
      rung: { src: rung.src, sha256: rung.sha256 },
    },
    step: reply.step,
    bodies: reply.bodies.map(({ x, y, paper, hollow }) => ({
      x: hundredth(x),
      y: hundredth(y),
      paper,
      hollow,
    })),
  };
}

/** Why a work's Ink still does not bear its bodies out, or nothing. */
export function refusal(reply) {
  if (reply.failure) return reply.failure;
  if (!reply.bodies.every((body) => body.paper))
    return 'a body stands on ink, which a body never holds';
  if (!bearsOut(reply.bodies)) return 'no body stands in a hollow of its own';
  return null;
}

/** A stored entry and a measured one agree when their bindings match and every measure is near. */
export function settle(previous, next) {
  if (!previous) return next;
  const labels = (entry) =>
    JSON.stringify([
      entry.id,
      entry.seed,
      entry.traitsSha256,
      entry.filmSha256,
      entry.ink,
      entry.step,
      entry.bodies.map((body) => [body.paper, body.hollow === null]),
    ]);
  const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;
  const same =
    labels(previous) === labels(next) &&
    previous.bodies.every((body, index) => {
      const other = next.bodies[index];
      return (
        near(body.x, other.x, 0.011) &&
        near(body.y, other.y, 0.011) &&
        (body.hollow === null ||
          (near(body.hollow.offset, other.hollow.offset, 1e-3) &&
            near(body.hollow.radius, other.hollow.radius, 1e-3)))
      );
    });
  return same ? previous : next;
}

export function mergeHollows(existing, measured) {
  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  for (const entry of measured) byId.set(entry.id, entry);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/** Re-running on unchanged sources keeps the previous date, so the file stays byte-identical. */
export function decideDerivedOn(previous, previousEntries, nextEntries, today) {
  return JSON.stringify(previousEntries) === JSON.stringify(nextEntries) &&
    typeof previous === 'string'
    ? previous
    : today;
}

export function serializeHollows({ derivedOn, hollows }) {
  return format(
    JSON.stringify(
      { schemaVersion: SCHEMA_VERSION, derivedOn, parameters: PARAMETERS, hollows },
      null,
      2,
    ),
    { parser: 'json', printWidth: 100 },
  );
}

/** The jobs for the given frames: each work's window, frame and Ink rung, all checked for shape. */
export function hollowJobs(frames, records, windows, rungs) {
  return frames.map((entry) => {
    const record = records.find((candidate) => candidate.id === entry.id);
    const window = windows.find((candidate) => candidate.id === entry.id);
    if (!record || record.seed !== entry.seed || record.traitsSha256 !== entry.traitsSha256)
      throw new Error(`Signature ${entry.id}: the frame is not the orbit record's`);
    if (!window || window.seed !== record.seed || window.traitsSha256 !== record.traitsSha256)
      throw new Error(`Signature ${entry.id}: no window; run npm run art:windows first`);
    const rung = rungs.find(
      (candidate) =>
        candidate.id === entry.id &&
        candidate.expression === 'ink' &&
        candidate.width === PARAMETERS.rungWidth,
    );
    if (!rung || !SHA256.test(rung.sha256) || !SHA256.test(rung.stillSha256 ?? ''))
      throw new Error(`Signature ${entry.id}: no Ink rung; run npm run art:ladder first`);
    const numbers = (values) => values.map(Number);
    return {
      id: entry.id,
      start: {
        masses: numbers(record.physics.masses),
        dt: Number(record.generation.dt),
        steps: record.generation.steps,
        positions: numbers(window.positions),
        velocities: numbers(window.velocities),
      },
      frame: plateFrameOf(entry),
      rung: { ...rung, path: resolve(publicRoot, `.${rung.src}`) },
    };
  });
}

/** Measure the bodies at rest on their Ink stills in worker threads, one work at a time each. */
export function measureHollows(jobs, options) {
  return overWorkers(
    jobs,
    new URL('./lib/orbit-hollow-worker.mjs', import.meta.url),
    ({ id, start, frame, rung }) => ({ id, start, frame, rung }),
    { width: Math.min(availableParallelism(), 6), ...options },
  );
}

async function main() {
  const requestedIds = parseRequestedIds(process.argv.slice(2), USAGE);
  await withLock(`${registryPath}.lock`, async () => {
    const read = async (name) => JSON.parse(await readFile(art(name), 'utf8'));
    const { frames } = await read('orbit-frames.json');
    const { records } = await read('orbit-records.json');
    const { windows } = await read('orbit-windows.json');
    const { rungs } = await read('still-ladder.json');
    const registry = await readRegistry(registryPath, SCHEMA_VERSION, 'hollows');
    const selected = requestedIds.length
      ? frames.filter((entry) => requestedIds.includes(entry.id))
      : frames;
    if (requestedIds.some((id) => !selected.some((entry) => entry.id === id)))
      throw new Error('Requested token has no frame; run npm run art:frames first');
    const sameParameters = JSON.stringify(registry.parameters) === JSON.stringify(PARAMETERS);
    if (!sameParameters && requestedIds.length && registry.hollows.length)
      throw new Error('The parameters changed since the last build; rebuild every work');

    const jobs = hollowJobs(selected, records, windows, rungs);
    log(`Placing ${jobs.length} works' bodies on their Ink stills…`);
    const started = performance.now();
    const replies = await measureHollows(jobs, {
      onResult: (reply) =>
        log(
          reply.failure
            ? `Signature ${reply.id}: ${reply.failure}`
            : `Signature ${reply.id}: ` +
                reply.bodies
                  .map((body) =>
                    !body.paper
                      ? 'on ink'
                      : body.hollow
                        ? `${inOwnHollow(body) ? 'its hollow' : 'a hollow'} (${body.hollow.offset} off, ${body.hollow.radius} wide)`
                        : 'open paper',
                  )
                  .join(' · '),
        ),
    });
    const refused = replies.flatMap((reply) => {
      const reason = refusal(reply);
      return reason ? [{ id: reply.id, reason }] : [];
    });
    for (const { id, reason } of refused) error(`Signature ${id}: ${reason}`);
    if (refused.length)
      throw new Error(
        `${refused.length} Ink still(s) do not bear out their bodies; the registry was not written`,
      );

    const stored = new Map(registry.hollows.map((entry) => [entry.id, entry]));
    const measured = replies.map((reply) => {
      const job = jobs.find((candidate) => candidate.id === reply.id);
      const entry = hollowEntry(
        selected.find((candidate) => candidate.id === reply.id),
        job.rung,
        reply,
      );
      return settle(stored.get(entry.id), entry);
    });
    const hollows = requestedIds.length ? mergeHollows(registry.hollows, measured) : measured;
    const derivedOn = decideDerivedOn(
      registry.derivedOn,
      registry.hollows,
      hollows,
      new Date().toISOString().slice(0, 10),
    );
    await writeAtomically(registryPath, await serializeHollows({ derivedOn, hollows }));
    const own = hollows.reduce(
      (count, entry) => count + entry.bodies.filter((body) => inOwnHollow(body)).length,
      0,
    );
    log(
      `${hollows.length} Ink stills bear out their bodies (${own} of ${hollows.length * 3} in a hollow of their own), in ${((performance.now() - started) / 1000).toFixed(1)} s; derived on ${derivedOn}.`,
    );
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
