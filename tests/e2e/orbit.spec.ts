import { expect, test, type Locator, type Page } from '@playwright/test';
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

/** The line under the drawing, and the words beside it. */
const lineOf = (orbit: Locator) => orbit.locator('p[class*="readout"]');
const wordsOf = (orbit: Locator) => orbit.locator('[class*="words"] > *');
/** The orbit section of a work on its Light plate, derived and checked, with its path past the window. */
async function onItsPlate(page: Page, id: number, locale = '') {
  await page.goto(`${locale}/art/${id}?expression=light`);
  const orbit = page.locator('#orbit');
  // Each poll scrolls again: a page that settles its own place after loading cannot leave the
  // section a screen away, where nothing is derived.
  await expect
    .poll(
      async () => {
        await orbit.scrollIntoViewIfNeeded();
        return orbit.getAttribute('data-phase');
      },
      { timeout: 30_000 },
    )
    .not.toBe('waiting');
  await expect(orbit).toHaveAttribute('data-exact', 'true', { timeout: 60_000 });
  // On the plate the picture is the work's own frame, whatever size it is drawn at.
  await expect(orbit).toHaveAttribute('data-drawing', 'plate');
  await expect(orbit).toHaveAttribute('data-material', 'light');
  return orbit;
}
/**
 * Further on, for as long as it would save a wait. Where nothing plays it always does: it steps
 * to each moment in turn, to the end, and from the end to what happened. Where the picture is
 * performed it is dimmed once the next moment is near, and the performance does the rest.
 */
async function allTheWayOn(orbit: Locator) {
  const onward = orbit.getByRole('button', { name: catalogs.en.beyondOnward });
  // It keeps its place for the whole performance, so it is there to be found.
  await expect(onward).toBeVisible();
  for (let step = 0; step < 60; step++) {
    if ((await orbit.getAttribute('data-beyond')) !== 'running') return;
    if ((await onward.getAttribute('aria-disabled').catch(() => 'true')) === 'true') return;
    // A word that goes with the performance's end as it is pressed has done its work.
    await onward.click({ timeout: 2_000 }).catch(() => {});
  }
}
/** The plate's word asks by this event, wherever the visitor stands. */
async function goBeyond(page: Page, orbit: Locator, words = t) {
  await page.evaluate((name) => window.dispatchEvent(new Event(name)), AFTER_THE_FRAME_EVENT);
  const word = orbit.getByRole('button', { name: words.afterTheFrame });
  await expect(word).toHaveAttribute('aria-pressed', 'true', { timeout: 60_000 });
  await expect(orbit.getByText(words.afterTheFrameNote)).toBeVisible();
  return word;
}
/** Where an element stands once the page has come to rest: two readings a moment apart agree. */
async function atRest(locator: Locator) {
  let last = await locator.boundingBox();
  await expect
    .poll(async () => {
      const now = await locator.boundingBox();
      const still = JSON.stringify(now) === JSON.stringify(last);
      last = now;
      return still;
    })
    .toBe(true);
  return last!;
}
/** How many pixels of the bodies' layer are drawn on: a 2D canvas, read without a GPU. */
const lit = (orbit: Locator) =>
  orbit.locator('canvas[data-layer="marks"]').evaluate((canvas: HTMLCanvasElement) => {
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    let drawn = 0;
    for (let alpha = 3; alpha < data.length; alpha += 4) if (data[alpha] > 0) drawn++;
    return drawn;
  });

/**
 * After the frame, with the frame held (docs/after-the-frame.md §8.3). № 025's record finds body 2
 * free 6.3 seconds of film after its window. On its plate the camera stays where the film left
 * it: body 2 crosses the edge of the picture 3.4 seconds after the film, nothing follows it, and
 * the two it left are out of it 7.2 seconds later. Then the still stands alone, whole, for eight
 * seconds in which nothing is said or offered; then one line of what happened. Where motion is
 * unwelcome the same picture stands still and is stepped from moment to moment, to the same line.
 */
test('After the frame holds the frame: № 025’s bodies leave the picture, the still returns, and one line says what happened', async ({
  page,
}, info) => {
  test.slow();
  const still = info.project.name.includes('reduced-motion');
  const desk = !info.project.name.includes('mobile');
  const orbit = await onItsPlate(page, 25);
  await expect(orbit).toHaveAttribute('data-fate', 'ejection');
  const record = page.getByRole('region', { name: t.orbitTableCaption });
  // The record's own row says what its test finds at that step, not that the body goes then.
  await expect(
    record.getByRole('row', { name: /^Fate body 2 no longer bound at step 1,210,000/ }),
  ).toBeVisible();
  const word = await goBeyond(page, orbit);
  await expect(orbit).toHaveAttribute('data-beyond', 'running');
  const line = lineOf(orbit);
  const picture = orbit.locator('figure img');
  const drawing = orbit.locator('canvas[data-layer="continued"]');
  // While it runs the still stands back, a ghost of itself, under the three bodies.
  await expect(picture).toHaveCSS('opacity', '0.3');
  // The whole picture is the subject: the page has brought it into view with all four of its
  // edges, the label under it, its line and its words, on a desk and on a phone alike.
  const stage = orbit.locator('figure [class*="stage"]');
  const label = orbit.getByText(t.analysisNotWork, { exact: true });
  const tell = orbit.getByRole('button', { name: t.beyondTell });
  await expect(stage).toBeInViewport({ ratio: 1 });
  await expect(label).toBeInViewport({ ratio: 1 });
  await expect(label).toHaveCSS('opacity', '1');
  await expect(line).toBeInViewport({ ratio: 1 });
  await expect(tell).toBeInViewport({ ratio: 1 });
  const stood = await atRest(stage);
  // On a desk the section is taller than the screen, so the picture was brought 6 px under the
  // running head, which is 48 px tall and would hide whatever stood behind it.
  // (An engine that scrolls by whole pixels lands a fraction of one lower.)
  if (desk) expect(Math.abs(stood.y - 54)).toBeLessThanOrEqual(1.5);
  else expect(stood.y).toBeGreaterThanOrEqual(56);
  // The caption's account of the window and the window's score have stepped aside for them.
  await expect(orbit.getByText(/drawn over the Light still/)).toHaveCount(0);
  await expect(orbit.locator('canvas[class*="events"]')).toBeHidden();
  // Further on keeps its place among the words for the whole performance.
  const onward = orbit.getByRole('button', { name: t.beyondOnward });
  await expect(wordsOf(orbit)).toHaveText([
    t.beyondOnward,
    t.beyondTell,
    t.afterTheFrame,
    t.oneInATrillion,
  ]);
  const tellAt = (await tell.boundingBox())!;
  const out = /past the film · body 2 is out of the picture(, \d[\d.]* picture widths away)?$/;
  const allOut = /past the film · all three are out of the picture$/;
  if (still) {
    // Nothing plays: the picture stands at the film's end, with its three bodies drawn, and
    // Further on steps it.
    await expect(line).toHaveText('00:00 past the film · step 1,000,000');
    const three = await lit(orbit);
    expect(three).toBeGreaterThan(0);
    await onward.click();
    await expect(line).toHaveText(out);
    // On through the other leavings to a picture with no body on it, its end, and what happened.
    await onward.click();
    await onward.click();
    await expect(line).toHaveText(allOut);
    // No body's centre is on it: at most the rim of one's light, just past the edge.
    expect(await lit(orbit)).toBeLessThan(three / 4);
    await allTheWayOn(orbit);
  } else {
    // The three bodies are drawn on the picture as it begins…
    const three = await lit(orbit);
    expect(three).toBeGreaterThan(0);
    await expect(line).toHaveText(out, { timeout: 30_000 });
    // …the words stand where they stood, whatever Further on has to offer…
    expect(await tell.boundingBox()).toEqual(tellAt);
    await expect(line).toHaveText(allOut, { timeout: 30_000 });
    // …and once all three are out no body's centre is on it: at most the rim of one's light,
    // just past the edge.
    expect(await lit(orbit)).toBeLessThan(three / 4);
    // The drawing gives way to the still, and for eight seconds nothing is said or offered.
    await expect(orbit).toHaveAttribute('data-beyond', 'resting', { timeout: 30_000 });
    await expect(line).toHaveText('');
    await expect(wordsOf(orbit)).toHaveCount(0);
    await expect(drawing).toHaveCSS('opacity', '0');
    await expect(picture).toHaveCSS('opacity', '1');
    // The picture is the work again: the label has gone with the drawing it labelled.
    await expect(label).toHaveCSS('opacity', '0');
  }
  await expect(orbit).toHaveAttribute('data-beyond', 'told', { timeout: 30_000 });
  await expect(line).toHaveText(
    'Body 2 left the picture 3.4 seconds after the film ended. 7.2 seconds later the other two had left it too. The record finds body 2 no longer bound to the other two at step 1,210,000.',
  );
  // It ends on the still, unaltered, with two words, the way back to the frame, and the other act.
  await expect(picture).toHaveCSS('opacity', '1');
  await expect(drawing).toHaveCSS('opacity', '0');
  await expect(wordsOf(orbit)).toHaveText([
    t.again,
    t.beyondRecord,
    t.afterTheFrame,
    t.oneInATrillion,
  ]);
  await expect(orbit.getByRole('link', { name: t.beyondRecord })).toHaveAttribute('href', '#proof');
  // Nothing has moved since the performance began: the picture stands where it stood, and what
  // happened is read under it without a scroll, in the book face, with its words.
  expect(await stage.boundingBox()).toEqual(stood);
  await expect(line).toBeInViewport({ ratio: 1 });
  await expect(line).toHaveCSS('font-style', 'italic');
  const again = orbit.getByRole('button', { name: t.again });
  await expect(again).toBeInViewport({ ratio: 1 });
  // Again stands where Tell me stood, and the way into the record on the line of the words.
  const againBox = (await again.boundingBox())!;
  const recordBox = (await orbit.getByRole('link', { name: t.beyondRecord }).boundingBox())!;
  expect(againBox.y).toBe(tellAt.y);
  expect(Math.abs(recordBox.y - againBox.y)).toBeLessThan(1);
  expect(recordBox.height).toBeGreaterThanOrEqual(44);
  // The word again returns to the recorded window, and stays where the hand pressed it.
  const pressedAt = (await word.boundingBox())!;
  await word.click();
  await expect(orbit).not.toHaveAttribute('data-beyond');
  await expect(word).toHaveAttribute('aria-pressed', 'false');
  await expect(orbit.getByText(t.orbitLine)).toBeVisible();
  // The caption and the score are back above the words, and the word is where it was.
  await expect(orbit.getByText(/drawn over the Light still/)).toBeVisible();
  await expect(word).toBeInViewport({ ratio: 1 });
  expect(Math.abs((await atRest(word)).y - pressedAt.y)).toBeLessThan(2);
});

/**
 * № 031's record finds its three bound to the horizon. On its plate body 3 leaves the picture
 * 33.6 seconds after the film and is back 8.8 seconds later. Asked, the section tells it at
 * once, with no wait and no rest.
 */
test('Tell me says what a bound orbit does past its frame: № 031’s body 3 leaves, and comes back', async ({
  page,
}) => {
  test.slow();
  const orbit = await onItsPlate(page, 31);
  await expect(orbit).toHaveAttribute('data-fate', 'eternal_dance');
  await goBeyond(page, orbit);
  await orbit.getByRole('button', { name: t.beyondTell }).click();
  await expect(orbit).toHaveAttribute('data-beyond', 'told');
  await expect(lineOf(orbit)).toHaveText(
    'Body 3 left the picture 33.6 seconds after the film ended. It came back 8.8 seconds later. All three are still bound to one another at step 8,000,000, where the record stops looking.',
  );
  await expect(orbit.locator('figure img')).toHaveCSS('opacity', '1');
  // Asked for by the keyboard or the hand, what is told has the focus: a screen reader reads it.
  await expect(lineOf(orbit)).toBeFocused();
});

/**
 * № 054 is plotted in cross-braid space, where each mark is made of two bodies' coordinates: a
 * mark that leaves that picture is not a body leaving. Its performance runs to the same kind of
 * end, and no line or sentence names a body: only what the record finds is told.
 */
test('a picture that does not draw the bodies where they were names none of them past its frame', async ({
  page,
}) => {
  test.slow();
  const orbit = await onItsPlate(page, 54);
  await goBeyond(page, orbit);
  await expect(lineOf(orbit)).toHaveText(/^00:0\d past the film · step [\d,]+$/);
  await orbit.getByRole('button', { name: t.beyondTell }).click();
  await expect(lineOf(orbit)).toHaveText(
    'The record finds body 2 no longer bound to the other two at step 1,090,000.',
  );
});

/**
 * A phone on its side has 390 px of height. Past the frame the plate is fitted to what is left
 * of them under the running head, so the whole picture stands in view with its label, its line
 * and its words; the full-width plate would run 160 px under the fold. And in Ukrainian, whose
 * caption and hint run to more lines, the word pressed to go back stays under the hand.
 */
test('past the frame the whole picture stands in view on a phone on its side, and the words stay in reach in Ukrainian', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'chromium-desktop', 'One engine is enough for the arithmetic.');
  test.slow();
  await page.setViewportSize({ width: 844, height: 390 });
  const orbit = await onItsPlate(page, 25);
  await goBeyond(page, orbit);
  const stage = orbit.locator('figure [class*="stage"]');
  await expect(stage).toBeInViewport({ ratio: 1 });
  const box = await atRest(stage);
  expect(box.y).toBeGreaterThanOrEqual(48);
  expect(box.width / box.height).toBeCloseTo(3456 / 2234, 1);
  await expect(orbit.getByText(t.analysisNotWork, { exact: true })).toBeInViewport({ ratio: 1 });
  await expect(lineOf(orbit)).toBeInViewport({ ratio: 1 });
  await expect(orbit.getByRole('button', { name: t.beyondTell })).toBeInViewport({ ratio: 1 });
  await orbit.getByRole('button', { name: t.beyondTell }).click();
  await expect(lineOf(orbit)).toHaveText(/^Body 2 left the picture 3\.4 seconds/);
  await expect(lineOf(orbit)).toBeInViewport({ ratio: 1 });
  await expect(orbit.getByRole('button', { name: t.again })).toBeInViewport({ ratio: 1 });

  // A desk, in Ukrainian: the performance, the line, and the way back.
  const uk = catalogs.uk;
  await page.setViewportSize({ width: 1440, height: 900 });
  const there = await onItsPlate(page, 25, '/uk');
  const word = await goBeyond(page, there, uk);
  await expect(there.locator('figure [class*="stage"]')).toBeInViewport({ ratio: 1 });
  await there.getByRole('button', { name: uk.beyondTell }).click();
  await expect(lineOf(there)).toHaveText(
    /^Тіло 2 вийшло з кадру через 3,4 секунди після кінця фільму\. Ще через 7,2 секунди два інші теж були поза кадром\./,
  );
  await expect(there.getByRole('link', { name: uk.beyondRecord })).toBeInViewport({ ratio: 1 });
  const pressedAt = (await atRest(word)).y;
  await word.click();
  await expect(there).not.toHaveAttribute('data-beyond');
  await expect(word).toBeInViewport({ ratio: 1 });
  expect(Math.abs((await atRest(word)).y - pressedAt)).toBeLessThan(2);
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
  await expect(orbit).toHaveAttribute('data-beyond', /^(running|resting|told)$/, {
    timeout: 60_000,
  });
  await expect(orbit).toBeInViewport();
  // The word moves the visitor, not the address.
  expect(new URL(page.url()).hash).toBe('');
});

/**
 * The energy the computation keeps (EnergyWatch in src/lib/physics/orbit.ts). The record dates
 * № 004's ejection at step 1,540,000 and the derivation meets it to the step. It also finds what
 * the record does not say: 5,000 steps earlier two bodies pass 0.11 apart, closer than the fixed
 * step can follow, and the computed energy of a bound triple turns several times over positive.
 * The record's note says so. After the frame performs nothing past that step, and says of it
 * only that: no body is called free, and the three are not called bound.
 */
test('the record says where a computation lost its energy, and After the frame performs nothing past it', async ({
  page,
}) => {
  test.slow();
  const orbit = await onItsPlate(page, 4);
  await expect(orbit).toHaveAttribute('data-fate', 'ejection');
  const record = page.getByRole('region', { name: t.orbitTableCaption });
  const kept = record.locator('[data-energy]');
  await expect(kept).toHaveAttribute('data-energy', 'broken');
  await expect(kept).toContainText(
    'Near step 1,535,000 two bodies pass 0.11 apart, closer than the computation’s fixed step can follow, and its energy changes by 780%.',
  );
  await expect(kept).toContainText('past that step this is the computation, not an orbit.');
  await goBeyond(page, orbit);
  // The step lies sixteen seconds of film on: Further on goes there, at any pace.
  await allTheWayOn(orbit);
  await expect(orbit).toHaveAttribute('data-beyond', 'told', { timeout: 60_000 });
  await expect(lineOf(orbit)).toHaveText(
    'Past step 1,535,000 this is not an orbit: the computed energy changed by 780%.',
  );
  await expect(orbit.getByText(/no longer bound to the other two|still bound/)).toHaveCount(0);
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
