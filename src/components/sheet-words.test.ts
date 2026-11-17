import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SheetWords, fillOf, paintsNothing, type Anchor } from './sheet-words';

/*
  jsdom lays nothing out, so each element says where it lies (data-box="left top width height",
  or data-lines for a word broken over lines), and every glyph is ten pixels wide from its word's
  left edge, or from the start of the line it falls on.
*/
const GLYPH = 10;
const box = (left: number, top: number, width: number, height: number) =>
  ({
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  }) as DOMRect;
const numbers = (value: string) =>
  value.split(/\s+/).map(Number) as [number, number, number, number];
function linesOf(element: Element) {
  const lines = element.getAttribute('data-lines');
  if (lines) return lines.split(';').map((line) => box(...numbers(line.trim())));
  const one = element.getAttribute('data-box');
  return one ? [box(...numbers(one))] : [];
}
function rectOf(element: Element) {
  const lines = linesOf(element);
  if (!lines.length) return box(0, 0, 0, 0);
  const left = Math.min(...lines.map((line) => line.left));
  const top = Math.min(...lines.map((line) => line.top));
  return box(
    left,
    top,
    Math.max(...lines.map((line) => line.right)) - left,
    Math.max(...lines.map((line) => line.bottom)) - top,
  );
}

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return rectOf(this);
  });
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
    return linesOf(this) as unknown as DOMRectList;
  });
  // A glyph lies on the line its number falls on: as many glyphs to a line as the line is wide.
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value(this: Range) {
      let index = this.startOffset;
      for (const line of linesOf(this.startContainer.parentElement!)) {
        const held = Math.round(line.width / GLYPH);
        if (index < held) return box(line.left + index * GLYPH, line.top, GLYPH, line.height);
        index -= held;
      }
      return box(0, 0, 0, 0);
    },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
  document.body.innerHTML = '';
});

/** A page of a head, a stage of two strips, and a paragraph beyond it. */
function page(html: string) {
  document.body.innerHTML = html;
  return {
    head: document.querySelector<HTMLElement>('.head-row'),
    stage: document.querySelector<HTMLElement>('[data-stage]')!,
    main: document.querySelector<HTMLElement>('main'),
  };
}
/** The front as one straight line: everything left of `x` has turned. */
const leftOf = (x: number) => (at: number) => (at < x ? 1 : 0);
const paint = (words: SheetWords, turned: (x: number, y: number, anchor: Anchor) => number) =>
  words.paint(turned, 'night', 'light');

describe('the fill of a word the front is passing', () => {
  const glyphs = [0, 1, 2, 3].map((i) => ({ x: 0, y: 0, from: i * 10, to: i * 10 + 8 }));

  it('is none for a word that stands on one ground', () => {
    expect(fillOf(['paper', 'paper', 'paper', 'paper'], glyphs, false)).toBe('');
    expect(fillOf([], [], false)).toBe('');
  });

  it('changes type half-way between two glyphs, never inside one', () => {
    // The first two glyphs on the night, the last two on paper: the stop lies between 18 and 20.
    expect(fillOf(['night', 'night', 'paper', 'paper'], glyphs, false)).toBe(
      'linear-gradient(to right, var(--night-type) 0px 19px, var(--paper-type) 19px)',
    );
  });

  it('follows a front that crosses a word more than once', () => {
    expect(fillOf(['paper', 'night', 'night', 'paper'], glyphs, false)).toBe(
      'linear-gradient(to right, var(--paper-type) 0px 9px, var(--night-type) 9px 29px, var(--paper-type) 29px)',
    );
  });

  it('fills a muted word in each ground’s muted type', () => {
    expect(fillOf(['paper', 'night'], glyphs.slice(0, 2), true)).toBe(
      'linear-gradient(to right, var(--sheet-paper-muted, #68685e) 0px 9px, #b8b5ad 9px)',
    );
  });
});

describe('a background that paints nothing', () => {
  it('is transparent, or any colour at no opacity', () => {
    expect(paintsNothing('transparent')).toBe(true);
    expect(paintsNothing('rgba(0, 0, 0, 0)')).toBe(true);
    expect(paintsNothing('rgba(241, 235, 223, 0)')).toBe(true);
    expect(paintsNothing('rgb(0 0 0 / 0)')).toBe(true);
    expect(paintsNothing('color(srgb 1 1 1 / 0%)')).toBe(true);
    expect(paintsNothing('')).toBe(true);
  });

  it('is not the night: black paints', () => {
    expect(paintsNothing('rgb(0, 0, 0)')).toBe(false);
    expect(paintsNothing('rgba(0, 0, 0, 0.5)')).toBe(false);
    expect(paintsNothing('rgb(241, 235, 223)')).toBe(false);
    expect(paintsNothing('rgb(0 0 0 / 0.4)')).toBe(false);
  });
});

describe('the words on the sheet', () => {
  it('sets a word the front has passed in the type of its new ground, whole', () => {
    const { head, stage } = page(`
      <header data-box="0 0 400 48"><div class="head-row" data-box="0 0 400 48">
        <a data-box="20 10 40 20">Left</a><a data-box="300 10 50 20">Right</a>
      </div></header>
      <div data-stage data-box="0 48 400 300"></div>`);
    const words = new SheetWords();
    words.measure(head, stage);
    paint(words, leftOf(200));
    const [left, right] = document.querySelectorAll('a');
    expect(left).toHaveAttribute('data-sheet', 'night');
    expect(right).toHaveAttribute('data-sheet', 'paper');
    // Neither is being passed: neither is filled.
    expect(document.querySelector('[data-sheet-fill]')).toBeNull();
  });

  it('fills a word the front is passing glyph by glyph, on the ground most of it stands on', () => {
    const { head, stage } = page(`
      <header data-box="0 0 400 48"><div class="head-row" data-box="0 0 400 48">
        <a data-box="100 10 80 20">Exhibits</a>
      </div></header>
      <div data-stage data-box="0 48 400 300"></div>`);
    const words = new SheetWords();
    words.measure(head, stage);
    // The front stands at x = 128: glyphs centred at 105, 115, 125 have turned, five have not.
    paint(words, leftOf(128));
    const word = document.querySelector('a')!;
    expect(word).toHaveAttribute('data-sheet', 'paper');
    expect(word).toHaveAttribute('data-sheet-fill');
    expect(word.style.backgroundImage).toBe(
      'linear-gradient(to right, var(--night-type) 0px 30px, var(--paper-type) 30px)',
    );
    // The front moves on past its middle: the word stands on the night, its last glyph on paper.
    paint(words, leftOf(172));
    expect(word).toHaveAttribute('data-sheet', 'night');
    expect(word.style.backgroundImage).toBe(
      'linear-gradient(to right, var(--night-type) 0px 70px, var(--paper-type) 70px)',
    );
    // And past the whole of it: no fill is left.
    paint(words, leftOf(400));
    expect(word).not.toHaveAttribute('data-sheet-fill');
    expect(word.style.backgroundImage).toBe('');
  });

  it('places the head’s words by the head and the strips’ by the stage', () => {
    const { head, stage } = page(`
      <header data-box="0 0 400 48"><div class="head-row" data-box="0 0 400 48">
        <a data-box="20 10 40 20">Head</a>
      </div></header>
      <div data-stage data-box="0 48 400 300">
        <div data-layer="ink"><div class="strip" data-box="0 300 400 48">
          <span data-box="20 310 50 20">Strip</span>
        </div></div>
      </div>`);
    const words = new SheetWords();
    words.measure(head, stage);
    const asked: [number, number, Anchor][] = [];
    paint(words, (x, y, anchor) => {
      asked.push([x, y, anchor]);
      return 0;
    });
    // The head's first glyph, from the header's corner; the strip's, from the stage's.
    expect(asked).toContainEqual([25, 20, 'head']);
    expect(asked).toContainEqual([25, 272, 'stage']);
  });

  it('changes two strips’ words that share a place hand to hand, as the front passes their middle', () => {
    const { stage } = page(`
      <div data-stage data-box="0 0 400 300">
        <div data-layer="ink"><div class="strip" data-box="0 250 400 50">
          <button data-box="300 260 50 20">Light</button>
        </div></div>
        <div data-layer="light"><div class="strip" data-box="0 250 400 50">
          <button data-box="310 260 30 20">Ink</button>
        </div></div>
      </div>`);
    const words = new SheetWords();
    words.measure(null, stage);
    const [departing, arriving] = document.querySelectorAll('button');
    // The front has touched the place and not passed its middle (x = 325): the departing word stays.
    paint(words, leftOf(320));
    expect(departing).not.toHaveAttribute('data-sheet-out');
    expect(arriving).toHaveAttribute('data-sheet-out');
    // Past the middle the words have changed hands; never both, never neither.
    paint(words, leftOf(330));
    expect(departing).toHaveAttribute('data-sheet-out');
    expect(arriving).not.toHaveAttribute('data-sheet-out');
  });

  it('lets words that share no place change on their own', () => {
    const { stage } = page(`
      <div data-stage data-box="0 0 400 300">
        <div data-layer="ink"><div class="strip" data-box="0 250 400 50">
          <span data-box="20 260 30 20">031</span><button data-box="300 260 50 20">Light</button>
        </div></div>
        <div data-layer="light"><div class="strip" data-box="0 250 400 50">
          <span data-box="20 260 30 20">031</span><button data-box="310 260 30 20">Ink</button>
        </div></div>
      </div>`);
    const words = new SheetWords();
    words.measure(null, stage);
    paint(words, leftOf(200));
    const [inkNumeral, light, lightNumeral, ink] = document.querySelectorAll('span, button');
    // The numerals' place has turned and the buttons' has not.
    expect(inkNumeral).toHaveAttribute('data-sheet-out');
    expect(lightNumeral).not.toHaveAttribute('data-sheet-out');
    expect(light).not.toHaveAttribute('data-sheet-out');
    expect(ink).toHaveAttribute('data-sheet-out');
  });

  it('turns a drawn mark by its middle', () => {
    const { head, stage } = page(`
      <header data-box="0 0 400 48"><div class="head-row" data-box="0 0 400 48">
        <span class="brand-mark" data-box="100 10 22 22"></span>
        <button data-box="200 10 44 28"><svg data-box="216 18 12 12"></svg></button>
      </div></header>
      <div data-stage data-box="0 48 400 300"></div>`);
    const words = new SheetWords();
    words.measure(head, stage);
    paint(words, leftOf(150));
    expect(document.querySelector('.brand-mark')).toHaveAttribute('data-sheet', 'night');
    expect(document.querySelector('button')).toHaveAttribute('data-sheet', 'paper');
  });

  it('knows a muted word by its colour, and fills it in the muted types', () => {
    const { stage } = page(`
      <div data-stage data-box="0 0 400 300">
        <div data-layer="ink"><div class="strip" data-box="0 250 400 50">
          <span data-box="100 260 40 20" style="--muted: rgb(90, 90, 81); color: rgb(90, 90, 81)">Mute</span>
          <span data-box="200 260 40 20" style="--muted: rgb(90, 90, 81); color: rgb(34, 35, 31)">Type</span>
        </div></div>
      </div>`);
    const words = new SheetWords();
    words.measure(null, stage);
    paint(words, leftOf(118));
    const [muted, plain] = document.querySelectorAll('span');
    expect(muted).toHaveAttribute('data-sheet-muted');
    // The night's muted type to the front, the paper's beyond it: the stage's own where it names one.
    expect(muted.style.backgroundImage).toBe(
      'linear-gradient(to right, #b8b5ad 0px 20px, var(--sheet-paper-muted, #68685e) 20px)',
    );
    expect(plain).not.toHaveAttribute('data-sheet-muted');
  });

  it('follows a word broken over lines along its lines laid end to end', () => {
    const { stage } = page(`
      <div data-stage data-box="0 0 400 300">
        <div data-layer="ink"><div class="strip" data-box="0 200 400 100">
          <span data-lines="20 210 50 20; 20 230 30 20">Fivethree</span>
        </div></div>
      </div>`);
    const words = new SheetWords();
    words.measure(null, stage);
    // The front lies level between the two lines: the first line has turned, the second has not.
    words.paint((_x, y) => (y < 230 ? 1 : 0), 'night', 'light');
    const word = document.querySelector('span')!;
    // The stop falls after the first line's fifty pixels, where the second line begins.
    expect(word.style.backgroundImage).toBe(
      'linear-gradient(to right, var(--night-type) 0px 50px, var(--paper-type) 50px)',
    );
  });

  it('turns the page’s words beyond the stage where they stand on the room’s own ground', () => {
    const { stage, main } = page(`
      <main data-box="0 0 400 2000">
        <div data-stage data-box="0 0 400 300">
          <div data-layer="ink"><div class="strip" data-box="0 250 400 50"></div></div>
        </div>
        <p data-box="20 320 60 20">Bare</p>
        <section style="background-color: rgb(0, 0, 0)"><p data-box="20 360 60 20">Night</p></section>
        <p data-box="20 1500 60 20">Below</p>
      </main>`);
    const words = new SheetWords();
    words.measure(null, stage, main);
    paint(words, () => 1);
    const [bare, night, below] = document.querySelectorAll('p');
    expect(bare).toHaveAttribute('data-sheet', 'night');
    // A section on a ground of its own keeps it, and what the screen does not show is left alone.
    expect(night).not.toHaveAttribute('data-sheet');
    expect(below).not.toHaveAttribute('data-sheet');
  });

  it('places the page’s words on the document, so they keep their place as it scrolls', () => {
    const { stage, main } = page(`
      <main data-box="0 0 400 2000">
        <div data-stage data-box="0 0 400 300"></div>
        <p data-box="20 320 60 20">Bare</p>
      </main>`);
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(100);
    const words = new SheetWords();
    words.measure(null, stage, main);
    const asked: [number, number, Anchor][] = [];
    paint(words, (x, y, anchor) => {
      asked.push([x, y, anchor]);
      return 0;
    });
    // The first glyph's middle is at (25, 330) of the viewport, 100 further down the document.
    expect(asked[0]).toEqual([25, 430, 'page']);
  });

  it('turns each word whole where the browser cannot say where a run of text lies', () => {
    Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
    const { head, stage } = page(`
      <header data-box="0 0 400 48"><div class="head-row" data-box="0 0 400 48">
        <a data-box="100 10 80 20">Exhibits</a>
      </div></header>
      <div data-stage data-box="0 48 400 300"></div>`);
    const words = new SheetWords();
    words.measure(head, stage);
    paint(words, leftOf(128));
    const word = document.querySelector('a')!;
    // By its middle (x = 140), not yet passed; and never filled.
    expect(word).toHaveAttribute('data-sheet', 'paper');
    expect(word).not.toHaveAttribute('data-sheet-fill');
    paint(words, leftOf(150));
    expect(word).toHaveAttribute('data-sheet', 'night');
  });

  it('leaves out what is not laid out or not seen', () => {
    const { head, stage } = page(`
      <header data-box="0 0 400 48"><div class="head-row" data-box="0 0 400 48">
        <span data-box="0 0 1 1">Read aloud only</span>
        <span data-box="20 10 60 20" style="visibility: hidden">Hidden</span>
        <span data-box="100 10 60 20">   </span>
      </div></header>
      <div data-stage data-box="0 48 400 300"></div>`);
    const words = new SheetWords();
    words.measure(head, stage);
    paint(words, () => 1);
    expect(document.querySelector('[data-sheet]')).toBeNull();
  });

  it('gives every word back to its own rules when the Turn is over', () => {
    const { head, stage } = page(`
      <header data-box="0 0 400 48"><div class="head-row" data-box="0 0 400 48">
        <a data-box="100 10 80 20">Exhibits</a>
      </div></header>
      <div data-stage data-box="0 48 400 300">
        <div data-layer="ink"><div class="strip" data-box="0 300 400 48">
          <button data-box="300 310 50 20">Light</button>
        </div></div>
        <div data-layer="light"><div class="strip" data-box="0 300 400 48">
          <button data-box="310 310 30 20">Ink</button>
        </div></div>
      </div>`);
    const words = new SheetWords();
    words.measure(head, stage);
    paint(words, leftOf(128));
    expect(document.querySelector('[data-sheet]')).not.toBeNull();
    words.release();
    expect(
      document.querySelector(
        '[data-sheet], [data-sheet-out], [data-sheet-fill], [data-sheet-muted]',
      ),
    ).toBeNull();
    expect(document.querySelector('a')!.style.backgroundImage).toBe('');
    // Measuring leaves nothing behind in the page either.
    expect(document.body.querySelector('span[style*="display: none"]')).toBeNull();
  });
});

/*
  The viewing room sets one strip and holds the room for the other expression's beneath it, its
  words drawn from attributes (data-line). The strips name their clusters, and each cluster's
  words change hands together.
*/
describe('the words of a room that sets one strip and holds room for the other', () => {
  /** A room: a strip of Ink set, and Light's held beneath it, each of one named cluster. */
  function room(set: string, held: string, more = '') {
    document.body.innerHTML = `
      <div data-stage data-box="0 0 400 300">
        <div data-strip="ink" data-box="0 250 400 50">
          <div data-sheet-group="sources" data-box="0 250 400 50">${set}</div>
        </div>
        <div data-strip-room="light" data-box="0 250 400 50" style="visibility: hidden">
          <div data-sheet-group="sources" data-box="0 250 400 50">${held}</div>
        </div>
        ${more}
      </div>`;
    const stage = document.querySelector<HTMLElement>('[data-stage]')!;
    const words = new SheetWords();
    words.measure(null, stage, null, {
      strips: (layer) =>
        stage.querySelectorAll<HTMLElement>(
          layer === 'ink' ? '[data-strip="ink"]' : '[data-strip-room="light"]',
        ),
      shared: stage.querySelectorAll<HTMLElement>('[data-room-said]'),
      muted: '--room-muted',
    });
    return words;
  }
  const word = (name: string) =>
    [...document.querySelectorAll<HTMLElement>('button, span')].find(
      (element) => (element.getAttribute('data-line') ?? element.textContent) === name,
    )!;

  it('changes the words of a named cluster hands together, at the cluster’s middle', () => {
    // The set words lie from 10 to 240 and the held from 100 to 350: the cluster's middle is 180.
    const words = room(
      '<button data-box="10 260 50 20">Still</button><button data-box="200 260 40 20">Film</button>',
      '<span data-line="Still" data-box="100 260 50 20"></span><span data-line="Sweep" data-box="300 260 50 20"></span>',
    );
    // The front has passed the set "Still" and not the cluster's middle: no word has changed
    // hands, so "Still" is never said twice in one row.
    paint(words, leftOf(170));
    for (const set of document.querySelectorAll('button'))
      expect(set).not.toHaveAttribute('data-sheet-out');
    for (const held of document.querySelectorAll('[data-line]'))
      expect(held).toHaveAttribute('data-sheet-out');
    expect(word('Still')).toHaveAttribute('data-sheet', 'night');
    // Past the middle the whole cluster has changed hands.
    paint(words, leftOf(190));
    for (const set of document.querySelectorAll('button'))
      expect(set).toHaveAttribute('data-sheet-out');
    for (const held of document.querySelectorAll('[data-line]'))
      expect(held).not.toHaveAttribute('data-sheet-out');
  });

  it('changes clusters of different names hands together where their words would share a place', () => {
    // A narrow room wraps its two strips differently. Ink's sets the work's number on its first
    // row and its films on the second; Light's holds a lens on the first row and the number on
    // the second, across Ink's films.
    document.body.innerHTML = `
      <div data-stage data-box="0 0 400 300">
        <div data-strip="ink" data-box="0 240 400 60">
          <div data-sheet-group="identity"><button data-box="10 240 60 20">No 031</button></div>
          <div data-sheet-group="sources"><button data-box="10 262 120 20">Long study..</button></div>
        </div>
        <div data-strip-room="light" data-box="0 240 400 60" style="visibility: hidden">
          <div data-sheet-group="actions"><span data-line="Wavelength" data-box="290 240 100 20"></span></div>
          <div data-sheet-group="identity"><span data-line="No 031" data-box="10 262 60 20"></span></div>
        </div>
      </div>`;
    const stage = document.querySelector<HTMLElement>('[data-stage]')!;
    const words = new SheetWords();
    words.measure(null, stage, null, {
      strips: (layer) =>
        stage.querySelectorAll<HTMLElement>(
          layer === 'ink' ? '[data-strip="ink"]' : '[data-strip-room="light"]',
        ),
      muted: '--room-muted',
    });
    const set = [...document.querySelectorAll('button')];
    const number = document.querySelector('[data-line="No 031"]')!;
    const lens = document.querySelector('[data-line="Wavelength"]')!;
    // The number's two places lie from 10 to 70, and the films it would lie across run to 130:
    // the three are one group, whose middle is 70. The front has passed the number's own middle
    // and not the group's: the held number waits, and is never set across the films.
    paint(words, leftOf(50));
    for (const word of set) expect(word).not.toHaveAttribute('data-sheet-out');
    expect(number).toHaveAttribute('data-sheet-out');
    expect(lens).toHaveAttribute('data-sheet-out');
    // Past the group's middle all three have changed hands, in one frame.
    paint(words, leftOf(80));
    for (const word of set) expect(word).toHaveAttribute('data-sheet-out');
    expect(number).not.toHaveAttribute('data-sheet-out');
    // The lens shares no place with any word: it changes on its own, at its own middle, 340.
    expect(lens).toHaveAttribute('data-sheet-out');
    paint(words, leftOf(350));
    expect(lens).not.toHaveAttribute('data-sheet-out');
  });

  it('measures a held word though it is unseen, and turns it whole at its middle', () => {
    const words = room(
      '<button data-box="10 260 50 20">Still</button>',
      '<span data-line="Sweep" data-box="300 260 50 20"></span>',
    );
    const held = document.querySelector<HTMLElement>('[data-line="Sweep"]')!;
    // Its middle is at 325.
    paint(words, leftOf(320));
    expect(held).toHaveAttribute('data-sheet', 'paper');
    paint(words, leftOf(330));
    expect(held).toHaveAttribute('data-sheet', 'night');
    // No script can say where a drawn word's glyphs lie: it is never filled glyph by glyph.
    expect(held).not.toHaveAttribute('data-sheet-fill');
    expect(held.style.backgroundImage).toBe('');
  });

  it('gives a held word the glyphs of the set word it replaces, where both say the same in one place', () => {
    const words = room(
      '<button data-box="10 260 50 20">Still</button><button data-box="200 260 40 20">Film</button>',
      '<span data-line="Still" data-box="10 260 50 20"></span><span data-line="Film" data-box="230 260 40 20"></span>',
    );
    // The front stands inside "Still": between its second and third glyphs.
    paint(words, leftOf(28));
    const [set, moved] = document.querySelectorAll<HTMLElement>('button');
    const [twin, apart] = document.querySelectorAll<HTMLElement>('[data-line]');
    expect(set.style.backgroundImage).toBe(
      'linear-gradient(to right, var(--night-type) 0px 20px, var(--paper-type) 20px)',
    );
    // The held word in the same place is filled as the word it replaces: they cannot be told apart.
    expect(twin.style.backgroundImage).toBe(set.style.backgroundImage);
    expect(twin).toHaveAttribute('data-sheet-fill');
    // "Film" is held 30 px from where it is set: it is no twin, and turns whole.
    paint(words, leftOf(218));
    expect(moved.style.backgroundImage).not.toBe('');
    expect(apart.style.backgroundImage).toBe('');
  });

  it('knows a muted word by the token the room names', () => {
    const words = room(
      `<button data-box="10 260 50 20">Film
         <span data-box="70 260 40 20" style="--room-muted: rgb(90, 90, 81); color: rgb(90, 90, 81)">116s</span>
       </button>`,
      '<span data-line="Film" data-box="10 260 50 20"></span>',
    );
    paint(words, leftOf(5));
    expect(word('116s')).toHaveAttribute('data-sheet-muted');
    expect(document.querySelector('button')).not.toHaveAttribute('data-sheet-muted');
  });

  it('turns the words both expressions share, which never change hands', () => {
    const words = room(
      '<button data-box="10 260 50 20">Still</button>',
      '<span data-line="Still" data-box="10 260 50 20"></span>',
      '<div data-room-said data-box="0 280 400 20"><span data-box="100 280 40 20">Said</span></div>',
    );
    // The front has passed the first of its four glyphs.
    paint(words, leftOf(108));
    const said = word('Said');
    expect(said).toHaveAttribute('data-sheet', 'paper');
    expect(said.style.backgroundImage).toBe(
      'linear-gradient(to right, var(--night-type) 0px 10px, var(--paper-type) 10px)',
    );
    paint(words, () => 1);
    expect(said).toHaveAttribute('data-sheet', 'night');
    expect(said).not.toHaveAttribute('data-sheet-out');
  });

  /** The style a browser computes, with an underline jsdom would not report. */
  function underlined(lines: Map<Element, string>) {
    const computed = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
      const real = computed(element, pseudo);
      const colour = lines.get(element);
      if (colour === undefined) return real;
      return new Proxy(real, {
        get(target, property) {
          if (property === 'textDecorationLine') return 'underline';
          if (property === 'textDecorationColor') return colour;
          const value = Reflect.get(target, property, target) as unknown;
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    });
  }

  it('sets aside an underline that paints nothing while its word is filled, and its control’s', () => {
    document.body.innerHTML = `
      <div data-stage data-box="0 0 400 300">
        <div data-strip="ink" data-box="0 250 400 50">
          <button id="plain" data-box="10 260 50 20">Still</button>
          <button id="chosen" data-box="100 260 40 20">Film</button>
          <button id="study" data-box="200 260 50 20">Study<span data-box="260 260 40 20">116s</span></button>
        </div>
      </div>`;
    const stage = document.querySelector<HTMLElement>('[data-stage]')!;
    const [plain, chosen, study] = document.querySelectorAll('button');
    underlined(
      new Map<Element, string>([
        [plain, 'rgba(0, 0, 0, 0)'],
        [chosen, 'rgb(34, 35, 31)'],
        [study, 'rgba(0, 0, 0, 0)'],
      ]),
    );
    const words = new SheetWords();
    words.measure(null, stage, null, { strips: (layer) => (layer === 'ink' ? [stage] : []) });
    // No word is filled yet: nothing is set aside.
    paint(words, () => 0);
    expect(document.querySelector('[data-sheet-unlined]')).toBeNull();
    // The front stands in "Still", whose underline waits unseen for the hand.
    paint(words, leftOf(28));
    expect(plain).toHaveAttribute('data-sheet-unlined');
    // In "Film", chosen and underlined: its line is seen, and takes the fill as its glyphs do.
    paint(words, leftOf(118));
    expect(chosen).toHaveAttribute('data-sheet-fill');
    expect(chosen).not.toHaveAttribute('data-sheet-unlined');
    // In the muted figures of a study: the line that runs under them is their control's.
    paint(words, leftOf(278));
    expect(study).toHaveAttribute('data-sheet-unlined');
    words.release();
    expect(document.querySelector('[data-sheet-unlined]')).toBeNull();
  });

  it('gives the focused word’s ring to the held word that takes its place', () => {
    const matches = Element.prototype.matches;
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      return selector === ':focus-visible'
        ? this === document.activeElement
        : matches.call(this, selector);
    });
    document.body.innerHTML = `
      <div data-stage data-box="0 0 400 300">
        <div data-strip="ink" data-box="0 250 400 50">
          <div data-sheet-group="actions" data-box="0 250 400 50">
            <button data-box="300 260 50 20">Close</button>
          </div>
        </div>
        <div data-strip-room="light" data-box="0 250 400 50">
          <div data-sheet-group="actions" data-box="0 250 400 50">
            <span data-line="Detail" data-box="200 260 50 20"></span>
            <span data-line="Close" data-box="320 260 50 20"></span>
          </div>
        </div>
      </div>`;
    const stage = document.querySelector<HTMLElement>('[data-stage]')!;
    const strips = (layer: 'ink' | 'light') =>
      stage.querySelectorAll<HTMLElement>(
        layer === 'ink' ? '[data-strip="ink"]' : '[data-strip-room="light"]',
      );
    const words = new SheetWords();
    // No word has the ring: none is carried.
    words.measure(null, stage, null, { strips });
    expect(document.querySelector('[data-sheet-focus]')).toBeNull();
    document.querySelector('button')!.focus();
    words.measure(null, stage, null, { strips });
    // The held "Close" wears it, wherever it lies; "Detail" replaces no focused word.
    expect(document.querySelector('[data-line="Close"]')).toHaveAttribute('data-sheet-focus');
    expect(document.querySelector('[data-line="Detail"]')).not.toHaveAttribute('data-sheet-focus');
    words.release();
    expect(document.querySelector('[data-sheet-focus]')).toBeNull();
  });
});
