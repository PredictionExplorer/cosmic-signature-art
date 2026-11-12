import { expect, test, type Locator, type Page } from '@playwright/test';
import { catalogs } from '../../src/lib/i18n/messages';
import { fill } from '../../src/lib/i18n/format';
import { SETTLE_MS } from '../../src/lib/second-press';
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

/** The line under the drawing, the words beside it, and the answers under the question. */
const lineOf = (orbit: Locator) => orbit.locator('#orbit-said');
const wordsOf = (orbit: Locator) => orbit.locator('[class*="words"] :is(button, a)');
const answersOf = (orbit: Locator) => orbit.locator('[class*="answers"] button');
/** The orbit section of a work on its plate, derived and checked, with its path past the window. */
async function onItsPlate(page: Page, id: number, locale = '', expression = 'light') {
  await page.goto(`${locale}/art/${id}?expression=${expression}`);
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
  await expect(orbit).toHaveAttribute('data-material', expression);
  return orbit;
}
/**
 * Further on, for as long as it goes anywhere. Where the picture is performed it is dimmed once
 * the next moment is near, and the performance does the rest. Where nothing plays (`still`) it
 * steps to each moment in turn and to the end, where it is dimmed too: it never tells, so Tell
 * me is pressed then.
 */
async function allTheWayOn(orbit: Locator, still = false) {
  const onward = orbit.getByRole('button', { name: catalogs.en.beyondOnward });
  // It keeps its place for the whole performance, so it is there to be found.
  await expect(onward).toBeVisible();
  for (let step = 0; step < 60; step++) {
    if ((await orbit.getAttribute('data-beyond')) !== 'running') {
      // A performance may end by itself where it plays. Where nothing plays only Tell me
      // tells: a press of Further on never does.
      expect(still, 'Further on told what happened').toBe(false);
      return;
    }
    if ((await onward.getAttribute('aria-disabled').catch(() => 'true')) === 'true') break;
    // A performance that ends as the word is pressed has done its work.
    await onward.click({ timeout: 2_000 }).catch(() => {});
  }
  if (!still || (await orbit.getAttribute('data-beyond')) !== 'running') return;
  // Dimmed at the end, Further on does nothing however often it is pressed.
  await onward.click({ force: true });
  await expect(orbit).toHaveAttribute('data-beyond', 'running');
  await orbit.getByRole('button', { name: catalogs.en.beyondTell }).click();
}
/**
 * The plate's word asks by this event, wherever the visitor stands. Where the picture draws the
 * bodies where they were, the visitor is then asked whom to stay with: `stay` answers with the
 * frame (as every test of the frame held does), with a body, or (null) leaves the question open.
 */
async function goBeyond(
  page: Page,
  orbit: Locator,
  words = t,
  stay: 'frame' | 1 | 2 | 3 | null = 'frame',
) {
  await page.evaluate((name) => window.dispatchEvent(new Event(name)), AFTER_THE_FRAME_EVENT);
  const word = orbit.getByRole('button', { name: words.afterTheFrame });
  await expect(word).toHaveAttribute('aria-pressed', 'true', { timeout: 60_000 });
  await expect(orbit).toHaveAttribute('data-beyond', /./);
  if ((await orbit.getAttribute('data-beyond')) !== 'choosing') {
    await expect(orbit.getByText(words.afterTheFrameNote)).toBeVisible();
    return word;
  }
  await expect(orbit.getByText(words.afterTheFrameNoteAsk)).toBeVisible();
  await expect(lineOf(orbit)).toHaveText(words.beyondAsk);
  if (stay === null) return word;
  const answer =
    stay === 'frame' ? words.beyondStayFrame : words.beyondStayBody.replace('{body}', String(stay));
  // Answered in the page, not by a pointer: the page is still bringing the picture into view,
  // and a pointer aimed at a word on the move leaves the page somewhere else (the tests of the
  // question itself press as a visitor does).
  await orbit.getByRole('button', { name: answer, exact: true }).dispatchEvent('click');
  await expect(orbit).toHaveAttribute('data-beyond', 'running');
  return word;
}
/**
 * Where an element stands once the page has come to rest: the page has not scrolled for eight
 * of its own animation frames in a row, and the element is where it was at the first of them.
 * A scroll the page begins a frame or two after the change that asks for it has begun by then;
 * and a page too busy to draw waits, where a clock would have called it still.
 */
async function atRest(locator: Locator) {
  await expect
    .poll(async () => {
      const before = await locator.boundingBox();
      await locator.page().evaluate(
        () =>
          new Promise<void>((resolve) => {
            let at = window.scrollY;
            let same = 0;
            const frame = () => {
              same = window.scrollY === at ? same + 1 : 0;
              at = window.scrollY;
              if (same >= 8) resolve();
              else requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
          }),
      );
      return JSON.stringify(await locator.boundingBox()) === JSON.stringify(before);
    })
    .toBe(true);
  return (await locator.boundingBox())!;
}
/** How many pixels of the bodies' layer are drawn on: a 2D canvas, read without a GPU. */
const lit = (orbit: Locator, layer = 'marks') =>
  orbit.locator(`canvas[data-layer="${layer}"]`).evaluate((canvas: HTMLCanvasElement) => {
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    let drawn = 0;
    for (let alpha = 3; alpha < data.length; alpha += 4) if (data[alpha] > 0) drawn++;
    return drawn;
  });
/**
 * Where the bodies' layer is drawn on, as shares of the picture: the box about every lit pixel,
 * and the middles of the topmost and the bottommost lit rows.
 */
const litBox = (orbit: Locator) =>
  orbit.locator('canvas[data-layer="marks"]').evaluate((canvas: HTMLCanvasElement) => {
    const { width, height } = canvas;
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, width, height);
    let [left, right, top, bottom] = [width, -1, height, -1];
    let [topFrom, topTo] = [width, -1];
    let [bottomFrom, bottomTo] = [width, -1];
    let hearts = 0;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        // The bright heart of a light, not the far reach of its halo.
        if (data[(y * width + x) * 4 + 3] < 160) continue;
        hearts += 1;
        if (top === height) top = y;
        if (y === top) [topFrom, topTo] = [Math.min(topFrom, x), Math.max(topTo, x)];
        if (y !== bottom) [bottomFrom, bottomTo] = [width, -1];
        [bottomFrom, bottomTo] = [Math.min(bottomFrom, x), Math.max(bottomTo, x)];
        left = Math.min(left, x);
        right = Math.max(right, x);
        bottom = y;
      }
    return {
      /** Pixels at a light's heart: none where nothing is drawn. */
      hearts,
      left: left / width,
      right: right / width,
      top: top / height,
      bottom: bottom / height,
      topmost: [(topFrom + topTo) / 2 / width, top / height],
      bottommost: [(bottomFrom + bottomTo) / 2 / width, bottom / height],
    };
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
    await allTheWayOn(orbit, true);
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
  // Again stands on the line Tell me stood on, and the way into the record beside it.
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
 * Whom to stay with (docs/after-the-frame.md §8.4). Before time resumes the three wait where the
 * film left them, each with its number, and one line asks: "Stay with one of the three, or with
 * the frame." № 025's record finds body 2 free. With body 2 the picture stays on it: the still
 * leaves the stage, the other two go out of the picture 1.2 seconds after the film, and body 2
 * is alone in it for eight seconds; then the still, the silence, and what happened. Nothing on
 * the page moves from the question to the telling.
 */
test('asked whom to stay with, № 025 stays with the body its record finds free, and that body is left alone', async ({
  page,
}, info) => {
  test.slow();
  const still = info.project.name.includes('reduced-motion');
  const orbit = await onItsPlate(page, 25);
  const word = await goBeyond(page, orbit, t, null);
  await expect(orbit).toHaveAttribute('data-beyond', 'choosing');
  const line = lineOf(orbit);
  const picture = orbit.locator('figure img');
  const stage = orbit.locator('figure [class*="stage"]');
  // The question, in the voice of what will be told, said by the focus it is given: here the
  // plate's word asked, from wherever the visitor stood. Its answers stand under it, as a
  // group it names, in its order: the three by the numbers they bear in the picture, then the
  // frame.
  await expect(line).toHaveCSS('font-style', 'italic');
  await expect(line).toBeFocused();
  await expect(answersOf(orbit)).toHaveText(['1', '2', '3', t.beyondFrame]);
  const group = orbit.getByRole('group', { name: t.beyondAsk });
  await expect(group).toBeVisible();
  // Under it: both read in one look, since the page may still be bringing the picture up.
  const [lineEnds, groupBegins] = await group.evaluate((answers) => [
    document.getElementById(answers.getAttribute('aria-labelledby')!)!.getBoundingClientRect()
      .bottom,
    answers.getBoundingClientRect().top,
  ]);
  expect(groupBegins).toBeGreaterThanOrEqual(lineEnds - 0.5);
  // Everything else that can come to stand in the line's room is laid out there, unseen: the
  // question again with its answers, the four tellings and the longest running line.
  const unseen = orbit.locator('[class*="said"] > [aria-hidden="true"]');
  await expect(unseen).toHaveCount(6);
  for (const one of await unseen.all()) await expect(one).toHaveCSS('visibility', 'hidden');
  // Beside the line stand only the two words that stay: none where an answer will go.
  await expect(wordsOf(orbit)).toHaveText([t.afterTheFrame, t.oneInATrillion]);
  const answer = orbit.getByRole('button', { name: 'Stay with body 2', exact: true });
  expect((await answer.boundingBox())!.width).toBeGreaterThanOrEqual(44);
  expect((await answer.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // The still stands back a little; the three are drawn on it, each with its number; nothing runs.
  await expect(picture).toHaveCSS('opacity', '0.6');
  await expect(orbit.getByText(t.analysisNotWork, { exact: true })).toHaveCSS('opacity', '1');
  expect((await litBox(orbit)).hearts).toBeGreaterThan(0);
  expect(await lit(orbit, 'names')).toBeGreaterThan(0);
  // The whole picture, the question and every word are in view.
  await expect(stage).toBeInViewport({ ratio: 1 });
  await expect(line).toBeInViewport({ ratio: 1 });
  await expect(answer).toBeInViewport({ ratio: 1 });
  await expect(orbit.getByRole('button', { name: t.oneInATrillion })).toBeInViewport({ ratio: 1 });
  const stood = await atRest(stage);
  const twin = orbit.getByRole('button', { name: t.oneInATrillion });
  const twinAt = (await atRest(twin)).y;

  // Answered from the keyboard on a desk, and by one tap of a finger on a phone: the word goes,
  // and the focus is on the line, which says first whom the picture stays with.
  if (info.project.name.includes('mobile')) await answer.tap();
  else {
    await answer.focus();
    await page.keyboard.press('Enter');
  }
  await expect(orbit).toHaveAttribute('data-beyond', 'running');
  await expect(orbit).toHaveAttribute('data-kept', '2');
  await expect(line).toHaveText(/^Staying with body 2 · 00:0\d past the film · /);
  await expect(line).toBeFocused();
  await expect(answersOf(orbit)).toHaveCount(0);
  // The picture travels with body 2 now, so the still has left the stage, and the window's
  // strokes with it. Nothing on the page has moved, and the two words that stay stand where
  // they stood.
  await expect(picture).toHaveCSS('opacity', '0');
  await expect(orbit.locator('canvas[data-layer="trails"]')).toHaveCSS('opacity', '0');
  expect(await lit(orbit, 'names')).toBe(0);
  expect(await stage.boundingBox()).toEqual(stood);
  expect((await twin.boundingBox())!.y).toBe(twinAt);
  const alone =
    /^Staying with body 2 · 00:\d\d past the film · bodies 1 and 3 are out of the picture$/;
  // On a phone the words are two rows: those that come and go, and under them the two that stay.
  if (info.project.name.includes('mobile'))
    expect(
      (await twin.boundingBox())!.y -
        (await orbit.getByRole('button', { name: t.beyondTell }).boundingBox())!.y,
    ).toBeGreaterThanOrEqual(40);
  if (still) {
    await expect(line).toHaveText('Staying with body 2 · 00:00 past the film · step 1,000,000');
    await allTheWayOn(orbit, true);
  } else {
    await expect(line).toHaveText(alone, { timeout: 30_000 });
    // One light, held at the middle of the picture, and nothing else on it.
    const box = await litBox(orbit);
    expect(box.hearts).toBeGreaterThan(0);
    expect((box.left + box.right) / 2).toBeCloseTo(0.5, 1);
    expect((box.top + box.bottom) / 2).toBeCloseTo(0.5, 1);
    expect(box.right - box.left).toBeLessThan(0.05);
    await expect(orbit).toHaveAttribute('data-beyond', 'resting', { timeout: 30_000 });
    await expect(picture).toHaveCSS('opacity', '1');
  }
  await expect(orbit).toHaveAttribute('data-beyond', 'told', { timeout: 30_000 });
  await expect(line).toHaveText(
    'The picture stayed with body 2. Body 2 was alone in it from 1.2 seconds after the film ended. The record finds body 2 no longer bound to the other two at step 1,210,000.',
  );
  // From the question to the telling nothing has moved: the picture, and the words under it.
  expect(await stage.boundingBox()).toEqual(stood);
  expect((await twin.boundingBox())!.y).toBe(twinAt);
  await expect(line).toBeInViewport({ ratio: 1 });
  // Again asks the question again. Pressed twice in the same place, as a double click presses,
  // it does not also answer it: no word stands where Again stood.
  const again = orbit.getByRole('button', { name: t.again });
  if (info.project.name.includes('mobile')) await again.tap();
  else await again.dblclick();
  await expect(orbit).toHaveAttribute('data-beyond', 'choosing');
  await expect(line).toHaveText(t.beyondAsk);
  await expect(picture).toHaveCSS('opacity', '0.6');
  await expect(answersOf(orbit)).toHaveCount(4);
  await expect(orbit).not.toHaveAttribute('data-kept');
  await expect(orbit).toHaveAttribute('data-beyond', 'choosing');
  // And the word that began it still ends it.
  await word.click();
  await expect(orbit).not.toHaveAttribute('data-beyond');
});

/**
 * A second press in the same place (src/lib/second-press.ts). Tell me, pressed twice as a double
 * click or a double tap presses it, tells once: the way into the record, which comes to stand
 * under the pointer when it is told, is not followed by the second.
 */
test('a word pressed twice in one place is pressed once: Tell me tells, and nothing follows it', async ({
  page,
}, info) => {
  test.slow();
  const finger = info.project.name.includes('mobile');
  const orbit = await onItsPlate(page, 31);
  await goBeyond(page, orbit, t, 3);
  const tell = orbit.getByRole('button', { name: t.beyondTell });
  await expect(tell).toBeInViewport({ ratio: 1 });
  const at = await atRest(tell);
  if (finger) {
    // Two taps of a finger in one place, as fast as the page takes them.
    const [x, y] = [at.x + at.width / 2, at.y + at.height / 2];
    await page.touchscreen.tap(x, y);
    await page.touchscreen.tap(x, y);
  } else await tell.dblclick();
  await expect(orbit).toHaveAttribute('data-beyond', 'told');
  await expect(lineOf(orbit)).toHaveText(
    /^The picture stayed with body 3\. Body 3 was alone in it for 10\.8 seconds/,
  );
  // Neither followed into the record, nor asked again: read in the page, once the second
  // press has had time to do whatever it would.
  await page.waitForTimeout(SETTLE_MS + 200);
  expect(await page.evaluate(() => window.location.hash)).toBe('');
  await expect(orbit).toHaveAttribute('data-beyond', 'told');
  // The way into the record now stands where Tell me was pressed. A press there in its own
  // time is taken as any other.
  const record = orbit.getByRole('link', { name: t.beyondRecord });
  const there = (await record.boundingBox())!;
  expect(at.x + at.width / 2).toBeGreaterThan(there.x);
  expect(at.x + at.width / 2).toBeLessThan(there.x + there.width);
  if (finger) await record.tap();
  else await record.click();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#proof');
});

/**
 * A body can be pressed in the picture itself. A mouse finds it, and its number, and is shown
 * that it can be pressed; a finger, which covers more than it points at, is taken only where one
 * body is under it: № 025's bodies 1 and 3 end the film a few pixels apart on a phone, and a
 * tap on them leaves the question to the words. And from one of the two the record leaves bound,
 * it is body 2 that goes, while the other stays in the picture: said in Ukrainian too.
 */
test('a body pressed in the picture is stayed with; from one left behind, the other is still there', async ({
  page,
}, info) => {
  test.skip(
    !['chromium-desktop', 'chromium-mobile', 'webkit-mobile'].includes(info.project.name),
    'A mouse on one engine, and a finger on two.',
  );
  test.slow();
  const orbit = await onItsPlate(page, 25);
  await goBeyond(page, orbit, t, null);
  const stage = orbit.locator('figure [class*="stage"]');
  // Body 2 stands apart at the top of the three; bodies 1 and 3 together at the bottom. The
  // page may still be bringing the picture into view, so each is found afresh as it is pressed.
  const { topmost, bottommost } = await litBox(orbit);
  const on = async ([x, y]: number[], down = 0) => {
    const frame = (await stage.boundingBox())!;
    return [frame.x + x * frame.width, frame.y + y * frame.height + down];
  };
  if (info.project.name.includes('mobile')) {
    await expect(orbit.getByRole('button', { name: t.oneInATrillion })).toBeInViewport({
      ratio: 1,
    });
    await atRest(stage);
    // A finger on the two that stand together: not taken, and both are ringed, so the press
    // is seen to have been taken in (a tap that missed them would ring nothing).
    const numbers = await lit(orbit, 'names');
    const [bx, by] = await on(bottommost, -3);
    await page.touchscreen.tap(bx, by);
    await expect.poll(() => lit(orbit, 'names')).toBeGreaterThan(numbers);
    await expect(orbit).toHaveAttribute('data-beyond', 'choosing');
    // On body 2, alone under it: taken.
    const [tx, ty] = await on(topmost, 4);
    await page.touchscreen.tap(tx, ty);
  } else {
    let at = [0, 0];
    await expect(async () => {
      at = await on(topmost, 4);
      await page.mouse.move(at[0] - 40, at[1] - 40);
      await page.mouse.move(at[0], at[1]);
      await expect(stage).toHaveAttribute('data-pick', /./, { timeout: 500 });
    }).toPass({ timeout: 20_000 });
    await page.mouse.click(at[0], at[1]);
  }
  await expect(orbit).toHaveAttribute('data-kept', '2');
  // Asked again, and answered with body 1: told at the visitor's word.
  await orbit.getByRole('button', { name: t.beyondTell }).click();
  await orbit.getByRole('button', { name: t.again }).click();
  await orbit.getByRole('button', { name: 'Stay with body 1', exact: true }).click();
  await expect(orbit).toHaveAttribute('data-kept', '1');
  await orbit.getByRole('button', { name: t.beyondTell }).click();
  await expect(lineOf(orbit)).toHaveText(
    'The picture stayed with body 1. Body 2 left the picture 1.2 seconds after the film ended. 8.0 seconds later body 3 was still in it. The record finds body 2 no longer bound to the other two at step 1,210,000.',
  );
  if (info.project.name !== 'chromium-desktop') return;

  const uk = catalogs.uk;
  const there = await onItsPlate(page, 25, '/uk');
  await goBeyond(page, there, uk, 2);
  await expect(lineOf(there)).toHaveText(/^Кадр із тілом 2 · 00:0\d після фільму · /);
  await there.getByRole('button', { name: uk.beyondTell }).click();
  await expect(lineOf(there)).toHaveText(
    /^Кадр лишався з тілом 2\. Через 1,2 секунди після кінця фільму тіло 2 лишилося в кадрі одне\./,
  );
});

/**
 * On paper the same question is asked over the Ink still, with each body's ring in the hollow it
 * left; with a body, the three go on as graphite on the sheet's own tone, and what happened is
 * told as it is on Light.
 */
test('on Ink the question is asked over the sheet, and a body is stayed with on its bare tone', async ({
  page,
}) => {
  test.slow();
  const orbit = await onItsPlate(page, 25, '', 'ink');
  await goBeyond(page, orbit, t, null);
  const picture = orbit.locator('figure img');
  await expect(picture).toHaveCSS('opacity', '0.6');
  await expect(answersOf(orbit)).toHaveText(['1', '2', '3', t.beyondFrame]);
  expect(await lit(orbit)).toBeGreaterThan(0);
  expect(await lit(orbit, 'names')).toBeGreaterThan(0);
  // The sheet's own edge is there to see: no hairline is drawn about it.
  expect(
    await orbit
      .locator('figure [class*="stage"]')
      .evaluate((stage) => getComputedStyle(stage, '::after').content),
  ).toBe('none');
  await orbit.getByRole('button', { name: 'Stay with body 3', exact: true }).click();
  await expect(orbit).toHaveAttribute('data-kept', '3');
  await expect(picture).toHaveCSS('opacity', '0');
  expect(await lit(orbit)).toBeGreaterThan(0);
  await orbit.getByRole('button', { name: t.beyondTell }).click();
  await expect(lineOf(orbit)).toHaveText(
    'The picture stayed with body 3. Body 2 left the picture 0.2 seconds after the film ended. 8.0 seconds later body 1 was still in it. The record finds body 2 no longer bound to the other two at step 1,210,000.',
  );
  await expect(picture).toHaveCSS('opacity', '1');
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

/**
 * Nothing on the page moves from the question to the telling (docs/after-the-frame.md §8.4):
 * everything that can come to stand in the line's room is laid out there from the moment of
 * asking, and the plate is fitted to the room that takes. Held here where it is hardest: the
 * longest telling there is (№ 030 with body 3: four sentences, the last of lost energy), in
 * Japanese, on a narrow phone.
 */
test('nothing moves from the question to the longest telling, in Japanese on a narrow phone', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'chromium-desktop', 'One engine is enough for the arithmetic.');
  test.slow();
  const screen = { width: 360, height: 740 };
  await page.setViewportSize(screen);
  const ja = catalogs.ja;
  const orbit = await onItsPlate(page, 30, '/ja');
  await goBeyond(page, orbit, ja, null);
  const stage = orbit.locator('figure [class*="stage"]');
  /** Where the picture, the line's room and the words stand, once the page is at rest. */
  const placed = async () => {
    const picture = await atRest(stage);
    const room = (await orbit.locator('[class*="said"]').boundingBox())!;
    const words = (await orbit.locator('[class*="words"]').boundingBox())!;
    return [picture, room, words].flatMap(({ x, y, width, height }) => [x, y, width, height]);
  };
  const asked = await placed();
  const [, top, , , , roomTop, , roomHeight, , wordsTop, , wordsHeight] = asked;
  // All of it in one screen: the picture under the running head, the last word above the fold.
  expect(top).toBeGreaterThanOrEqual(48);
  expect(wordsTop + wordsHeight).toBeLessThanOrEqual(screen.height);
  const unmoved = async () => {
    const now = await placed();
    now.forEach((value, at) =>
      expect(Math.abs(value - asked[at]), `reading ${at}`).toBeLessThan(0.5),
    );
  };

  await orbit
    .getByRole('button', { name: fill(ja.beyondStayBody, { body: 3 }), exact: true })
    .dispatchEvent('click');
  await expect(orbit).toHaveAttribute('data-kept', '3');
  await expect(lineOf(orbit)).not.toHaveText(ja.beyondAsk);
  await unmoved();

  await orbit.getByRole('button', { name: ja.beyondTell }).click();
  await expect(orbit).toHaveAttribute('data-beyond', 'told');
  const line = lineOf(orbit);
  await expect(line.locator('[class*="sentence"]')).toHaveCount(4);
  await unmoved();
  // The telling stands inside the room that was kept for it.
  const told = (await line.boundingBox())!;
  expect(told.y + told.height).toBeLessThanOrEqual(roomTop + roomHeight + 0.5);
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
}, info) => {
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
  await allTheWayOn(orbit, info.project.name.includes('reduced-motion'));
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
