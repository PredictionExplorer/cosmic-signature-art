import { expect, test } from './fixtures';
import { catalogs } from '../../src/lib/i18n/messages';
import { fill } from '../../src/lib/i18n/format';
import { AFTER_THE_FRAME_EVENT } from '../../src/lib/venue-events';
import { playAmbientMotion, standInFilm } from './helpers';

const t = catalogs.en;

/**
 * Every engine re-derives the orbit from the seed with + − × ÷ and √ only, so each project
 * here (Chromium, Firefox, WebKit; desktop, phone, reduced motion) must reach the published
 * record bit for bit. A calm eternal dance, and an ejection whose profile rolled a Duet.
 */
for (const id of [31, 71]) {
  test(`№ ${String(id).padStart(3, '0')}'s orbit is re-derived here and is its published record`, async ({
    page,
  }) => {
    await page.goto(`/art/${id}`);
    const orbit = page.getByRole('region', { name: t.orbitTitle });
    await orbit.scrollIntoViewIfNeeded();
    await expect(orbit).toHaveAttribute('data-phase', 'derived', { timeout: 30_000 });
    // The fate is checked last: the worker runs on past the window, to the horizon for a dance.
    await expect(orbit).toHaveAttribute('data-exact', 'true', { timeout: 60_000 });
    // The record, checked here, opens the page's second act, on paper beneath the show.
    const record = page.getByRole('region', { name: t.orbitTableCaption });
    await expect(record.getByRole('cell', { name: t.orbitExact, exact: true })).toHaveCount(11);
    await expect(record.getByRole('status')).toContainText(t.orbitAllExact);
    await expect(record.getByRole('table', { name: t.orbitTableCaption })).toBeVisible();
    // While the section stands beneath the running head, the head is night, type and all; the
    // entry returns it to paper. Each poll scrolls again, so a late change of layout above the
    // target cannot leave the page short of it.
    const headAt = async (selector: string, offset: number) => {
      await page.evaluate(
        ([target, by]) => {
          const element = document.querySelector(target as string)!;
          const top = element.getBoundingClientRect().top + window.scrollY + (by as number);
          window.scrollTo({ top, behavior: 'instant' });
        },
        [selector, offset],
      );
      return page.locator('html').getAttribute('data-plate-material');
    };
    await expect.poll(() => headAt('[aria-labelledby="orbit-title"]', 40)).toBe('night');
    await expect.poll(() => headAt('#record', 0)).not.toBe('night');
  });
}

test('the orbit holds still for reduced motion and plays once otherwise', async ({
  page,
}, info) => {
  await page.goto('/art/31');
  const orbit = page.getByRole('region', { name: t.orbitTitle });
  await orbit.scrollIntoViewIfNeeded();
  await expect(orbit).toHaveAttribute('data-phase', 'derived', { timeout: 30_000 });
  const again = orbit.getByRole('button', { name: t.again });
  if (info.project.name.includes('reduced-motion')) {
    // The whole orbit is drawn at once, and nothing plays unasked: Play is offered, not Pause.
    await expect(again).toHaveCount(0);
    await expect(orbit.getByRole('button', { name: t.play })).toBeVisible();
    await expect(orbit.getByRole('button', { name: t.pause })).toHaveCount(0);
  } else {
    await expect(orbit.getByText(/into the Light film$/)).toBeVisible();
  }
});

/**
 * After the frame (third-physics.md §5.6): past the recorded window the same physics runs on,
 * labelled as physics, not the work. № 054 ejects soonest, 90,000 steps after its window, so
 * every project sees the escape at the published step: performed at the film's pace, or drawn
 * at once for reduced motion.
 */
test('After the frame performs № 054’s escape at its published step, then returns', async ({
  page,
}) => {
  await page.goto('/art/54');
  const orbit = page.getByRole('region', { name: t.orbitTitle });
  await orbit.scrollIntoViewIfNeeded();
  await expect(orbit).toHaveAttribute('data-exact', 'true', { timeout: 60_000 });
  await expect(orbit).toHaveAttribute('data-fate', 'ejection');
  // The fate is checked in the record, which opens the page's second act.
  const record = page.getByRole('region', { name: t.orbitTableCaption });
  await expect(
    record.getByRole('row', { name: /^Fate body 2 escapes at step 1,090,000/ }),
  ).toBeVisible();
  // The plate's word asks by this event, wherever the visitor stands.
  await page.evaluate((name) => window.dispatchEvent(new Event(name)), AFTER_THE_FRAME_EVENT);
  const word = orbit.getByRole('button', { name: t.afterTheFrame });
  await expect(word).toHaveAttribute('aria-pressed', 'true');
  await expect(orbit.getByText(t.afterTheFrameNote)).toBeVisible();
  await expect(orbit).toHaveAttribute('data-beyond', 'rested', { timeout: 60_000 });
  await expect(orbit.getByText('Body 2 has escaped, at step 1,090,000')).toBeVisible();
  // The word again returns to the recorded window.
  await word.click();
  await expect(orbit).not.toHaveAttribute('data-beyond');
  await expect(word).toHaveAttribute('aria-pressed', 'false');
  await expect(orbit.getByText(t.orbitLine)).toBeVisible();
});

test('a resolved film offers After the frame, which goes down to the orbit and on past it', async ({
  page,
}, info) => {
  // A desk's plate resolves its film into the still; a phone's rests on an excerpt, which
  // offers the film instead, and reduced motion plays no film at all.
  test.skip(!info.project.name.endsWith('-desktop'), 'Only a desk’s film resolves on the plate.');
  test.slow();
  await page.goto('/art/54');
  const word = page.locator('[data-layer-state="current"]').getByRole('link', {
    name: t.afterTheFrame,
  });
  await expect(word).toBeVisible({ timeout: 90_000 });
  await expect(word).toHaveAttribute('href', '#orbit');
  await word.click();
  const orbit = page.getByRole('region', { name: t.orbitTitle });
  await expect(orbit).toHaveAttribute('data-beyond', /^(running|rested)$/, { timeout: 60_000 });
  await expect(orbit).toBeInViewport();
  // The word moves the visitor, not the address.
  expect(new URL(page.url()).hash).toBe('');
});

/**
 * The energy the computation keeps (EnergyWatch in src/lib/physics/orbit.ts). The record dates
 * № 004's ejection at step 1,540,000 and the derivation meets it to the step. It also finds what
 * the record does not say: 5,000 steps earlier two bodies pass 0.11 apart, closer than the fixed
 * step can follow, and the computed energy of a bound triple turns several times over positive.
 * The record's note says so, and After the frame stops calling what follows an escape.
 */
test('the record says where a computation lost its energy, and After the frame calls nothing past it an escape', async ({
  page,
}, info) => {
  await page.goto('/art/4');
  const orbit = page.getByRole('region', { name: t.orbitTitle });
  await orbit.scrollIntoViewIfNeeded();
  await expect(orbit).toHaveAttribute('data-exact', 'true', { timeout: 60_000 });
  await expect(orbit).toHaveAttribute('data-fate', 'ejection');
  const record = page.getByRole('region', { name: t.orbitTableCaption });
  const kept = record.locator('[data-energy]');
  await expect(kept).toHaveAttribute('data-energy', 'broken');
  await expect(kept).toContainText(
    'Near step 1,535,000 two bodies pass 0.11 apart, closer than the computation’s fixed step can follow, and its energy changes by 780%.',
  );
  await expect(kept).toContainText('past that step this is the computation, not an orbit.');
  await page.evaluate((name) => window.dispatchEvent(new Event(name)), AFTER_THE_FRAME_EVENT);
  await expect(orbit.getByRole('button', { name: t.afterTheFrame })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // The ejection lies sixteen seconds of film on: performed, it is reached by its own word;
  // drawn at once for reduced motion, it is already there.
  if (!info.project.name.includes('reduced-motion'))
    await orbit.getByRole('button', { name: t.toTheEjection }).click();
  await expect(orbit).toHaveAttribute('data-beyond', 'rested', { timeout: 60_000 });
  await expect(
    orbit.getByText('Not an orbit past step 1,535,000: the computed energy changed by 780%.'),
  ).toBeVisible();
  await expect(orbit.getByText(/has escaped/)).toHaveCount(0);
});

test('a window whose energy held says so, and Verify an orbit prints a break inside a window', async ({
  page,
}) => {
  await page.goto('/art/31');
  const orbit = page.getByRole('region', { name: t.orbitTitle });
  await orbit.scrollIntoViewIfNeeded();
  await expect(orbit).toHaveAttribute('data-exact', 'true', { timeout: 60_000 });
  await expect(
    page.getByRole('region', { name: t.orbitTableCaption }).locator('[data-energy="held"]'),
  ).toHaveText('As computed here, the energy holds to 12 digits through the recorded window.');
  // № 022: the pass the step could not follow lies inside the recorded window itself.
  await page.goto('/verify/orbit/22');
  await expect(page.locator('[data-energy="broken"]')).toHaveText(
    'Near step 44,000 two bodies pass 0.19 apart, closer than the computation’s fixed step can follow, and its energy changes by 58%. Gravity keeps energy constant, so past that step this is the computation, not an orbit.',
    { timeout: 60_000 },
  );
});

/**
 * The score (third-physics.md §5.5): while the Light film plays, its time line becomes the
 * orbit's score, measured here from the verified window, and the strip reads the physics of the
 * moment. The options open the complete film just before the closest approach, which № 031's
 * bodies 1–3 reach at step 255,842, first drawn by the film's frame 460: 00:07.
 */
test('the Light film’s transport is its orbit’s score, and opens on the closest approach', async ({
  page,
  isMobile,
}, info) => {
  test.slow();
  // The complete film is the published original; a local film of the same length stands in.
  await standInFilm(page, /\/videos\/web\/main\.mp4(?:\?|$)/, 'public/art/31-ink-preview.mp4');
  await page.goto('/art/31?expression=light');
  const plate = page.locator('[data-artwork-stage="page"]:visible [data-layer-state="current"]');
  // Reduced motion plays no film on the plate: the score waits for a film, the word does not.
  if (!info.project.name.includes('reduced-motion')) {
    await playAmbientMotion(page);
    // A phone's plate rests on its excerpt, which carries no transport; its word plays the film.
    if (isMobile) await plate.getByRole('button', { name: t.film, exact: true }).click();
    const band = plate.locator('[data-film-score]');
    await expect(band).toBeVisible({ timeout: 60_000 });
    await expect(plate.locator('.time-line')).toHaveCount(0);
    // The settling clip is the film's last eight seconds: the score is lit past its 22nd.
    const lit = band.locator('[data-film-score-progress]');
    expect(Number(await lit.getAttribute('data-film-score-progress'))).toBeGreaterThan(70);
    await expect(plate.locator('[data-film-physics]')).toHaveText(
      /^bodies [1-3]–[1-3] · \d+\.\d apart$/,
    );
    // It lies along the plate's own foot, on its night.
    const screen = (await plate.locator('[data-plate-ground="night"]').boundingBox())!;
    const box = (await band.boundingBox())!;
    expect(box.height).toBe(9);
    expect(Math.abs(box.y + box.height - (screen.y + screen.height))).toBeLessThanOrEqual(1);
  }
  await plate.getByRole('button', { name: t.ways, exact: true }).click();
  const closest = plate.getByRole('button', { name: `${t.toClosestApproach} 00:07` });
  await expect(closest).toHaveAccessibleDescription(fill(t.closestApproachAt, { clock: '00:07' }));
  await closest.click();
  const film = page.getByRole('dialog').locator('video');
  await expect(film).toHaveAttribute('src', /\/videos\/web\/main\.mp4$/);
  // Two seconds before the closest approach (7.67 s), so the visitor sees it happen.
  await expect
    .poll(() => film.evaluate((video) => (video as HTMLVideoElement).currentTime), {
      timeout: 30_000,
    })
    .toBeGreaterThanOrEqual(5.6);
  expect(await film.evaluate((video) => (video as HTMLVideoElement).currentTime)).toBeLessThan(10);
});

/**
 * The Ink film's score (third-physics-phase-e.md §6): the complete Ink film keeps the Light
 * film's clock frame for frame, after a pre-roll of bare paper; № 031's first ink is its frame
 * 71, 3.9 % of the film. Its plate plays the local complete film, which the venue checked
 * against that clock with the published one: the band lies on the plate's paper, lit from the
 * first ink, the strip reads the physics once there is ink to read, and the options open the
 * room's complete Ink film just before the closest approach, which it shows at 00:07 as well.
 */
test('the Ink film’s transport is its orbit’s score too, lit from its first ink', async ({
  page,
  isMobile,
}, info) => {
  test.slow();
  await page.goto('/art/31?expression=ink');
  const plate = page.locator('[data-artwork-stage="page"]:visible [data-layer-state="current"]');
  if (!info.project.name.includes('reduced-motion')) {
    await playAmbientMotion(page);
    if (isMobile) await plate.getByRole('button', { name: t.film, exact: true }).click();
    const band = plate.locator('[data-film-score="ink"]');
    await expect(band).toBeVisible({ timeout: 60_000 });
    await expect(plate.locator('.time-line')).toHaveCount(0);
    await expect(band.locator('[data-film-score-progress]')).toHaveAttribute(
      'data-film-score-from',
      '3.9',
    );
    await expect(plate.locator('[data-film-physics]')).toHaveText(
      /^bodies [1-3]–[1-3] · \d+\.\d apart$/,
      { timeout: 30_000 },
    );
    // It lies along the plate's own foot, on its paper.
    const screen = (await plate.locator('[data-plate-ground="paper"]').boundingBox())!;
    const box = (await band.boundingBox())!;
    expect(box.height).toBe(9);
    expect(Math.abs(box.y + box.height - (screen.y + screen.height))).toBeLessThanOrEqual(1);
  }
  await plate.getByRole('button', { name: t.ways, exact: true }).click();
  await plate.getByRole('button', { name: `${t.toClosestApproach} 00:07` }).click();
  const room = page.getByRole('dialog');
  const film = room.locator('video');
  await expect(film).toHaveAttribute('src', /\/art\/31-ink-preview\.mp4$/);
  await expect
    .poll(() => film.evaluate((video) => (video as HTMLVideoElement).currentTime), {
      timeout: 30_000,
    })
    .toBeGreaterThanOrEqual(5.6);
  expect(await film.evaluate((video) => (video as HTMLVideoElement).currentTime)).toBeLessThan(10);
  await expect(room.locator('[data-film-score="ink"]')).toBeVisible({ timeout: 60_000 });
});

/**
 * Every work's Ink plate settles on the last eight seconds of its film, which the venue checked
 * frame by frame against the published film's clock: № 060's Ink score is lit past its 22nd
 * second, on paper, while the clip plays.
 */
test('an Ink plate’s settling clip carries its score, on paper', async ({
  page,
  isMobile,
}, info) => {
  test.skip(
    info.project.name.includes('reduced-motion'),
    'Reduced motion plays no film on the plate.',
  );
  test.slow();
  await page.goto('/art/60?expression=ink');
  const plate = page.locator('[data-artwork-stage="page"]:visible [data-layer-state="current"]');
  await playAmbientMotion(page);
  if (isMobile) await plate.getByRole('button', { name: t.film, exact: true }).click();
  const band = plate.locator('[data-film-score="ink"]');
  await expect(band).toBeVisible({ timeout: 60_000 });
  const lit = band.locator('[data-film-score-progress]');
  expect(Number(await lit.getAttribute('data-film-score-progress'))).toBeGreaterThan(70);
  await expect(plate.locator('[data-film-physics]')).toHaveText(
    /^bodies [1-3]–[1-3] · \d+\.\d apart$/,
  );
  await expect(plate.locator('video')).toHaveAttribute(
    'src',
    /\/art\/clips\/60-ink-settling-[a-f0-9]{16}\.mp4$/,
  );
});
