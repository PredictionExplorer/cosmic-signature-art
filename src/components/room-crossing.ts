import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { isExpression, type ArtInterpretation, type Expression } from '@/lib/art/types';
import type { Rgb, Toward } from '@/lib/crossing/material';
import {
  edgeOf,
  frontAt,
  passed,
  sheetTime,
  trailOf,
  type Box,
  type Maps,
  type Sheets,
} from '@/lib/crossing/sheet';
import type { StillRequest } from './artwork-media';
import { SheetLayer } from './sheet-layer';
import { SheetPainter } from './sheet-painter';
import { close, load, readMap, readable, rgb, snapshot, type Still } from './sheet-pictures';
import { SheetWords } from './sheet-words';
import { setThemeColor, tokenMs } from './turn';

/*
  The Turn in the viewing room, drawn as it is on the page: one sheet, turned by one front.

  The room sets one expression at a time, so nothing of the other lies beneath to be shown.
  While a Turn travels, one canvas lies over the whole room, under the strip's words, and paints
  what the Turn brings: the arriving ground and the arriving still, wherever the front has
  passed, read from the same field the page reads (src/lib/crossing/sheet.ts), laid for the
  room: the work where the room hangs it, and the ground on past its edges to the room's corners.
  Ahead of the front the canvas is clear, and the room shows what it was showing: its still at
  the room's own size, or its film, still playing, from whatever host it comes. The strip's
  words take the type of the ground beneath each glyph, and the words the other expression's
  strip will say (the room held for them, artwork-room.tsx) change hands with the strip's as
  the front passes.

  What a Turn brings is what the room will then show. Resting on a still, it brings the other
  expression's still. Playing a film, it brings that expression's bare ground, the night or the
  sheet with nothing drawn on it yet: its film begins there, from its first frame, and the work
  is never shown whole only to be taken away and drawn again.

  The order of things is the page's too. The Turn is asked for; its still is readied; the front
  crosses the room; then the change is made, by an ordinary update, with nothing left to show.
  The canvas stays until the room has painted the work beneath it, and goes.

  Where this browser cannot paint the sheet, the room's Turn is the stage's own snapshot
  (artwork-stage.tsx). Where the room shows something that is not the work itself (a lens, the
  loupe), the change is made at once.
*/

/** How a Turn asked of the room came out. */
export type RoomTurnOutcome =
  /** The front has crossed the room, or there was nothing to cross: the change is due, plainly. */
  | 'landed'
  /** A newer request, a press the other way or the room's closing took the Turn back. */
  | 'called off'
  /** The room cannot draw this Turn by the sheet: the stage's own snapshot shows it. */
  | 'undrawn';

/** The room's Turn, as the viewer that owns the expression asks for it. */
export interface RoomTurn {
  /** Draw the Turn to an expression whose still is ready. */
  cross(to: Expression): Promise<RoomTurnOutcome>;
  /** The expression a Turn is on its way to; null while none is. */
  heading(): Expression | null;
  /** Take the Turn in flight back: its front returns the way it came. */
  callOff(): void;
}

/** A room and where the work hangs in it, in the room's own pixels. */
interface Layout {
  region: Box;
  art: Box;
}

const sameBox = (a: Box, b: Box) =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
const same = (a: Layout, b: Layout) => sameBox(a.region, b.region) && sameBox(a.art, b.art);

/** A crossing still being readied is worth this long; a Turn never waits longer for one. */
const READY_MS = 400;
/** The stills and the sheets of a room that has changed are worth this long. */
const MAKE_MS = 700;
/** A Turn that has landed waits this long for the change it asked for, and then lets go. */
const LAND_MS = 1500;
/** The room's work is worth this long after the change: past it the canvas goes regardless. */
const PAINT_MS = 600;
/** A film that begins on the ground a Turn brought is worth this long for its first frame. */
const FILM_MS = 2000;
/** A Turn asked for while the room is still opening waits this long for it, looking this often. */
const OPEN_MS = 1200;
const OPEN_STEP_MS = 50;
/** The strip's hairline is read this often along its length, in pixels. */
const RULE_STEP = 2;

/** A promise's answer, or false when it has not come in time. */
function within(promise: Promise<boolean>, ms: number) {
  return Promise.race([
    promise.catch(() => false),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms)),
  ]);
}

/** The canvas over the room: what it needs to paint a Turn, and one frame of it. */
export class RoomCrossing {
  private painter: SheetPainter | null = null;
  private layer: SheetLayer | null = null;
  private sheets: Sheets | null = null;
  private laid: Layout | null = null;
  /** The layout sheets were last asked for, and the promise of them. */
  private asked: { layout: Layout; coming: Promise<void> } | null = null;
  /** The work's width, in the canvas's pixels, that each still in hand was read for; 0 for none. */
  private pictured: Record<Expression, number> = { ink: 0, light: 0 };
  private readonly words = new SheetWords();
  /** The room's words wear the sheet while a Turn is painted. */
  private worn = false;
  /** The strip's hairline, measured as the Turn begins: where it lies in the room, and its last drawing. */
  private rule: { strip: HTMLElement; x: number; y: number; width: number; drawn: string } | null =
    null;
  private preparing: Promise<boolean> | null = null;
  /** Each preparation's number: one overtaken by a lost context builds nothing. */
  private attempt = 0;
  private disposed = false;
  ready = false;

  private readonly lost = (event: Event) => {
    // The browser took the context back: stand down now, and be prepared again on its return.
    event.preventDefault();
    this.attempt += 1;
    this.ready = false;
    this.preparing = null;
    this.painter = null;
    this.pictured = { ink: 0, light: 0 };
    this.land();
    this.onLost();
  };
  private readonly restored = () => {
    this.preparing = null;
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly frame: () => HTMLElement | null,
    /** The Ink sheet's own tone: the room's ground in Ink. */
    private readonly paper: Rgb,
    private readonly onLost: () => void = () => {},
  ) {
    canvas.addEventListener('webglcontextlost', this.lost);
    canvas.addEventListener('webglcontextrestored', this.restored);
  }

  /**
   * Load both maps, compile the painter and lay the sheets for the room as it stands. The stills
   * wait for a Turn: the room fetches no expression it was not asked to show. Resolves false where
   * this browser cannot cross this way.
   */
  prepare(ink: ArtInterpretation, light: ArtInterpretation): Promise<boolean> {
    this.preparing ??= this.load(ink, light).catch(() => false);
    return this.preparing;
  }

  private async load(ink: ArtInterpretation, light: ArtInterpretation): Promise<boolean> {
    if (!ink.arrival || !light.arrival || this.disposed) return false;
    const attempt = ++this.attempt;
    // Asked first: a browser without WebGL loads neither map.
    if (!SheetPainter.offered(this.canvas, true)) return false;
    const [inkImage, lightImage] = await Promise.all([
      load(ink.arrival.src),
      load(light.arrival.src),
    ]);
    const current = () => !this.disposed && attempt === this.attempt;
    if (!current()) return false;
    const inkMap = readMap(inkImage);
    const lightMap = readMap(lightImage);
    if (
      !inkMap ||
      !lightMap ||
      inkMap.width !== lightMap.width ||
      inkMap.height !== lightMap.height
    )
      return false;
    // The room's painter paints through: only what a Turn brings, over the room as it stands.
    const painter = SheetPainter.on(this.canvas, true);
    if (!painter) return false;
    const maps: Maps = {
      width: inkMap.width,
      height: inkMap.height,
      ink: inkMap.bytes,
      light: lightMap.bytes,
    };
    this.layer?.dispose();
    this.layer = new SheetLayer(maps);
    this.painter = painter;
    this.sheets = null;
    this.laid = this.asked = null;
    this.pictured = { ink: 0, light: 0 };
    // The sheets are laid now, while nothing waits on them, where the room can be measured.
    const layout = this.measure();
    if (layout) await this.lay(layout);
    if (!current() || painter.lost) return false;
    this.ready = true;
    return true;
  }

  private lay(layout: Layout) {
    const { layer } = this;
    if (!layer) return Promise.resolve();
    const coming = layer.lay(layout.region, layout.art).then((sheets) => {
      // Null: a newer layout was asked for meanwhile, and its answer is on its way.
      if (!sheets || this.disposed || !this.painter || this.painter.lost) return;
      this.painter.lay(sheets);
      this.sheets = sheets;
      this.laid = layout;
    });
    this.asked = { layout, coming };
    return coming;
  }

  /**
   * Fit the canvas to the room and find the work in it. Every length is a whole number of the
   * canvas's own pixels, as the browser places the work itself. Null where the room shows no
   * work to measure.
   */
  private measure(): Layout | null {
    const frame = this.frame();
    const media = frame?.querySelector<HTMLElement>('[data-room-media]');
    if (!frame || !media) return null;
    const room = frame.getBoundingClientRect();
    const work = media.getBoundingClientRect();
    if (room.width < 2 || room.height < 2 || work.width < 2 || work.height < 2) return null;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.round(room.width * ratio);
    const height = Math.round(room.height * ratio);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    const snap = (value: number) => Math.round(value * ratio) / ratio;
    return {
      region: { x: 0, y: 0, width: width / ratio, height: height / ratio },
      art: {
        x: snap(work.left - room.left),
        y: snap(work.top - room.top),
        width: snap(work.width),
        height: snap(work.height),
      },
    };
  }

  /** Sheets for the room as it stands now are asked for, if they are not in hand or on their way. */
  settle() {
    if (!this.ready || !this.painter || this.painter.lost) return;
    const layout = this.measure();
    if (!layout || (this.laid && same(this.laid, layout))) return;
    if (!this.asked || !same(this.asked.layout, layout)) void this.lay(layout);
  }

  /**
   * Everything a Turn needs that is not in hand yet: sheets for the room as it stands, and the
   * still the Turn brings, by the very request the room will make for it (so what the canvas
   * paints is the rung the room then shows). A Turn that brings its ground `bare` needs no
   * still. False where either cannot be had.
   */
  async make(
    target: ArtInterpretation,
    still: (media: ArtInterpretation) => StillRequest | undefined,
    bare = false,
  ): Promise<boolean> {
    if (!this.ready || !this.painter || this.painter.lost) return false;
    const { id } = target;
    if (!isExpression(id)) return false;
    const layout = this.measure();
    if (!layout) return false;
    const attempt = this.attempt;
    const due: Promise<void>[] = [];
    if (!(this.laid && same(this.laid, layout)))
      due.push(
        this.asked && same(this.asked.layout, layout) ? this.asked.coming : this.lay(layout),
      );
    const work = (layout.art.width * this.canvas.width) / layout.region.width;
    // A still read for a work a quarter wider or narrower is read again, at the room's new size.
    const had = this.pictured[id];
    if (!bare && !(had > 0 && Math.abs(work - had) <= had / 4))
      due.push(this.picture(id, still(target), work));
    try {
      await Promise.all(due);
    } catch {
      // A still that could not be had, or may not be read: this Turn is not the sheet's to draw.
      return false;
    }
    return (
      !this.disposed &&
      attempt === this.attempt &&
      !!this.painter &&
      !this.painter.lost &&
      (bare || this.pictured[id] > 0) &&
      !!this.sheets &&
      !!this.laid &&
      same(this.laid, layout)
    );
  }

  private async picture(expression: Expression, request: StillRequest | undefined, work: number) {
    if (!request) throw new Error('no still to read');
    const image = new Image();
    image.decoding = 'async';
    // The layout width, then the candidates, then the source, as the Turn readies it
    // (artwork-stage.tsx): the browser chooses the rung the room will show.
    if (request.srcSet) {
      if (request.sizes) image.sizes = request.sizes;
      image.srcset = request.srcSet;
    }
    image.src = request.src;
    await image.decode();
    if (!readable(image)) throw new Error('a still this canvas may not read');
    const read: Still = await snapshot(image, work);
    try {
      if (this.disposed || !this.painter || this.painter.lost) return;
      this.painter.still(expression, read);
      this.pictured[expression] = work;
    } finally {
      // Uploaded once: the texture is the painter's own copy from here on.
      close(read);
    }
  }

  /**
   * Paint the room with the front `share` of its way across, 0 to 1, toward a ground (`bare`:
   * that ground alone, with nothing drawn on it); and set every word of the strip from the same
   * field in the same frame. False where it cannot be painted.
   */
  render(share: number, toward: Toward, bare = false): boolean {
    const { painter, sheets, laid } = this;
    const frame = this.frame();
    if (!this.ready || !painter || painter.lost || !sheets || !laid || !frame) return false;
    const sheet = sheets[toward];
    const front = frontAt(sheet, share);
    const ratio = this.canvas.width / laid.region.width;
    painter.paint(
      {
        toward,
        sheet,
        front,
        share,
        edge: edgeOf(sheet),
        trail: trailOf(sheet),
        ratio,
        art: {
          x: laid.art.x * ratio,
          y: laid.art.y * ratio,
          width: laid.art.width * ratio,
          height: laid.art.height * ratio,
        },
        paper: this.paper,
        // Painted through, the layer the Turn leaves is the room's own to show.
        leaving: toward === 'night' ? 'ink' : 'light',
        film: 0,
        bare,
      },
      this.canvas.width,
      this.canvas.height,
    );
    if (!this.worn) {
      this.worn = true;
      this.words.measure(null, frame, null, {
        strips: (layer) =>
          frame.querySelectorAll<HTMLElement>(
            `[data-strip="${layer}"], [data-strip-room="${layer}"]`,
          ),
        shared: frame.querySelectorAll<HTMLElement>('[data-room-said]'),
        muted: '--room-muted',
      });
      frame.setAttribute('data-sheet-active', '');
      const strip = frame.querySelector<HTMLElement>('[data-strip]');
      const room = frame.getBoundingClientRect();
      const box = strip?.getBoundingClientRect();
      this.rule =
        strip && box
          ? {
              strip,
              x: box.left - room.left,
              y: box.top - room.top + 0.5,
              width: box.width,
              drawn: '',
            }
          : null;
    }
    const edge = edgeOf(sheet);
    // The sheet lies in the room's own pixels, and so do its words.
    const turned = (x: number, y: number) =>
      share <= 0 ? 0 : share >= 1 ? 1 : passed(sheetTime(sheet, x, y), front, edge);
    this.words.paint(turned, toward, toward === 'night' ? 'light' : 'ink');
    this.line(turned, toward);
    return true;
  }

  /**
   * The strip's hairline lies across the whole room: each stretch of it is drawn in the line of
   * the ground beneath, changing where the front stands on it, as the words' ink does.
   */
  private line(turned: (x: number, y: number) => number, toward: Toward) {
    const { rule } = this;
    if (!rule) return;
    const from: Toward = toward === 'night' ? 'paper' : 'night';
    const stops: string[] = [];
    let since = 0;
    let ground = turned(rule.x, rule.y) >= 0.5 ? toward : from;
    for (let x = RULE_STEP; x <= rule.width; x += RULE_STEP) {
      const next = turned(rule.x + x, rule.y) >= 0.5 ? toward : from;
      if (next === ground) continue;
      const at = x - RULE_STEP / 2;
      stops.push(`var(--room-line-${ground}) ${since}px ${at}px`);
      since = at;
      ground = next;
    }
    stops.push(`var(--room-line-${ground}) ${since}px`);
    // One stretch: the line of one ground from end to end.
    const drawn =
      stops.length > 1
        ? `linear-gradient(to right, ${stops.join(', ')}) 1`
        : `linear-gradient(var(--room-line-${ground}), var(--room-line-${ground})) 1`;
    if (rule.drawn === drawn) return;
    rule.drawn = drawn;
    rule.strip.style.borderImage = drawn;
  }

  /** The words go back to the strip's own rules; what the canvas shows stays as it is. */
  land() {
    if (!this.worn) return;
    this.worn = false;
    this.words.release();
    this.rule?.strip.style.removeProperty('border-image');
    this.rule = null;
    this.frame()?.removeAttribute('data-sheet-active');
  }

  /**
   * Release everything this instance made, but keep the context: the canvas may outlive the
   * instance, and a context lost on purpose would stay lost for the next one.
   */
  dispose() {
    this.disposed = true;
    this.ready = false;
    this.land();
    this.canvas.removeEventListener('webglcontextlost', this.lost);
    this.canvas.removeEventListener('webglcontextrestored', this.restored);
    this.painter?.dispose();
    this.painter = null;
    this.layer?.dispose();
    this.layer = null;
    this.sheets = null;
  }
}

/** What a travel paints with and asks of the room; the room's hook gives it, and a test can. */
export interface TravelRoom {
  /** The canvas's crossing, where the room has one. */
  crossing(): Pick<RoomCrossing, 'render' | 'land'> | null;
  /** The crossing readied: its maps, its painter, its sheets. */
  prepare(): Promise<boolean>;
  /** The sheets for the room as it stands, and what a Turn to an expression brings, if a still. */
  make(to: Expression, bare: boolean): Promise<boolean>;
  /**
   * What a Turn to an expression brings: its still, where the room will rest on it; its bare
   * ground, where the room will play its film from the start.
   */
  brings(to: Expression): 'still' | 'ground';
  /** The expression the room shows. */
  expression(): Expression;
  /** The room shows something that is not the work itself: a lens, the loupe. */
  plain(): boolean;
  /** The room stands where it will stay: its opening has ended. */
  steady(): boolean;
  /** The room is closing. */
  leaving(): boolean;
  /** Show or hide the canvas. */
  show(on: boolean): void;
  /** How long the front takes to cross the room, in milliseconds. */
  duration(): number;
}

interface Flight {
  to: Expression;
  toward: Toward;
  leaving: Expression;
  /** The Turn brings its ground alone: the arriving film will begin on it. */
  bare: boolean;
  /** How far the front has come, 0 to 1, and which way it is going. */
  share: number;
  direction: 1 | -1;
  last: number | null;
  frame: number;
  /** Whether the status bar has taken the ground the Turn brings. */
  themed: boolean;
  settle: ((outcome: RoomTurnOutcome) => void) | null;
  /** The wait for the change, once landed. */
  waiting: ReturnType<typeof setTimeout> | null;
}

const groundOf = (expression: Expression) => (expression === 'light' ? 'night' : 'paper');

/**
 * One Turn across the room at a time, at an even pace: the front's share of its way is the
 * Turn's share of its time. It answers the viewer, which owns the expression: `landed` when the
 * change is due, and nothing more once it has been taken back.
 */
export class RoomTravel implements RoomTurn {
  private flight: Flight | null = null;
  /** Each request's number: a newer one, or a Turn taken back, supersedes one still being readied. */
  private request = 0;
  /** The expression a request still being readied is for. */
  private wanted: Expression | null = null;

  constructor(private readonly room: TravelRoom) {}

  heading(): Expression | null {
    const { flight } = this;
    return flight && flight.direction > 0 ? flight.to : this.wanted;
  }

  async cross(to: Expression): Promise<RoomTurnOutcome> {
    if (!this.room.crossing()) return 'undrawn';
    const flight = this.flight;
    // A Turn taken back and asked for again goes on from where its front stands.
    if (flight && flight.to === to && !flight.settle) {
      this.request += 1;
      if (flight.waiting) clearTimeout(flight.waiting);
      flight.waiting = null;
      flight.direction = 1;
      return new Promise((resolve) => {
        flight.settle = resolve;
        if (!flight.frame) flight.frame = requestAnimationFrame(this.step);
      });
    }
    if (flight) this.end();
    const request = ++this.request;
    this.wanted = to;
    const stale = () => request !== this.request;
    const undrawn = (): RoomTurnOutcome => {
      this.wanted = null;
      return 'undrawn';
    };
    if (!(await within(this.room.prepare(), READY_MS))) return stale() ? 'called off' : undrawn();
    if (stale()) return 'called off';
    // A lens or the loupe is not the work: its change is made at once.
    if (this.room.plain()) {
      this.wanted = null;
      return 'landed';
    }
    // A room that is closing has no time for a crossing: the stage makes the change. One still
    // opening is worth the rest of its opening, and the Turn then crosses it as any other.
    if (this.room.leaving()) return undrawn();
    for (let waited = 0; !this.room.steady() && waited < OPEN_MS; waited += OPEN_STEP_MS) {
      await new Promise((resolve) => setTimeout(resolve, OPEN_STEP_MS));
      if (stale()) return 'called off';
    }
    if (!this.room.steady() || this.room.leaving()) return undrawn();
    const bare = this.room.brings(to) === 'ground';
    if (!(await within(this.room.make(to, bare), MAKE_MS)))
      return stale() ? 'called off' : undrawn();
    if (stale()) return 'called off';
    if (!this.room.steady() || this.room.leaving() || this.room.plain()) return undrawn();
    const leaving = this.room.expression();
    return new Promise((resolve) => {
      const next: Flight = {
        to,
        toward: groundOf(to),
        leaving,
        bare,
        share: 0,
        direction: 1,
        last: null,
        frame: 0,
        themed: false,
        settle: resolve,
        waiting: null,
      };
      this.flight = next;
      this.wanted = null;
      // The first frame is the room as it stands, painted before the canvas is shown.
      if (!this.paint(next)) return;
      this.room.show(true);
      next.frame = requestAnimationFrame(this.step);
    });
  }

  callOff() {
    this.request += 1;
    this.wanted = null;
    const { flight } = this;
    if (!flight) return;
    flight.settle?.('called off');
    flight.settle = null;
    if (flight.waiting) clearTimeout(flight.waiting);
    flight.waiting = null;
    flight.direction = -1;
    flight.last = null;
    if (!flight.frame) flight.frame = requestAnimationFrame(this.step);
  }

  /** One frame of the flight; false when it could not be painted, and the flight is over. */
  private paint(flight: Flight) {
    if (this.room.crossing()?.render(flight.share, flight.toward, flight.bare)) return true;
    // The canvas cannot paint (a lost context): a Turn on its way is the stage's to show.
    const settle = flight.settle;
    this.end();
    settle?.(flight.direction > 0 ? 'undrawn' : 'called off');
    return false;
  }

  private readonly step = (now: number) => {
    const { flight } = this;
    if (!flight) return;
    flight.frame = 0;
    const elapsed = flight.last === null ? 0 : now - flight.last;
    flight.last = now;
    const duration = Math.max(1, this.room.duration());
    flight.share = Math.min(1, Math.max(0, flight.share + (flight.direction * elapsed) / duration));
    if (!this.paint(flight)) return;
    // The status bar follows the front at its halfway point, there and back.
    const half = flight.share >= 0.5;
    if (half !== flight.themed) {
      flight.themed = half;
      setThemeColor(groundOf(half ? flight.to : flight.leaving));
    }
    if (flight.direction > 0 && flight.share >= 1) {
      // Landed: the change is due. The last frame stays until the room has made it.
      const settle = flight.settle;
      flight.settle = null;
      flight.waiting = setTimeout(() => this.end(), LAND_MS);
      settle?.('landed');
      return;
    }
    if (flight.direction < 0 && flight.share <= 0) {
      this.end();
      return;
    }
    flight.frame = requestAnimationFrame(this.step);
  };

  /**
   * The room shows `expression` now. True when that is the Turn this travel landed: its words are
   * the strip's own again, and the canvas waits only for the work to be painted beneath it
   * (`clear`).
   */
  landed(expression: Expression): boolean {
    const { flight } = this;
    if (!flight || flight.to !== expression || flight.share < 1 || flight.direction < 0)
      return false;
    if (flight.waiting) clearTimeout(flight.waiting);
    cancelAnimationFrame(flight.frame);
    this.flight = null;
    this.room.crossing()?.land();
    return true;
  }

  /** The work is painted beneath: the canvas goes, unless a new Turn has taken it. */
  clear() {
    if (!this.flight) this.room.show(false);
  }

  /** The flight is over where it stands: the words and the canvas go back. */
  private end() {
    const { flight } = this;
    this.flight = null;
    if (flight) {
      cancelAnimationFrame(flight.frame);
      if (flight.waiting) clearTimeout(flight.waiting);
    }
    this.room.crossing()?.land();
    this.room.show(false);
  }

  /**
   * The travel is over, whatever was on its way. `land` says the Turn in flight is made at once
   * (motion was stilled mid-way: the visitor's choice stands); otherwise it is taken back (the
   * room is closing).
   */
  stop(land = false) {
    this.request += 1;
    this.wanted = null;
    const settle = this.flight?.settle ?? null;
    const forward = (this.flight?.direction ?? -1) > 0;
    this.end();
    settle?.(land && forward ? 'landed' : 'called off');
  }
}

/** Resolves when the room's work can be shown: its image decoded, its film or poster arrived. */
function painted(frame: HTMLElement | null): Promise<void> {
  const media = frame?.querySelector<HTMLElement>('[data-room-media]');
  const frames = () =>
    new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  if (typeof HTMLImageElement !== 'undefined' && media instanceof HTMLImageElement)
    return within(
      media.decode().then(
        () => true,
        () => true,
      ),
      PAINT_MS,
    ).then(frames);
  if (typeof HTMLVideoElement !== 'undefined' && media instanceof HTMLVideoElement) {
    // A film begins on the ground the Turn brought: the canvas holds that ground until the
    // film's first frame is there to take its place. Past the wait the film's poster stands.
    if (media.readyState >= 2) return frames();
    const arrived = new Promise<boolean>((resolve) =>
      media.addEventListener('loadeddata', () => resolve(true), { once: true }),
    );
    return within(arrived, FILM_MS).then(frames);
  }
  return frames();
}

/**
 * The room's crossing, for one open room. Prepared at idle once the room is open; while it is
 * readied the viewer's `turnRef` holds the room's Turn, and each Turn asked of it is drawn here.
 */
export function useRoomCrossing({
  frame,
  ink,
  light,
  expression,
  enabled,
  plain,
  paper,
  still,
  steady,
  leaving,
  brings,
  turnRef,
}: {
  /** The room: its ground, its work and its strip. */
  frame: RefObject<HTMLElement | null>;
  ink?: ArtInterpretation;
  light?: ArtInterpretation;
  /** The expression the room shows. */
  expression: string;
  /** Both maps are bound and crossings travel (not reduced, paused or hushed). */
  enabled: boolean;
  /** The room shows something that is not the work itself. */
  plain: boolean;
  /** The Ink sheet's own tone. */
  paper: string;
  /** The still as the room asks for it. */
  still: (media: ArtInterpretation) => StillRequest | undefined;
  /** The room stands where it will stay: its opening has ended. */
  steady: () => boolean;
  /** The room is closing. */
  leaving: () => boolean;
  /** What a Turn to an expression brings: its still, or its bare ground for its film to begin on. */
  brings: (to: Expression) => 'still' | 'ground';
  /** Where the viewer finds the room's Turn. */
  turnRef?: RefObject<RoomTurn | null>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const crossing = useRef<RoomCrossing | null>(null);
  const travel = useRef<RoomTravel | null>(null);
  /** The room as it is on the latest render, for a travel that outlives many. */
  const latest = useRef({ ink, light, expression, plain, still, steady, leaving, brings });
  useEffect(() => {
    latest.current = { ink, light, expression, plain, still, steady, leaving, brings };
  });

  useEffect(() => {
    const node = canvas.current;
    const room = frame.current;
    if (!enabled || !node || !ink?.arrival || !light?.arrival) return;
    let cancelled = false;
    const instance = new RoomCrossing(
      node,
      () => frame.current,
      rgb(paper),
      () => {
        node.removeAttribute('data-ready');
        // A Turn on its way when the context was lost is the stage's to show.
        travel.current?.stop(true);
      },
    );
    crossing.current = instance;
    const media = () => {
      const { ink: inkNow, light: lightNow } = latest.current;
      return inkNow && lightNow ? { ink: inkNow, light: lightNow } : null;
    };
    const controller = new RoomTravel({
      crossing: () => (crossing.current === instance ? instance : null),
      prepare: () => {
        const now = media();
        return now ? instance.prepare(now.ink, now.light) : Promise.resolve(false);
      },
      make: (to, bare) => {
        const now = media();
        return now
          ? instance.make(to === 'ink' ? now.ink : now.light, latest.current.still, bare)
          : Promise.resolve(false);
      },
      brings: (to) => latest.current.brings(to),
      expression: () => (latest.current.expression === 'light' ? 'light' : 'ink'),
      plain: () => latest.current.plain,
      steady: () => latest.current.steady(),
      leaving: () => latest.current.leaving(),
      show: (on) => {
        if (on) node.setAttribute('data-active', '');
        else node.removeAttribute('data-active');
      },
      duration: () => tokenMs(document.documentElement, '--t-cross', 2000),
    });
    travel.current = controller;
    if (turnRef) turnRef.current = controller;
    const start = () => {
      if (cancelled) return;
      // Prepared, the room's sheet says so on its canvas, as the page's says so on the document
      // (data-crossing): until then a Turn asked for is the stage's own to show.
      void instance.prepare(ink, light).then((ok) => {
        if (ok && !cancelled && crossing.current === instance) node.setAttribute('data-ready', '');
      });
    };
    // Whichever scheduler took the idle start is the one that may cancel it. Each is called
    // bare: a browser refuses either with any other receiver than the window.
    let cancelIdle: () => void;
    if (typeof requestIdleCallback === 'function') {
      const handle = requestIdleCallback(start, { timeout: 1500 });
      cancelIdle = () => cancelIdleCallback(handle);
    } else {
      const handle = window.setTimeout(start, 400);
      cancelIdle = () => window.clearTimeout(handle);
    }
    node.addEventListener('webglcontextrestored', start);
    return () => {
      cancelled = true;
      cancelIdle();
      node.removeEventListener('webglcontextrestored', start);
      node.removeAttribute('data-ready');
      // Motion stilled while the room stays open lands a Turn in flight at once; a room that is
      // going takes it back.
      controller.stop(!!room?.isConnected);
      if (turnRef?.current === controller) turnRef.current = null;
      if (travel.current === controller) travel.current = null;
      instance.dispose();
      if (crossing.current === instance) crossing.current = null;
    };
  }, [enabled, ink, light, paper, frame, turnRef]);

  // The room is gone: its canvas is no one's, and its context is given back now rather than when
  // the browser next collects it. (A browser keeps only so many contexts alive, and takes the
  // oldest away: a room opened many times must not cost the page its own.) Only a canvas that
  // has left the page: effects are also taken down and put back with the room still standing
  // (Strict Mode, an Activity hidden and shown), and a context lost on purpose stays lost.
  useEffect(() => {
    const node = canvas.current;
    return () => {
      setTimeout(() => {
        if (!node || node.isConnected || typeof node.getContext !== 'function') return;
        try {
          node.getContext('webgl')?.getExtension('WEBGL_lose_context')?.loseContext();
        } catch {
          /* A canvas that never had a context has none to give back. */
        }
      }, 0);
    };
  }, []);

  // The change a Turn asked for has been made: the strip's words are its own again in the same
  // frame, and the canvas goes once the work is painted beneath it.
  useLayoutEffect(() => {
    const controller = travel.current;
    if (!controller?.landed(expression === 'light' ? 'light' : 'ink')) return;
    let waiting = true;
    void painted(frame.current).then(() => {
      if (!waiting) return;
      waiting = false;
      controller.clear();
    });
    return () => {
      if (waiting) controller.clear();
      waiting = false;
    };
  }, [expression, frame]);

  /** The room has stopped moving (its opening has ended): sheets for it as it stands are laid. */
  const settled = useCallback(() => crossing.current?.settle(), []);

  return { canvas, settled };
}
