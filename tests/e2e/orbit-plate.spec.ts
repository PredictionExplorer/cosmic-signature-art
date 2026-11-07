import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { catalogs } from '../../src/lib/i18n/messages';
import { pauseAmbientMotion } from './helpers';

const t = catalogs.en;
const root = new URL('../../', import.meta.url);
const { hollows } = JSON.parse(
  readFileSync(new URL('src/lib/art/orbit-hollows.json', root), 'utf8'),
) as { hollows: { id: number; bodies: { x: number; y: number }[] }[] };
/** Where № 031's bodies stand at the window's last step, in its frame's pixels (3,456 × 2,234). */
const rests = hollows.find((entry) => entry.id === 31)!.bodies;

/**
 * The orbit drawn on the plate (third-physics-phase-d.md §7): with the work's frame the section's
 * drawing lies over the still the page shows, untouched, and each body is drawn where the films
 * put it. Drawn whole (reduced motion, or Pause), the window ends where its still shows it: on
 * Ink, each body in the hollow it left. Every engine places the bodies with the same arithmetic.
 */
async function drawnWhole(page: Page, path: string, reducedMotion: boolean) {
  await page.goto(path);
  if (!reducedMotion) await pauseAmbientMotion(page);
  const orbit = page.getByRole('region', { name: t.orbitTitle });
  await orbit.scrollIntoViewIfNeeded();
  await expect(orbit).toHaveAttribute('data-phase', 'derived', { timeout: 30_000 });
  return orbit;
}

/**
 * At each body's place on the plate: how opaque the section's marks are there (a body is drawn
 * there), how bright the still beneath is (paper), the most of each within a pixel or two of the
 * place on the canvas's own grid; and in how many of 64 directions the paper meets ink within
 * 1.7 of the Ink edition's body radii (a hollow, ringed all round).
 */
function atRest(page: Page, places: { x: number; y: number }[]) {
  return page.evaluate(async (bodies) => {
    const stage = document.querySelector<HTMLElement>('#orbit [data-drawing="plate"]')!;
    const marks = stage.querySelectorAll('canvas')[2];
    const { width, height } = marks;
    const drawn = marks.getContext('2d')!.getImageData(0, 0, width, height).data;
    const image = stage.querySelector('img')!;
    await image.decode();
    const sheet = document.createElement('canvas');
    sheet.width = width;
    sheet.height = height;
    const context = sheet.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(image, 0, 0, width, height);
    const still = context.getImageData(0, 0, width, height).data;
    const grey = (px: number, py: number) => {
      const p = (Math.round(py) * width + Math.round(px)) * 4;
      return (still[p] + still[p + 1] + still[p + 2]) / 3;
    };
    const radius = 0.025 * height;
    return bodies.map(({ x, y }) => {
      const cx = Math.round((x / 3456) * width);
      const cy = Math.round((y / 2234) * height);
      let mark = 0;
      let paper = 0;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          mark = Math.max(mark, drawn[((cy + dy) * width + cx + dx) * 4 + 3]);
          paper = Math.max(paper, grey(cx + dx, cy + dy));
        }
      let ringed = 0;
      for (let turn = 0; turn < 64; turn++) {
        const angle = (turn / 64) * 2 * Math.PI;
        for (let reach = radius; reach <= 1.7 * radius; reach += 0.5)
          if (grey(cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach) < 150) {
            ringed += 1;
            break;
          }
      }
      return { mark, paper, ringed };
    });
  }, places);
}

test('№ 031’s orbit is drawn on its Ink still, each body at rest in the hollow it left', async ({
  page,
}, info) => {
  const orbit = await drawnWhole(
    page,
    '/art/31?expression=ink',
    info.project.name.includes('reduced-motion'),
  );
  await expect(orbit).toHaveAttribute('data-drawing', 'plate');
  await expect(orbit).toHaveAttribute('data-material', 'ink');
  const still = orbit.locator('figure img');
  await expect(still).toHaveAttribute('alt', '');
  await expect
    .poll(() => still.evaluate((image) => (image as HTMLImageElement).currentSrc))
    .toMatch(/\/art\/stills\/31-ink-(?:1280|1920)-[a-f0-9]{16}\.webp$/);
  await expect(orbit.getByText(/each comes to rest in the hollow it left/)).toBeVisible();
  await expect(orbit.getByText(/Analysis, not the work\.$/)).toBeVisible();
  // Each body is drawn at its rest, and the still beneath it there is bare paper ringed by ink:
  // the hollow it left. Ninety pixels of the frame away, the paper opens out.
  await expect
    .poll(async () => (await atRest(page, rests)).every(({ mark }) => mark > 64), {
      timeout: 15_000,
    })
    .toBe(true);
  for (const { paper, ringed } of await atRest(page, rests)) {
    expect(paper).toBeGreaterThan(200);
    expect(ringed).toBeGreaterThanOrEqual(60);
  }
  const aside = await atRest(
    page,
    rests.map(({ x, y }) => ({ x: x + 90, y: y - 60 })),
  );
  for (const { mark, ringed } of aside) {
    expect(mark).toBeLessThan(64);
    expect(ringed).toBeLessThan(48);
  }
  // Away from the bodies nothing of theirs is drawn: the middle of the hollows' triangle.
  const between = {
    x: (rests[0].x + rests[1].x + rests[2].x) / 3,
    y: (rests[0].y + rests[1].y + rests[2].y) / 3,
  };
  const [{ mark: elsewhere }] = await atRest(page, [between]);
  expect(elsewhere).toBeLessThan(64);
});

test('№ 031’s orbit is drawn on its Light still, each body where its stroke ends', async ({
  page,
}, info) => {
  const orbit = await drawnWhole(
    page,
    '/art/31?expression=light',
    info.project.name.includes('reduced-motion'),
  );
  await expect(orbit).toHaveAttribute('data-drawing', 'plate');
  await expect(orbit).toHaveAttribute('data-material', 'light');
  await expect
    .poll(() =>
      orbit.locator('figure img').evaluate((image) => (image as HTMLImageElement).currentSrc),
    )
    .toMatch(/\/art\/stills\/31-light-(?:1280|1920)-[a-f0-9]{16}\.webp$/);
  await expect(orbit.getByText(/each ends where its stroke ends/)).toBeVisible();
  // The bodies' lights stand at the window's last step, where the Ink still's hollows are too:
  // one frame for both expressions.
  await expect
    .poll(async () => (await atRest(page, rests)).every(({ mark }) => mark > 64), {
      timeout: 15_000,
    })
    .toBe(true);
});

test('the plate keeps the still’s proportions and turns with the page’s plate', async ({
  page,
  isMobile,
}, info) => {
  // The day pinned for the suite is an Ink day: № 023 opens on Ink with nothing asked.
  const orbit = await drawnWhole(page, '/art/23', info.project.name.includes('reduced-motion'));
  await expect(orbit).toHaveAttribute('data-material', 'ink');
  const stage = orbit.locator('[data-drawing="plate"]');
  const box = (await stage.boundingBox())!;
  expect(box.width / box.height).toBeCloseTo(3456 / 2234, 1);
  if (isMobile) {
    // A phone's plate runs the full width between the gutters.
    const viewport = page.viewportSize()!;
    expect(box.width).toBeGreaterThan(viewport.width - 48);
  }
  // A Turn of the page's plate turns the section's with it: the visitor's choice.
  const plate = page.locator('[data-artwork-stage="page"]:visible [data-layer-state="current"]');
  await plate.scrollIntoViewIfNeeded();
  await plate.getByRole('button', { name: t.light, exact: true }).click();
  await expect(page.locator('[data-presentation="gallery"]')).toHaveAttribute(
    'data-expression',
    'light',
  );
  await expect(orbit).toHaveAttribute('data-material', 'light');
  // Back down at the section, its plate is the Light still: the image was asked for at once,
  // since the section had come near, not at the browser's lazy margin.
  await expect(orbit.locator('figure img')).toHaveAttribute('loading', 'eager');
  await orbit.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      orbit.locator('figure img').evaluate((image) => (image as HTMLImageElement).currentSrc),
    )
    .toMatch(/\/art\/stills\/23-light-/);
});
