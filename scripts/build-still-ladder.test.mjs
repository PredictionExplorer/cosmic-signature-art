import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MASTER_MATCH_MEAN,
  PUBLISHED_MATCH_MEAN,
  QUALITY,
  RUNGS,
  consistent,
  faithful,
  orphans,
  rungEntry,
  rungKey,
  serializeRegistry,
} from './build-still-ladder.mjs';

test("the ladder has two rungs in the plate's proportion at an archival quality", () => {
  assert.deepEqual(RUNGS, [
    { width: 1280, height: 828 },
    { width: 1920, height: 1242 },
  ]);
  for (const rung of RUNGS) assert.ok(Math.abs(rung.width / rung.height - 3456 / 2234) < 0.002);
  assert.ok(QUALITY >= 92);
});

test('a rung is faithful to its master and consistent with the published still within measured limits', () => {
  assert.equal(faithful({ mean: 1.58, max: 18, over: 0 }), true);
  assert.equal(faithful({ mean: MASTER_MATCH_MEAN + 0.1 }), false);
  assert.equal(consistent({ mean: 1.908 }), true);
  assert.equal(consistent({ mean: PUBLISHED_MATCH_MEAN + 1 }), false);
});

test('registry entries keep a stable shape and order, and orphans are the unreferenced files', () => {
  const fields = {
    id: 31,
    seed: `0x${'a'.repeat(64)}`,
    expression: 'ink',
    width: 1920,
    height: 1242,
    src: '/art/stills/31-ink-1920-0123456789abcdef.webp',
    sha256: `0123456789abcdef${'d'.repeat(48)}`,
    bytes: 100,
    masterUrl: 'https://a1.cosmicsignature.com/m.png',
    masterSha256: 'b'.repeat(64),
    stillSha256: 'c'.repeat(64),
    masterMatch: { mean: 1.5, max: 18, over: 0 },
    publishedMatch: { mean: 1.9, max: 32, over: 0 },
  };
  const entry = rungEntry({ ...fields, extra: true });
  assert.deepEqual(Object.keys(entry), Object.keys(fields));
  assert.equal(rungKey(entry), '31:ink:1920');
  const small = { ...entry, width: 1280, src: '/art/stills/31-ink-1280-ffffffffffffffff.webp' };
  const light = {
    ...entry,
    expression: 'light',
    src: '/art/stills/31-light-1920-eeeeeeeeeeeeeeee.webp',
  };
  const registry = JSON.parse(serializeRegistry([entry, light, small]));
  assert.equal(registry.schemaVersion, 1);
  assert.deepEqual(registry.rungs.map(rungKey), ['31:ink:1280', '31:ink:1920', '31:light:1920']);
  assert.deepEqual(
    orphans(['31-ink-1920-0123456789abcdef.webp', 'old.webp', 'readme.md'], [entry]),
    ['old.webp'],
  );
});
