import assert from 'node:assert/strict';
import { test } from 'node:test';
import { overWorkers } from './orbit-verify.mjs';

const worker = (source) => new URL(`data:text/javascript,${encodeURIComponent(source)}`);

test('every item is answered once, and the answers come back in order of id', async () => {
  const echo = worker(
    "import { parentPort } from 'node:worker_threads';" +
      'parentPort.on("message", (item) => parentPort.postMessage(item));',
  );
  const results = await overWorkers([{ id: 3 }, { id: 1 }, { id: 2 }], echo, (item) => item, {
    width: 2,
  });
  assert.deepEqual(
    results.map((result) => result.id),
    [1, 2, 3],
  );
});

test('a worker that stops before its work is done fails the build instead of hanging it', async () => {
  const quits = worker('process.exit(3);');
  await assert.rejects(
    overWorkers([{ id: 1 }], quits, (item) => item),
    /stopped \(3\) before its work was done/,
  );
});
