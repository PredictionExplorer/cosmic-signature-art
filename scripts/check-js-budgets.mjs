import { readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants } from 'node:zlib';
import { log, error } from 'node:console';

/**
 * The first-load JavaScript budget: how much script each route asks a browser to download
 * before its page can hydrate, held to the size set for it in scripts/budgets.json.
 *
 * What is counted. For every App Router page, the framework's root main files plus the client
 * entry chunks of each segment on the route (its layouts and the page itself). This is the
 * "First Load JS" that `next build` used to print. Next 16 dropped that column from the table,
 * because it was hard to state exactly for Server Components, but it still writes the same
 * accounting to .next/diagnostics/route-bundle-stats.json (next/dist/build/route-bundle-stats.js).
 * This script reads that list and measures the chunks itself.
 *
 * How it is measured. Each chunk is compressed as Vercel sends it to a browser: Brotli at quality
 * 3, which matched every Brotli chunk cosmic.art served on 8 November 2026 to within a byte. A
 * route's total is the sum of its chunks. The raw size is reported too, since a browser parses and
 * compiles the uncompressed bytes. Gzip, the old column's measure, would mislead: its window is
 * 32 KiB, so when text that repeats (the eight locales' copy, which every page carries) grows
 * further apart than that, gzip's size jumps by tens of KiB while what a visitor downloads barely
 * moves.
 *
 * What is not counted. Script a page loads later by `import()`, such as First Light's performance
 * on a first visit or the orbit workers. That is deliberate: what loads later does not hold up
 * the first paint, the art (see README, "The art is the Largest Contentful Paint").
 *
 * Usage, after a production build (`npm run build`):
 *   node scripts/check-js-budgets.mjs [--dist .next] [--budgets scripts/budgets.json]
 */

export const STATS_FILE = 'diagnostics/route-bundle-stats.json';
export const BUDGETS_KEY = 'firstLoadJsBrotliKiB';
/** Brotli's quality as Vercel compresses JavaScript for a browser that accepts it. */
export const BROTLI_QUALITY = 3;
const KIB = 1024;

/** The repository root; under a test runner whose module URLs are not file URLs, the working directory. */
function repositoryRoot() {
  try {
    return fileURLToPath(new URL('..', import.meta.url));
  } catch {
    return process.cwd();
  }
}

/** A chunk's size on the wire: Brotli, at the quality Vercel uses. */
export function brotliSize(bytes) {
  return brotliCompressSync(bytes, {
    params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY },
  }).length;
}

/** Bytes as KiB, to one decimal place. */
export function kib(bytes) {
  return Math.round((bytes / KIB) * 10) / 10;
}

/** Reads the build's route list, refusing anything that is not the shape Next 16.4 writes. */
export function parseRouteStats(text, where) {
  let rows;
  try {
    rows = JSON.parse(text);
  } catch {
    throw new Error(`${where} is not JSON. Build again with \`npm run build\`.`);
  }
  const wellFormed = (row) =>
    row &&
    typeof row.route === 'string' &&
    row.route.startsWith('/') &&
    Array.isArray(row.firstLoadChunkPaths) &&
    row.firstLoadChunkPaths.length > 0 &&
    row.firstLoadChunkPaths.every((path) => typeof path === 'string' && path.endsWith('.js'));
  if (!Array.isArray(rows) || rows.length === 0 || !rows.every(wellFormed))
    throw new Error(
      `${where} does not list each route's first-load chunks as Next 16.4 does ` +
        '({ route, firstLoadChunkPaths }). If a Next upgrade changed the file, update this script.',
    );
  return rows;
}

/** Reads the budgets: a route → KiB map under BUDGETS_KEY, every budget a positive number. */
export function parseBudgets(text, where) {
  const budgets = JSON.parse(text)[BUDGETS_KEY];
  const valid =
    budgets &&
    typeof budgets === 'object' &&
    Object.entries(budgets).every(
      ([route, size]) => route.startsWith('/') && Number.isFinite(size) && size > 0,
    );
  if (!valid)
    throw new Error(`${where} must map each route to its budget in KiB under "${BUDGETS_KEY}".`);
  return budgets;
}

/**
 * Each route's first-load JavaScript, raw and compressed. Most chunks are shared by every route
 * (the framework, the locale layout), so each chunk is read and compressed once.
 */
export async function measureRoutes(rows, readChunk) {
  const sizes = new Map();
  const measured = [];
  for (const { route, firstLoadChunkPaths } of rows) {
    let raw = 0;
    let brotli = 0;
    for (const path of firstLoadChunkPaths) {
      if (!sizes.has(path)) {
        const bytes = await readChunk(path, route);
        sizes.set(path, { raw: bytes.length, brotli: brotliSize(bytes) });
      }
      raw += sizes.get(path).raw;
      brotli += sizes.get(path).brotli;
    }
    measured.push({
      route,
      chunks: firstLoadChunkPaths.length,
      rawBytes: raw,
      brotliBytes: brotli,
    });
  }
  return measured.sort((a, b) => a.route.localeCompare(b.route));
}

/**
 * Holds every route to its budget. A route without a budget fails, so a new page is given one
 * when it is added; so does a budget for a route the build no longer has, so the file stays true.
 */
export function checkBudgets(measured, budgets, budgetsFile = 'scripts/budgets.json') {
  const failures = [];
  const rows = measured.map((route) => {
    const budget = budgets[route.route];
    const size = kib(route.brotliBytes);
    if (budget === undefined) {
      failures.push(
        `${route.route} has no first-load JavaScript budget. Add it to ${budgetsFile} under ` +
          `"${BUDGETS_KEY}": its size now is ${size} KiB; a tenth above that, rounded up, leaves ` +
          'room to grow without hiding a mistake.',
      );
      return { ...route, budget: null, headroom: null };
    }
    const headroom = Math.round((budget - route.brotliBytes / KIB) * 10) / 10;
    if (headroom < 0)
      failures.push(
        `${route.route} loads ${size} KiB of JavaScript before it can hydrate (Brotli, as sent), ` +
          `${-headroom} KiB over its ${budget} KiB budget. Run \`npx next analyze\` to see what ` +
          'grew. Load what the first paint does not need with import(), or, if the growth is ' +
          `meant, raise the budget in ${budgetsFile} in the same change and say why.`,
      );
    return { ...route, budget, headroom };
  });
  const built = new Set(measured.map((route) => route.route));
  for (const route of Object.keys(budgets))
    if (!built.has(route))
      failures.push(
        `${budgetsFile} sets a budget for ${route}, which the build does not have. Remove it, ` +
          'or rename it to the route it became.',
      );
  return { rows, failures };
}

/** The table printed on every run, passing or not, so CI's log keeps each build's sizes. */
export function formatReport(rows, heading) {
  const width = Math.max(5, ...rows.map((row) => row.route.length));
  const line = (cells) => cells.join('  ');
  const number = (value) => (value === null ? '—' : value.toFixed(1));
  return [
    heading,
    line(['route'.padEnd(width), 'chunks', '  raw KiB', '   br KiB', '   budget', ' headroom']),
    ...rows.map((row) =>
      line([
        row.route.padEnd(width),
        String(row.chunks).padStart(6),
        number(kib(row.rawBytes)).padStart(9),
        number(kib(row.brotliBytes)).padStart(9),
        (row.budget === null ? '—' : String(row.budget)).padStart(9),
        number(row.headroom).padStart(9),
      ]),
    ),
  ].join('\n');
}

/** Reads a named option's value (`--dist .next`), or the default. */
function option(argv, name, fallback) {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 && argv[at + 1] ? argv[at + 1] : fallback;
}

/**
 * The whole check. Returns the exit code, 0 when every route is within its budget; the CLI
 * below sets it. Paths in the stats file are relative to the directory the build ran in.
 */
export async function run({
  root = repositoryRoot(),
  argv = [],
  print = log,
  report = error,
  env = process.env,
} = {}) {
  const dist = resolve(root, option(argv, 'dist', env.NEXT_DIST_DIR || '.next'));
  const budgetsPath = resolve(root, option(argv, 'budgets', 'scripts/budgets.json'));
  const statsPath = resolve(dist, STATS_FILE);
  const shown = (path) => relative(root, path) || path;
  try {
    let statsText;
    try {
      statsText = await readFile(statsPath, 'utf8');
    } catch {
      throw new Error(
        `No ${shown(statsPath)}. It is written by a production build: run ` +
          '`COSMIC_VENUE_DATE=2026-11-06 npm run build` first.',
      );
    }
    const rows = parseRouteStats(statsText, shown(statsPath));
    const budgets = parseBudgets(await readFile(budgetsPath, 'utf8'), shown(budgetsPath));
    const framework = await readFile(resolve(dist, 'diagnostics/framework.json'), 'utf8')
      .then((text) => JSON.parse(text))
      .catch(() => ({ name: 'Next.js', version: 'unknown' }));
    const measured = await measureRoutes(rows, async (path, route) => {
      const absolute = resolve(root, path);
      if (!absolute.startsWith(dist + sep))
        throw new Error(`${route} lists ${path}, which is outside ${shown(dist)}.`);
      try {
        return await readFile(absolute);
      } catch {
        throw new Error(
          `${route} lists ${path}, which is missing: the build is incomplete or older than its ` +
            'stats. Build again.',
        );
      }
    });
    const { rows: checked, failures } = checkBudgets(measured, budgets, shown(budgetsPath));
    print(
      formatReport(
        checked,
        `First-load JavaScript per route, Brotli at quality ${BROTLI_QUALITY} as Vercel sends it ` +
          `(${framework.name} ${framework.version}, ` +
          `budgets in ${shown(budgetsPath)})`,
      ),
    );
    if (failures.length) {
      report(`\n${failures.length} route budget(s) failed:`);
      for (const failure of failures) report(`- ${failure}`);
      return 1;
    }
    print(`\nEvery route is within its first-load JavaScript budget.`);
    return 0;
  } catch (failure) {
    report(failure instanceof Error ? failure.message : String(failure));
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = await run({ argv: process.argv.slice(2) });
