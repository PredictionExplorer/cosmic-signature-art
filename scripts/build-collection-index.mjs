import { randomUUID } from 'node:crypto';
import { open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { log, error } from 'node:console';
import { setTimeout } from 'node:timers';

/**
 * The collection index: one build-time read of every published record, so the venue can
 * order the collection by real measurements (wavelength, cycle, number) and hang the Index
 * of numbers without 72 request-time reads. Everything here is the publisher's own data,
 * copied verbatim after validation; nothing is inferred, scored or invented. A work whose
 * metadata lacks a field simply lacks it in the index.
 */
const { fetch, AbortSignal, Buffer } = globalThis;
const origin = 'https://a1.cosmicsignature.com';
const registryPath = fileURLToPath(
  new URL('../src/lib/art/collection-index.json', import.meta.url),
);
const lockPath = `${registryPath}.lock`;
const maxJsonBytes = 2 * 1024 * 1024;
const seedPattern = /^0x[a-f0-9]{64}$/;
const shaPattern = /^[a-f0-9]{64}$/;
/** The origin is one plain nginx host that answers bursts with 429; two readers and a backoff suffice. */
const concurrency = 2;
const attempts = 5;

/** Manifest roles the venue reads, keyed by expression; paths are the published convention. */
export const MEDIA_ROLES = {
  light: {
    still: ['web_full', 'images/web/full.webp'],
    preview: ['web_preview', 'images/web/preview.webp'],
    films: {
      main: ['main_web', 'videos/web/main.mp4'],
      sweep: ['spectral_sweep_web', 'videos/web/spectral_sweep.mp4'],
    },
  },
  ink: {
    still: ['ember_web_full', 'images/web/ember_full.webp'],
    preview: ['ember_web_preview', 'images/web/ember_preview.webp'],
    films: {
      main: ['ember_web', 'videos/web/ember.mp4'],
      medium: ['ember_medium_web', 'videos/web/ember_medium.mp4'],
      slow: ['ember_slow_web', 'videos/web/ember_slow.mp4'],
    },
  },
};

const textTraits = {
  Structure: 'structure',
  Underlay: 'underlay',
  Palette: 'palette',
  'Spectral Class': 'spectralClass',
  'Mass Balance': 'massBalance',
  Fate: 'fate',
  Allocation: 'allocation',
};

function integer(value, max = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= 0 && value <= max ? value : undefined;
}
function positiveInteger(value, max = Number.MAX_SAFE_INTEGER) {
  const parsed = integer(value, max);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}
function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function positive(value) {
  const parsed = finite(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}
/** The visible spectrum the venue hangs; a value outside it is a publisher anomaly, left unmeasured. */
function wavelength(value) {
  const parsed = finite(value);
  return parsed !== undefined && parsed >= 380 && parsed <= 700 ? parsed : undefined;
}
function text(value, max = 120) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max || /[\p{Cc}\p{Cf}]/u.test(trimmed)) return undefined;
  return trimmed;
}
function normalizeSeed(value) {
  if (typeof value !== 'string') return undefined;
  const seed = `0x${value.replace(/^0x/i, '').toLowerCase()}`;
  return seedPattern.test(seed) ? seed : undefined;
}
/** Only a value that appears exactly once is unambiguous. */
function uniqueTrait(attributes, name) {
  const matches = attributes.filter((trait) => trait && trait.trait_type === name);
  return matches.length === 1 ? matches[0].value : undefined;
}

export function parseMetadata(raw, expectedId, expectedSeed) {
  if (!raw || typeof raw !== 'object' || !raw.properties || typeof raw.properties !== 'object')
    throw new Error(`Signature ${expectedId}: malformed metadata document`);
  const properties = raw.properties;
  if (properties.token_id !== expectedId || normalizeSeed(properties.seed) !== expectedSeed)
    throw new Error(`Signature ${expectedId}: metadata identity does not match the indexed token`);
  const attributes = Array.isArray(raw.attributes) ? raw.attributes.slice(0, 64) : [];
  const generation =
    properties.generation && typeof properties.generation === 'object' ? properties.generation : {};
  const palette =
    generation.palette && typeof generation.palette === 'object' ? generation.palette : {};
  const borda = generation.borda && typeof generation.borda === 'object' ? generation.borda : {};
  const drift = generation.drift && typeof generation.drift === 'object' ? generation.drift : {};
  const structure =
    generation.structure && typeof generation.structure === 'object' ? generation.structure : {};
  const underlay =
    structure.underlay && typeof structure.underlay === 'object' ? structure.underlay : {};
  const simulation =
    properties.simulation && typeof properties.simulation === 'object' ? properties.simulation : {};
  const braid = simulation.braid && typeof simulation.braid === 'object' ? simulation.braid : {};
  const fate = simulation.fate && typeof simulation.fate === 'object' ? simulation.fate : {};
  const hues = Array.isArray(palette.body_base_hues_deg)
    ? palette.body_base_hues_deg.map(finite)
    : undefined;
  const masses = Array.isArray(simulation.masses) ? simulation.masses.map(finite) : undefined;
  const imprinted = integer(uniqueTrait(attributes, 'Imprinted'), 8_640_000_000_000);
  const work = {
    metadataVersion: text(raw.metadata_version, 40),
    metadataName: text(raw.name, 200),
    description: text(raw.description, 1000),
    traits: {},
    chaos: integer(uniqueTrait(attributes, 'Chaos'), 100),
    syzygies: integer(uniqueTrait(attributes, 'Syzygies')),
    wildcard:
      uniqueTrait(attributes, 'Wildcard') === 'Yes'
        ? true
        : uniqueTrait(attributes, 'Wildcard') === 'No'
          ? false
          : undefined,
    imprintedAt: imprinted === undefined ? undefined : new Date(imprinted * 1000).toISOString(),
    wavelengthNm: wavelength(palette.dominant_wavelength_nm),
    hueDegrees:
      hues && hues.length === 3 && hues.every((hue) => hue !== undefined) ? hues : undefined,
    paletteFamily: text(palette.family),
    underlayAlpha: finite(underlay.alpha),
    eccentricity: finite(drift.orbit_eccentricity),
    borda:
      integer(borda.selected_index) !== undefined &&
      positiveInteger(borda.total_candidates) !== undefined
        ? {
            selectedIndex: borda.selected_index,
            totalCandidates: borda.total_candidates,
            chaosWeight: finite(borda.chaos_weight),
            equilibriumWeight: finite(borda.equil_weight),
            aestheticScore: finite(borda.aesthetic_score),
            selectionScore: finite(borda.selection_score),
            weightsRandomized:
              typeof borda.weights_randomized === 'boolean' ? borda.weights_randomized : undefined,
          }
        : undefined,
    masses:
      masses && masses.length === 3 && masses.every((mass) => mass !== undefined)
        ? masses
        : undefined,
    integrator: text(simulation.integrator, 40),
    simulationSteps: integer(simulation.steps),
    braidCrossings: integer(braid.crossings),
    fateOutcome: text(fate.outcome, 60),
  };
  for (const [name, key] of Object.entries(textTraits)) {
    const value = text(uniqueTrait(attributes, name));
    if (value !== undefined) work.traits[key] = value;
  }
  return work;
}

export function parseManifest(raw, expectedId) {
  if (!raw || raw.schema_version !== 2 || !Array.isArray(raw.assets))
    throw new Error(`Signature ${expectedId}: unexpected manifest schema`);
  const find = (role, path, kind) => {
    const matches = raw.assets.filter((asset) => asset && asset.role === role);
    if (matches.length !== 1) return undefined;
    const asset = matches[0];
    if (asset.path !== path || asset.kind !== kind) return undefined;
    const sha256 = typeof asset.sha256 === 'string' ? asset.sha256.toLowerCase() : undefined;
    return {
      path,
      sha256: sha256 && shaPattern.test(sha256) ? sha256 : undefined,
      bytes: positiveInteger(asset.bytes),
      width: positiveInteger(asset.width, 100_000),
      height: positiveInteger(asset.height, 100_000),
      durationSeconds: kind === 'video' ? positive(asset.duration_seconds) : undefined,
    };
  };
  const media = {};
  for (const [expression, roles] of Object.entries(MEDIA_ROLES)) {
    const still = find(...roles.still, 'image');
    const preview = find(...roles.preview, 'image');
    const films = {};
    for (const [id, [role, path]] of Object.entries(roles.films)) {
      const film = find(role, path, 'video');
      if (film) films[id] = film;
    }
    if (!still && !preview && !Object.keys(films).length) continue;
    media[expression] = { still, preview, films };
  }
  return media;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** One bounded read; a 429 or a transient failure waits (honouring Retry-After) and tries again. */
async function json(url, attempt = 1) {
  let response;
  try {
    response = await fetch(url, {
      redirect: 'error',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (failure) {
    if (attempt >= attempts) throw failure;
    await sleep(1000 * 2 ** (attempt - 1));
    return json(url, attempt + 1);
  }
  if ((response.status === 429 || response.status >= 500) && attempt < attempts) {
    await response.body?.cancel();
    const retryAfter = Number(response.headers.get('retry-after'));
    await sleep(
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt,
    );
    return json(url, attempt + 1);
  }
  if (!response.ok || Number(response.headers.get('content-length')) > maxJsonBytes) {
    await response.body?.cancel();
    throw new Error(`Invalid JSON response (${response.status}): ${url}`);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maxJsonBytes) throw new Error(`Oversized JSON: ${url}`);
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function tokens() {
  const records = new Map();
  for (let offset = 0; offset < 10_000; offset += 18) {
    const page = await json(`${origin}/api/cosmicgame/cst/list/all/${offset}/18`);
    if (page.status !== 1 || page.error || !Array.isArray(page.CosmicSignatureTokenList))
      throw new Error('Collection index is unavailable');
    for (const row of page.CosmicSignatureTokenList) {
      const seed = normalizeSeed(row.Seed);
      const id = integer(row.TokenId);
      if (id === undefined || !seed) throw new Error('Malformed token identity');
      if (records.has(id)) throw new Error('Collection changed during pagination; rerun');
      const timestamp = integer(row.Tx?.TimeStamp, 8_640_000_000_000);
      records.set(id, {
        id,
        seed,
        cycle: integer(row.RoundNum),
        mintedAt: timestamp ? new Date(timestamp * 1000).toISOString() : undefined,
        mintTransactionHash:
          typeof row.Tx?.TxHash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(row.Tx.TxHash)
            ? row.Tx.TxHash
            : undefined,
        name: text(row.TokenName, 512) || undefined,
      });
    }
    if (page.CosmicSignatureTokenList.length < 18)
      return [...records.values()].sort((a, b) => a.id - b.id);
  }
  throw new Error('Collection exceeds the ingestion safety limit');
}

/** Stable key order with undefined fields dropped, so reruns on unchanged data are byte-identical. */
export function serializeIndex(index) {
  return `${JSON.stringify(index, (key, value) => (value === undefined ? undefined : value), 2)}\n`;
}

/** A listing that shrinks is an outage or an API change until a human says otherwise. */
export function refusesToShrink(previous, works, allowShrink) {
  if (allowShrink) return null;
  if (works.length === 0) return 'The origin listed no works; the index was not written';
  if (previous && Array.isArray(previous.works) && works.length < previous.works.length)
    return `The origin listed ${works.length} works, fewer than the ${previous.works.length} committed; pass --allow-shrink to accept`;
  return null;
}

async function main() {
  const allowShrink = process.argv.includes('--allow-shrink');
  let lock;
  try {
    lock = await open(lockPath, 'wx');
  } catch (failure) {
    if (failure.code === 'EEXIST')
      throw new Error(`Stale lock at ${lockPath}; remove it if no index build is running`, {
        cause: failure,
      });
    throw failure;
  }
  try {
    const list = await tokens();
    log(`${list.length} indexed tokens.`);
    const works = new Array(list.length);
    const failures = [];
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(concurrency, list.length) }, async () => {
        while (next < list.length) {
          const index = next++;
          const token = list[index];
          try {
            const [metadata, manifest] = await Promise.all([
              json(`${origin}/metadata/${token.id}`),
              json(`${origin}/images/new/cosmicsignature/${token.seed}/metadata/assets.json`),
            ]);
            works[index] = {
              ...token,
              ...parseMetadata(metadata, token.id, token.seed),
              media: parseManifest(manifest, token.id),
            };
            log(
              `Signature ${token.id}: ${works[index].wavelengthNm ?? '—'} nm, cycle ${token.cycle}`,
            );
          } catch (failure) {
            failures.push(`Signature ${token.id}: ${failure.message}`);
          }
        }
      }),
    );
    if (failures.length) {
      for (const failure of failures) error(failure);
      throw new Error(`${failures.length} record(s) could not be read; the index was not written`);
    }
    let previous = null;
    try {
      previous = JSON.parse(await readFile(registryPath, 'utf8'));
    } catch {
      /* First build. */
    }
    const refusal = refusesToShrink(previous, works, allowShrink);
    if (refusal) throw new Error(refusal);
    const today = new Date().toISOString().slice(0, 10);
    const unchanged =
      previous &&
      JSON.stringify(previous.works) ===
        JSON.stringify(JSON.parse(serializeIndex({ works })).works);
    const index = {
      schemaVersion: 1,
      origin,
      checkedOn: unchanged ? previous.checkedOn : today,
      total: works.length,
      works,
    };
    const temporary = `${registryPath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, serializeIndex(index));
      await rename(temporary, registryPath);
    } catch (failure) {
      await rm(temporary, { force: true });
      throw failure;
    }
    log(`Wrote ${works.length} works; checked on ${index.checkedOn}.`);
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
