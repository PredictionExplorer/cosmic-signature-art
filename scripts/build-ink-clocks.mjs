import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { log, error } from 'node:console';
import { readFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import {
  SHA256,
  cachedAsset,
  command,
  hashFile,
  jsonDocument,
  manifest,
  parseRequestedIds,
  readRegistry,
  seedPackagePath,
  uniqueAsset,
  withLock,
  writeAtomically,
} from './lib/origin.mjs';
import { overWorkers } from './lib/orbit-verify.mjs';
import { BODY_RADIUS } from './lib/ink-hollows.mjs';
import { decimal } from './build-orbit-records.mjs';
import { orbitWindowOf } from './build-orbit-windows.mjs';
import { plateFrameOf } from './build-orbit-frames.mjs';

const { inkFilmFirstInked, inkFilmSchedule, inkFluidTime } =
  await import('../src/lib/physics/ink-film.ts');
const { LIGHT_FILM } = await import('../src/lib/physics/light-film.ts');

/**
 * Ink clocks: each work's complete Ink film on its own map from step to time, so the orbit's
 * score can drive the Ink film's transport as it drives the Light film's
 * (third-physics-phase-e.md §6).
 *
 * The generator renders the Ink (ember) edition's film on exactly the Light film's checkpoints,
 * one frame each at 60 fps (CS-Image-Generation app::ember_frame_schedule); its bodies stir the
 * water from the window's first step but lay no ink before the fluid time `pre_roll`, so the film
 * opens on bare paper (src/lib/physics/ink-film.ts). For every indexed work:
 *
 * - **The certificate.** The work's published Ink certificate (metadata/ember.json) is read, and
 *   its own record of the film checked against the clock re-derived here: the schedule's digest,
 *   length, first and last steps and rate must be the Light film's checkpoints'; the first inked
 *   frame is derived from the certificate's duration and pre-roll, and must stand where the
 *   generator started each slow film, six frames before the interval in which the ink begins.
 * - **The film.** The published film is decoded once, whole, through the verified cache, at its
 *   own size, and measured against the bodies' places at the step each frame shows
 *   (scripts/lib/ink-clock-measure.mjs): bare paper before the first inked frame and ink on it,
 *   all of it beside the bodies; no body's place ever on ink; the hollows each body travels in
 *   following its track at the clock's frames; no frame repeated.
 * - **What the venue plays.** Every derivative the plate may play in its place (the settling and
 *   opening clips, a local complete film) is matched frame by frame with the film's frames the
 *   clock says it holds; only those whose every frame keeps its place carry the score.
 *
 * The registry is written only when every work's film keeps its clock. Each entry binds to the
 * orbit record, the certificate and the films by hash; the venue draws the Ink score only on a
 * film the entry names.
 */
const USAGE = 'Usage: npm run art:ink -- [tokenId ...]';
const art = (name) => fileURLToPath(new URL(`../src/lib/art/${name}`, import.meta.url));
const registryPath = art('ink-clocks.json');
const publicRoot = fileURLToPath(new URL('../public', import.meta.url));
export const SCHEMA_VERSION = 1;
const CERTIFICATE_PATH = 'metadata/ember.json';
/** The generator starts its slow films this many scheduled frames before the inking interval. */
const SLOW_FILM_LEAD_FRAMES = 6;

export const PARAMETERS = Object.freeze({
  /** The published film is decoded at every one of its 60 frames a second, at its own size. */
  fps: LIGHT_FILM.fps,
  /** Ink: darker than the first frame, which is bare paper, by this many grey levels. */
  ink: 64,
  /** Paper: no more than this many levels below bare paper's own. */
  paperMargin: 18,
  /** The Ink edition's body, as a share of the sheet's height (scripts/lib/ink-hollows.mjs). */
  bodyRadius: BODY_RADIUS,
  /**
   * The first ink lies within this many radii of the path a body took since the pre-roll ended:
   * the most stretched body's soak zone reaches 2.33 (√3 radii, and the soak depth of 0.6), and
   * the water carries fresh ink a little further within the frame.
   */
  firstInkReach: 3,
  /** A hollow is looked for within this many radii, and is a body's size between these, as a disc. */
  hollow: Object.freeze({ reach: 2, radius: Object.freeze([0.8, 1.6]) }),
  /** The frames either side of its own that each hollow is compared with. */
  offsets: 3,
  /** A derivative's frames are compared at this size; one keeps its place within this many levels. */
  derivatives: Object.freeze({ width: 320, height: 207, tolerance: 0.05 }),
  accept: Object.freeze({
    /** The hollows measured, at least, for their timing to mean anything. */
    hollows: 200,
    /** Their median place along the track lies within this many frames of the clock's. */
    offset: 0.25,
  }),
});

/** The certificate's digest of a schedule: its steps as little-endian 64-bit integers. */
export function scheduleSha256(schedule) {
  const bytes = Buffer.alloc(schedule.length * 8);
  schedule.forEach((step, index) => bytes.writeBigUInt64LE(BigInt(step), index * 8));
  return createHash('sha256').update(bytes).digest('hex');
}

const finite = (value, name) => {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`${name} is not a number`);
  return value;
};
const count = (value, name) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} is not a count`);
  return value;
};

/**
 * The Ink film's clock as its certificate records it, checked against the clock re-derived here:
 * the schedule, the first inked frame, and the slow films that start before it. A certificate
 * of another work, of another window, or whose film is not on the Light film's checkpoints is a
 * refusal, never a guess.
 */
export function certificateClock(certificate, { seed, steps }) {
  const { inputs, config, derived, outputs } = certificate ?? {};
  if (certificate?.edition !== 'ember' || certificate.schema_version !== 5)
    throw new Error('the certificate is not an Ink certificate of schema 5');
  if (typeof certificate.algorithm !== 'string' || !/^ember-v\d+$/.test(certificate.algorithm))
    throw new Error('the certificate names no Ink algorithm');
  if (`0x${inputs?.seed}` !== seed) throw new Error('the certificate is another work’s');
  if (inputs.steps !== steps) throw new Error(`the certificate's window is not ${steps} steps`);
  const schedule = inkFilmSchedule(steps);
  const frames = inputs.frames ?? {};
  const sha256 = scheduleSha256(schedule);
  if (
    frames.count !== schedule.length ||
    frames.first_step !== schedule[0] ||
    frames.last_step !== schedule.at(-1) ||
    frames.frame_rate !== LIGHT_FILM.fps ||
    frames.sha256 !== sha256
  )
    throw new Error('the certificate’s film is not on the Light film’s checkpoints');
  if (outputs?.frames_emitted !== schedule.length)
    throw new Error('the certificate’s film is not every scheduled frame');
  const duration = finite(derived?.duration, 'the duration');
  const preRoll = finite(config?.contact?.pre_roll, 'the pre-roll');
  const valveLead = finite(config?.contact?.valve_lead, 'the valve lead');
  if (!(duration > 0) || !(preRoll >= 0) || derived.valve_time !== duration - valveLead)
    throw new Error('the certificate’s times do not agree');
  const firstInked = inkFilmFirstInked(steps, duration, preRoll);
  const slowFilms = Array.isArray(outputs.slow_films) ? outputs.slow_films : [];
  const lead = Math.max(firstInked - SLOW_FILM_LEAD_FRAMES - 1, 0);
  for (const film of slowFilms) {
    const factor = count(film.factor, 'a slow film’s factor');
    if (
      count(film.first_frame, 'a slow film’s first frame') !== lead ||
      film.frames_emitted !== (schedule.length - 1 - lead) * factor + 1
    )
      throw new Error(
        `the slow films do not start ${SLOW_FILM_LEAD_FRAMES + 1} frames before frame ${firstInked}`,
      );
  }
  return {
    algorithm: certificate.algorithm,
    steps,
    frames: schedule.length,
    scheduleSha256: sha256,
    duration,
    preRoll,
    valveLead,
    firstInked,
    slowFilms: slowFilms.length,
  };
}

/** The first step whose fluid time reaches the pre-roll: no ink is laid before it. */
export function firstInkingStep({ steps, duration, preRoll }) {
  const guess = Math.floor((preRoll / duration) * (steps - 1)) - 2;
  let step = Math.min(steps - 1, Math.max(0, guess));
  while (step < steps - 1 && inkFluidTime(step, steps, duration) < preRoll) step += 1;
  while (step > 0 && inkFluidTime(step - 1, steps, duration) >= preRoll) step -= 1;
  return step;
}

/** Why a work's Ink film does not keep its clock, or nothing. */
export function refusal(reply, clock, accept = PARAMETERS.accept) {
  if (reply.failure) return reply.failure;
  const { firstInked } = clock;
  if (reply.frames !== clock.frames)
    return `the film has ${reply.frames} frames, not its schedule’s ${clock.frames}`;
  if (reply.preRoll.inkedBefore > 0) return `ink shows before frame ${firstInked}`;
  if (reply.preRoll.firstInk === 0) return `no ink shows at frame ${firstInked}`;
  if (reply.preRoll.beside !== reply.preRoll.firstInk)
    return `${reply.preRoll.firstInk - reply.preRoll.beside} pixels of the first ink lie away from the bodies`;
  if (reply.bodies.onInk > 0)
    return `${reply.bodies.onInk} of the bodies’ places lie on ink, which a body never holds`;
  if (reply.hollows.measured < accept.hollows)
    return `only ${reply.hollows.measured} hollows were measured`;
  const middle = (reply.hollows.distance.length - 1) / 2;
  const [before, own, after] = reply.hollows.distance.slice(middle - 1, middle + 2);
  if (!(own < before && own < after)) return 'the hollows follow the bodies better a frame away';
  if (!(Math.abs(reply.hollows.offset) <= accept.offset))
    return `the hollows follow the bodies ${reply.hollows.offset} frames from the clock`;
  if (reply.repeats > 0) return `${reply.repeats} frames repeat the frame before`;
  for (const derivative of reply.derivatives)
    if (derivative.displaced > 0)
      return `${derivative.displaced} frames of ${derivative.sha256.slice(0, 12)}… are not the film’s frames the clock says`;
  return null;
}

const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places;

/** The registry entry: what it binds to, the clock, and how the film met it. */
export function clockEntry(record, certificate, film, clock, derivatives, reply) {
  const middle = (reply.hollows.distance.length - 1) / 2;
  return {
    id: record.id,
    seed: record.seed,
    traitsSha256: record.traitsSha256,
    certificate: { sha256: certificate.sha256, algorithm: clock.algorithm },
    steps: clock.steps,
    frames: clock.frames,
    scheduleSha256: clock.scheduleSha256,
    duration: decimal(clock.duration),
    preRoll: decimal(clock.preRoll),
    valveLead: decimal(clock.valveLead),
    firstInked: clock.firstInked,
    film: { sha256: film.sha256, bytes: film.bytes },
    derivatives: derivatives.map(({ kind, src, sha256, start, every, frames }) => ({
      kind,
      src,
      sha256,
      start,
      every,
      frames,
    })),
    measured: {
      firstInk: reply.preRoll.firstInk,
      farthest: round(reply.preRoll.farthest, 2),
      bodies: reply.bodies.placed,
      hollows: reply.hollows.measured,
      offset: round(reply.hollows.offset, 3),
      distance: reply.hollows.distance
        .slice(middle - 1, middle + 2)
        .map((value) => round(value, 2)),
    },
  };
}

/** A stored entry and a measured one agree when every binding matches and every measure is near. */
export function settle(previous, next) {
  if (!previous) return next;
  const { measured: a, ...bindingsA } = previous;
  const { measured: b, ...bindingsB } = next;
  const near = (x, y, tolerance) => Math.abs(x - y) <= tolerance;
  const same =
    JSON.stringify(bindingsA) === JSON.stringify(bindingsB) &&
    a.firstInk === b.firstInk &&
    near(a.farthest, b.farthest, 0.011) &&
    a.bodies === b.bodies &&
    near(a.hollows, b.hollows, 2) &&
    near(a.offset, b.offset, 0.002) &&
    a.distance.every((value, index) => near(value, b.distance[index], 0.02));
  return same ? previous : next;
}

export function mergeClocks(existing, measured) {
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

export function serializeClocks({ derivedOn, clocks }) {
  return format(
    JSON.stringify(
      { schemaVersion: SCHEMA_VERSION, derivedOn, parameters: PARAMETERS, clocks },
      null,
      2,
    ),
    { parser: 'json', printWidth: 100 },
  );
}

/** A local film's frame rate and frame count, as its container states them. */
async function probeFilm(path) {
  const output = await command('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=avg_frame_rate,nb_frames',
    '-of',
    'json',
    path,
  ]);
  const stream = JSON.parse(output).streams?.[0] ?? {};
  const [numerator, denominator] = String(stream.avg_frame_rate).split('/').map(Number);
  const fps = numerator / denominator;
  const frames = Number(stream.nb_frames);
  if (!Number.isFinite(fps) || fps <= 0 || !Number.isSafeInteger(frames) || frames <= 0)
    throw new Error(`${path} states no frame rate or frame count`);
  return { fps, frames };
}

/**
 * The derivatives of a work's Ink film that the venue may play in its place, each with the
 * film's frame it opens on and how many of the film's frames it steps per frame of its own: the
 * plate clips cut from it (plate-clips.json) and a local complete film delivered for it
 * (curated-media.json). Each is read only once its bytes are the ones recorded.
 */
export async function derivativesOf(id, film, clips, curated) {
  const found = [];
  for (const clip of clips) {
    if (clip.id !== id || clip.expression !== 'ink' || clip.sourceSha256 !== film.sha256) continue;
    const start = clip.startSeconds * LIGHT_FILM.fps;
    if (Math.abs(start - Math.round(start)) > 1e-6)
      throw new Error(`Signature ${id}: ${clip.src} does not open on a frame of the film`);
    found.push({
      kind: clip.kind,
      src: clip.src,
      sha256: clip.sha256,
      start: Math.round(start),
      every: Math.round(LIGHT_FILM.fps / clip.frameRate),
      frames: clip.frames,
      fps: clip.frameRate,
    });
  }
  const local = curated
    .find((work) => work.id === id)
    ?.media.find((item) => item.id === 'ink')?.film;
  if (local && local.sourceSha256 === film.sha256) {
    const { fps, frames } = await probeFilm(resolve(publicRoot, `.${local.src}`));
    found.push({
      kind: 'local',
      src: local.src,
      sha256: local.sha256,
      start: 0,
      every: Math.round(LIGHT_FILM.fps / fps),
      frames,
      fps,
    });
  }
  const filmFrames = Math.round(film.duration_seconds * LIGHT_FILM.fps);
  for (const derivative of found) {
    if (
      !SHA256.test(derivative.sha256 ?? '') ||
      !/^\/art\/[a-z0-9/._-]+\.mp4$/.test(derivative.src)
    )
      throw new Error(`Signature ${id}: a malformed Ink derivative`);
    // Its frames must fall on the film's: a whole number of the film's to each of its own.
    if (
      !Number.isInteger(LIGHT_FILM.fps / derivative.fps) ||
      derivative.every !== LIGHT_FILM.fps / derivative.fps ||
      derivative.start + (derivative.frames - 1) * derivative.every > filmFrames - 1
    )
      throw new Error(`Signature ${id}: ${derivative.src} does not fall on the film's frames`);
    derivative.path = resolve(publicRoot, `.${derivative.src}`);
    if ((await hashFile(derivative.path)) !== derivative.sha256)
      throw new Error(`Signature ${id}: ${derivative.src} is not the file recorded`);
  }
  return found;
}

/** Measure each work's Ink film against its clock in worker threads, one work at a time each. */
export function measureClocks(jobs, options) {
  return overWorkers(
    jobs,
    new URL('./lib/ink-clock-worker.mjs', import.meta.url),
    ({ id, start, frame, film, clock, derivatives }) => ({
      id,
      start,
      frame,
      film,
      firstInked: clock.firstInked,
      inkedFrom: firstInkingStep(clock),
      derivatives,
      parameters: PARAMETERS,
    }),
    { width: Math.min(availableParallelism(), 4), ...options },
  );
}

async function main() {
  const requestedIds = parseRequestedIds(process.argv.slice(2), USAGE);
  await withLock(`${registryPath}.lock`, async () => {
    const read = async (name) => JSON.parse(await readFile(art(name), 'utf8'));
    const { records } = await read('orbit-records.json');
    const { windows } = await read('orbit-windows.json');
    const { frames } = await read('orbit-frames.json');
    const { clips } = await read('plate-clips.json');
    const curated = await read('curated-media.json');
    const registry = await readRegistry(registryPath, SCHEMA_VERSION, 'clocks');
    const selected = requestedIds.length
      ? records.filter((record) => requestedIds.includes(record.id))
      : records;
    if (requestedIds.some((id) => !selected.some((record) => record.id === id)))
      throw new Error('Requested token has no orbit record; run npm run art:orbits first');
    const sameParameters = JSON.stringify(registry.parameters) === JSON.stringify(PARAMETERS);
    if (!sameParameters && requestedIds.length && registry.clocks.length)
      throw new Error('The parameters changed since the last build; rebuild every work');

    const jobs = [];
    for (const record of selected) {
      const window = windows.find((entry) => entry.id === record.id);
      const frame = frames.find((entry) => entry.id === record.id);
      if (!window || window.seed !== record.seed || window.traitsSha256 !== record.traitsSha256)
        throw new Error(`Signature ${record.id}: no window; run npm run art:windows first`);
      if (!frame || frame.seed !== record.seed || frame.traitsSha256 !== record.traitsSha256)
        throw new Error(`Signature ${record.id}: no frame; run npm run art:frames first`);
      const film = uniqueAsset(
        await manifest(record.seed),
        'ember_web',
        'videos/web/ember.mp4',
        'video',
      );
      if (!film) throw new Error(`Signature ${record.id}: no Ink film is published`);
      const certificate = await jsonDocument(seedPackagePath(record.seed, CERTIFICATE_PATH));
      const start = orbitWindowOf(record, window);
      const clock = certificateClock(certificate.value, { seed: record.seed, steps: start.steps });
      if (
        film.frame_rate !== LIGHT_FILM.fps ||
        Math.abs(film.duration_seconds - clock.frames / LIGHT_FILM.fps) > 1e-9
      )
        throw new Error(
          `Signature ${record.id}: the manifest's Ink film is not the schedule's length`,
        );
      jobs.push({
        id: record.id,
        record,
        certificate,
        filmAsset: film,
        clock,
        start,
        frame: plateFrameOf(frame),
        film: await cachedAsset(record.seed, film, { log }),
        derivatives: await derivativesOf(record.id, film, clips, curated),
      });
    }

    log(`Measuring ${jobs.length} Ink films against their clocks…`);
    const started = performance.now();
    const replies = await measureClocks(jobs, {
      onResult: (reply) =>
        log(
          reply.failure
            ? `Signature ${reply.id}: ${reply.failure}`
            : `Signature ${reply.id}: ink from frame ${jobs.find((job) => job.id === reply.id).clock.firstInked} ` +
                `(${reply.preRoll.inkedBefore} pixels before, ${reply.preRoll.firstInk} on it, ${reply.preRoll.beside} beside the bodies, the farthest ${reply.preRoll.farthest} radii); ` +
                `${reply.bodies.onInk} of ${reply.bodies.placed} places on ink; ${reply.hollows.measured} hollows, ` +
                `${reply.hollows.offset?.toFixed(3)} frames off, ${reply.hollows.distance.map((d) => d?.toFixed(2)).join(' / ')} px; ` +
                `${reply.derivatives.map((d) => `${d.displaced}/${d.frames}`).join(', ') || 'no derivatives'} displaced`,
        ),
    });
    const refused = replies.flatMap((reply) => {
      const reason = refusal(reply, jobs.find((job) => job.id === reply.id).clock);
      return reason ? [{ id: reply.id, reason }] : [];
    });
    for (const { id, reason } of refused) error(`Signature ${id}: ${reason}`);
    if (refused.length)
      throw new Error(
        `${refused.length} Ink film(s) do not keep their clocks; the registry was not written`,
      );

    const stored = new Map(registry.clocks.map((entry) => [entry.id, entry]));
    const measured = replies.map((reply) => {
      const job = jobs.find((candidate) => candidate.id === reply.id);
      const entry = clockEntry(
        job.record,
        job.certificate,
        job.filmAsset,
        job.clock,
        job.derivatives,
        reply,
      );
      return settle(stored.get(entry.id), entry);
    });
    const clocks = requestedIds.length ? mergeClocks(registry.clocks, measured) : measured;
    const derivedOn = decideDerivedOn(
      registry.derivedOn,
      registry.clocks,
      clocks,
      new Date().toISOString().slice(0, 10),
    );
    await writeAtomically(registryPath, await serializeClocks({ derivedOn, clocks }));
    log(
      `${clocks.length} Ink films keep their clocks, in ${((performance.now() - started) / 1000).toFixed(1)} s; derived on ${derivedOn}.`,
    );
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
