import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { log, error } from 'node:console';
import { performance } from 'node:perf_hooks';
import { format } from 'prettier';
import {
  SEED,
  SHA256,
  eachConcurrently,
  jsonDocument,
  parseRequestedIds,
  readRegistry,
  seedPackagePath,
  withLock,
  writeAtomically,
} from './lib/origin.mjs';
import { verifyOrbits } from './lib/orbit-verify.mjs';

/**
 * Orbit records: what each work's published trait file says about the orbit beneath it, kept
 * only once this repository has re-derived that orbit to the last bit.
 *
 * For every indexed work the package's metadata/nft_traits.json is read (bounded, and hashed
 * so a changed file is noticed on the next run). The record keeps the inputs that chose the
 * orbit (the candidate, the aesthetic retries, whether the Borda weights were drawn, the step
 * counts) and the measurements published about it (masses, energy, angular momentum, the
 * closest approach, the syzygies and the braid word), plus the fate and the body hues for the
 * pages that draw it. src/lib/physics/orbit.ts then re-derives every orbit from its seed; the
 * registry is written only when every measurement of every work matches exactly. Nothing here
 * alters a published file or infers a value the publisher did not state.
 *
 * Every measured double is kept as its shortest decimal string: the bundler's JSON loader turns
 * numbers into literals that do not round-trip every double (124.96327743951707 arrived as
 * …709), while ECMAScript's Number() of the string is exact by definition.
 */
const USAGE = 'Usage: npm run art:orbits -- [tokenId ...]';
const indexPath = fileURLToPath(new URL('../src/lib/art/collection-index.json', import.meta.url));
const registryPath = fileURLToPath(new URL('../src/lib/art/orbit-records.json', import.meta.url));
export const SCHEMA_VERSION = 1;
const TRAITS_PATH = 'metadata/nft_traits.json';

const finite = (value, name) => {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`${name} is not a number`);
  return value;
};
const count = (value, name, max = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isSafeInteger(value) || value < 0 || value > max)
    throw new Error(`${name} is not a count`);
  return value;
};
const positive = (value, name) => {
  if (finite(value, name) <= 0) throw new Error(`${name} is not positive`);
  return value;
};
/** The shortest decimal that parses back to exactly this double; String(-0) alone loses the sign. */
export function decimal(value) {
  const text = Object.is(value, -0) ? '-0' : String(value);
  if (!Object.is(Number(text), value)) throw new Error(`${value} does not round-trip`);
  return text;
}

/**
 * The record for one work from its published trait file. Every field is checked for shape and
 * range and copied by name; anything missing or malformed refuses the whole record.
 */
export function orbitRecord(work, traits, traitsSha256) {
  if (!SEED.test(work.seed ?? '')) throw new Error('malformed indexed seed');
  if (!SHA256.test(traitsSha256 ?? '')) throw new Error('malformed trait file hash');
  if (typeof traits !== 'object' || traits === null) throw new Error('trait file is not an object');
  if (!/^1\./.test(traits.schema_version ?? '')) throw new Error('unsupported trait file schema');
  if (String(traits.seed).toLowerCase() !== work.seed)
    throw new Error('trait file is for another seed');
  const simulation = traits.simulation ?? {};
  const borda = traits.generation?.borda ?? {};
  const palette = traits.generation?.palette ?? {};
  if (simulation.integrator !== 'yoshida4') throw new Error('unknown integrator');
  const masses = simulation.masses;
  if (!Array.isArray(masses) || masses.length !== 3) throw new Error('masses are not three');
  masses.forEach((mass, index) => positive(mass, `mass ${index + 1}`));
  if (
    Array.isArray(work.masses) &&
    !work.masses.every((mass, index) => Object.is(mass, masses[index]))
  )
    throw new Error('trait file masses differ from the indexed record');
  const retryCount = count(borda.retry_count, 'retry count', 16);
  const totalCandidates = count(borda.total_candidates, 'total candidates');
  if (totalCandidates === 0 || totalCandidates % (retryCount + 1) !== 0)
    throw new Error('candidates do not divide into the attempts');
  const candidatesPerAttempt = totalCandidates / (retryCount + 1);
  const selectedIndex = count(borda.selected_index, 'selected index');
  if (selectedIndex >= candidatesPerAttempt)
    throw new Error('selected index is outside the search');
  if (typeof borda.weights_randomized !== 'boolean')
    throw new Error('weights flag is not a boolean');
  const closest = simulation.closest_approach ?? {};
  const pair = closest.pair;
  if (
    !Array.isArray(pair) ||
    pair.length !== 2 ||
    !pair.every((body) => Number.isSafeInteger(body) && body >= 0 && body <= 2) ||
    pair[0] >= pair[1]
  )
    throw new Error('closest approach pair is malformed');
  const steps = count(simulation.steps, 'steps');
  const braid = simulation.braid ?? {};
  if (typeof braid.word !== 'string' || !/^(?:s[12]'?(?: s[12]'?)*)?$/.test(braid.word))
    throw new Error('braid word is malformed');
  if (typeof braid.truncated !== 'boolean') throw new Error('braid truncation is not a boolean');
  const fate = simulation.fate ?? {};
  if (!['eternal_dance', 'ejection'].includes(fate.outcome)) throw new Error('unknown fate');
  const hues = palette.body_base_hues_deg;
  if (!Array.isArray(hues) || hues.length !== 3) throw new Error('body hues are not three');
  return {
    id: work.id,
    seed: work.seed,
    traitsSha256,
    pipelineVersion: String(traits.pipeline_version ?? ''),
    generation: {
      candidatesPerAttempt,
      selectedIndex,
      retryCount,
      weightsRandomized: borda.weights_randomized,
      integrator: simulation.integrator,
      dt: decimal(positive(simulation.dt, 'dt')),
      steps,
      warmupSteps: count(simulation.warmup_steps, 'warm-up steps'),
    },
    physics: {
      masses: masses.map(decimal),
      totalEnergy: decimal(finite(simulation.total_energy, 'total energy')),
      angularMomentum: decimal(finite(simulation.angular_momentum, 'angular momentum')),
      closestApproach: {
        distance: decimal(positive(closest.distance, 'closest distance')),
        pair: [pair[0], pair[1]],
        step: count(closest.step, 'closest step', steps - 1),
      },
      syzygyCount: count(simulation.syzygy_count, 'syzygy count'),
      braid: {
        word: braid.word,
        crossings: count(braid.crossings, 'braid crossings'),
        truncated: braid.truncated,
      },
    },
    fate: {
      outcome: fate.outcome,
      escaper: fate.outcome === 'ejection' ? count(fate.escaper, 'escaper', 2) : null,
      ejectionStep: fate.outcome === 'ejection' ? count(fate.ejection_step, 'ejection step') : null,
      horizonSteps: count(fate.horizon_steps, 'horizon steps'),
    },
    bodyHues: hues.map((hue, index) => {
      const degrees = finite(hue, `body hue ${index + 1}`);
      if (degrees < 0 || degrees >= 360) throw new Error(`body hue ${index + 1} is out of range`);
      return degrees;
    }),
  };
}

export function mergeRecords(existing, read) {
  const byId = new Map(existing.map((record) => [record.id, record]));
  for (const record of read) byId.set(record.id, record);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/** Re-running on unchanged trait files keeps the previous date, so the file stays byte-identical. */
export function decideReadOn(previous, previousRecords, nextRecords, today) {
  const same = JSON.stringify(previousRecords) === JSON.stringify(nextRecords);
  return same && typeof previous === 'string' ? previous : today;
}

/** The registry as the repository's formatter writes it, so a rebuild leaves the check clean. */
export function serializeRegistry({ readOn, records }) {
  return format(JSON.stringify({ schemaVersion: SCHEMA_VERSION, readOn, records }, null, 2), {
    parser: 'json',
    printWidth: 100,
  });
}

/** The works whose re-derived orbit differs from the record, with every differing measurement. */
export function differences(results) {
  return results.flatMap((result) =>
    result.failure
      ? [{ id: result.id, failure: result.failure }]
      : result.comparisons.some((row) => !row.exact)
        ? [{ id: result.id, rows: result.comparisons.filter((row) => !row.exact) }]
        : [],
  );
}

async function main() {
  const requestedIds = parseRequestedIds(process.argv.slice(2), USAGE);
  await withLock(`${registryPath}.lock`, async () => {
    const { readFile } = await import('node:fs/promises');
    const index = JSON.parse(await readFile(indexPath, 'utf8'));
    if (index.schemaVersion !== 1 || !Array.isArray(index.works))
      throw new Error('Invalid collection index; run npm run art:index first');
    const registry = await readRegistry(registryPath, SCHEMA_VERSION, 'records');
    const selected = requestedIds.length
      ? index.works.filter((work) => requestedIds.includes(work.id))
      : index.works;
    if (requestedIds.some((id) => !selected.some((work) => work.id === id)))
      throw new Error('Requested token is not indexed');
    const read = [];
    const failures = await eachConcurrently(selected, 3, async (work) => {
      const { value, sha256 } = await jsonDocument(seedPackagePath(work.seed, TRAITS_PATH));
      read.push(orbitRecord(work, value, sha256));
    });
    for (const { item, failure } of failures) error(`Signature ${item.id}: ${failure.message}`);
    if (failures.length)
      throw new Error(
        `${failures.length} trait file(s) could not be read; the registry was not written`,
      );
    log(`Re-deriving ${read.length} orbits…`);
    const started = performance.now();
    const results = await verifyOrbits(read);
    const differing = differences(results);
    for (const entry of differing)
      error(`Signature ${entry.id}: ${JSON.stringify(entry.failure ?? entry.rows)}`);
    if (differing.length)
      throw new Error(
        `${differing.length} orbit(s) did not re-derive exactly; the registry was not written`,
      );
    const draws = new Map();
    for (const result of results)
      draws.set(result.profileDraws, (draws.get(result.profileDraws) ?? 0) + 1);
    log(
      `Every orbit re-derived exactly in ${((performance.now() - started) / 1000).toFixed(1)} s ` +
        `(profile draws: ${[...draws].map(([n, works]) => `${n} × ${works}`).join(', ')}).`,
    );
    const records = requestedIds.length
      ? mergeRecords(registry.records, read)
      : mergeRecords([], read);
    const readOn = decideReadOn(
      registry.readOn,
      registry.records,
      records,
      new Date().toISOString().slice(0, 10),
    );
    await writeAtomically(registryPath, await serializeRegistry({ readOn, records }));
    log(`${records.length} orbit records; read on ${readOn}.`);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
