import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  BUDGETS_KEY,
  checkBudgets,
  formatReport,
  gzipSize,
  kib,
  measureRoutes,
  parseBudgets,
  parseRouteStats,
  run,
} from './check-js-budgets.mjs';

const KIB = 1024;

test('a chunk is measured gzipped, which repetition shrinks and noise does not', () => {
  const repetitive = Buffer.from('const art = "light";\n'.repeat(500));
  assert.ok(gzipSize(repetitive) < repetitive.length / 10);
  assert.equal(
    gzipSize(repetitive),
    gzipSize(Buffer.from(repetitive)),
    'the same bytes, the same size',
  );
  assert.equal(kib(1536), 1.5);
  assert.equal(kib(1000), 1);
});

test('the build’s route list is read only in the shape Next writes', () => {
  const rows = [{ route: '/[locale]', firstLoadChunkPaths: ['.next/static/chunks/a.js'] }];
  assert.deepEqual(parseRouteStats(JSON.stringify(rows), 'stats'), rows);
  assert.throws(() => parseRouteStats('{', 'stats'), /stats is not JSON/);
  assert.throws(() => parseRouteStats('[]', 'stats'), /firstLoadChunkPaths/);
  assert.throws(
    () => parseRouteStats(JSON.stringify([{ route: '/x', firstLoadChunkPaths: [] }]), 'stats'),
    /firstLoadChunkPaths/,
  );
  assert.throws(
    () => parseRouteStats(JSON.stringify([{ route: '/x', chunks: ['a.js'] }]), 'stats'),
    /update this script/,
  );
  assert.throws(
    () =>
      parseRouteStats(JSON.stringify([{ route: '/x', firstLoadChunkPaths: ['a.css'] }]), 'stats'),
    /firstLoadChunkPaths/,
  );
});

test('budgets are a route-to-KiB map, every budget a positive number', () => {
  const budgets = { '/[locale]': 345 };
  assert.deepEqual(parseBudgets(JSON.stringify({ [BUDGETS_KEY]: budgets }), 'b.json'), budgets);
  for (const wrong of [{}, { [BUDGETS_KEY]: { '/x': 0 } }, { [BUDGETS_KEY]: { x: 10 } }])
    assert.throws(() => parseBudgets(JSON.stringify(wrong), 'b.json'), /b\.json must map/);
});

test('a route’s total is the sum of its chunks, and a shared chunk is read once', async () => {
  const files = {
    'shared.js': Buffer.alloc(4 * KIB, 'a'),
    'home.js': Buffer.from('x'.repeat(100)),
    'work.js': Buffer.from('y'.repeat(300)),
  };
  const reads = [];
  const measured = await measureRoutes(
    [
      { route: '/[locale]/art/[id]', firstLoadChunkPaths: ['shared.js', 'work.js'] },
      { route: '/[locale]', firstLoadChunkPaths: ['shared.js', 'home.js'] },
    ],
    async (path) => {
      reads.push(path);
      return files[path];
    },
  );
  assert.deepEqual(reads.sort(), ['home.js', 'shared.js', 'work.js']);
  assert.deepEqual(
    measured.map(({ route, chunks, rawBytes }) => [route, chunks, rawBytes]),
    [
      ['/[locale]', 2, 4 * KIB + 100],
      ['/[locale]/art/[id]', 2, 4 * KIB + 300],
    ],
    'sorted by route',
  );
  assert.equal(measured[0].gzipBytes, gzipSize(files['shared.js']) + gzipSize(files['home.js']));
});

test('every route is held to its budget, and the file to the routes the build has', () => {
  const measured = [
    { route: '/[locale]', chunks: 15, rawBytes: 900 * KIB, gzipBytes: 300 * KIB },
    { route: '/[locale]/art/[id]', chunks: 15, rawBytes: 1000 * KIB, gzipBytes: 362.4 * KIB },
    { route: '/[locale]/new', chunks: 12, rawBytes: 800 * KIB, gzipBytes: 250 * KIB },
  ];
  const { rows, failures } = checkBudgets(measured, {
    '/[locale]': 345,
    '/[locale]/art/[id]': 360,
    '/[locale]/gone': 300,
  });
  assert.deepEqual(
    rows.map(({ route, budget, headroom }) => [route, budget, headroom]),
    [
      ['/[locale]', 345, 45],
      ['/[locale]/art/[id]', 360, -2.4],
      ['/[locale]/new', null, null],
    ],
  );
  assert.equal(failures.length, 3);
  assert.match(
    failures[0],
    /^\/\[locale\]\/art\/\[id\] loads 362\.4 KiB .* 2\.4 KiB over its 360 KiB budget/,
  );
  assert.match(failures[0], /npx next analyze/);
  assert.match(failures[1], /^\/\[locale\]\/new has no first-load JavaScript budget\. .* 250 KiB/);
  assert.match(failures[2], /sets a budget for \/\[locale\]\/gone, which the build does not have/);
  assert.deepEqual(checkBudgets(measured.slice(0, 1), { '/[locale]': 300 }).failures, []);
});

test('the report shows every route, with its budget and headroom or a dash', () => {
  const report = formatReport(
    [
      {
        route: '/[locale]',
        chunks: 15,
        rawBytes: 1024 * KIB,
        gzipBytes: 300 * KIB,
        budget: 345,
        headroom: 45,
      },
      { route: '/x', chunks: 1, rawBytes: KIB, gzipBytes: KIB, budget: null, headroom: null },
    ],
    'Heading',
  );
  const [heading, columns, home, other] = report.split('\n');
  assert.equal(heading, 'Heading');
  assert.match(columns, /^route\s+chunks\s+raw KiB\s+gzip KiB\s+budget\s+headroom$/);
  assert.match(home, /^\/\[locale\]\s+15\s+1024\.0\s+300\.0\s+345\s+45\.0$/);
  assert.match(other, /^\/x\s+1\s+1\.0\s+1\.0\s+—\s+—$/);
});

/** A production build's files, as far as this check reads them, in a scratch directory. */
async function fixture({ budgets, chunks, stats }) {
  const root = await mkdtemp(join(tmpdir(), 'js-budgets-'));
  await mkdir(join(root, '.next/diagnostics'), { recursive: true });
  await mkdir(join(root, '.next/static/chunks'), { recursive: true });
  await mkdir(join(root, 'scripts'));
  for (const [name, bytes] of Object.entries(chunks))
    await writeFile(join(root, '.next/static/chunks', name), bytes);
  if (stats)
    await writeFile(
      join(root, '.next', 'diagnostics/route-bundle-stats.json'),
      JSON.stringify(stats),
    );
  await writeFile(
    join(root, '.next/diagnostics/framework.json'),
    JSON.stringify({ name: 'Next.js', version: '16.4.2' }),
  );
  await writeFile(join(root, 'scripts/budgets.json'), JSON.stringify({ [BUDGETS_KEY]: budgets }));
  return root;
}

async function runIn(root, argv = []) {
  const printed = [];
  const reported = [];
  const code = await run({
    root,
    argv,
    env: {},
    print: (line) => printed.push(line),
    report: (line) => reported.push(line),
  });
  return { code, printed: printed.join('\n'), reported: reported.join('\n') };
}

test('the check passes a build within its budgets and prints the table', async () => {
  const root = await fixture({
    chunks: { 'a.js': Buffer.alloc(2 * KIB, 'a'), 'b.js': Buffer.from('b'.repeat(200)) },
    stats: [
      {
        route: '/[locale]',
        firstLoadChunkPaths: ['.next/static/chunks/a.js', '.next/static/chunks/b.js'],
      },
    ],
    budgets: { '/[locale]': 1 },
  });
  try {
    const { code, printed, reported } = await runIn(root);
    assert.equal(code, 0, reported);
    assert.match(printed, /Next\.js 16\.4\.2, budgets in scripts\/budgets\.json/);
    assert.match(printed, /^\/\[locale\]\s+2\s+2\.2\s/m);
    assert.match(printed, /Every route is within its first-load JavaScript budget\./);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the check fails a route over its budget, naming it and the file to change', async () => {
  // Random bytes do not compress: 4 KiB stays about 4 KiB gzipped.
  const root = await fixture({
    chunks: { 'big.js': randomBytes(4 * KIB) },
    stats: [{ route: '/[locale]/art/[id]', firstLoadChunkPaths: ['.next/static/chunks/big.js'] }],
    budgets: { '/[locale]/art/[id]': 1 },
  });
  try {
    const { code, reported } = await runIn(root);
    assert.equal(code, 1);
    assert.match(reported, /1 route budget\(s\) failed/);
    assert.match(reported, /\/\[locale\]\/art\/\[id\] loads .* over its 1 KiB budget/);
    assert.match(reported, /raise the budget in scripts\/budgets\.json/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('without a build, or with chunks missing or outside it, the check says what to do', async () => {
  const unbuilt = await fixture({ chunks: {}, stats: null, budgets: { '/[locale]': 1 } });
  const partial = await fixture({
    chunks: {},
    stats: [{ route: '/[locale]', firstLoadChunkPaths: ['.next/static/chunks/gone.js'] }],
    budgets: { '/[locale]': 1 },
  });
  const escaping = await fixture({
    chunks: {},
    stats: [{ route: '/[locale]', firstLoadChunkPaths: ['package.js'] }],
    budgets: { '/[locale]': 1 },
  });
  try {
    const none = await runIn(unbuilt);
    assert.equal(none.code, 1);
    assert.match(
      none.reported,
      /No \.next\/diagnostics\/route-bundle-stats\.json\. .*npm run build/,
    );
    const missing = await runIn(partial);
    assert.equal(missing.code, 1);
    assert.match(missing.reported, /lists \.next\/static\/chunks\/gone\.js, which is missing/);
    const outside = await runIn(escaping);
    assert.equal(outside.code, 1);
    assert.match(outside.reported, /lists package\.js, which is outside \.next/);
  } finally {
    await Promise.all(
      [unbuilt, partial, escaping].map((root) => rm(root, { recursive: true, force: true })),
    );
  }
});

test('another build directory and budgets file can be named', async () => {
  const root = await fixture({ chunks: {}, stats: null, budgets: {} });
  try {
    await mkdir(join(root, '.next-other/diagnostics'), { recursive: true });
    await mkdir(join(root, '.next-other/static/chunks'), { recursive: true });
    await writeFile(join(root, '.next-other/static/chunks/a.js'), 'a');
    await writeFile(
      join(root, '.next-other/diagnostics/route-bundle-stats.json'),
      JSON.stringify([{ route: '/x', firstLoadChunkPaths: ['.next-other/static/chunks/a.js'] }]),
    );
    await writeFile(join(root, 'other.json'), JSON.stringify({ [BUDGETS_KEY]: { '/x': 1 } }));
    const { code, printed } = await runIn(root, [
      '--dist',
      '.next-other',
      '--budgets',
      'other.json',
    ]);
    assert.equal(code, 0);
    assert.match(printed, /budgets in other\.json/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the checked-in budgets cover the same routes and hold sensible sizes', async () => {
  const text = await readFile(new URL('./budgets.json', import.meta.url), 'utf8');
  const budgets = parseBudgets(text, 'scripts/budgets.json');
  assert.ok(budgets['/[locale]'] && budgets['/[locale]/art/[id]'], 'the home and the work page');
  for (const [route, size] of Object.entries(budgets))
    assert.ok(size >= 100 && size <= 1000, `${route}: ${size} KiB is not a plausible budget`);
  // The lab's paint budgets may be stricter than the field's lines for "good", never looser.
  const { paint } = JSON.parse(text);
  assert.ok(paint.largestContentfulPaintMs > 0 && paint.largestContentfulPaintMs <= 2500);
  assert.ok(paint.cumulativeLayoutShift > 0 && paint.cumulativeLayoutShift <= 0.1);
});
