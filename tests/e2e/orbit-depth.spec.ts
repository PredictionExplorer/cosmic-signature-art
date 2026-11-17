import { expect, test, type Locator, type Page } from './fixtures';
import { catalogs } from '../../src/lib/i18n/messages';
import { locales, localizedPath } from '../../src/lib/i18n/routing';
import { cutOnScreen, noHorizontalOverflow, smallTargets } from './helpers';

const t = catalogs.en;

/*
  The orbit in depth: the home's first exhibit (src/components/orbit-depth.tsx).

  Every project checks what the exhibit does:
  - that the stage, the line that says how it is turned and the words that turn it stand in
    one screen, so nobody scrolls to learn that it turns;
  - that it opens by itself where motion is welcome, turns under a hand, a key and a button,
    rests where it is left, and never rests part-open over its still;
  - that a phone's swipe still scrolls the page, and a hold takes the orbit.

  Where a browser cannot draw it (CI's Firefox has no WebGL 2) the still stands with a sentence
  that says so, and nothing is offered. The pixels are not read here: CI has no GPU.
*/

/** Whether this browser can draw WebGL 2 at all. */
const canDraw = (page: Page) =>
  page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')));

/** The home with the exhibit's section brought to the head, as the cover's contents bring it. */
async function exhibit(page: Page, path = '/') {
  await page.goto(path);
  const section = page.locator('#orbit');
  await section.evaluate((node) => node.scrollIntoView({ block: 'start', behavior: 'instant' }));
  const figure = section.locator('figure');
  await expect(figure).toHaveAttribute('data-phase', /ready|unavailable/, { timeout: 60_000 });
  return { section, figure, canvas: figure.locator('canvas') };
}

/** The orbit, ready to be turned: null where this browser cannot draw it, which is then checked. */
async function turnable(page: Page, figure: Locator) {
  if (await canDraw(page)) {
    await expect(figure).toHaveAttribute('data-phase', 'ready');
    return true;
  }
  await expect(figure).toHaveAttribute('data-phase', 'unavailable');
  await expect(figure.getByText(t.depthUnavailable)).toBeVisible();
  for (const control of await figure.getByRole('button').all())
    await expect(control).toBeDisabled();
  await expect(figure.locator('canvas')).toHaveAttribute('aria-hidden', 'true');
  return false;
}

/** The part's first thing at the head of the screen, and what the screen then holds of it. */
async function firstScreen(first: Locator, figure: Locator) {
  await first.evaluate((node) => {
    const head = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--head'));
    scrollTo({ top: node.getBoundingClientRect().top + scrollY - head, behavior: 'instant' });
  });
  return figure.evaluate((node) => {
    const box = (selector: string) => node.querySelector(selector)!.getBoundingClientRect();
    const head = document.querySelector('.site-header')!.getBoundingClientRect().bottom;
    const stage = box('canvas');
    const strip = box('.strip');
    return {
      stageBeneathHead: Math.round(stage.top - head) >= -1,
      stripInSight: strip.bottom <= innerHeight + 1,
      stageHeight: Math.round(stage.height),
      screen: innerHeight,
    };
  });
}

// Every language: the line that says how it is turned is longest in Ukrainian and Vietnamese.
for (const locale of locales)
  test(`the stage, how it is turned and the words that turn it stand in one screen: ${locale}`, async ({
    page,
    isMobile,
  }, info) => {
    const words = catalogs[locale];
    const { section, figure } = await exhibit(page, localizedPath(locale, '/'));
    await page.evaluate(() => document.fonts.ready);
    // On a phone the stage is the first thing of its section; on a desk the copy stands above.
    const first = isMobile ? figure : section;
    const seen = await firstScreen(first, figure);
    expect(seen.stageBeneathHead, JSON.stringify(seen)).toBe(true);
    expect(seen.stripInSight, JSON.stringify(seen)).toBe(true);
    // The stage is no sliver: at least a third of the screen is the orbit's.
    expect(seen.stageHeight).toBeGreaterThanOrEqual(Math.min(300, seen.screen / 3));
    // What it is stands with it: the part's head, the label of an analysis beneath it (the
    // figure says where), and its controls by name: four arrows, each named for what it does.
    await expect(section.getByRole('heading', { level: 2 })).toHaveText(words.gravityTitle);
    const about = page.locator(`#${await figure.getAttribute('aria-describedby')}`);
    await expect(about.locator('.small-caps')).toHaveText(words.analysisNotWork);
    for (const name of [
      words.depthTurnLeft,
      words.depthTurnRight,
      words.depthTiltUp,
      words.depthTiltDown,
    ])
      await expect(figure.getByRole('button', { name, exact: true })).toBeVisible();
    // On a phone the head follows the words that turn it, and what the drawing is follows the
    // head: the sentence that says "here it can be turned" is not a screen below its subject.
    const order = await section.evaluate((node) => {
      const top = (selector: string) => node.querySelector(selector)!.getBoundingClientRect().top;
      return { stage: top('canvas'), head: top('header'), about: top('[id$="-about"]') };
    });
    if (isMobile) expect(order.stage).toBeLessThan(order.head);
    else expect(order.head).toBeLessThan(order.stage);
    expect(Math.max(order.stage, order.head)).toBeLessThan(order.about);
    // The still the orbit opens from is the day's Light still, in the page from the first byte.
    await expect(figure.locator('img')).toHaveAttribute('alt', new RegExp(` · ${words.light}$`));
    await noHorizontalOverflow(page);
    expect(await cutOnScreen(page)).toEqual([]);
    // Every word that turns it is a finger's target (the whole home's are the essay's test).
    expect(await smallTargets(figure)).toEqual([]);
    // The smallest phone the venue is made for: the line takes more lines there, the words
    // two rows, and the stage gives them the room.
    if (info.project.name !== 'chromium-mobile') return;
    await page.setViewportSize({ width: 320, height: 568 });
    const small = await firstScreen(figure, figure);
    expect(small.stageBeneathHead, JSON.stringify(small)).toBe(true);
    expect(small.stripInSight, JSON.stringify(small)).toBe(true);
    expect(small.stageHeight).toBeGreaterThanOrEqual(240);
    await noHorizontalOverflow(page);
    // A phone on its side: too short for the head, the stage and the strip together, so the
    // stage comes first there too, and the strip is still in the first screen.
    await page.setViewportSize({ width: 844, height: 390 });
    const side = await firstScreen(figure, figure);
    expect(side.stageBeneathHead, JSON.stringify(side)).toBe(true);
    expect(side.stripInSight, JSON.stringify(side)).toBe(true);
    expect(side.stageHeight).toBeGreaterThanOrEqual(180);
    await noHorizontalOverflow(page);
  });

test('it opens by itself as it comes into view, and plays the window in depth', async ({
  page,
}, info) => {
  test.skip(info.project.name.includes('reduced-motion'), 'Reduced motion opens nothing unasked.');
  const { figure, canvas } = await exhibit(page);
  if (!(await turnable(page, figure))) return;
  // The picture opens into depth with no hand on it, and its performance runs.
  await expect(figure).toHaveAttribute('data-view', 'depth', { timeout: 10_000 });
  await expect(figure).toHaveAttribute('data-playing', 'playing');
  await expect(canvas).toHaveCSS('opacity', '1', { timeout: 10_000 });
  await expect(canvas).toHaveAccessibleName(/in depth\. The arrow keys turn it/);
  // The line that says how it is turned is the pointer's on a desk, the finger's on a phone.
  await expect(
    figure.getByText(info.project.name.includes('mobile') ? t.depthHintTouch : t.depthHint),
  ).toBeVisible();
  // Its own word holds it, and plays it on.
  await figure.getByRole('button', { name: t.pause, exact: true }).click();
  await expect(figure).toHaveAttribute('data-playing', 'held');
  await figure.getByRole('button', { name: t.play, exact: true }).click();
  await expect(figure).toHaveAttribute('data-playing', 'playing');
  // The venue's own Pause holds it as it holds every film, and it says so: its word is Play,
  // as a plate's is, and Play lifts the pause and plays on.
  await page.locator('button.motion-toggle').click();
  await expect(figure).toHaveAttribute('data-playing', 'held');
  await expect(figure.getByRole('button', { name: t.pause, exact: true })).toHaveCount(0);
  await expect(figure).toHaveAttribute('data-view', 'depth');
  await figure.getByRole('button', { name: t.play, exact: true }).click();
  await expect(figure).toHaveAttribute('data-playing', 'playing');
  await expect(page.locator('button.motion-toggle')).toHaveAttribute('aria-pressed', 'false');
});

test('nothing opens or plays unasked where motion is unwelcome: one word shows it in depth', async ({
  page,
}, info) => {
  test.skip(!info.project.name.includes('reduced-motion'), 'The reduced-motion projects’ own.');
  const { figure, canvas } = await exhibit(page);
  if (!(await turnable(page, figure))) return;
  await page.waitForTimeout(1_500);
  await expect(figure).toHaveAttribute('data-view', 'picture');
  await expect(figure).toHaveAttribute('data-playing', 'idle');
  await expect(canvas).toHaveCSS('opacity', '0');
  // One word shows it in depth, in one step; the buttons turn it, and one word returns it.
  await figure.getByRole('button', { name: t.depthOpen, exact: true }).click();
  await expect(figure).toHaveAttribute('data-view', 'depth');
  await expect(canvas).toHaveCSS('opacity', '1');
  await figure.getByRole('button', { name: t.depthTurnLeft, exact: true }).click();
  await expect(figure).toHaveAttribute('data-view', 'depth');
  await expect(canvas).toHaveCSS('opacity', '1');
  // A step that passes within twenty degrees of the picture's view lands on the picture
  // itself, never half over it; the next step opens it on the other side.
  await figure.getByRole('button', { name: t.depthTurnRight, exact: true }).click();
  await figure.getByRole('button', { name: t.depthTurnRight, exact: true }).click();
  await expect(figure).toHaveAttribute('data-view', 'picture');
  await expect(canvas).toHaveCSS('opacity', '0');
  await figure.getByRole('button', { name: t.depthTurnRight, exact: true }).click();
  await expect(figure).toHaveAttribute('data-view', 'depth');
  await expect(canvas).toHaveCSS('opacity', '1');
  await figure.getByRole('button', { name: t.orbitGeneratorView, exact: true }).click();
  await expect(figure).toHaveAttribute('data-view', 'picture');
  await expect(canvas).toHaveCSS('opacity', '0');
});

test('a hand turns it and it rests where it is left; one word returns it to the generator’s view', async ({
  page,
}, info) => {
  test.skip(info.project.name.includes('mobile'), 'A phone takes it with a hold: see below.');
  const { figure, canvas } = await exhibit(page);
  if (!(await turnable(page, figure))) return;
  // Given back first, so the hand begins from the still at rest whatever opened by itself.
  await canvas.focus();
  await page.keyboard.press('Escape');
  await expect(figure).toHaveAttribute('data-view', 'picture', { timeout: 3_000 });
  await expect(canvas).toHaveCSS('opacity', '0');
  const box = (await canvas.boundingBox())!;
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 240, y + 40, { steps: 10 });
  await expect(figure).toHaveAttribute('data-view', 'depth');
  await page.mouse.up();
  // Let go, it stays: it does not spring back as the orbit on a work's page does.
  await page.waitForTimeout(1_500);
  await expect(figure).toHaveAttribute('data-view', 'depth');
  await expect(canvas).toHaveCSS('opacity', '1');
  // A small turn does not leave the drawing half over the still: let go there, it goes on
  // into depth, the way it was being turned.
  await page.keyboard.press('Escape');
  await expect(figure).toHaveAttribute('data-view', 'picture', { timeout: 3_000 });
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 50, y, { steps: 5 });
  await page.mouse.up();
  await expect(canvas).toHaveCSS('opacity', '1', { timeout: 3_000 });
  await expect(figure).toHaveAttribute('data-view', 'depth');
  // The arrows step it round and tip it, and the view's own name returns it: the still alone.
  await figure.getByRole('button', { name: t.depthTurnLeft, exact: true }).click();
  await figure.getByRole('button', { name: t.depthTiltUp, exact: true }).click();
  await figure.getByRole('button', { name: t.depthTiltDown, exact: true }).click();
  await expect(figure).toHaveAttribute('data-view', 'depth');
  await figure.getByRole('button', { name: t.orbitGeneratorView, exact: true }).click();
  await expect(figure).toHaveAttribute('data-view', 'picture', { timeout: 3_000 });
  await expect(canvas).toHaveCSS('opacity', '0');
  await expect(figure.getByRole('button', { name: t.orbitGeneratorView })).toHaveCount(0);
  // And it opens again by the word that says what it does.
  await figure.getByRole('button', { name: t.depthOpen, exact: true }).click();
  await expect(figure).toHaveAttribute('data-view', 'depth', { timeout: 5_000 });
});

test('the keys turn it and leave it where they put it; Home and Escape give it back', async ({
  page,
}) => {
  const { figure, canvas } = await exhibit(page);
  if (!(await turnable(page, figure))) return;
  // Given back first, so the keys begin from the generator's view whatever opened by itself.
  await canvas.focus();
  await page.keyboard.press('Escape');
  await expect(figure).toHaveAttribute('data-view', 'picture', { timeout: 3_000 });
  await page.keyboard.press('ArrowLeft');
  await expect(figure).toHaveAttribute('data-view', 'depth');
  await page.keyboard.press('Shift+ArrowDown');
  await page.waitForTimeout(1_000);
  await expect(figure).toHaveAttribute('data-view', 'depth');
  // Home gives it back, and is the orbit's own key while it is turned: the page does not move.
  const before = await page.evaluate(() => window.scrollY);
  await page.keyboard.press('Home');
  await expect(figure).toHaveAttribute('data-view', 'picture', { timeout: 3_000 });
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  // The focus stays on the orbit it gave back: it does not fall to the page.
  await expect(canvas).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(figure).toHaveAttribute('data-view', 'depth');
  await page.keyboard.press('Escape');
  await expect(figure).toHaveAttribute('data-view', 'picture', { timeout: 3_000 });
});

test('on a phone a swipe over the orbit scrolls the page, and a hold takes the orbit', async ({
  page,
  browserName,
}, info) => {
  test.skip(
    !info.project.name.includes('mobile') || browserName !== 'chromium',
    'Touch is driven through Chromium’s own protocol; WebKit’s native scroll cannot be driven.',
  );
  const refused: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') refused.push(message.text());
  });
  const { figure, canvas } = await exhibit(page);
  if (!(await turnable(page, figure))) return;
  // Given back first, so the gestures begin from the still at rest.
  await canvas.focus();
  await page.keyboard.press('Escape');
  await expect(figure).toHaveAttribute('data-view', 'picture', { timeout: 3_000 });
  await expect(figure.getByText(t.depthHintTouch)).toBeVisible();
  const touch = await page.context().newCDPSession(page);
  const send = (
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    points: { x: number; y: number }[],
  ) => touch.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  await canvas.evaluate((node) => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
  let box = (await canvas.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height * 0.7;
  const before = await page.evaluate(() => window.scrollY);
  // A swipe up over the orbit: the page scrolls, and the orbit is left as it was.
  await send('touchStart', [{ x, y }]);
  for (let step = 1; step <= 10; step++) await send('touchMove', [{ x, y: y - step * 15 }]);
  await send('touchEnd', []);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before + 40);
  await expect(figure).toHaveAttribute('data-view', 'picture');
  // With the page at rest, a finger held still past the hold takes the orbit, the page holds
  // still beneath it, and the turn stays when the finger lifts.
  await expect
    .poll(async () => {
      const first = await page.evaluate(() => window.scrollY);
      await page.waitForTimeout(160);
      return (await page.evaluate(() => window.scrollY)) === first;
    })
    .toBe(true);
  await canvas.evaluate((node) => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
  box = (await canvas.boundingBox())!;
  const [hx, hy] = [box.x + box.width / 2, box.y + box.height / 2];
  await send('touchStart', [{ x: hx, y: hy }]);
  await page.waitForTimeout(450);
  const held = await page.evaluate(() => window.scrollY);
  for (let step = 1; step <= 10; step++)
    await send('touchMove', [{ x: hx - step * 15, y: hy + step * 4 }]);
  await expect(figure).toHaveAttribute('data-view', 'depth');
  expect(await page.evaluate(() => window.scrollY)).toBe(held);
  await send('touchEnd', []);
  await page.waitForTimeout(1_000);
  await expect(figure).toHaveAttribute('data-view', 'depth');
  // And the arrows turn it with a tap, for a visitor who never holds.
  await figure.getByRole('button', { name: t.depthTurnLeft }).tap();
  await expect(figure).toHaveAttribute('data-view', 'depth');
  expect(refused).toEqual([]);
});

test('its words stand whole in every language', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium-mobile', 'The narrowest screen says it for the rest.');
  for (const locale of locales) {
    const { figure } = await exhibit(page, localizedPath(locale, '/'));
    await figure.evaluate((node) => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await noHorizontalOverflow(page);
    expect(await cutOnScreen(page), locale).toEqual([]);
    expect(await smallTargets(figure), locale).toEqual([]);
  }
});
