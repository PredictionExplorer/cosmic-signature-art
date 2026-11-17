import { expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * A page as a visitor has it, before anything is measured on it: the shell hydrated, every
 * streamed section revealed, and its faces loaded. A streamed page first shows its loading
 * plate, and its own content is revealed on a frame after it arrives, which on a busy machine
 * can come after `load`; a reading taken before then measures the frame alone.
 */
export async function stands(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('data-keys', 'ready');
  await expect(page.locator('main.loading-room, div[hidden][id^="S:"]')).toHaveCount(0);
  await facesLoaded(page);
}

/**
 * Every face the page has asked for so far has arrived. The set's own status is read, not its
 * `ready` promise: in WebKit that promise was seen never to settle on a page whose faces had
 * all loaded and whose status said so (the collection, about one load in ten).
 */
export async function facesLoaded(page: Page) {
  await page.waitForFunction(() => document.fonts.status === 'loaded');
}

/** Words or a control not whole on the screen from side to side, and what cuts them. */
export type Cut = { what: string; words: string; left: number; right: number; by: string };

/**
 * Runs in the page, and reads what is drawn. Every line of every text and every control's own
 * box must lie between the screen's two sides, and inside every box around it that clips and
 * does not scroll: such a box hides what passes its edge and offers no way to reach it. The
 * page's width cannot say this. The venue's frame clips its own overflow (`.site` in
 * globals.css), so a line that runs past the screen is cut off there and `scrollWidth` still
 * reads the screen's width: at 320 px the home lost the end of the venue's name that way while
 * every check of the page's width passed.
 *
 * Not counted, each because nothing is lost: what lies in the unseen part of a box that scrolls
 * (it is a scroll away); a line that ends in an ellipsis, which says it was shortened; and
 * words kept for a screen reader in a box one pixel square.
 */
function cutAtTheSides(): Cut[] {
  const HAIR = 0.5;
  const screen = document.documentElement.clientWidth;
  const named = (element: Element) =>
    element.localName +
    [...element.classList]
      .slice(0, 2)
      .map((name) => `.${name}`)
      .join('');
  type Box = {
    x: 'visible' | 'scrolls' | 'clips';
    y: 'visible' | 'clips';
    left: number;
    right: number;
    top: number;
    bottom: number;
    tiny: boolean;
    shortens: boolean;
  };
  const boxes = new Map<Element, Box>();
  const boxOf = (element: Element) => {
    let box = boxes.get(element);
    if (box) return box;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    // Overflow means nothing on a box that is not laid out as one.
    const applies = style.display !== 'contents' && style.display !== 'inline';
    const kind = (value: string) =>
      !applies || value === 'visible'
        ? 'visible'
        : value === 'auto' || value === 'scroll'
          ? 'scrolls'
          : 'clips';
    const left = rect.left + element.clientLeft;
    const top = rect.top + element.clientTop;
    box = {
      x: kind(style.overflowX),
      y: kind(style.overflowY) === 'visible' ? 'visible' : 'clips',
      left,
      right: left + element.clientWidth,
      top,
      bottom: top + element.clientHeight,
      tiny: rect.width <= 1.5 || rect.height <= 1.5,
      shortens: style.textOverflow === 'ellipsis',
    };
    boxes.set(element, box);
    return box;
  };
  const cuts: Cut[] = [];
  const judge = (rect: DOMRect, holder: Element, what: string, words: string) => {
    if (rect.width < HAIR || rect.height < HAIR) return;
    let { left, right, top, bottom } = rect;
    let by: string | undefined;
    for (
      let element: Element | null = holder;
      element && element !== document.documentElement;
      element = element.parentElement
    ) {
      const box = boxOf(element);
      if (box.y === 'clips') {
        top = Math.max(top, box.top);
        bottom = Math.min(bottom, box.bottom);
      }
      if (box.x !== 'visible') {
        if (box.x === 'clips' && box.tiny) return;
        if (box.x === 'clips' && !box.shortens)
          if (right > box.right + HAIR || left < box.left - HAIR) by ??= named(element);
        left = Math.max(left, box.left);
        right = Math.min(right, box.right);
      }
      // Wholly outside a box that clips: not drawn at all, so nothing of it is cut.
      if (right - left < HAIR || bottom - top < HAIR) return;
    }
    if (right > screen + HAIR || left < -HAIR) by ??= 'the screen';
    if (by)
      cuts.push({
        what,
        words,
        left: Math.round(rect.left * 10) / 10,
        right: Math.round(rect.right * 10) / 10,
        by,
      });
  };
  const shown = (element: Element) => getComputedStyle(element).visibility === 'visible';
  const texts = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = texts.nextNode(); node; node = texts.nextNode()) {
    const holder = node.parentElement;
    const words = node.textContent?.replace(/\s+/g, ' ').trim();
    if (!holder || !words || holder.closest('script, style, noscript, template, option')) continue;
    if (!shown(holder)) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const rect of range.getClientRects())
      judge(rect, holder, `words in ${named(holder)}`, words.slice(0, 60));
  }
  const controls =
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="slider"]';
  for (const control of document.querySelectorAll(controls)) {
    if (!shown(control)) continue;
    const rect = control.getBoundingClientRect();
    // A control kept in a box one pixel square is worked through its label, which is judged.
    if (rect.width <= 1.5 || rect.height <= 1.5) continue;
    const said = control.getAttribute('aria-label') ?? control.textContent ?? '';
    judge(
      rect,
      control,
      `the control ${named(control)}`,
      said.replace(/\s+/g, ' ').trim().slice(0, 60),
    );
  }
  return cuts;
}

/** What on the page is not whole on the screen from side to side (see `cutAtTheSides`). */
export const cutOnScreen = (page: Page) => page.evaluate(cutAtTheSides);

/**
 * Nothing on the page runs past the screen's sides: the page does not scroll sideways, and
 * nothing drawn on it is cut off at a side instead. The second is what a visitor meets, and what
 * the page's width alone cannot see.
 */
export async function noHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(
    await cutOnScreen(page),
    'Words or controls are cut off at a side: by the screen, or by a box that clips them.',
  ).toEqual([]);
}

/** An ideograph drawn smaller than its line is set, or set under the floor. */
export type Shrunk = { words: string; in: string; set: number; drawn: number; plain: number };

/**
 * Runs in the page, and measures type as it is drawn. For each text that holds a Han, kana or
 * Hangul character, the width that character is drawn at is compared with the same character
 * set plainly beside it, in the same face at the same size. A stylesheet cannot say this either:
 * a label that asks for small capitals of a face that has none is still computed at 12 px, while
 * the browser fakes them by drawing each character at 70 %, an ideograph at 8 px. The 12 px floor
 * is read here too, as the size the line is set at.
 */
function shrunkenIdeographs(): Shrunk[] {
  // Hiragana and katakana, the Han ideographs, and the Hangul syllables.
  const IDEOGRAPH = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;
  const FLOOR = 12;
  const widthOf = (node: Node, at: number) => {
    const range = document.createRange();
    range.setStart(node, at);
    range.setEnd(node, at + 1);
    return range.getBoundingClientRect().width;
  };
  const texts: { node: Node; at: number }[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const at = (node.textContent ?? '').search(IDEOGRAPH);
    if (at >= 0 && !node.parentElement?.closest('script, style, noscript, template, option'))
      texts.push({ node, at });
  }
  // Read, then write, then read: a twin set beside each text in turn would lay the page out
  // again for every one of them, and a collection's wall holds hundreds.
  // Not laid out (a closed sheet, a hidden copy): nothing is drawn of it to measure.
  const drawn = texts
    .map((text) => ({ ...text, drawn: widthOf(text.node, text.at) }))
    .filter((text) => text.drawn > 0);
  const twins = drawn.map(({ node, at }) => {
    const twin = document.createElement('span');
    twin.style.fontVariantCaps = 'normal';
    twin.textContent = node.textContent![at];
    node.parentElement!.append(twin);
    return twin;
  });
  const plain = twins.map((twin) => widthOf(twin.firstChild!, 0));
  const found: Shrunk[] = [];
  drawn.forEach(({ node, drawn: width }, index) => {
    const holder = node.parentElement!;
    const set = parseFloat(getComputedStyle(holder).fontSize);
    // A faked small capital is 70 to 75 % of the character; a kerned pair differs by a hair.
    if (width < plain[index] * 0.9 || set < FLOOR)
      found.push({
        words: (node.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40),
        in: holder.localName + (holder.classList[0] ? `.${holder.classList[0]}` : ''),
        set,
        drawn: Math.round(width * 100) / 100,
        plain: Math.round(plain[index] * 100) / 100,
      });
  });
  for (const twin of twins) twin.remove();
  return found;
}

/** Every ideograph on the page that is drawn smaller than it is set (see `shrunkenIdeographs`). */
export const shrunkOnScreen = (page: Page) => page.evaluate(shrunkenIdeographs);

/** A control whose target is under 44 px one way or the other. */
export type Small = { control: string; name: string; width: number; height: number };

/**
 * Runs in the page, and measures every control a visitor can press, by its own box: 44 px each
 * way is the venue's rule. A hidden field worked through its label is measured as that label.
 * One kind of control is let be, as WCAG 2.5.8 lets it: a link set in a line of words, a note's
 * mark or a name in a sentence, whose line cannot grow for a finger without parting the text.
 * Sizes are compared to a thousandth of a pixel: Firefox reads a 44 px box that stands at a
 * fractional place as 43.99999.
 */
function controlsUnder44(): Small[] {
  const TARGET = 44;
  const round = (value: number) => Math.round(value * 1000) / 1000;
  const said = (element: Element) =>
    (element.getAttribute('aria-label') ?? element.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 50);
  /** Set in a line of words: laid out as text, in a block that says more than the link does. */
  const inRunningText = (element: Element) => {
    if (getComputedStyle(element).display !== 'inline') return false;
    let block = element.parentElement;
    while (block && getComputedStyle(block).display === 'inline') block = block.parentElement;
    const around = (block?.textContent ?? '').replace(/\s+/g, ' ').trim().length;
    const own = (element.textContent ?? '').replace(/\s+/g, ' ').trim().length;
    return around - own > 1;
  };
  const controls =
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="slider"], [role="tab"], [tabindex]:not([tabindex="-1"])';
  const judged = new Set<Element>();
  const small: Small[] = [];
  for (const control of document.querySelectorAll(controls)) {
    if (getComputedStyle(control).visibility !== 'visible' || control.closest('[inert]')) continue;
    let target: Element = control;
    let box = control.getBoundingClientRect();
    // A field in a box one pixel square is pressed through its label.
    const label = control.closest('label');
    if (label && box.width <= 1.5 && box.height <= 1.5) {
      target = label;
      box = label.getBoundingClientRect();
    }
    if ((box.width === 0 && box.height === 0) || judged.has(target)) continue;
    judged.add(target);
    if (round(box.width) >= TARGET && round(box.height) >= TARGET) continue;
    if (inRunningText(target)) continue;
    small.push({
      control: target.localName + (target.classList[0] ? `.${target.classList[0]}` : ''),
      name: said(target),
      width: round(box.width),
      height: round(box.height),
    });
  }
  return small;
}

/** Every control on the page under 44 px either way (see `controlsUnder44`). */
export const smallTargets = (page: Page) => page.evaluate(controlsUnder44);

export async function imageLoaded(image: Locator) {
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((element) => {
        const img = element as HTMLImageElement;
        return img.complete && img.naturalWidth > 0;
      }),
    )
    .toBe(true);
}

/**
 * Stands a local film in for a published one, answering the byte ranges a video asks for: the
 * published host does, and a film served whole cannot be sought before it has all arrived.
 */
export async function standInFilm(page: Page, url: RegExp, file: string) {
  const film = readFileSync(file);
  await page.route(url, (route) => {
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range ?? '');
    if (!range)
      return route.fulfill({
        body: film,
        contentType: 'video/mp4',
        headers: { 'accept-ranges': 'bytes' },
      });
    const start = Number(range[1]);
    const end = range[2] ? Math.min(Number(range[2]), film.length - 1) : film.length - 1;
    return route.fulfill({
      status: 206,
      body: film.subarray(start, end + 1),
      contentType: 'video/mp4',
      headers: {
        'accept-ranges': 'bytes',
        'content-range': `bytes ${start}-${end}/${film.length}`,
      },
    });
  });
}

export const archivedMedia = JSON.parse(
  readFileSync(new URL('../../src/lib/art/curated-media.json', import.meta.url), 'utf8'),
) as { id: number; media: { id: string; sourceUrl: string }[] }[];

export async function artworkImageSource(
  image: Locator,
  tokenId: number,
  expression: 'ink' | 'light',
  allowPublished = false,
) {
  const allowed = [new URL(`/art/${tokenId}-${expression}.webp`, image.page().url()).href];
  if (allowPublished) {
    const source = archivedMedia
      .find((work) => work.id === tokenId)
      ?.media.find((media) => media.id === expression)?.sourceUrl;
    if (!source) throw new Error(`Missing authentic source for ${tokenId} / ${expression}`);
    allowed.push(source);
  }
  await expect
    .poll(
      async () => {
        const source = await image.getAttribute('src');
        if (!source) return false;
        const url = new URL(source, image.page().url());
        // Vercel's deployment-routing query changes delivery, not artwork identity.
        // Preserve the exact expected origin/path and reject every other query or fragment.
        url.searchParams.delete('dpl');
        return allowed.includes(url.href);
      },
      {
        message: `Expected authentic ${expression} image for token ${tokenId}: ${allowed.join(' or ')}`,
      },
    )
    .toBe(true);
}

export async function collectionLoaded(page: Page, loadAllImages = false) {
  const section = page.getByRole('main').locator('#works');
  await expect(section.locator('.collection-skeleton:visible')).toHaveCount(0, { timeout: 30_000 });
  const cards = section.locator('.work-grid:not(.collection-skeleton) .work-card');
  await expect(cards.first()).toBeVisible({ timeout: 30_000 });
  await cards.first().scrollIntoViewIfNeeded();
  await imageLoaded(cards.first().locator('img'));
  if (loadAllImages) {
    const count = await cards.count();
    for (let index = 0; index < count; index += 3) {
      await cards.nth(index).scrollIntoViewIfNeeded();
    }
    await cards.last().scrollIntoViewIfNeeded();
    await expect(cards.locator('img')).toHaveCount(count);
    await expect
      .poll(async () =>
        cards
          .locator('img')
          .evaluateAll((elements) =>
            elements.every(
              (element) =>
                (element as HTMLImageElement).complete &&
                (element as HTMLImageElement).naturalWidth > 0,
            ),
          ),
      )
      .toBe(true);
    // Instantly, as the venue's smooth scroll can be given up when the layout moves beneath it.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  }
}

/**
 * The motion toggle, once it is the visitor's to press. The server's page begins paused, and the
 * client then takes the toggle over and shows the browser's own preference. So the toggle is
 * read only when the client has attached its listeners (the keyboard's vocabulary marks the
 * document ready, src/components/keys.tsx) and shows that preference. Waiting for the
 * preference alone is not enough: under reduced motion it is the server's own answer, there
 * before any script has run, and a press made then lands on a page that is not listening.
 */
export async function motionToggle(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('data-keys', 'ready');
  const control = page.locator('button.motion-toggle');
  const paused = await page.evaluate(() => {
    const saved = sessionStorage.getItem('cosmic-art-motion-v1');
    return saved ? saved === 'paused' : matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  await expect(control).toHaveAttribute('aria-pressed', String(paused));
  return { control, paused };
}

/** Lets ambient motion play, whatever the browser prefers. Returns once the page is hydrated. */
export async function playAmbientMotion(page: Page) {
  const { control, paused } = await motionToggle(page);
  if (paused) await control.click();
  await expect(control).toHaveAttribute('aria-pressed', 'false');
}

/** Pauses ambient motion, whatever the browser prefers. Returns once the page is hydrated. */
export async function pauseAmbientMotion(page: Page) {
  const { control, paused } = await motionToggle(page);
  if (!paused) await control.click();
  await expect(control).toHaveAttribute('aria-pressed', 'true');
}

/** A key the page has stored, in this tab's session or this browser's local storage. */
export const stored = (page: Page, key: string, where: 'local' | 'session') =>
  page.evaluate(
    ([name, kind]) => (kind === 'local' ? localStorage : sessionStorage).getItem(name),
    [key, where] as const,
  );

/** Whether First Light performs here: it takes the plate, or the page stands at once. */
export async function performs(page: Page) {
  const html = page.locator('html');
  await expect
    .poll(async () => (await html.getAttribute('data-overture')) ?? 'stood', { timeout: 20_000 })
    .toMatch(/^(playing|landing|dawn|stood)$/);
  return (await html.getAttribute('data-overture')) !== null;
}

/**
 * Every value the gate takes, from the document's first moment: the room script sets it before
 * anything paints. A browser that cannot draw the light lifts it at once, often before the page
 * has loaded, so a poll after the load can miss it; this reads it back instead.
 */
export async function watchTheGate(page: Page) {
  await page.addInitScript(() => {
    const taken: (string | null)[] = [];
    Object.defineProperty(window, '__gate', { value: taken });
    new MutationObserver((records) => {
      // Each record holds the value before its change; the value after is the next one's, or now.
      records.forEach((_, i) =>
        taken.push(
          i + 1 < records.length
            ? records[i + 1].oldValue
            : document.documentElement.getAttribute('data-overture'),
        ),
      );
    }).observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-overture'],
      attributeOldValue: true,
    });
  });
  return () => page.evaluate(() => (window as unknown as { __gate: (string | null)[] }).__gate);
}
