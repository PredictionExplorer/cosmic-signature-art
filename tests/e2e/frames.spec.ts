import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import sharp from 'sharp';

/**
 * The frames (third-physics.md §5.8, the Overture's version 2), checked as Phase A checked the
 * orbit: in every engine, the very files Node runs (src/lib/physics, types stripped) place every
 * indexed work's recorded window on its plate, where its published Light film gained light, and
 * re-derive a frame from its seed. The engine is all that is under test, so the page is a blank
 * one on an origin of its own: one project an engine (the desks) is enough.
 */
const ORIGIN = 'http://frames.test';
const root = new URL('../../', import.meta.url);
const read = (path: string) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const { parameters, frames } = read('src/lib/art/orbit-frames.json');
const { records } = read('src/lib/art/orbit-records.json');
const { windows } = read('src/lib/art/orbit-windows.json');

type Entry = (typeof frames)[number];
const numbers = (values: string[]) => values.map(Number);
const recordOf = (id: number) => records.find((record: { id: number }) => record.id === id);
const startOf = (id: number) => {
  const record = recordOf(id);
  const window = windows.find((entry: { id: number }) => entry.id === id);
  return {
    masses: numbers(record.physics.masses),
    dt: Number(record.generation.dt),
    steps: record.generation.steps,
    positions: numbers(window.positions),
    velocities: numbers(window.velocities),
  };
};
const frameOf = (entry: Entry) => ({
  width: entry.width,
  height: entry.height,
  projection: entry.projection,
  velocityScale: Number(entry.velocityScale),
  view: numbers(entry.view.triple),
  drift: {
    config: {
      scale: Number(entry.drift.scale),
      arcFraction: Number(entry.drift.arcFraction),
      eccentricity: Number(entry.drift.eccentricity),
    },
    orientation: {
      inclination: Number(entry.drift.inclination),
      ascendingNode: Number(entry.drift.ascendingNode),
      argumentOfPeriapsis: Number(entry.drift.argumentOfPeriapsis),
      initialMeanAnomaly: Number(entry.drift.initialMeanAnomaly),
    },
    semiMajor: Number(entry.drift.semiMajor),
    semiMinor: Number(entry.drift.semiMinor),
  },
  box: Object.fromEntries(Object.entries(entry.box).map(([key, value]) => [key, Number(value)])),
  symmetry: entry.symmetry,
});

/** A blank page on its own origin, serving the physics port and the traces from this checkout. */
async function bench(page: Page) {
  await page.route(`${ORIGIN}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    const physics = /^\/physics\/([a-z-]+\.ts)$/.exec(pathname);
    if (physics) {
      const source = readFileSync(new URL(`src/lib/physics/${physics[1]}`, root), 'utf8');
      return route.fulfill({ contentType: 'text/javascript', body: stripTypeScriptTypes(source) });
    }
    if (/^\/art\/traces\/[0-9]+-light-[a-f0-9]{16}\.webp$/.test(pathname))
      return route.fulfill({
        contentType: 'image/webp',
        body: readFileSync(new URL(`public${pathname}`, root)),
      });
    if (pathname === '/')
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html>' });
    return route.fulfill({ status: 404 });
  });
  await page.goto(`${ORIGIN}/`);
}

/** The engine is all that is under test, so one project an engine asks: the desks. */
function oneProjectAnEngine(info: TestInfo) {
  test.skip(!info.project.name.endsWith('-desktop'), 'One project an engine.');
}

test('every indexed work’s bodies stand where its Light film drew them, in this engine', async ({
  page,
}, info) => {
  oneProjectAnEngine(info);
  test.slow();
  await bench(page);
  // The trace as Node decodes it, so a browser that decoded it otherwise would say so.
  const works = await Promise.all(
    frames.map(async (entry: Entry) => {
      const file = new URL(`public${entry.trace.src}`, root);
      const { data, info } = await sharp(readFileSync(file))
        .raw()
        .toBuffer({ resolveWithObject: true });
      let checksum = 0;
      for (let p = 0; p < info.width * info.height; p++)
        checksum += data[p * info.channels] | (data[p * info.channels + 1] << 8);
      return {
        id: entry.id,
        src: entry.trace.src,
        frames: entry.film.frames,
        start: startOf(entry.id),
        frame: frameOf(entry),
        checksum,
      };
    }),
  );
  const measured = await page.evaluate(
    async ({ works, stride }) => {
      const port = '/physics/framing.ts';
      const framing = await import(port);
      const results = [];
      for (const work of works) {
        const blob = await (await fetch(work.src)).blob();
        const bitmap = await createImageBitmap(blob, {
          colorSpaceConversion: 'none',
          premultiplyAlpha: 'none',
        });
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d', { willReadFrequently: true })!;
        context.drawImage(bitmap, 0, 0);
        const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
        const trace = framing.traceFromPixels(data, {
          width: bitmap.width,
          height: bitmap.height,
          channels: 4,
          slices: 16,
          frames: work.frames,
        });
        let checksum = 0;
        for (const bits of trace.bits) checksum += bits;
        const agreement = framing.traceAgreement(trace, work.start, work.frame, { stride });
        results.push({ id: work.id, checksum, agreement });
      }
      return results;
    },
    { works, stride: parameters.traceStride },
  );
  expect(measured).toHaveLength(frames.length);
  for (const [index, entry] of (frames as Entry[]).entries()) {
    const { id, checksum, agreement } = measured[index];
    expect(id).toBe(entry.id);
    expect(checksum, `№ ${id}'s trace decodes as Node decodes it`).toBe(works[index].checksum);
    // As often as the build measured the bodies there, and far more often than any other view's.
    expect(Math.abs(agreement - entry.trace.agreement), `№ ${id}`).toBeLessThanOrEqual(1e-4);
    expect(agreement).toBeGreaterThanOrEqual(parameters.accept.traceLead * entry.trace.otherViews);
  }
});

test('a frame is re-derived from its seed here as Node derived it', async ({ page }, info) => {
  oneProjectAnEngine(info);
  test.slow();
  await bench(page);
  // The day's work of the suite's venue day, and a mirrored-and-turned phase portrait.
  const works = [23, 1].map((id) => {
    const entry = (frames as Entry[]).find((frame) => frame.id === id)!;
    const record = recordOf(id);
    return {
      id,
      generation: {
        seed: record.seed,
        candidatesPerAttempt: record.generation.candidatesPerAttempt,
        weightsRandomized: record.generation.weightsRandomized,
      },
      start: startOf(id),
      traits: {
        projection: entry.projection,
        symmetry: entry.symmetry,
        stack: entry.stack,
        preferredStack: entry.preferredStack,
        wildcard: entry.wildcard,
        drift: {
          enabled: true,
          mode: 'elliptical',
          scale: Number(entry.drift.scale),
          arcFraction: Number(entry.drift.arcFraction),
          eccentricity: Number(entry.drift.eccentricity),
        },
        width: entry.width,
        height: entry.height,
      },
      frame: frameOf(entry),
      scores: numbers(entry.view.scores),
      candidate: entry.view.candidate,
    };
  });
  const derived = await page.evaluate(async (works) => {
    const port = '/physics/frame-derivation.ts';
    const { deriveFrame } = await import(port);
    return works.map((work) => {
      const result = deriveFrame(work.generation, work.start, work.traits);
      return {
        exact: result.checks.every((row: { exact: boolean }) => row.exact),
        candidate: result.view.candidate,
        scores: result.view.scores,
        frame: result.frame,
      };
    });
  }, works);
  for (const [index, work] of works.entries()) {
    const { exact, candidate, scores, frame } = derived[index];
    // The stream's draws and the arithmetic of + − × ÷ and √ are exact in every engine.
    expect(exact).toBe(true);
    expect(candidate).toBe(work.candidate);
    expect(frame.drift.config).toEqual(work.frame.drift.config);
    expect(frame.drift.orientation).toEqual(work.frame.drift.orientation);
    expect(frame.velocityScale).toBe(work.frame.velocityScale);
    expect(frame.view).toEqual(work.frame.view);
    // Sines, cosines and logarithms may round apart from V8's in the last place.
    scores.forEach((score: number, k: number) => expect(score).toBeCloseTo(work.scores[k], 12));
    for (const key of ['minX', 'maxX', 'minY', 'maxY', 'width', 'height'] as const)
      expect(Math.abs(frame.box[key] - work.frame.box[key])).toBeLessThanOrEqual(
        1e-9 * work.frame.box.width,
      );
    expect(frame.drift.semiMajor).toBeCloseTo(work.frame.drift.semiMajor, 6);
  }
});
