import { readFile } from 'node:fs/promises';
import { log, error } from 'node:console';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import {
  eachConcurrently,
  jsonDocument,
  seedPackagePath,
  withLock,
  writeAtomically,
} from './lib/origin.mjs';
import { generationOf, overWorkers, publishedFateOf } from './lib/orbit-verify.mjs';
import { orbitWindowOf } from './build-orbit-windows.mjs';
import { plateFrameOf } from './build-orbit-frames.mjs';
import { plaitStretch, spread, yoshidaWeights } from './lib/essay-figures.mjs';

const {
  CHECK_INTERVAL,
  ENERGY_HELD_WITHIN,
  ENERGY_INTERVAL,
  G,
  HYSTERESIS,
  PAIRS,
  drawProfileAndWeights,
  energyAndMomentum,
  integrator,
  randomBodies,
  seedBytes,
  seedStream,
} = await import('../src/lib/physics/orbit.ts');
const { LIGHT_FILM, lightFilmDuration, lightFilmFrames } =
  await import('../src/lib/physics/light-film.ts');

/**
 * The essay's figures (the home's essay): every number its words state about the venue's own
 * works, re-derived here from the committed registries with the modules the page itself runs,
 * so that no figure in the essay is recalled or copied by hand.
 *
 * - **The clock and the units**, from the records and the film's own clock: the step, the
 *   warm-up, the recorded window, the horizon, and what a second of film holds.
 * - **The beginnings** of the exemplar, drawn again from its seed: the ranges the generator
 *   draws masses, places and velocities from.
 * - **The twin**, for every work, as the page's own worker follows it (src/lib/physics/twin.ts):
 *   where it parts and how fast the gap doubles; and the twin's fate by the record's own test,
 *   beside the work's.
 * - **One taken away**: each pair of bodies alone at the window's first step, by Newton's
 *   two-body solution.
 * - **The energy**, counted from the energy registry (npm run art:energy).
 * - **Past the record** (with `--beyond`): each work the record finds bound at its horizon,
 *   carried on to step 60,000,000 with the same test. Minutes of arithmetic; without the flag
 *   the figures already kept are carried over.
 * - **The Ink certificates** (with `--online`): every work's, read from the publisher and held
 *   to the hash the Ink clock registry recorded for it; the settings every work shares are
 *   refused if one work's differ. Without the flag the figures already kept are carried over.
 *
 * The file is read by the essay's own tests; nothing in it is compared with a published record,
 * because the record publishes none of these.
 */
const art = (name) => fileURLToPath(new URL(`../src/lib/art/${name}`, import.meta.url));
const figuresPath = art('essay-figures.json');
export const SCHEMA_VERSION = 1;
/** The work the essay's worked examples are of. */
export const EXEMPLAR = 31;
/** The work whose lost energy the essay tells: the record dates an ejection after it. */
export const LOST = 4;
/** How far past the record's horizon `--beyond` looks, in steps from the window's first. */
export const BEYOND_STEPS = 60_000_000;

const read = async (name) => JSON.parse(await readFile(art(name), 'utf8'));

/** The ranges a seed's beginnings are drawn from, found by drawing the exemplar's again. */
export function beginningRanges(generation) {
  const stream = seedStream(seedBytes(generation.seed));
  drawProfileAndWeights(stream, generation.weightsRandomized);
  const range = () => ({ least: Infinity, most: -Infinity });
  const found = { mass: range(), place: range(), velocity: range() };
  const widen = (span, value) => {
    if (value < span.least) span.least = value;
    if (value > span.most) span.most = value;
  };
  for (let candidate = 0; candidate < generation.candidatesPerAttempt; candidate++) {
    const { masses, positions, velocities } = randomBodies(stream);
    for (const mass of masses) widen(found.mass, mass);
    for (const place of positions) widen(found.place, place);
    for (const velocity of velocities) widen(found.velocity, velocity);
  }
  return found;
}

/** What every record agrees on: one value, or a refusal naming the works that differ. */
function shared(records, name, pick) {
  const values = new Set(records.map(pick));
  if (values.size !== 1) throw new Error(`The records do not share one ${name}`);
  return [...values][0];
}

/** The clock the essay tells time by: steps, the film's frames and what a second of it holds. */
export function clockOf(records) {
  const steps = shared(records, 'window', (record) => record.generation.steps);
  const dt = Number(shared(records, 'step', (record) => record.generation.dt));
  const frames = lightFilmFrames(steps);
  return {
    dt,
    steps,
    warmupSteps: shared(records, 'warm-up', (record) => record.generation.warmupSteps),
    horizonSteps: shared(records, 'horizon', (record) => record.fate.horizonSteps),
    candidates: shared(records, 'count of candidates', (r) => r.generation.candidatesPerAttempt),
    retries: shared(records, 'count of retries', (record) => record.generation.retryCount),
    escapeThreshold: Number(shared(records, 'threshold', (r) => r.generation.escapeThreshold)),
    checkInterval: CHECK_INTERVAL,
    hysteresis: HYSTERESIS,
    gravitationalConstant: G,
    film: {
      frames,
      framesPerSecond: LIGHT_FILM.fps,
      seconds: lightFilmDuration(steps),
      stepsPerFrame: Math.floor(steps / LIGHT_FILM.targetFrames),
      stepsPerSecond: Math.floor(steps / LIGHT_FILM.targetFrames) * LIGHT_FILM.fps,
    },
  };
}

/** The energy registry, counted: who kept the energy to the record's fate, and who lost it where. */
export function energyCounts(records, energies) {
  const byId = new Map(energies.map((entry) => [entry.id, entry]));
  const counts = {
    heldWithin: ENERGY_HELD_WITHIN,
    kept: [],
    lost: [],
    lostInsideWindow: [],
    lostEjections: [],
    lostDances: [],
  };
  for (const record of records) {
    const entry = byId.get(record.id);
    if (!entry || entry.seed !== record.seed) throw new Error(`No energy for work ${record.id}`);
    if (!entry.broken) {
      counts.kept.push(record.id);
      continue;
    }
    counts.lost.push(record.id);
    if (entry.broken.step <= record.generation.steps) counts.lostInsideWindow.push(record.id);
    (record.fate.outcome === 'ejection' ? counts.lostEjections : counts.lostDances).push(record.id);
  }
  return counts;
}

/**
 * The pass at which a work's computation loses its energy, replayed from its window's first
 * step: the closest two bodies come in the thousand steps before the energy watch found the
 * loss, and how far the two travel relative to each other in the one step that takes them
 * through it, as a share of the gap between them; then the energy `after` steps past the loss,
 * beside the energy the window began with.
 */
export function closePass(window, broken, { after = 5 * ENERGY_INTERVAL, near = 1 } = {}) {
  const P = Float64Array.from(window.positions);
  const V = Float64Array.from(window.velocities);
  const step = integrator(window.masses, P, V, window.dt);
  const bodies = { masses: window.masses, positions: P, velocities: V };
  const energyBefore = energyAndMomentum(bodies).energy;
  const pass = { step: -1, distance: Infinity, pair: [0, 1], travel: 0 };
  // Passes nearer than `near` from the thousand steps before the loss to `after` steps past it:
  // each time the closest pair's distance turns from falling to rising below it.
  let passes = 0;
  let before = Infinity;
  let falling = false;
  const until = broken.step + after;
  for (let taken = 0; ; taken++) {
    if (taken > broken.step - ENERGY_INTERVAL) {
      let closest = Infinity;
      for (const [a, b] of PAIRS)
        closest = Math.min(
          closest,
          Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]),
        );
      if (falling && closest > before && before < near) passes += 1;
      falling = closest < before;
      before = closest;
    }
    if (taken > broken.step - ENERGY_INTERVAL && taken <= broken.step)
      for (const [a, b] of PAIRS) {
        const d = [0, 1, 2].map((k) => P[a * 3 + k] - P[b * 3 + k]);
        const distance = Math.hypot(d[0], d[1], d[2]);
        if (distance < pass.distance) {
          const v = [0, 1, 2].map((k) => V[a * 3 + k] - V[b * 3 + k]);
          Object.assign(pass, {
            step: taken,
            distance,
            pair: [a, b],
            travel: Math.hypot(v[0], v[1], v[2]) * window.dt,
          });
        }
      }
    if (taken === until) break;
    step();
  }
  return {
    ...pass,
    travelInGaps: pass.travel / pass.distance,
    passes,
    // The energy at the window's first step, and at `until`, where the replay stops.
    until,
    energyBefore,
    energyAfter: energyAndMomentum(bodies).energy,
  };
}

/**
 * How far the computed energy stands from its first value, as a share of it, every `every`
 * steps from a window's first step to `until`: the line the essay draws, flat or stepped.
 */
export function energySeries(window, until, every) {
  const P = Float64Array.from(window.positions);
  const V = Float64Array.from(window.velocities);
  const step = integrator(window.masses, P, V, window.dt);
  const bodies = { masses: window.masses, positions: P, velocities: V };
  const first = energyAndMomentum(bodies).energy;
  const values = [];
  for (let taken = 1; taken <= until; taken++) {
    step();
    if (taken % every === 0)
      values.push(Math.abs((energyAndMomentum(bodies).energy - first) / first));
  }
  return { every, values };
}

/** Whether two fates are one: the same outcome, the same body, the same step. */
const sameFate = (a, b) =>
  a.outcome === b.outcome && a.escaper === b.escaper && a.ejectionStep === b.ejectionStep;

/** What one work's Ink certificate says of its water and its making, held to its recorded hash. */
async function certificateFigures(record, clock) {
  if (!clock) throw new Error(`No Ink clock for work ${record.id}`);
  const certificate = await jsonDocument(seedPackagePath(record.seed, 'metadata/ember.json'));
  if (certificate.sha256 !== clock.certificate.sha256)
    throw new Error(`Work ${record.id}: the Ink certificate is not the one its clock recorded`);
  const { inputs, config, derived, stats, build, timings_seconds: timings } = certificate.value;
  if (inputs.gravitational_constant !== G || inputs.dt !== Number(record.generation.dt))
    throw new Error(`Work ${record.id}: the Ink certificate is of another computation`);
  return {
    sha256: certificate.sha256,
    algorithm: certificate.value.algorithm,
    reynolds: config.fluid.reynolds,
    bodyRadius: config.fluid.body_radius,
    maxAspect: config.tidal.max_aspect,
    preRoll: config.contact.pre_roll,
    holdFraction: config.look.hold_fraction,
    fadeFraction: config.look.fade_fraction,
    supersample: config.raster.supersample,
    fluidGrid: derived.fluid_grid,
    inkGrid: derived.ink_grid,
    fluidSteps: stats.fluid_steps,
    threads: build.threads,
    seconds: timings.total,
  };
}

/** The settings of the water and the look that the essay says every work shares. */
export const SHARED_INK = [
  'reynolds',
  'bodyRadius',
  'maxAspect',
  'preRoll',
  'holdFraction',
  'fadeFraction',
  'supersample',
];

/** Every work's certificate figures, read a few at a time; a work that differs in a shared setting is refused. */
async function inkFigures(records, clocks) {
  const clockOf = new Map(clocks.map((entry) => [entry.id, entry]));
  const found = new Map();
  const failures = await eachConcurrently(records, 4, async (record) => {
    found.set(record.id, await certificateFigures(record, clockOf.get(record.id)));
  });
  for (const { item, failure } of failures) error(`Signature ${item.id}: ${failure.message}`);
  if (failures.length) throw new Error(`${failures.length} Ink certificate(s) could not be read`);
  const first = found.get(records[0].id);
  for (const [id, ink] of found)
    for (const key of SHARED_INK)
      if (ink[key] !== first[key])
        throw new Error(`Work ${id}: its Ink's ${key} is not the collection's`);
  return found;
}

async function main() {
  const beyond = process.argv.includes('--beyond');
  const online = process.argv.includes('--online');
  await withLock(`${figuresPath}.lock`, async () => {
    const { records } = await read('orbit-records.json');
    const { windows } = await read('orbit-windows.json');
    const { frames } = await read('orbit-frames.json');
    const { energies } = await read('orbit-energy.json');
    const { clocks } = await read('ink-clocks.json');
    const index = await read('collection-index.json');
    let previous = null;
    try {
      previous = await read('essay-figures.json');
    } catch (failure) {
      if (failure.code !== 'ENOENT') throw failure;
    }
    const inks = online ? await inkFigures(records, clocks) : null;
    const windowOf = new Map(windows.map((entry) => [entry.id, entry]));
    const frameOf = new Map(frames.map((entry) => [entry.id, entry]));
    const clock = clockOf(records);
    const exemplar = records.find((record) => record.id === EXEMPLAR);

    log(
      `Following ${records.length} twins${beyond ? ', and the bound orbits past the record' : ''}…`,
    );
    const started = performance.now();
    const replies = await overWorkers(
      records,
      new URL('./lib/essay-figures-worker.mjs', import.meta.url),
      (record) => {
        const window = windowOf.get(record.id);
        const frame = frameOf.get(record.id);
        if (!window || !frame || window.seed !== record.seed || frame.seed !== record.seed)
          throw new Error(`Work ${record.id} has no window or frame bound to it`);
        return {
          id: record.id,
          window: orbitWindowOf(record, window),
          frame: plateFrameOf(frame),
          fate: publishedFateOf(record),
          beyond: beyond && record.fate.outcome === 'eternal_dance' ? BEYOND_STEPS : null,
        };
      },
    );
    const failed = replies.filter((reply) => reply.failure);
    for (const reply of failed) error(`Signature ${reply.id}: ${reply.failure}`);
    if (failed.length) throw new Error(`${failed.length} work(s) failed; nothing was written`);
    log(`…in ${((performance.now() - started) / 1000).toFixed(1)} s.`);

    const recordOf = new Map(records.map((record) => [record.id, record]));
    const kept = (id) => previous?.works?.find((work) => work.id === id);
    const seconds = (steps) => steps / clock.film.stepsPerSecond;
    const works = replies.map((reply) => {
      const record = recordOf.get(reply.id);
      const published = publishedFateOf(record);
      return {
        id: reply.id,
        seed: record.seed,
        twin: {
          ...reply.twin,
          fate: reply.twinFate,
          sameFate: sameFate(reply.twinFate, published),
          sameOutcome: reply.twinFate.outcome === published.outcome,
        },
        pairs: reply.pairs,
        sheet: reply.sheet,
        beyond: reply.beyond ?? kept(reply.id)?.beyond ?? null,
        ink: inks ? inks.get(reply.id) : (kept(reply.id)?.ink ?? null),
      };
    });

    const doublings = works.map((work) => work.twin.doubling).filter((value) => value !== null);
    const twins = {
      nudge: 1e-12,
      parted: works.filter((work) => work.twin.parted !== null).length,
      partedInsideWindow: works.filter(
        (work) => work.twin.parted !== null && work.twin.parted <= clock.steps,
      ).length,
      measured: doublings.length,
      doublingSteps: spread(doublings),
      doublingSeconds: spread(doublings.map(seconds)),
      differentFate: works.filter((work) => !work.twin.sameFate).map((work) => work.id),
      differentOutcome: works.filter((work) => !work.twin.sameOutcome).map((work) => work.id),
      differentBody: works
        .filter(
          (work) =>
            work.twin.fate.outcome === 'ejection' &&
            recordOf.get(work.id).fate.outcome === 'ejection' &&
            work.twin.fate.escaper !== recordOf.get(work.id).fate.escaper,
        )
        .map((work) => work.id),
    };

    // The Ink's bodies are the picture's, flattened onto its sheet (docs/ember-design.md §3 in
    // the generator), so two of them can pass over one another there.
    const sheets = {
      overlapAtSomeTime: works.filter((work) => work.sheet.overlapShare > 0).map((w) => w.id),
      centreInsideAnother: works.filter((work) => work.sheet.insideShare > 0).map((w) => w.id),
      overlapShare: spread(works.map((work) => work.sheet.overlapShare)),
      plaitForcesNothing: works.filter((work) => !(work.sheet.stretch > 1)).map((w) => w.id),
      plaitDoublings: spread(works.map((work) => Math.log2(work.sheet.stretch))),
      crossings: spread(works.map((work) => work.sheet.crossings)),
    };
    const pictures = {
      positions: frames.filter((f) => f.projection === 'position' && f.symmetry === 'none').length,
      otherSpace: frames.filter((f) => f.projection !== 'position').length,
      symmetry: frames.filter((f) => f.symmetry !== 'none').length,
    };

    const looked = works.filter((work) => work.beyond);
    const past = looked.length
      ? {
          steps: BEYOND_STEPS,
          bound: records.filter((record) => record.fate.outcome === 'eternal_dance').length,
          looked: looked.length,
          lostABody: looked.filter((w) => w.beyond.outcome === 'ejection').map((w) => w.id),
          stillThree: looked.filter((w) => w.beyond.outcome !== 'ejection').map((w) => w.id),
          energyBroken: looked.filter((w) => w.beyond.energyBroken !== null).map((w) => w.id),
        }
      : null;

    const weights = yoshidaWeights();
    const source = await readFile(
      fileURLToPath(new URL('../src/lib/physics/orbit.ts', import.meta.url)),
      'utf8',
    );
    const written = {
      w1: Number(/const W1 = ([-\d.]+);/.exec(source)?.[1]),
      w0: Number(/const W0 = ([-\d.]+);/.exec(source)?.[1]),
    };
    if (!(Math.abs(written.w1 - weights.w1) < 1e-15 && Math.abs(written.w0 - weights.w0) < 1e-15))
      throw new Error('The integrator’s weights are not Yoshida’s');

    const lost = new Set(energyCounts(records, energies).lost);
    // Where both computations keep their energy, the twin's fate can be set beside the work's.
    const cleanTwins = works.filter(
      (work) => !lost.has(work.id) && work.twin.fate.energyBroken === null,
    );
    const cleanPast = looked.filter((work) => work.beyond.energyBroken === null);
    const cleanLosses = cleanPast.filter((work) => work.beyond.outcome === 'ejection');
    const series = (id) =>
      energySeries(orbitWindowOf(recordOf.get(id), windowOf.get(id)), 2 * clock.steps, 10_000);
    const lostEntry = energies.find((entry) => entry.id === LOST);
    const lostBreak = {
      step: lostEntry.broken.step,
      change: Number(lostEntry.broken.change),
      closest: Number(lostEntry.broken.closest),
    };
    const lostFate = recordOf.get(LOST).fate;
    const shared = works.every((work) => work.ink)
      ? Object.fromEntries(SHARED_INK.map((key) => [key, works[0].ink[key]]))
      : null;
    const figures = {
      schemaVersion: SCHEMA_VERSION,
      clock,
      fates: {
        ejection: records.filter((record) => record.fate.outcome === 'ejection').length,
        boundAtHorizon: records.filter((record) => record.fate.outcome === 'eternal_dance').length,
      },
      integrator: { ...written, sum: written.w1 + written.w0 + written.w1 },
      beginnings: { of: EXEMPLAR, ...beginningRanges(generationOf(exemplar)) },
      energy: {
        ...energyCounts(records, energies),
        // The two lines the essay draws, to twice the window: one held, one lost.
        heldExample: {
          id: EXEMPLAR,
          windowChange: Number(energies.find((entry) => entry.id === EXEMPLAR).windowChange),
          series: series(EXEMPLAR),
        },
        lostExample: {
          id: LOST,
          ...lostBreak,
          // Replayed as far as the step the record dates its ejection.
          pass: closePass(orbitWindowOf(recordOf.get(LOST), windowOf.get(LOST)), lostBreak, {
            after: lostFate.ejectionStep - lostBreak.step,
          }),
          ejected: { body: lostFate.escaper, step: lostFate.ejectionStep },
          series: series(LOST),
        },
      },
      twins: {
        ...twins,
        clean: {
          works: cleanTwins.length,
          differ: cleanTwins.filter((work) => !work.twin.sameFate).length,
          outcome: cleanTwins.filter((work) => !work.twin.sameOutcome).length,
        },
      },
      past: past && {
        ...past,
        clean: {
          runs: cleanPast.length,
          lost: cleanLosses.length,
          still: cleanPast.length - cleanLosses.length,
          earliest: Math.min(...cleanLosses.map((work) => work.beyond.ejectionStep)),
        },
      },
      sheets,
      pictures,
      plait: { pigtail: plaitStretch([1, -2]), plain: plaitStretch([1, 2]) },
      ink: {
        // What every work's certificate agrees on; nothing until the certificates are read.
        shared,
        // Every Ink film opens on bare paper: the frame at which each first carries ink.
        opens: {
          frames: spread(clocks.map((entry) => entry.firstInked)),
          seconds: spread(clocks.map((entry) => entry.firstInked / LIGHT_FILM.fps)),
        },
      },
      traits: {
        syzygies: spread(index.works.map((work) => work.syzygies)),
        chaos: spread(index.works.map((work) => work.chaos)),
        braidCrossings: spread(records.map((record) => record.physics.braid.crossings)),
      },
      works,
    };
    await writeAtomically(
      figuresPath,
      await format(JSON.stringify(figures, null, 2), { parser: 'json', printWidth: 100 }),
    );
    log(`Wrote ${figuresPath}`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch((failure) => {
    error(failure.message);
    process.exitCode = 1;
  });
