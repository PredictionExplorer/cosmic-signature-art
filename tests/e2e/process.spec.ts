import { expect, test, type Page } from './fixtures';
import AxeBuilder from '@axe-core/playwright';
import { WCAG_22_AA } from './standard';
import { readFileSync } from 'node:fs';
import { catalogs } from '../../src/lib/i18n/messages';
import { fill } from '../../src/lib/i18n/format';
import { workOfTheDay } from '../../src/lib/art/work-of-the-day';
import { SOURCES } from '../../src/lib/essay/sources';
import { locales, localizedPath } from '../../src/lib/i18n/routing';
import { ESSAY, TERMS } from '../../src/lib/essay/structure';
import { deriveBeginnings, QUICK_GATE } from '../../src/lib/physics/beginnings';
import { artworkImageSource, imageLoaded, noHorizontalOverflow } from './helpers';
import { wholePagePictures } from './whole-page';

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

test('the essay opens on night, pins the day’s Light film, crosses one hard edge into Ink paper and ends on the thesis', async ({
  page,
  isMobile,
}, testInfo) => {
  // The day's work is deterministic per UTC date; a test that spans midnight may see either.
  const day = workOfTheDay();
  await page.goto('/process');
  await pauseAmbientMotion(page);
  const header = page.locator('.site-header');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.processTitle);
  await expect(page.getByText(t.statementSigned)).toBeVisible();
  await expect(header).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  // One theme colour, the night's, from the server's first byte.
  await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#000000');
  // The contents: the eight numbered chapters, what is not known, the terms and the sources.
  const chapters = page.getByRole('main').getByRole('navigation', { name: t.process });
  await expect(chapters.getByRole('link')).toHaveText([
    ...ESSAY.map(({ numeral, word }) => `${numeral}${t[word]}`),
    `·${t.essayTermsWord}`,
    `·${t.essaySourcesWord}`,
  ]);
  await expect(page.locator('#process-title + p')).toHaveText(t.essayStandfirst);

  // Light: the authentic Light still of the day's work on true black, under the cover.
  await expect(page.locator('#light header')).toContainText(
    fill(t.essayLightCopy, { work: `№ ${folio(day)}` }),
  );
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

  // The spectrum closes the night: the sweep exists only on intent and never loops.
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

  // 06 The choice is still night: the day's work's real Borda line, formatted for the reader.
  const work = index.works.find((candidate) => candidate.id === day)!;
  const choice = page.locator('#choice');
  await expect(choice).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(choice).toContainText(
    `One of ${work.borda.totalCandidates.toLocaleString('en')} candidate orbits. Number ${work.borda.selectedIndex.toLocaleString('en')} was chosen.`,
  );
  await expect(choice).toContainText(`№ ${folio(day)}`);

  // The one seam: Ink is paper, its plate in the sheet's own measured tone, and everything
  // after it is paper too.
  await expect(page.locator('#ink header')).toContainText(t.essayInkCopy);
  // The section's own top is brought to the top of the screen, so that its ground, not the
  // night chapter's above it, lies under the screen's centre, where the running head looks.
  await page
    .locator('#ink')
    .evaluate((section) => section.scrollIntoView({ block: 'start', behavior: 'instant' }));
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

  // Every ground after the seam is paper: no chapter returns to night.
  expect(
    await page
      .locator('main > section')
      .evaluateAll((sections) => sections.map((section) => section.getAttribute('data-ground'))),
  ).toEqual([...Array(9).fill('night'), ...Array(7).fill('paper')]);

  // The coda: the thesis, and the way into the day's work.
  const coda = page.getByRole('region', { name: t.expressionTitle });
  await coda.scrollIntoViewIfNeeded();
  await expect(header).toHaveCSS('background-color', 'rgb(241, 235, 223)');
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
  // The whole page as evidence: in strips on a phone, where the essay is longer than one
  // picture may be in WebKit on Linux (tests/e2e/whole-page.ts).
  await wholePagePictures(page, testInfo, 'process-redesign', {
    style: 'nextjs-portal { visibility: hidden; }',
  });
  const results = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
  expect(
    results.violations.map(({ id, impact, nodes }) => ({
      id,
      impact,
      targets: nodes.map((node) => node.target),
    })),
  ).toEqual([]);
  // The contents' words are anchors, and one of them crosses the seam: 07 is paper. This comes
  // last of the page's own checks, because WebKit holds a page to the place a fragment sent it
  // (it scrolls there again at each later layout, until a reader's own hand scrolls on), so no
  // scroll a test makes after this one can be trusted to stay.
  await chapters.getByRole('link', { name: /07/ }).click();
  await expect(page).toHaveURL(/\/process#current$/);
  await expect(page.locator('#current-title')).toBeInViewport();
  await expect(header).toHaveCSS('background-color', 'rgb(241, 235, 223)');
  await expect(header).toHaveCSS('color', 'rgb(34, 35, 31)');

  // On phones the words live in the Index sheet; the route itself proves the chrome returns to paper.
  if (isMobile) await page.goto('/collection');
  else await header.getByRole('link', { name: t.collection, exact: true }).click();
  await expect(page).toHaveURL(/\/collection$/);
  await expect(page.locator('.process-page:visible')).toHaveCount(0);
  await expect(header).not.toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(header).toHaveCSS('color', 'rgb(34, 35, 31)');
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
  await page.goto('/process');
  // The figure stands at the foot of the sixth chapter and derives when a reader reaches it;
  // every check below re-reads it, so none holds on to a node the page has since rendered anew.
  const field = page.locator('#choice figure');
  await field.scrollIntoViewIfNeeded();
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
});

test.describe('the essay', () => {
  /** A streamed page shows its route's plate until its own content is revealed. */
  async function essay(page: Page, address = '/process') {
    await page.goto(address);
    await expect(page.locator('main.loading-room, div[hidden][id^="S:"]')).toHaveCount(0);
    await expect(page.locator('main.process-page')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
  }

  test('teaches in eleven parts, each at its own address, with its figures and its sources', async ({
    page,
  }) => {
    const day = workOfTheDay();
    await essay(page);
    for (const { id, numeral, word, title } of ESSAY) {
      const chapter = page.locator(`#${id}`);
      await expect(chapter).toHaveAccessibleName(t[title]);
      await expect(chapter.locator('.numeral').first()).toHaveText(numeral);
      await expect(chapter.locator('.small-caps').first()).toHaveText(t[word]);
    }
    // What the day's work says of itself, from its record: two bodies of the three, alone.
    const record = page.locator('#two [role="note"]');
    await expect(record).toContainText(`From the record of № ${folio(day)}`);
    await expect(record).toContainText(fill(t.essayTakeLead, { work: `№ ${folio(day)}` }));
    await expect(record).toContainText(t.essayTakeAll);

    // Eight figures; the four derived from a work say so, and each caption is the reader's words.
    const figures = page.locator('figure[data-figure]');
    await expect(figures).toHaveCount(8);
    await expect(page.locator('figure[data-figure] figcaption .small-caps')).toHaveText(
      Array(4).fill(t.analysisNotWork),
    );
    for (const name of ['pair', 'energy', 'twin', 'sheet'])
      await expect(page.locator(`figure[data-figure="${name}"] figcaption .small-caps`)).toHaveText(
        t.analysisNotWork,
      );

    // The terms, each with its meaning, and the sources in the order the text cites them.
    await expect(page.locator('#terms dt')).toHaveText(TERMS.map(([term]) => t[term]));
    await expect(page.locator('#sources ol > li')).toHaveCount(Object.keys(SOURCES).length);

    // A numeral in the text leads to its source, and the address says which.
    const first = page.locator('#two sup a').first();
    await expect(first).toHaveText('1');
    await expect(first).toHaveAccessibleName(fill(t.footnote, { n: 1 }));
    await first.click();
    await expect(page).toHaveURL(/\/process#source-1$/);
    const source = page.locator('#source-1');
    await expect(source).toBeInViewport();
    await expect(source).toContainText('Newton');
    // The entry comes to rest clear of the running head: its first line is not beneath it. The
    // venue scrolls smoothly, so the place is read until it holds.
    const head = (await page.locator('.site-header').boundingBox())!;
    await expect
      .poll(async () => {
        const first = (await source.boundingBox())!.y;
        await page.waitForTimeout(150);
        const second = (await source.boundingBox())!.y;
        return first === second ? Math.round(second - (head.y + head.height)) : -1;
      })
      .toBeGreaterThanOrEqual(0);
    // A reference with an address leaves the venue, in a tab of its own.
    const outward = source.getByRole('link');
    await expect(outward).toHaveAttribute('target', '_blank');
    await expect(outward).toHaveAttribute('href', /^https:\/\/en\.wikisource\.org\//);
  });

  // Every language on the narrowest phone: a long word in a title, or a mark hung outside a
  // paragraph, is cut there first (the Ukrainian «розташуваннях.» ran 34 px past the screen).
  const pages: [name: string, address: string, width: number][] = [
    ...locales.map((locale): [string, string, number] => [
      `${locale} at 320 px`,
      localizedPath(locale, '/process'),
      320,
    ]),
    ['uk on a tablet', '/uk/process', 768],
  ];
  for (const [name, address, width] of pages)
    test(`holds its type to the floor, its words and its figures to the page: ${name}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 720 });
      await essay(page, address);
      await noHorizontalOverflow(page);
      const found = await page.evaluate(() => {
        const main = document.querySelector('main')!;
        const edge = document.documentElement.clientWidth;
        // Every piece of type in the essay, a drawing's own included, as it is drawn.
        const small: string[] = [];
        const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.textContent?.trim()) continue;
          const element = node.parentElement!;
          if (!element.getClientRects().length) continue;
          const drawn =
            element instanceof SVGGraphicsElement
              ? parseFloat(getComputedStyle(element).fontSize) * (element.getScreenCTM()?.a ?? 1)
              : parseFloat(getComputedStyle(element).fontSize);
          if (drawn < 11.99) small.push(`${node.textContent.trim().slice(0, 24)}: ${drawn}`);
        }
        // Every word of the essay whole from side to side: none runs past the screen, where
        // the page would clip it. (The plates' own strips are the plates' tests'.)
        const cut: string[] = [];
        const own =
          'section[id]:not(#light, #ink, #spectrum), :is(#light, #ink, #spectrum) > header';
        for (const part of main.querySelectorAll(own)) {
          const texts = document.createTreeWalker(part, NodeFilter.SHOW_TEXT);
          for (let node = texts.nextNode(); node; node = texts.nextNode()) {
            const words = node.textContent?.trim();
            if (!words || getComputedStyle(node.parentElement!).visibility !== 'visible') continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            for (const box of range.getClientRects())
              if (box.width >= 0.5 && box.height >= 0.5)
                if (box.left < -0.5 || box.right > edge + 0.5)
                  cut.push(
                    `${words.slice(0, 32)}: ${Math.round(box.left)}–${Math.round(box.right)}`,
                  );
          }
        }
        // Every figure, and every mark set over one, inside the page's own width.
        const outside: string[] = [];
        for (const figure of main.querySelectorAll('figure[data-figure]')) {
          const marks = figure.querySelectorAll('svg, span');
          for (const part of [figure, ...marks]) {
            const box = part.getBoundingClientRect();
            if (!box.width) continue;
            if (box.left < -0.5 || box.right > edge + 0.5)
              outside.push(
                `${figure.getAttribute('data-figure')} ${part.tagName} ${Math.round(box.left)}–${Math.round(box.right)}`,
              );
          }
        }
        // No two marks set over one drawing run into each other.
        const meeting: string[] = [];
        for (const drawing of main.querySelectorAll('figure[data-figure] [aria-hidden="true"]')) {
          const marks = [...drawing.querySelectorAll(':scope > span, :scope > div > span')].map(
            (mark) => ({ text: mark.textContent, box: mark.getBoundingClientRect() }),
          );
          for (let a = 0; a < marks.length; a++)
            for (let b = a + 1; b < marks.length; b++) {
              const [p, q] = [marks[a].box, marks[b].box];
              if (p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom)
                meeting.push(`${marks[a].text} / ${marks[b].text}`);
            }
        }
        return {
          small,
          cut,
          outside,
          meeting,
          figures: main.querySelectorAll('figure[data-figure]').length,
        };
      });
      expect(found).toEqual({ small: [], cut: [], outside: [], meeting: [], figures: 8 });
    });
});
