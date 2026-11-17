/*
  The words on the sheet. While a Turn's front crosses the first screen, the running head, the
  strip and the page beneath stand on two grounds at once. Two rules keep every word whole and
  readable:

  - Each glyph wears the type of the ground beneath it. A word the front has passed is set in the
    type of the ground it now stands on. A word the front is passing is light on the night side
    and dark on the paper side, glyph by glyph, and no glyph is ever two colours: such a word is
    filled through a gradient whose every stop falls between two glyphs, which every engine
    paints alike, in a layer that is inert as in one that is not. (The browser's own highlights
    of a range of text would be simpler, and WebKit does not paint them inside an inert layer.)
  - Where the two expressions say different things in one place (the strip's `Light` and `Ink`,
    the two lines under the still), the words change hands, a group at a time, as the front
    passes the group's middle. Words that would overlap are one group, so two never share a place;
    and where a strip names its clusters (`data-sheet-group`: the room's identity, its sources,
    its actions), a cluster is one group, so no word is ever said twice in one row. Both rules
    hold at once: a narrow room wraps its two strips differently, so one strip's cluster lies
    across another cluster of the other, and the clusters that meet so are one group too.

  Nothing here moves or measures the page's layout while the Turn travels: the words are measured
  once, as it begins, against what each of them moves with.

  The viewing room sets one strip at a time, and holds the room for the other expression's
  beneath it, its words drawn from attributes (artwork-room.tsx). Those words change hands in the
  same way. A word drawn from an attribute has no glyphs a script can measure, so it turns
  whole, at its middle; where it says what the word it replaces says, in the same place, it takes
  that word's glyphs, and the two cannot be told apart as they change hands.
*/

export type Ground = 'paper' | 'night';

/**
 * What a word is placed against: the running head stays with the viewport, the stage scrolls
 * (and may stick), and the page beyond it is placed on the document.
 */
export type Anchor = 'head' | 'stage' | 'page';

/** One glyph of a word: where its middle is, and its place along the word's own run of lines. */
interface Glyph {
  x: number;
  y: number;
  /** From the start of the word's first line, its lines laid end to end. */
  from: number;
  to: number;
}

/** A run of text, or a drawn mark, that stands on the sheet. */
interface Unit {
  element: HTMLElement;
  anchor: Anchor;
  /** The expression whose strip it belongs to; none for the head and the page, which both share. */
  layer: 'ink' | 'light' | null;
  /** Its box, from the anchor's own corner. */
  box: { x: number; y: number; width: number; height: number };
  glyphs: Glyph[];
  /** What it says, itself: a word drawn from an attribute is known by this alone. */
  text: string;
  /** Drawn from an attribute, in room held for it: there are no glyphs of its own to measure. */
  held: boolean;
  muted: boolean;
  /** The words that change hands together; none for a word both expressions share. */
  group: number;
  ground: Ground | null;
  out: boolean | null;
  /** The fill it wears now, so a frame that changes nothing writes nothing. */
  fill: string;
}

/**
 * The type of each ground, and its muted type: the tokens of globals.css. Muted words on paper
 * are darker on a sheet's own tone than on the page's (plate.module.css), so the stage names its
 * own (turn.module.css) and a word reads, mid-Turn, exactly as it will at rest.
 */
const TYPE: Record<Ground, { type: string; muted: string }> = {
  paper: { type: 'var(--paper-type)', muted: 'var(--sheet-paper-muted, #68685e)' },
  night: { type: 'var(--night-type)', muted: '#b8b5ad' },
};

/**
 * Whether a computed background paints nothing: `transparent`, or any colour at no opacity. A
 * black one paints the night, and `rgb(0, 0, 0)` ends as an empty `rgba(…, 0)` does.
 */
export function paintsNothing(colour: string) {
  if (colour === '' || colour === 'transparent') return true;
  const alpha = /^rgba\([^)]*,\s*([\d.]+)\)$/.exec(colour) ?? /\/\s*([\d.]+)%?\s*\)$/.exec(colour);
  return !!alpha && Number(alpha[1]) === 0;
}

/** Where a sheet's words are, when they are not the page's own two strips. */
export interface WordsOf {
  /** Each expression's words that lie over the other's: by default the two layers' strips. */
  strips?: (layer: 'ink' | 'light') => Iterable<HTMLElement>;
  /** Words both expressions share, placed with the stage. */
  shared?: Iterable<HTMLElement>;
  /** The custom property that names a muted word's colour there. */
  muted?: string;
}

/** The attribute a held word is drawn from (room-notice.tsx, artwork-room.tsx). */
const HELD = 'data-line';

const overlap = (a: Unit['box'], b: Unit['box']) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const px = (value: number) => `${Math.round(value * 100) / 100}px`;

/**
 * The fill of a word whose glyphs stand on these grounds, one after another: a gradient along
 * its lines with a hard stop half-way between two glyphs wherever the ground changes; none for
 * a word that stands on one ground.
 */
export function fillOf(grounds: readonly Ground[], glyphs: readonly Glyph[], muted: boolean) {
  if (grounds.every((ground) => ground === grounds[0])) return '';
  const colour = (ground: Ground) => TYPE[ground][muted ? 'muted' : 'type'];
  const stops: string[] = [];
  let since = 0;
  for (let i = 1; i <= grounds.length; i++) {
    if (i < grounds.length && grounds[i] === grounds[i - 1]) continue;
    if (i === grounds.length) stops.push(`${colour(grounds[i - 1])} ${px(since)}`);
    else {
      const until = (glyphs[i - 1].to + glyphs[i].from) / 2;
      stops.push(`${colour(grounds[i - 1])} ${px(since)} ${px(until)}`);
      since = until;
    }
  }
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

/** How far up from a word its underline may come from: a word, its control, the control's row. */
const DECORATORS = 3;

export class SheetWords {
  private units: Unit[] = [];
  /** Each group's middle, on the stage. */
  private middles = new Map<number, { x: number; y: number }>();
  /** The elements whose unseen underline is set aside while the sheet is worn. */
  private unlined = new Set<Element>();
  /** The held word that wears the focused word's ring, when one takes its place. */
  private ringed: Element | null = null;

  /**
   * Measure every word of the head and of the two strips, once, as the Turn begins. `head` is the
   * running head's row and `stage` what holds the two layers. `page` is the rest of the page,
   * where the screen shows any of it: its words on the room's own ground turn too.
   */
  measure(
    head: HTMLElement | null,
    stage: HTMLElement,
    page: HTMLElement | null = null,
    {
      strips = (layer) => stage.querySelectorAll<HTMLElement>(`[data-layer="${layer}"] .strip`),
      shared = [],
      muted: mutedToken = '--muted',
    }: WordsOf = {},
  ) {
    this.release();
    // One probe, beside the page: a token's colour is read from it and never from the words.
    const probe = document.createElement('span');
    probe.style.display = 'none';
    document.body.appendChild(probe);
    const colours = new Map<string, string>();
    const colourOf = (token: string) => {
      let colour = colours.get(token);
      if (colour === undefined) {
        probe.style.color = '';
        probe.style.color = token;
        colour = getComputedStyle(probe).color;
        colours.set(token, colour);
      }
      return colour;
    };
    /** Whether an element stands on the room's own ground: nothing between it and the page paints one. */
    const rooms = new Map<Element, boolean>();
    const onRoom = (element: Element | null): boolean => {
      if (!element || element === page) return true;
      const known = rooms.get(element);
      if (known !== undefined) return known;
      const answer =
        paintsNothing(getComputedStyle(element).backgroundColor) && onRoom(element.parentElement);
      rooms.set(element, answer);
      return answer;
    };
    const collect = (root: HTMLElement, anchor: Anchor, layer: Unit['layer']) => {
      // The page's words are placed on the document, so they keep their place as it scrolls.
      const frame =
        anchor === 'head'
          ? (root.closest('header') ?? root).getBoundingClientRect()
          : stage.getBoundingClientRect();
      const origin = anchor === 'page' ? { left: -window.scrollX, top: -window.scrollY } : frame;
      const found = new Map<HTMLElement, { unit: Unit; lines: DOMRect[] } | null>();
      const unitFor = (element: HTMLElement, held = false) => {
        const known = found.get(element);
        if (known !== undefined) return known;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        let entry: { unit: Unit; lines: DOMRect[] } | null = null;
        // A held word is unseen until the Turn wears it; any other unseen word is none of ours.
        if (rect.width >= 2 && rect.height >= 2 && (held || style.visibility !== 'hidden')) {
          const muted = style.getPropertyValue(mutedToken).trim();
          entry = {
            unit: {
              element,
              anchor,
              layer,
              box: {
                x: rect.left - origin.left,
                y: rect.top - origin.top,
                width: rect.width,
                height: rect.height,
              },
              glyphs: [],
              text: held ? (element.getAttribute(HELD) ?? '') : '',
              held,
              muted: !!muted && style.color === colourOf(muted),
              group: -1,
              ground: null,
              out: null,
              fill: '',
            },
            lines:
              typeof element.getClientRects === 'function' ? [...element.getClientRects()] : [],
          };
        }
        found.set(element, entry);
        return entry;
      };
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const parent = node.parentElement;
        const text = (node as Text).data;
        if (!parent || !text.trim()) continue;
        if (anchor === 'page') {
          // Only what the screen shows, outside the stage, on the room's own ground.
          if (stage.contains(parent) || !onRoom(parent)) continue;
          const rect = parent.getBoundingClientRect();
          if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
        }
        const entry = unitFor(parent);
        if (!entry) continue;
        entry.unit.text += text;
        const range = document.createRange();
        // A browser that cannot say where a run of text lies turns each word whole.
        if (typeof range.getBoundingClientRect !== 'function' || !entry.lines.length) continue;
        // Whole characters, never half a surrogate pair.
        let offset = 0;
        for (const character of text) {
          const start = offset;
          offset += character.length;
          if (!character.trim()) continue;
          range.setStart(node, start);
          range.setEnd(node, offset);
          const rect = range.getBoundingClientRect();
          if (rect.width < 0.5 || rect.height < 0.5) continue;
          const middle = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
          // Its place along the word's lines laid end to end, as a background is laid on them.
          let before = 0;
          let line = entry.lines[0];
          for (const candidate of entry.lines) {
            if (middle.y >= candidate.top && middle.y <= candidate.bottom) {
              line = candidate;
              break;
            }
            before += candidate.width;
          }
          entry.unit.glyphs.push({
            x: middle.x - origin.left,
            y: middle.y - origin.top,
            from: before + rect.left - line.left,
            to: before + rect.right - line.left,
          });
        }
      }
      // Marks that are drawn, not set: the wordmark's three bodies, the pause glyph.
      if (anchor !== 'page')
        root
          .querySelectorAll<HTMLElement | SVGElement>('.brand-mark, svg')
          .forEach((mark) =>
            unitFor(mark instanceof SVGElement ? (mark.parentElement as HTMLElement) : mark),
          );
      // Words drawn from an attribute, in the room held for them.
      if (anchor === 'stage')
        root.querySelectorAll<HTMLElement>(`[${HELD}]`).forEach((word) => unitFor(word, true));
      for (const entry of found.values()) if (entry) this.units.push(entry.unit);
    };
    try {
      if (head) collect(head, 'head', null);
      if (page) collect(page, 'page', null);
      for (const element of shared) collect(element, 'stage', null);
      for (const layer of ['ink', 'light'] as const)
        for (const strip of strips(layer)) collect(strip, 'stage', layer);
    } finally {
      probe.remove();
    }
    // A held word that says what a set word says, in the same place, takes that word's glyphs.
    const near = (a: number, b: number) => Math.abs(a - b) < 0.5;
    for (const unit of this.units) {
      if (!unit.held || !unit.layer) continue;
      const twin = this.units.find(
        (other) =>
          !other.held &&
          other.layer !== null &&
          other.layer !== unit.layer &&
          other.glyphs.length > 0 &&
          other.text === unit.text &&
          near(other.box.x, unit.box.x) &&
          near(other.box.y, unit.box.y) &&
          near(other.box.width, unit.box.width),
      );
      if (twin) unit.glyphs = twin.glyphs;
    }
    // The strips' words change hands in groups: the words of one named cluster together, the
    // words of the two layers that share a place together, and so on through every word either
    // rule joins, so that no two words are ever set in one place.
    const layered = this.units.filter((unit) => unit.layer);
    const leader = layered.map((_, index) => index);
    const lead = (index: number): number => {
      let at = index;
      while (leader[at] !== at) at = leader[at];
      return at;
    };
    const join = (a: number, b: number) => {
      leader[lead(a)] = lead(b);
    };
    const clusters = new Map<string, number>();
    layered.forEach((unit, index) => {
      const name = unit.element.closest('[data-sheet-group]')?.getAttribute('data-sheet-group');
      if (!name) return;
      const first = clusters.get(name);
      if (first === undefined) clusters.set(name, index);
      else join(index, first);
    });
    layered.forEach((unit, index) => {
      for (let other = index + 1; other < layered.length; other += 1)
        if (layered[other].layer !== unit.layer && overlap(unit.box, layered[other].box))
          join(index, other);
    });
    const extents = new Map<number, { x0: number; y0: number; x1: number; y1: number }>();
    layered.forEach((unit, index) => {
      unit.group = lead(index);
      const extent = extents.get(unit.group) ?? {
        x0: Infinity,
        y0: Infinity,
        x1: -Infinity,
        y1: -Infinity,
      };
      extent.x0 = Math.min(extent.x0, unit.box.x);
      extent.y0 = Math.min(extent.y0, unit.box.y);
      extent.x1 = Math.max(extent.x1, unit.box.x + unit.box.width);
      extent.y1 = Math.max(extent.y1, unit.box.y + unit.box.height);
      extents.set(unit.group, extent);
    });
    extents.forEach((extent, group) =>
      this.middles.set(group, {
        x: (extent.x0 + extent.x1) / 2,
        y: (extent.y0 + extent.y1) / 2,
      }),
    );
    // The ring of the word the hand is on goes with it: where a held word will take its place,
    // saying the same, that word wears the ring until the strip is its own again.
    const focused = document.activeElement;
    let ring = false;
    try {
      ring = !!focused?.matches(':focus-visible');
    } catch {
      /* An engine that does not know the ring's selector draws none to carry. */
    }
    const from = ring ? this.units.find((unit) => unit.element === focused) : undefined;
    const to =
      from?.layer &&
      this.units.find(
        (unit) =>
          unit.held &&
          unit.layer !== null &&
          unit.layer !== from.layer &&
          unit.group === from.group &&
          unit.text === from.text,
      );
    if (to) {
      to.element.setAttribute('data-sheet-focus', '');
      this.ringed = to.element;
    }
  }

  /**
   * A word filled through its text is clipped to its glyphs and to its underline, whatever colour
   * the underline is: a control's underline that waits, unseen, for the hand would be drawn in
   * the fill. So an underline that paints nothing is set aside while the sheet is worn: the
   * word's own, and its control's, whose line runs under it. One that is seen (a word pressed, a
   * Turn's own dotted line) stays, and takes the fill as the glyphs do.
   */
  private unline(element: Element) {
    let node: Element | null = element;
    for (let depth = 0; node && depth < DECORATORS; depth++, node = node.parentElement) {
      if (this.unlined.has(node)) continue;
      const style = getComputedStyle(node);
      if (
        (style.textDecorationLine ?? '').includes('underline') &&
        paintsNothing(style.textDecorationColor)
      ) {
        this.unlined.add(node);
        node.setAttribute('data-sheet-unlined', '');
      }
    }
  }

  /**
   * Set every word for this frame. `turned(x, y, anchor)` says how far the front has passed a
   * point, 0 to 1; `toward` is the ground the Turn brings, and `arriving` the layer it brings.
   */
  paint(
    turned: (x: number, y: number, anchor: Anchor) => number,
    toward: Ground,
    arriving: 'ink' | 'light',
  ) {
    const from: Ground = toward === 'night' ? 'paper' : 'night';
    const under = (x: number, y: number, anchor: Anchor): Ground =>
      turned(x, y, anchor) >= 0.5 ? toward : from;
    // Which groups have changed hands: the front has passed their middle.
    const changed = new Map<number, boolean>();
    this.middles.forEach((middle, group) =>
      changed.set(group, turned(middle.x, middle.y, 'stage') >= 0.5),
    );
    for (const unit of this.units) {
      // A word stands on the ground most of its glyphs stand on; a mark, on its middle's.
      const grounds = unit.glyphs.map((glyph) => under(glyph.x, glyph.y, unit.anchor));
      const ground = grounds.length
        ? grounds.filter((value) => value === toward).length * 2 >= grounds.length
          ? toward
          : from
        : under(unit.box.x + unit.box.width / 2, unit.box.y + unit.box.height / 2, unit.anchor);
      if (unit.ground !== ground) {
        unit.ground = ground;
        unit.element.setAttribute('data-sheet', ground);
        if (unit.muted) unit.element.setAttribute('data-sheet-muted', '');
      }
      if (unit.layer) {
        const out = (unit.layer === arriving) !== (changed.get(unit.group) ?? false);
        if (unit.out !== out) {
          unit.out = out;
          if (out) unit.element.setAttribute('data-sheet-out', '');
          else unit.element.removeAttribute('data-sheet-out');
        }
      }
      // The word the front is passing: each glyph filled in the type of its own ground.
      const fill = fillOf(grounds, unit.glyphs, unit.muted);
      if (unit.fill === fill) continue;
      unit.fill = fill;
      if (fill) {
        this.unline(unit.element);
        unit.element.style.backgroundImage = fill;
        unit.element.setAttribute('data-sheet-fill', '');
      } else {
        unit.element.style.removeProperty('background-image');
        unit.element.removeAttribute('data-sheet-fill');
      }
    }
  }

  /** The Turn is over: every word goes back to its own layer's rules. */
  release() {
    for (const unit of this.units) {
      unit.element.removeAttribute('data-sheet');
      unit.element.removeAttribute('data-sheet-muted');
      unit.element.removeAttribute('data-sheet-out');
      unit.element.removeAttribute('data-sheet-fill');
      if (unit.fill) unit.element.style.removeProperty('background-image');
    }
    for (const element of this.unlined) element.removeAttribute('data-sheet-unlined');
    this.unlined.clear();
    this.ringed?.removeAttribute('data-sheet-focus');
    this.ringed = null;
    this.units = [];
    this.middles.clear();
  }
}
