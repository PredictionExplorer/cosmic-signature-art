import { expect, test, type Locator, type Page } from './fixtures';
import { pauseAmbientMotion, playAmbientMotion } from './helpers';
import { catalogs } from '../../src/lib/i18n/messages';
import { fill } from '../../src/lib/i18n/format';

const t = catalogs.en;

/*
  The film runs on into the question (docs/after-the-frame.md §8.7). Where the recorded window's
  film plays out, the question stands under the picture with no word pressed, and nothing on
  the page moves, leaves or takes the focus for it. The answer is the press.

  № 025 on its plate: its picture draws the bodies where they were, and body 2 is no longer
  bound 210,000 steps past its window.
*/

const AT_THE_END = 'Step 1,000,000 of 1,000,000 · 00:30 into the Light film';

/** The orbit section of a work on its plate, derived and checked, its path past the window known. */
async function onItsPlate(page: Page, path: string) {
  await page.goto(path);
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
  await expect(orbit).toHaveAttribute('data-drawing', 'plate');
  // Checked to the last row, the worker has sent its last reply but one; the path past the
  // window follows it, and the question waits for that path wherever it stands.
  await page.evaluate(() => {
    const stage = document.querySelector('#orbit figure [class*="stage"]')!;
    const head =
      parseFloat(getComputedStyle(document.querySelector('#orbit')!).scrollMarginTop) || 0;
    // The picture just under the running head, as a visitor who came to watch it has it.
    window.scrollTo({
      top: window.scrollY + stage.getBoundingClientRect().top - head - 6,
      behavior: 'instant',
    });
  });
  return orbit;
}

const answersOf = (orbit: Locator) => orbit.locator('figcaption [class*="answers"] button');
const questionOf = (orbit: Locator) => orbit.locator('#orbit-ask');
const sliderOf = (orbit: Locator) => orbit.getByRole('slider');

/**
 * Samples, on every frame, where everything that must not move stands, and where the focus is.
 * `read` gives each thing's distinct readings since it began: one reading means it never moved.
 * It notes too whether the question stands (`asked`), so that a test can show its sampler saw
 * the page on both sides of the question's coming; and, while it stands, how strongly the
 * bodies' numbers do (`numbers`: where motion is welcome they come over the settling time).
 *
 * `nearTheEnd` first sets the film a second from its end, in the very task the sampling begins
 * in: no round trip of the test's driver lies between the two for the film to end in unseen.
 * It is set in the page, as a hand on the score sets it: a slider filled by the driver is first
 * scrolled into view, and here the page is being watched for exactly that. While the film
 * plays, a moment set on the slider plays on from there.
 */
async function watch(page: Page, { nearTheEnd = false } = {}) {
  await page.evaluate((nearTheEnd) => {
    if (nearTheEnd) {
      const input = document.querySelector<HTMLInputElement>('#orbit input[type="range"]')!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        '1740',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const half = (n: number) => Math.round(n * 2) / 2;
    const box = (selector: string) => {
      const node = document.querySelector(selector);
      if (!node) return 'none';
      const r = node.getBoundingClientRect();
      return [half(r.left), half(r.top), half(r.width), half(r.height)].join(' ');
    };
    const seen: Record<string, Set<string>> = {};
    const note = (name: string, value: string) => (seen[name] ??= new Set()).add(value);
    const sample = () => {
      // The page's whole height is not read: beneath the record, the work's history arrives from
      // the indexer when it will, and that is not this section's to hold still.
      note('scroll', String(half(window.scrollY)));
      note('picture', box('#orbit figure [class*="stage"]'));
      note('caption', box('#orbit figcaption'));
      note('score', box('#orbit [class*="strip"]'));
      note('record', box('#proof'));
      note('section', box('#orbit'));
      // The line's box is as wide as its words: its place and its height are what must hold.
      const line = document.querySelector('#orbit-said')!.getBoundingClientRect();
      note('line', [half(line.left), half(line.top), half(line.height)].join(' '));
      const active = document.activeElement;
      note('focus', !active || active === document.body ? 'the page' : active.id || active.tagName);
      const asked = document.querySelector('#orbit')!.hasAttribute('data-asked');
      note('asked', asked ? 'asked' : 'not yet');
      // How strongly the bodies' numbers stand, on every frame the question stands.
      if (asked)
        note(
          'numbers',
          getComputedStyle(document.querySelector('#orbit canvas[data-layer="names"]')!).opacity,
        );
    };
    const frame = () => {
      sample();
      (window as unknown as { __watching: number }).__watching = requestAnimationFrame(frame);
    };
    Object.assign(window, { __seen: seen, __sample: sample });
    frame();
  }, nearTheEnd);
  return {
    read: () =>
      page.evaluate(() => {
        const held = window as unknown as {
          __seen: Record<string, Set<string>>;
          __sample: () => void;
          __watching: number;
        };
        cancelAnimationFrame(held.__watching);
        // Once more, as it is read: what changed last may be younger than a frame, and a busy
        // runner's frames are far apart.
        held.__sample();
        return Object.fromEntries(
          Object.entries(held.__seen).map(([name, set]) => [name, [...set]]),
        );
      }),
  };
}

/**
 * The film's last second, played out by its own clock, and watched from before its end (the
 * sampler sets the film a second from it as it begins).
 */
async function playOut(page: Page, orbit: Locator, words = t) {
  await expect(orbit.getByRole('button', { name: words.pause })).toBeVisible({ timeout: 30_000 });
  let watched = await watch(page, { nearTheEnd: true });
  // A runner whose one frame passes over the film's whole last second has not watched it end:
  // the clock says so (`late`), and asks nothing. The film is then played again, twice at most:
  // by its word, pressed in the page as a key presses it, so that neither the focus nor the
  // page is moved by the test's own driver.
  for (let again = 0; again < 2; again++) {
    await expect(orbit).toHaveAttribute('data-ended', /./, { timeout: 20_000 });
    if ((await orbit.getAttribute('data-ended')) === 'played') break;
    await watched.read();
    await orbit
      .getByRole('button', { name: words.again })
      .evaluate((word: HTMLElement) => word.click());
    await expect(orbit.getByRole('button', { name: words.pause })).toBeVisible();
    watched = await watch(page, { nearTheEnd: true });
  }
  await expect(orbit).toHaveAttribute('data-ended', 'played');
  return watched;
}

/**
 * What a sampler read through the question's coming: every thing in one place, and the sampler
 * shown to have seen the page before the question stood as well as after.
 */
function stoodStill(moved: Record<string, string[]>, through: string) {
  for (const [what, readings] of Object.entries(moved))
    if (what !== 'asked' && what !== 'numbers')
      expect.soft(readings, `${what} stood in one place ${through}`).toHaveLength(1);
  expect(moved.asked, 'the sampler saw the page before the question and with it').toEqual([
    'not yet',
    'asked',
  ]);
}
const STILL = 'Nothing plays where motion is unwelcome.';

test.describe('where motion is welcome', () => {
  for (const expression of ['ink', 'light'] as const)
    test(`the film runs on into the question under the picture, and nothing moves for it: ${expression}`, async ({
      page,
    }, info) => {
      test.skip(info.project.name.includes('reduced-motion'), STILL);
      const orbit = await onItsPlate(page, `/art/25?expression=${expression}`);
      // No question while the film plays; its room is kept, unseen.
      await expect(questionOf(orbit)).toBeEmpty();
      await expect(answersOf(orbit)).toHaveCount(0);
      // And the caption is text alone: a pointer on its first line meets its words, not the
      // question's cell, which lies over them unseen.
      expect(
        await orbit.locator('figcaption').evaluate((caption) => {
          const account = caption.querySelector('[class*="account"]')!;
          const box = account.getBoundingClientRect();
          const met = document.elementFromPoint(box.left + 24, box.top + 4);
          return !!met && account.contains(met);
        }),
      ).toBe(true);
      const watched = await playOut(page, orbit);

      await expect(orbit).toHaveAttribute('data-asked', 'true');
      await expect(questionOf(orbit)).toHaveText(t.beyondAsk);
      await expect(answersOf(orbit)).toHaveText(['1', '2', '3', t.beyondFrame]);
      // In view with the whole picture: the question and every answer.
      await expect(questionOf(orbit)).toBeInViewport({ ratio: 1 });
      for (const answer of await answersOf(orbit).all()) {
        await expect(answer).toBeInViewport({ ratio: 1 });
        const box = (await answer.boundingBox())!;
        expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
      }
      await expect(orbit.locator('figure [class*="stage"]')).toBeInViewport({ ratio: 1 });
      // Nothing has been entered: the film's own words, its slider at the end of its track, and
      // the line and the slider saying the same of where it stands.
      await expect(orbit).not.toHaveAttribute('data-beyond', /./);
      await expect(orbit.getByRole('button', { name: t.again })).toBeVisible();
      await expect(sliderOf(orbit)).toBeEnabled();
      await expect(sliderOf(orbit)).toHaveValue('1801');
      await expect(sliderOf(orbit)).toHaveAttribute('aria-valuetext', AT_THE_END);
      await expect(orbit.locator('#orbit-said')).toHaveText(AT_THE_END);
      // The numbers come over the venue's settling time: let them, then read what moved.
      await page.waitForTimeout(1_500);
      const moved = await watched.read();
      stoodStill(moved, 'through the film’s end');
      expect(moved.focus).toEqual(['the page']);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false,
      );
    });

  test('the answer is the press: After the frame is entered with the answer given, and the focus is never lost', async ({
    page,
  }, info) => {
    test.skip(info.project.name.includes('reduced-motion'), STILL);
    const orbit = await onItsPlate(page, '/art/25?expression=ink');
    await playOut(page, orbit);
    await expect(answersOf(orbit)).toHaveCount(4);
    const answer = orbit.getByRole('button', { name: fill(t.beyondStayBody, { body: 2 }) });
    await answer.focus();
    const watched = await watch(page);
    await page.keyboard.press('Enter');
    await expect(orbit).toHaveAttribute('data-beyond', 'running');
    await expect(orbit).toHaveAttribute('data-kept', '2');
    await expect(orbit.locator('#orbit-said')).toHaveText(/^Staying with body 2 · /);
    await expect(orbit.locator('#orbit-said')).toBeFocused();
    // The answers went with the composition the answer brought: the focus was kept in the
    // section as they went, then handed to the line. It was never on the page.
    const { focus } = await watched.read();
    expect(focus).not.toContain('the page');
    expect(focus.at(-1)).toBe('orbit-said');
    // Past the frame as a press of the word would have it: the picture, its line and its
    // words in one screen.
    await expect(orbit.locator('figure [class*="stage"]')).toBeInViewport({ ratio: 1 });
    await expect(orbit.getByRole('button', { name: t.afterTheFrame })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(sliderOf(orbit)).toHaveCount(0);
  });

  test('taken back into the record, the question goes and the caption returns; at the next end it stands again', async ({
    page,
  }, info) => {
    test.skip(info.project.name.includes('reduced-motion'), STILL);
    const orbit = await onItsPlate(page, '/art/25?expression=light');
    await playOut(page, orbit);
    await expect(questionOf(orbit)).toHaveText(t.beyondAsk);
    // The caption's account gives way in sight only: a screen reader that was reading it when
    // the film ended goes on reading it, so it is neither removed nor hidden from one.
    const account = orbit.locator('figcaption').getByText(/^Three bodies, of masses/);
    await expect(account).toHaveCSS('opacity', '0');
    await expect(account).toBeAttached();
    expect(await account.evaluate((node) => !!node.closest('[aria-hidden="true"], [hidden]'))).toBe(
      false,
    );
    // A notch back on the slider is the record again.
    await sliderOf(orbit).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(orbit).not.toHaveAttribute('data-asked', /./);
    await expect(questionOf(orbit)).toBeEmpty();
    await expect(answersOf(orbit)).toHaveCount(0);
    await expect(account).toHaveCSS('opacity', '1');
    // The last notch is the film's end: set there by hand, it asks.
    await page.keyboard.press('End');
    await expect(orbit).toHaveAttribute('data-ended', 'hand');
    await expect(questionOf(orbit)).toHaveText(t.beyondAsk);
    await expect(sliderOf(orbit)).toBeFocused();
  });
});

test('where nothing plays, the question is not put unasked: the slider’s last notch puts it', async ({
  page,
}, info) => {
  test.skip(
    !info.project.name.includes('reduced-motion'),
    'Where motion is welcome the film asks.',
  );
  const orbit = await onItsPlate(page, '/art/25?expression=ink');
  // The window stands whole, with nothing watched: After the frame is a word away, as it was.
  await expect(orbit.getByRole('button', { name: t.play })).toBeVisible();
  await expect(orbit.getByRole('button', { name: t.afterTheFrame })).toBeVisible();
  await expect(orbit).not.toHaveAttribute('data-ended', /./);
  await expect(answersOf(orbit)).toHaveCount(0);
  await expect(questionOf(orbit)).toBeEmpty();
  // Stepped by the visitor. The End key where the slider already stands sets it there by their
  // hand, and asks; so does a notch back and to the end of the track again.
  const slider = sliderOf(orbit);
  await slider.focus();
  await page.keyboard.press('End');
  await expect(orbit).toHaveAttribute('data-ended', 'hand');
  await expect(questionOf(orbit)).toHaveText(t.beyondAsk);
  await expect(slider).toHaveAttribute('aria-describedby', 'orbit-ask');
  await page.keyboard.press('ArrowLeft');
  await expect(questionOf(orbit)).toBeEmpty();
  await expect(slider).toHaveAttribute('aria-valuetext', /^Step 999,\d{3} of 1,000,000/);
  const watched = await watch(page);
  await page.keyboard.press('End');
  await expect(orbit).toHaveAttribute('data-ended', 'hand');
  await expect(questionOf(orbit)).toHaveText(t.beyondAsk);
  await expect(answersOf(orbit)).toHaveText(['1', '2', '3', t.beyondFrame]);
  await expect(slider).toHaveAttribute('aria-valuetext', AT_THE_END);
  await expect(slider).toBeFocused();
  const moved = await watched.read();
  stoodStill(moved, 'as the question came');
  // Where nothing plays the bodies' numbers are there at once: at full strength on every frame
  // the question has stood.
  expect(moved.numbers).toEqual(['1']);
  // The answer, and the performance stands to be stepped: nothing plays here.
  await orbit.getByRole('button', { name: t.beyondStayFrame }).press('Enter');
  await expect(orbit).toHaveAttribute('data-beyond', 'running');
  await expect(orbit.getByRole('button', { name: t.beyondOnward })).toBeVisible();
});

test('on the narrowest phone, in the longest answers, the question keeps to its room', async ({
  page,
  isMobile,
}, info) => {
  test.skip(
    !isMobile || info.project.name.includes('reduced-motion'),
    'A phone, where the film plays.',
  );
  await page.setViewportSize({ width: 320, height: 568 });
  // Vietnamese: "Khung hình của phim" takes a row of its own under the three numbers.
  const vi = catalogs.vi;
  const orbit = await onItsPlate(page, '/vi/art/25?expression=ink');
  const watched = await playOut(page, orbit, vi);
  await expect(questionOf(orbit)).toHaveText(vi.beyondAsk);
  await expect(answersOf(orbit)).toHaveText(['1', '2', '3', vi.beyondFrame]);
  await page.waitForTimeout(1_500);
  stoodStill(await watched.read(), 'through the film’s end');
  // Every answer within the caption's cell, at least 44 px each way, none over another: the
  // three numbers on one row, and the fourth answer on a row of its own beneath them.
  const cell = (await orbit.locator('figcaption').boundingBox())!;
  const boxes = await Promise.all((await answersOf(orbit).all()).map((one) => one.boundingBox()));
  for (const box of boxes) {
    expect(box!.y).toBeGreaterThanOrEqual(cell.y);
    expect(box!.y + box!.height).toBeLessThanOrEqual(cell.y + cell.height + 0.5);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(44);
  }
  const [one, two, three, frame] = boxes.map((box) => box!);
  expect([two.y, three.y]).toEqual([one.y, one.y]);
  expect(one.x + one.width).toBeLessThanOrEqual(two.x);
  expect(two.x + two.width).toBeLessThanOrEqual(three.x);
  expect(frame.y).toBeGreaterThanOrEqual(one.y + one.height - 0.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('a finger that comes down on the score to scroll the page sets nothing; along the score, it takes it', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'chromium-mobile',
    'A finger is driven through Chromium’s own protocol, on the phone where the film plays.',
  );
  const orbit = await onItsPlate(page, '/art/25?expression=ink');
  await playOut(page, orbit);
  await expect(orbit).toHaveAttribute('data-asked', 'true');
  const slider = sliderOf(orbit);
  // The score in the middle of the screen, with page to scroll either way.
  await slider.evaluate((input) => input.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const touch = await page.context().newCDPSession(page);
  const send = (
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    points: { x: number; y: number }[],
  ) => touch.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const atRest = async () => {
    let last = -1;
    await expect
      .poll(
        async () => {
          const now = await page.evaluate(() => window.scrollY);
          const still = now === last;
          last = now;
          return still;
        },
        { intervals: [250] },
      )
      .toBe(true);
    return (await slider.boundingBox())!;
  };

  // Chromium's own slider sets itself where a finger lands, at once, before anyone can know
  // that the finger is a scroll of the page. That is not the visitor setting the moment: the
  // question stands, and the film's end is as it was.
  let box = await atRest();
  const before = await page.evaluate(() => window.scrollY);
  const third = box.x + box.width / 3;
  let y = box.y + box.height / 2;
  await send('touchStart', [{ x: third, y }]);
  for (let step = 1; step <= 10; step++)
    await send('touchMove', [{ x: third + step, y: y - step * 12 }]);
  // Held still before it lifts, so that the page is not flung on by however fast this runner
  // sent the moves.
  await page.waitForTimeout(150);
  await send('touchMove', [{ x: third + 10, y: y - 120 }]);
  await send('touchEnd', []);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before + 40);
  await expect(orbit).toHaveAttribute('data-asked', 'true');
  await expect(orbit).toHaveAttribute('data-ended', 'played');
  await expect(slider).toHaveValue('1801');
  await expect(slider).toHaveAttribute('aria-valuetext', AT_THE_END);
  await expect(orbit.locator('#orbit-said')).toHaveText(AT_THE_END);
  // The finger gone, the slider is the keys' again: a notch back is heard, and the End key.
  await slider.press('ArrowLeft');
  await expect(slider).toHaveValue('1800');
  await expect(orbit).not.toHaveAttribute('data-asked', /./);
  await page.keyboard.press('End');
  await expect(orbit).toHaveAttribute('data-ended', 'hand');
  await expect(orbit).toHaveAttribute('data-asked', 'true');

  // Along the score the finger takes it: the record is in the hand, and the question goes.
  await slider.evaluate((input) => input.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await expect(slider).toBeInViewport({ ratio: 1 });
  box = await atRest();
  y = box.y + box.height / 2;
  await send('touchStart', [{ x: third, y }]);
  for (let step = 1; step <= 8; step++) await send('touchMove', [{ x: third + step * 10, y }]);
  await expect(orbit).not.toHaveAttribute('data-asked', /./);
  await expect(slider).toHaveAttribute('aria-valuetext', /^Step [1-9]\d{2},\d{3} of 1,000,000/);
  // Carried to the end of the track and let go there, the window stands at its end by the
  // visitor's hand, whatever the browser's own slider made of the same finger.
  await send('touchMove', [{ x: box.x + box.width - 2, y }]);
  await send('touchEnd', []);
  await expect(orbit).toHaveAttribute('data-ended', 'hand');
  await expect(orbit).toHaveAttribute('data-asked', 'true');
  await expect(slider).toHaveValue('1801');

  // And a tap sets the moment where it lands.
  await send('touchStart', [{ x: box.x + box.width / 2, y }]);
  await send('touchEnd', []);
  await expect(orbit).not.toHaveAttribute('data-asked', /./);
  // Within three frames of the middle: frames 897 to 903 say steps 498,390 to 501,720.
  await expect
    .poll(async () => Math.abs(Number(await slider.inputValue()) - 900))
    .toBeLessThanOrEqual(3);
  await expect(slider).toHaveAttribute(
    'aria-valuetext',
    /^Step (49[89]|50[01]),\d{3} of 1,000,000/,
  );
});

test('under the venue’s Pause the numbers stand at once, and lifting the Pause begins nothing', async ({
  page,
}, info) => {
  test.skip(
    !/^(chromium|webkit)-desktop$/.test(info.project.name),
    'The venue’s own Pause, where motion is otherwise welcome: a desk.',
  );
  const orbit = await onItsPlate(page, '/art/25?expression=ink');
  await pauseAmbientMotion(page);
  // Paused while its film played, the window stands whole, and nothing is asked.
  await expect(orbit.getByRole('button', { name: t.play })).toBeVisible();
  await expect(orbit).not.toHaveAttribute('data-asked', /./);
  // The question, put by hand; and how strongly the numbers stand on every frame from here.
  const slider = sliderOf(orbit);
  await slider.focus();
  const watched = await watch(page);
  await page.keyboard.press('End');
  await expect(orbit).toHaveAttribute('data-ended', 'hand');
  await expect(orbit).toHaveAttribute('data-asked', 'true');
  // Longer than the settling time, so that lifting the Pause finds their coming over.
  await page.waitForTimeout(2_000);
  await playAmbientMotion(page);
  await expect(orbit).toHaveAttribute('data-asked', 'true');
  await page.waitForTimeout(1_500);
  const { asked, numbers } = await watched.read();
  expect(asked).toEqual(['not yet', 'asked']);
  expect(numbers, 'at full strength on every frame, under the Pause and as it lifts').toEqual([
    '1',
  ]);
});
