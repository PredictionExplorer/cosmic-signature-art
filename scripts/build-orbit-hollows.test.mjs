import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  PARAMETERS,
  decideDerivedOn,
  hollowEntry,
  hollowJobs,
  measureHollows,
  mergeHollows,
  refusal,
  serializeHollows,
  settle,
} from './build-orbit-hollows.mjs';
import { inOwnHollow } from './lib/ink-hollows.mjs';

const read = async (name) =>
  JSON.parse(await readFile(new URL(`../src/lib/art/${name}`, import.meta.url), 'utf8'));
const copy = (value) => JSON.parse(JSON.stringify(value));

const own = { x: 10, y: 20, paper: true, hollow: { offset: 0.03, radius: 1.02 } };
const open = { x: 30, y: 40, paper: true, hollow: null };

test('a still bears out its bodies only when they stand on paper, one in its own hollow', () => {
  assert.equal(refusal({ id: 1, bodies: [own, open, open] }), null);
  assert.match(refusal({ id: 1, bodies: [open, open, open] }), /no body stands in a hollow/);
  assert.match(
    refusal({ id: 1, bodies: [own, own, { ...open, paper: false }] }),
    /a body stands on ink/,
  );
  assert.equal(refusal({ id: 1, failure: 'unreadable' }), 'unreadable');
});

test('an entry binds the frame’s film and the Ink still, and keeps places to a hundredth', () => {
  const frame = { id: 7, seed: '0xab', traitsSha256: 'cd', film: { sha256: 'ef' } };
  const rung = { src: '/art/stills/7-ink-1920-0123.webp', sha256: '01', stillSha256: '23' };
  const entry = hollowEntry(frame, rung, {
    step: 999_999,
    bodies: [{ ...own, x: 1700.0912 }, open, open],
  });
  assert.deepEqual(entry, {
    id: 7,
    seed: '0xab',
    traitsSha256: 'cd',
    filmSha256: 'ef',
    ink: { stillSha256: '23', rung: { src: rung.src, sha256: '01' } },
    step: 999_999,
    bodies: [{ ...own, x: 1700.09 }, open, open],
  });
});

test('the hollows serialize stably, keep their date while unchanged, and merge by work', async () => {
  const entry = { id: 3, bodies: [own] };
  const text = await serializeHollows({ derivedOn: '2026-11-07', hollows: [entry] });
  const parsed = JSON.parse(text);
  assert.deepEqual(parsed.parameters, JSON.parse(JSON.stringify(PARAMETERS)));
  assert.equal(await serializeHollows(parsed), text);
  assert.equal(decideDerivedOn('2026-11-07', [entry], [entry], '2027-01-01'), '2026-11-07');
  assert.equal(decideDerivedOn('2026-11-07', [], [entry], '2027-01-01'), '2027-01-01');
  assert.deepEqual(
    mergeHollows([entry, { id: 9, old: true }], [{ id: 9 }, { id: 1 }]).map((item) => item.id),
    [1, 3, 9],
  );
  // The committed file is what the build writes.
  const committed = await readFile(
    new URL('../src/lib/art/orbit-hollows.json', import.meta.url),
    'utf8',
  );
  assert.equal(await serializeHollows(JSON.parse(committed)), committed);
});

test('a rebuild that finds the bodies where they were keeps the stored entry', async () => {
  const { hollows } = await read('orbit-hollows.json');
  const stored = hollows.find((entry) => entry.id === 31);
  const nudged = copy(stored);
  nudged.bodies[0].x += 0.01;
  nudged.bodies[1].hollow.radius += 5e-4;
  assert.equal(settle(stored, nudged), stored);
  assert.equal(settle(undefined, nudged), nudged);
  const moved = (change) => {
    const entry = copy(stored);
    change(entry);
    return settle(stored, entry) === entry;
  };
  assert.ok(moved((entry) => (entry.ink.stillSha256 = 'f'.repeat(64))));
  assert.ok(moved((entry) => (entry.filmSha256 = 'f'.repeat(64))));
  assert.ok(moved((entry) => (entry.bodies[2].x += 0.5)));
  assert.ok(moved((entry) => (entry.bodies[2].hollow = null)));
});

test('a job needs the frame’s own record, a window and the Ink rung the ladder recorded', async () => {
  const { frames } = await read('orbit-frames.json');
  const { records } = await read('orbit-records.json');
  const { windows } = await read('orbit-windows.json');
  const { rungs } = await read('still-ladder.json');
  const frame = frames.find((entry) => entry.id === 31);
  const [job] = hollowJobs([frame], records, windows, rungs);
  assert.equal(job.rung.width, PARAMETERS.rungWidth);
  assert.equal(job.rung.expression, 'ink');
  assert.equal(job.start.steps, 1_000_000);
  const other = records.map((record) =>
    record.id === 31 ? { ...record, traitsSha256: '0'.repeat(64) } : record,
  );
  assert.throws(() => hollowJobs([frame], other, windows, rungs), /not the orbit record's/);
  assert.throws(
    () =>
      hollowJobs(
        [frame],
        records,
        windows,
        rungs.filter((rung) => rung.id !== 31),
      ),
    /no Ink rung/,
  );
  // A rung whose bytes are not the ladder's is refused, never read.
  const [reply] = await measureHollows(
    [{ ...job, rung: { ...job.rung, sha256: '0'.repeat(64) } }],
    { width: 1 },
  );
  assert.match(reply.failure, /not the one the still ladder recorded/);
});

/*
  Every committed entry is measured again from the committed Ink rungs: the window replayed in
  its frame to the still's step, the primary copy's bodies placed on the still, and the hollow
  each stands in. The places may move in the last bits from machine to machine (framing.ts), far
  inside the hundredth of a pixel they are kept to.
*/
test('every work’s Ink still bears out its bodies, as the registry records', async () => {
  const { frames } = await read('orbit-frames.json');
  const { records } = await read('orbit-records.json');
  const { windows } = await read('orbit-windows.json');
  const { rungs } = await read('still-ladder.json');
  const { hollows } = await read('orbit-hollows.json');
  assert.deepEqual(
    hollows.map((entry) => entry.id),
    frames.map((entry) => entry.id),
  );
  const jobs = hollowJobs(frames, records, windows, rungs);
  // Two threads, as the frames' test: other pipelines' tests run beside this one.
  const replies = await measureHollows(jobs, { width: 2 });
  const differing = replies.flatMap((reply) => {
    const reason = refusal(reply);
    if (reason) return [{ id: reply.id, reason }];
    const frame = frames.find((entry) => entry.id === reply.id);
    const job = jobs.find((candidate) => candidate.id === reply.id);
    const stored = hollows.find((entry) => entry.id === reply.id);
    const measured = hollowEntry(frame, job.rung, reply);
    return settle(stored, measured) === stored ? [] : [{ id: reply.id, measured }];
  });
  assert.deepEqual(differing, []);
  // Most bodies stand in a hollow of their own; the rest share one or meet open paper.
  const found = hollows.reduce(
    (count, entry) => count + entry.bodies.filter((body) => inOwnHollow(body)).length,
    0,
  );
  assert.ok(found >= 190, `${found} of ${hollows.length * 3} bodies in their own hollows`);
});
