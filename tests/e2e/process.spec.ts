import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { catalogs } from '../../src/lib/i18n/messages';
import { fill } from '../../src/lib/i18n/format';
import { workOfTheDay } from '../../src/lib/art/work-of-the-day';
import { deriveBeginnings, QUICK_GATE } from '../../src/lib/physics/beginnings';
import { artworkImageSource, imageLoaded, noHorizontalOverflow } from './helpers';

const t = catalogs.en;
const folio = (id: number) => String(id).padStart(3, '0');
const archive = JSON.parse(
  readFileSync(new URL('../../src/lib/art/curated-records.json', import.meta.url), 'utf8'),
) as { records: { id: number; seed: string }[] };
const plates = JSON.parse(
  readFileSync(new URL('../../src/lib/art/plate-records.json', import.meta.url), 'utf8'),
) as { records: { id: number; ink: { tone: string } }[] };
const index = JSON.parse(
  readFileSync(new URL('../../src/lib/art/collection-index.json', import.meta.url), 'utf8'),
) as { works: { id: number; borda: { selectedIndex: number; totalCandidates: number } }[] };
/** The orbit records, as published: the generation that chose each work, doubles as text. */
const orbits = JSON.parse(
  readFileSync(new URL('../../src/lib/art/orbit-records.json', import.meta.url), 'utf8'),
) as {
  records: {
    id: number;
    seed: string;
    generation: {
      candidatesPerAttempt: number;
      selectedIndex: number;
      retryCount: number;
      weightsRandomized: boolean;
      dt: string;
      steps: number;
      warmupSteps: number;
    };
    physics: { masses: [string, string, string] };
  }[];
};
/** The one real control; the running head's inert overlay repeats its markup without a role. */
const motionToggle = (page: Page) => page.locator('button.motion-toggle');
async function pauseAmbientMotion(page: Page) {
  const control = motionToggle(page);
  const initiallyPaused = await page.evaluate(() => {
    const saved = sessionStorage.getItem('cosmic-art-motion-v1');
    return saved ? saved === 'paused' : matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  await expect(control).toHaveAttribute('aria-pressed', String(initiallyPaused));
  if (!initiallyPaused) await control.click();
  await expect(control).toHaveAttribute('aria-pressed', 'true');
}
const rgb = (hex: string) =>
  `rgb(${[1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)).join(', ')})`;

test('the essay opens on night, pins the day’s Light film, crosses a hard edge into Ink paper and ends on the thesis', async ({
  page,
  isMobile,
}, testInfo) => {
  // The day's work is deterministic per UTC date; a test that spans midnight may see either.
  const day = workOfTheDay();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/process');
  await pauseAmbientMotion(page);
  const header = page.locator('.site-header');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.processTitle);
  await expect(page.getByText(t.statementSigned)).toBeVisible();
  await expect(header).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  const chapters = page.getByRole('navigation', { name: t.ways });
  await expect(chapters.getByRole('link')).toHaveCount(4);
  await expect(chapters.getByRole('link').nth(0)).toHaveText(`00${t.chapterChoice}`);
  await expect(chapters.getByRole('link').nth(3)).toHaveText(`03${t.chapterSpectrum}`);

  // 00 The choice: the day's work's real Borda line, formatted for the reader.
  const work = index.works.find((candidate) => candidate.id === day)!;
  const choice = page.locator('#choice');
  await expect(choice).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(choice).toContainText(
    `One of ${work.borda.totalCandidates.toLocaleString('en')} candidate orbits. Number ${work.borda.selectedIndex.toLocaleString('en')} was chosen.`,
  );
  await expect(choice).toContainText(`№ ${folio(day)}`);

  // 01 Light: the authentic Light still of the day's work on true black.
  const light = page.locator('#light .art-media:visible');
  await light.scrollIntoViewIfNeeded();
  await imageLoaded(light.locator('img.art-still'));
  await expect(light).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(light.locator('img.art-still')).toHaveAttribute(
    'alt',
    `№\u00a0${folio(day)} · Light`,
  );
  await artworkImageSource(light.locator('img.art-still'), day, 'light', true);
  const seed = archive.records.find((item) => item.id === day)!.seed;
  if (await light.locator('video').count()) {
    expect(await light.locator('video').getAttribute('src')).toContain(
      `/${seed}/videos/web/main.mp4`,
    );
  }
  await expect(header).toHaveCSS('background-color', 'rgb(0, 0, 0)');

  // The chapter words are anchors; 02 Ink is paper, its plate in the sheet's own measured tone.
  await chapters.getByRole('link', { name: /02/ }).click();
  await expect(page).toHaveURL(/\/process#ink$/);
  await expect(page.locator('#ink-title')).toBeInViewport();
  const ink = page.locator('#ink .art-media');
  await ink.scrollIntoViewIfNeeded();
  await imageLoaded(ink.locator('img.art-still'));
  await expect(page.locator('#ink')).toHaveCSS('background-color', 'rgb(241, 235, 223)');
  const tone = plates.records.find((record) => record.id === day)!.ink.tone;
  await expect(ink).toHaveCSS('background-color', rgb(tone));
  await expect(ink.locator('img.art-still')).toHaveAttribute('alt', `№\u00a0${folio(day)} · Ink`);
  await artworkImageSource(ink.locator('img.art-still'), day, 'ink');
  // The running head follows the ground beneath the viewport's centre: paper here.
  await expect(header).toHaveCSS('background-color', 'rgb(241, 235, 223)');
  await expect(header).toHaveCSS('color', 'rgb(34, 35, 31)');
  // Sample the authentic local still's paper, not an invented CSS approximation.
  const paperPixel = await ink.locator('img.art-still').evaluate((element) => {
    const image = element as HTMLImageElement;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0, 16, 16, 0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
  });
  expect(
    paperPixel.every((channel, index) => Math.abs(channel - [241, 235, 223][index]) <= 8),
  ).toBe(true);

  // 03 The spectrum: the sweep exists only on intent and never loops.
  const spectrum = page.locator('#spectrum');
  await spectrum.scrollIntoViewIfNeeded();
  await expect(spectrum).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(spectrum.locator('video')).toHaveCount(0);
  await expect(header).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(spectrum).toContainText('380 nm');
  await expect(spectrum).toContainText('700 nm');
  const play = spectrum.getByRole('button', { name: t.playSweep, exact: true });
  await expect(play).toBeVisible({ timeout: 30_000 });
  await play.click();
  const sweep = spectrum.locator('video');
  await expect(sweep).toHaveAttribute(
    'src',
    new RegExp(`/${seed}/videos/web/spectral_sweep\\.mp4$`),
  );
  await expect(sweep).not.toHaveAttribute('loop');
  await expect(sweep).not.toHaveAttribute('autoplay');

  // The coda: the thesis, and the way into the day's work.
  const coda = page.getByRole('region', { name: t.expressionTitle });
  await coda.scrollIntoViewIfNeeded();
  await expect(coda.getByRole('link', { name: new RegExp(t.enterWork) })).toHaveAttribute(
    'href',
    `/art/${day}`,
  );
  await noHorizontalOverflow(page);
  // Instantly: the venue scrolls smoothly, and WebKit gives up a smooth scroll when the layout
  // moves beneath it (the sweep's clock), leaving the page short of the top.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(header).toBeInViewport();
  await expect(header).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  const screenshot = testInfo.outputPath('process-redesign.png');
  await page.screenshot({
    path: screenshot,
    fullPage: true,
    animations: 'disabled',
    style: 'nextjs-portal { visibility: hidden; }',
  });
  await testInfo.attach('process-redesign', { path: screenshot, contentType: 'image/png' });
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.map(({ id, impact, nodes }) => ({
      id,
      impact,
      targets: nodes.map((node) => node.target),
    })),
  ).toEqual([]);
  // On phones the words live in the Index sheet; the route itself proves the chrome returns to paper.
  if (isMobile) await page.goto('/collection');
  else await header.getByRole('link', { name: t.collection, exact: true }).click();
  await expect(page).toHaveURL(/\/collection$/);
  await expect(page.locator('.process-page:visible')).toHaveCount(0);
  await expect(header).not.toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(header).toHaveCSS('color', 'rgb(34, 35, 31)');
  expect(errors).toEqual([]);
});

test('with ambient motion allowed the Light chapter plays the published film from frame 0 and offers Sit', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name.includes('reduced-motion'),
    'Reduced motion keeps every film still until an explicit Play; covered by the paused run.',
  );
  const day = workOfTheDay();
  await page.goto('/process');
  const toggle = motionToggle(page);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  const light = page.locator('#light');
  await light.scrollIntoViewIfNeeded();
  const film = light.locator('video');
  const seed = archive.records.find((item) => item.id === day)!.seed;
  await expect(film).toHaveAttribute('src', new RegExp(`/${seed}/videos/web/main\\.mp4$`), {
    timeout: 30_000,
  });
  await expect
    .poll(() => film.evaluate((element) => !(element as HTMLVideoElement).paused), {
      timeout: 30_000,
    })
    .toBe(true);
  await expect(light.locator('[data-film-state]')).toHaveAttribute('data-film-state', 'film');
  await expect(light.getByRole('button', { name: t.sit, exact: true })).toBeVisible();
  // Pause keeps the film still and offers an explicit Play instead.
  await toggle.click();
  await expect
    .poll(() => film.evaluate((element) => (element as HTMLVideoElement).paused))
    .toBe(true);
  await expect(light.getByRole('button', { name: t.play, exact: true })).toBeVisible();
});

test('the choice derives every beginning of the day’s work in the browser and rings the chosen one', async ({
  page,
}) => {
  // Under a second on a desk; CI's two cores without a GPU are given far longer, and the test
  // waits on the figure's phase, never on a clock.
  test.setTimeout(150_000);
  const day = workOfTheDay();
  const record = orbits.records.find((item) => item.id === day)!;
  const { generation } = record;
  // The same walk in Node: the counts the browser states must be these.
  const walk = deriveBeginnings({
    ...generation,
    seed: record.seed,
    dt: Number(generation.dt),
    masses: [
      Number(record.physics.masses[0]),
      Number(record.physics.masses[1]),
      Number(record.physics.masses[2]),
    ],
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/process');
  // The figure sits within a screen of the top, so it derives without a scroll; every check
  // below re-reads it, so none holds on to a node the page has since rendered anew.
  const field = page.locator('#choice figure');
  await expect(field).toHaveAttribute('data-phase', 'derived', { timeout: 120_000 });
  await expect(field).toHaveAttribute('data-passed', String(walk.passed));

  const n = (value: number) => value.toLocaleString('en');
  const stepsEach = generation.warmupSteps + generation.steps;
  const gate =
    walk.passed === walk.count
      ? fill(t.choiceFieldAllPassed, {
          total: n(walk.count),
          energy: n(QUICK_GATE.maxEnergy),
          momentum: n(QUICK_GATE.minAngularMomentum),
        })
      : fill(t.choiceFieldSomePassed, {
          total: n(walk.count),
          passed: n(walk.passed),
          failed: n(walk.count - walk.passed),
          energy: n(QUICK_GATE.maxEnergy),
          momentum: n(QUICK_GATE.minAngularMomentum),
        });
  await expect(field.locator('[data-summary]')).toHaveText(
    fill(t.choiceFieldSummary, {
      gate,
      search: fill(t.choiceFieldSearch, {
        steps: n(stepsEach),
        search: n(walk.passed * stepsEach),
        index: n(generation.selectedIndex),
      }),
      masses: walk.chosen.massesExact ? t.choiceFieldMassesExact : t.choiceFieldMassesDiffer,
    }),
  );
  await expect(field.getByRole('status')).toHaveText(
    new RegExp(`^All ${n(walk.count)} beginnings derived in this browser in \\d+\\.\\d s\\.$`),
  );

  // The chosen beginning is ringed and named, and the field holds the beginnings' light.
  await expect(field.getByText(`№ ${n(generation.selectedIndex)}`, { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      field.locator('canvas').evaluate((element) => {
        const canvas = element as HTMLCanvasElement;
        const pixels = canvas
          .getContext('2d')!
          .getImageData(0, 0, canvas.width, canvas.height).data;
        let lit = 0;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) lit += 1;
        return lit;
      }),
    )
    .toBeGreaterThan(1_000);
  expect(errors).toEqual([]);
});
