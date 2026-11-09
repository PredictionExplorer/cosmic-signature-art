import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { workOfTheDay } from '../../src/lib/art/work-of-the-day';
import { REWIND_LEAD_S } from '../../src/lib/crossing/rewind';

/*
  The run back (src/components/plate-rewind.ts). A plate that performs its film from the
  beginning never cuts from its still to the film's bare first frame: the still runs back to it
  in the reverse of the order the work was made, and the film plays on from just before its first
  mark. The suite's visitor has seen First Light, so the home and a work page open on the plate.
*/
const { clips } = JSON.parse(
  readFileSync(new URL('../../src/lib/art/plate-clips.json', import.meta.url), 'utf8'),
) as {
  clips: {
    id: number;
    expression: string;
    kind: string;
    frameRate: number;
    firstMarkFrame?: number;
  }[];
};
/** Where a work's Ink film first shows the work, as its opening clip records it. */
function firstMark(id: number) {
  const clip = clips.find(
    (entry) => entry.id === id && entry.expression === 'ink' && entry.kind === 'opening',
  );
  if (clip?.firstMarkFrame === undefined) throw new Error(`№ ${id} records no first mark`);
  return clip.firstMarkFrame / clip.frameRate;
}

type Moment = {
  state: string | null;
  /** Of the still's marks, the share the canvas covers with the film's frame; null if it is clear. */
  covered: number | null;
  /** Of what the canvas shows, the share that departs from the sheet: the film's frame's marks. */
  marks: number | null;
  /** The plate's film: where it stands, and whether it shows. */
  time: number | null;
  shown: boolean;
};

/**
 * The current plate's run back as it happens: a moment at each change of its state or of its
 * film's showing, and every 80 ms while it runs, with what the canvas covers of the still.
 */
async function watchTheRunBack(page: Page) {
  await page.addInitScript(() => {
    const moments: unknown[] = [];
    (window as unknown as { runBack: unknown[] }).runBack = moments;
    const grey = (data: Uint8ClampedArray, p: number) => (data[p] + data[p + 1] + data[p + 2]) / 3;
    const groundOf = (data: Uint8ClampedArray) => {
      const histogram = new Uint32Array(256);
      for (let p = 0; p < data.length; p += 4) histogram[Math.round(grey(data, p))] += 1;
      return histogram.indexOf(Math.max(...histogram));
    };
    const sample = (media: Element) => {
      const video = media.querySelector<HTMLVideoElement>('video:not([data-relay])');
      const canvas = media.querySelector<HTMLCanvasElement>('canvas.art-rewind');
      const still = media.querySelector<HTMLImageElement>('img.art-still');
      let covered: number | null = null;
      let marks: number | null = null;
      if (canvas?.width && canvas.height && still?.complete) {
        const { width, height } = canvas;
        const shown = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
        const sheet = document.createElement('canvas');
        sheet.width = width;
        sheet.height = height;
        const context = sheet.getContext('2d')!;
        context.drawImage(still, 0, 0, width, height);
        const work = context.getImageData(0, 0, width, height).data;
        const ground = groundOf(work);
        let workMarks = 0;
        let coveredMarks = 0;
        let opaque = 0;
        let filmMarks = 0;
        for (let p = 0; p < work.length; p += 4) {
          const mark = Math.abs(grey(work, p) - ground) > 40;
          const over = shown[p + 3] > 250;
          if (mark) workMarks += 1;
          if (mark && over) coveredMarks += 1;
          if (over) {
            opaque += 1;
            if (Math.abs(grey(shown, p) - ground) > 40) filmMarks += 1;
          }
        }
        covered = workMarks ? coveredMarks / workMarks : null;
        marks = opaque ? filmMarks / opaque : null;
      }
      return {
        state: media.getAttribute('data-rewind'),
        covered,
        marks,
        time: video?.currentTime ?? null,
        shown: !!media.querySelector('video.has-frame'),
      };
    };
    const plate = () =>
      document.querySelector('[data-layer-state="current"] .art-media, .viewer-plate .art-media');
    let last = '';
    const changed = () => {
      const media = plate();
      if (!media) return;
      const key = `${media.getAttribute('data-rewind')}|${!!media.querySelector('video.has-frame')}`;
      if (key === last) return;
      last = key;
      moments.push(sample(media));
    };
    new MutationObserver(changed).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-rewind', 'class'],
    });
    let sampled = 0;
    const watch = (now: number) => {
      const media = plate();
      if (media?.getAttribute('data-rewind') === 'running' && now - sampled >= 80) {
        sampled = now;
        moments.push(sample(media));
      }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
}

const moments = (page: Page) =>
  page.evaluate(() => (window as unknown as { runBack: Moment[] }).runBack);

for (const [route, work] of [
  ['/art/31', 31],
  ['/', workOfTheDay()],
] as const) {
  test(`${route}: the plate runs its still back to the film’s first frame, then the film plays on`, async ({
    page,
    isMobile,
  }, info) => {
    // A phone rests on its still with the excerpt as its motion; reduced motion never starts unasked.
    test.skip(isMobile || info.project.name.includes('reduced-motion'), 'desk, with motion');
    await watchTheRunBack(page);
    await page.goto(route);
    const plate = page.locator('[data-layer-state="current"] .art-media').first();
    await expect(plate).toHaveAttribute('data-rewind', 'running', { timeout: 20_000 });
    await expect(plate.locator('video.has-frame').first()).toBeAttached({ timeout: 20_000 });
    await expect(plate).not.toHaveAttribute('data-rewind', /./);
    const seen = await moments(page);
    const states = seen.map(({ state }) => state);
    expect(states.indexOf('cued')).toBeGreaterThan(states.indexOf('running'));
    const run = seen.filter(({ state }) => state === 'running');
    const cued = seen.find(({ state }) => state === 'cued')!;
    // While it runs back the film is never shown, and waits at its start: just before its first
    // mark, not on the seconds of bare sheet before it.
    const start = firstMark(work) - REWIND_LEAD_S;
    expect(seen.slice(0, seen.indexOf(cued)).some(({ shown }) => shown)).toBe(false);
    // (The state is read a moment after it changes: the last sample may catch the film starting.)
    for (const { time } of run) {
      expect(time).toBeGreaterThanOrEqual(start - 0.04);
      expect(time).toBeLessThan(start + 0.1);
    }
    // The still's marks are taken away gradually, never more at once than a step allows, from
    // (all but) none to all: a run back, not a cut.
    const covered = [...run, cued].map((moment) => moment.covered ?? 0);
    expect(covered[0]).toBeLessThan(0.1);
    expect(covered.filter((share) => share > 0.05 && share < 0.95).length).toBeGreaterThanOrEqual(
      3,
    );
    for (let index = 1; index < covered.length; index += 1)
      expect(covered[index]).toBeGreaterThanOrEqual(covered[index - 1] - 0.01);
    // At its end the plate is the film's own first frame, everywhere: the bare sheet.
    expect(cued.covered).toBeGreaterThan(0.99);
    expect(cued.marks).toBeLessThan(0.001);
    // And the film plays on from there.
    const first = seen.find(({ shown }) => shown)!;
    expect(first.time).toBeGreaterThanOrEqual(start - 0.05);
    expect(first.time).toBeLessThan(start + 0.5);
  });
}

test('with motion reduced, a film asked for starts at its first mark without running back', async ({
  page,
}, info) => {
  test.skip(!info.project.name.includes('reduced-motion'), 'reduced motion');
  await watchTheRunBack(page);
  await page.goto('/art/31');
  const plate = page.locator('[data-layer-state="current"] .art-media').first();
  await expect(plate.locator('img.art-still')).toHaveClass(/is-settled/);
  await page.locator('button.motion-toggle').click();
  const film = plate.locator('video').first();
  await expect(film).toHaveClass(/has-frame/, { timeout: 20_000 });
  const seen = await moments(page);
  expect(seen.every(({ state }) => state === null)).toBe(true);
  const first = seen.find(({ shown }) => shown)!;
  expect(first.time).toBeGreaterThanOrEqual(firstMark(31) - REWIND_LEAD_S - 0.05);
  expect(first.time).toBeLessThan(firstMark(31) - REWIND_LEAD_S + 0.5);
});
