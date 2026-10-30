import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { hashFile } from './lib/origin.mjs';
import {
  PARAMETERS,
  SRGB_TO_LINEAR,
  addLight,
  brightnessGrid,
  exposeSky,
  fillingOrder,
  lightRungs,
  linearToSrgb,
  orphans,
  serializeRegistry,
  skyWorks,
} from './build-all-the-light.mjs';

const read = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));

test('light is added in linear light and every sRGB level comes back as itself', () => {
  for (let level = 0; level < 256; level++)
    assert.equal(linearToSrgb(SRGB_TO_LINEAR[level]), level);
  assert.equal(SRGB_TO_LINEAR[0], 0);
  assert.equal(SRGB_TO_LINEAR[255], 1);
  // Two mid-grey stills add to more than twice their sRGB value would suggest: light adds.
  const sum = new Float64Array(3);
  addLight(sum, Uint8Array.from([128, 128, 128]));
  addLight(sum, Uint8Array.from([128, 128, 128]));
  assert.ok(Math.abs(sum[0] - 2 * SRGB_TO_LINEAR[128]) < 1e-15);
  assert.throws(() => addLight(sum, new Uint8Array(6)), /differ in size/);
});

test('the soft shoulder keeps black black and never clips a crowd of light', () => {
  const sky = exposeSky(Float64Array.from([0, 1, 10, 1000]));
  assert.equal(sky[0], 0);
  assert.equal(sky[1], linearToSrgb(1 - Math.exp(-PARAMETERS.exposure)));
  assert.ok(sky[1] < sky[2] && sky[2] <= sky[3]);
  assert.equal(sky[3], 255);
});

test('the naming grid counts a ribbon across a cell and not a lone star in it', () => {
  // A 20 × 20 still, two cells across and down: a ribbon through the first cell, a star in
  // the second, nothing in the others.
  const width = 20;
  const pixels = new Uint8Array(width * width * 3);
  const paint = (x, y, value) => pixels.fill(value, (y * width + x) * 3, (y * width + x) * 3 + 3);
  for (let x = 0; x < 10; x++) for (const y of [4, 5]) paint(x, y, 200);
  paint(15, 3, 255);
  const grid = brightnessGrid(pixels, width, width, [2, 2]);
  assert.equal(grid[0], 40);
  assert.equal(grid[1], 0);
  assert.deepEqual([grid[2], grid[3]], [0, 0]);
});

test('the sky fills cycle by cycle, by number within a cycle, from rungs at every width', () => {
  const works = [{ id: 9, cycle: 1 }, { id: 2, cycle: 0 }, { id: 7, cycle: 0 }, { id: 3 }];
  assert.deepEqual(
    fillingOrder(works).map((work) => work.id),
    [2, 7, 9],
  );
  const rung = (id, width, expression = 'light') => ({
    id,
    width,
    expression,
    src: `/${id}-${width}`,
  });
  const ladder = { rungs: [rung(2, 1280), rung(2, 1920), rung(7, 1280), rung(7, 1920, 'ink')] };
  assert.deepEqual(Object.keys(lightRungs(ladder, 2)), ['1280', '1920']);
  assert.equal(lightRungs(ladder, 7), null);
  // A work whose Light still is not yet published waits; the published ones still make a sky.
  const { works: held, waiting } = skyWorks(works, ladder);
  assert.deepEqual(
    held.map(({ work }) => work.id),
    [2],
  );
  assert.deepEqual(waiting, [7, 9]);
});

test('the registry serializes stably and names the files a rebuild keeps', async () => {
  const registry = {
    builtOn: '2026-10-30',
    works: [{ id: 1, cycle: 0, rungs: {} }],
    cycles: [0],
    skies: [{ upTo: 0, width: 1280, height: 828, src: '/art/light/sky-0-1280-aaaa.webp' }],
    grid: { src: '/art/light/grid-bbbb.webp' },
  };
  const text = await serializeRegistry(registry);
  assert.equal(await serializeRegistry(JSON.parse(text)), text);
  assert.deepEqual(JSON.parse(text).parameters, PARAMETERS);
  assert.deepEqual(
    orphans(['sky-0-1280-aaaa.webp', 'grid-bbbb.webp', 'grid-old.webp', '.DS_Store'], registry),
    ['grid-old.webp'],
  );
});

test('the committed sky is built from the ladder’s own rungs, and every file is intact', async () => {
  const registry = await read('../src/lib/art/all-the-light.json');
  const ladder = await read('../src/lib/art/still-ladder.json');
  const index = await read('../src/lib/art/collection-index.json');
  assert.deepEqual(
    registry.works.map((work) => work.id),
    skyWorks(index.works, ladder).works.map(({ work }) => work.id),
  );
  for (const work of registry.works) {
    const rungs = lightRungs(ladder, work.id);
    for (const width of PARAMETERS.widths)
      assert.deepEqual(work.rungs[width], {
        src: rungs[width].src,
        sha256: rungs[width].sha256,
      });
  }
  assert.equal(registry.skies.length, registry.cycles.length * PARAMETERS.widths.length);
  for (const file of [...registry.skies, registry.grid])
    assert.equal(await hashFile(new URL(`../public${file.src}`, import.meta.url)), file.sha256);
});
