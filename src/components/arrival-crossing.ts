import { useEffect, useEffectEvent, useRef, type RefObject } from 'react';
import { rungFor, twinOf, type ArtInterpretation, type Expression } from '@/lib/art/types';
import { travelled, type Rgb, type Toward } from '@/lib/crossing/material';
import {
  edgeOf,
  frontAt,
  passed,
  sheetTime,
  trailOf,
  type Box,
  type Maps,
  type Sheet,
  type Sheets,
} from '@/lib/crossing/sheet';
import { invertEasing, parseEasing } from '@/lib/crossing/timing';
import { paintGround } from './sheet-grounds';
import { SheetLayer } from './sheet-layer';
import { SheetPainter } from './sheet-painter';
import { close, load, readMap, readable, rgb, snapshot } from './sheet-pictures';
import { SheetWords, paintsNothing } from './sheet-words';
import type { SeamController } from './turn';

/*
  The crossing in the order the work was made: one sheet, turned by one front.

  Over the whole of a work's first screen (the plate, the walls beside it and the strip beneath
  it) one canvas paints the two grounds and the two published stills, or the film the departing
  layer is playing (sheet-painter.ts). Where the front stands is read from one field, the sheet
  (src/lib/crossing/sheet.ts): on the work it is the work's own order, Light where its film first
  drew it and Ink where its film came to rest, and past the work's edge it goes on at the
  ground's own pace. The running head above and the page beyond read the same field for their
  own grounds (sheet-grounds.ts), and every word of the head, the strip and the page takes the
  type of the ground beneath it (sheet-words.ts).

  At the front the ground changes, paper to night or night to paper, across a soft edge a few
  pixels wide; the two grounds are never mixed anywhere else. The bodies stay where they are,
  for the stills share one frame, and what they are made of changes as the front passes
  (src/lib/crossing/material.ts). At either end of a Turn the canvas paints the published still
  itself.

  Every Turn is drawn this way: the word and the keys, a finger across the plate, the Overture's
  landing, and a plate resting partly under its wing. This file is where the page meets the
  sheet: it measures the stage, asks for the sheets that fit it, and gives each frame to the
  painter, the grounds and the words.
*/

/** How the crossing reads the picture: the order it follows and the layer it leaves. */
type Reading = {
  toward: Toward;
  leaving: Expression;
  /**
   * A Turn that travels by time gives the share of its time for the share of its travel: the
   * seam moves on a curve, and the front keeps an even pace from the press to the last corner.
   */
  clock?: (travel: number) => number;
};
/** A stage and what the sheets must cover for it, in the stage's own pixels. */
interface Layout {
  region: Box;
  art: Box;
}

/** The head's own ground is painted this many CSS pixels to a cell, and smoothed by the browser. */
const HEAD_CELL = 2;
/** The page beyond the stage is wider and plainer: its cells are larger. */
const PAGE_CELL = 4;
/** A sheet is laid this much deeper than its stage, so a strip that grows a line needs no new one. */
const SPARE = 96;
/** The page beyond the stage is looked at on a grid this coarse, once a Turn. */
const LOOK = 48;

const half = (value: number) => Math.round(value * 2) / 2;
const sameBox = (a: Box, b: Box) =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
/** Whether sheets laid for one layout serve another: the same work in the same place, and no shallower. */
const serves = (laid: Layout, layout: Layout) =>
  sameBox(laid.art, layout.art) &&
  laid.region.x === layout.region.x &&
  laid.region.y === layout.region.y &&
  laid.region.width === layout.region.width &&
  laid.region.height >= layout.region.height;
/** A layout as its sheets are asked for: a little deeper than its stage. */
const spared = (layout: Layout): Layout => ({
  art: layout.art,
  region: { ...layout.region, height: layout.region.height + SPARE },
});

export class ArrivalCrossing {
  private painter: SheetPainter | null = null;
  private layer: SheetLayer | null = null;
  /** The sheet for each ground a Turn can bring, and the layout they were laid for. */
  private sheets: Sheets | null = null;
  private laid: Layout | null = null;
  /** The layout sheets have been asked for, so a frame does not ask again. */
  private asked: Layout | null = null;
  /** The sheet's own tone, as 0–1 channels: the paper wall beyond the work. */
  private paper: Rgb = [0, 0, 0];
  /** The page's own paper, beyond the sheet. */
  private pagePaper: Rgb = [0, 0, 0];
  /** This frame's stage and head, in viewport pixels. */
  private view: { stage: DOMRect; head: DOMRect | null } | null = null;
  private readonly words = new SheetWords();
  /** The stage, the head and the words wear the sheet while the crossing paints. */
  private worn = false;
  /** Whether the room's own ground changes with the Turn in flight, read as it begins. */
  private pageTurns = false;
  /** How far the front must go for the bare page the screen shows, and where that was read. */
  private reached: { sheet: Sheet; scroll: number; time: number } | null = null;
  private preparing: Promise<boolean> | null = null;
  /** Each preparation's number: one overtaken by a lost context or a newer one builds nothing. */
  private attempt = 0;
  private disposed = false;
  ready = false;

  private readonly canvas: HTMLCanvasElement;
  private readonly container: () => HTMLElement | null;
  private readonly head: () => HTMLElement | null;
  private readonly onLost: () => void;
  private readonly onLaid: () => void;
  private readonly lost = (event: Event) => {
    // The browser took the context back: stand down now, and be prepared again on its return.
    event.preventDefault();
    this.attempt += 1;
    this.ready = false;
    this.preparing = null;
    this.painter = null;
    this.release();
    this.onLost();
  };
  /** A preparation tried while the context was lost failed for that reason alone. */
  private readonly restored = () => {
    this.preparing = null;
  };

  constructor(
    canvas: HTMLCanvasElement,
    container: () => HTMLElement | null,
    {
      head = () => document.querySelector<HTMLElement>('.site-header'),
      onLost = () => {},
      onLaid = () => {},
    }: { head?: () => HTMLElement | null; onLost?: () => void; onLaid?: () => void } = {},
  ) {
    this.canvas = canvas;
    this.container = container;
    this.head = head;
    this.onLost = onLost;
    this.onLaid = onLaid;
    canvas.addEventListener('webglcontextlost', this.lost);
    canvas.addEventListener('webglcontextrestored', this.restored);
  }

  /**
   * Load both maps and both stills, compile the painter and lay the sheets for the stage as it
   * stands. Resolves false when this browser cannot cross this way (no WebGL, a lost context,
   * a map or still missing), in which case the straight seam stands.
   */
  prepare(ink: ArtInterpretation, light: ArtInterpretation): Promise<boolean> {
    this.preparing ??= this.load(ink, light).catch(() => false);
    return this.preparing;
  }

  private async load(ink: ArtInterpretation, light: ArtInterpretation): Promise<boolean> {
    if (!ink.arrival || !light.arrival || this.disposed) return false;
    const attempt = ++this.attempt;
    // Asked first: a browser without WebGL loads neither map.
    if (!SheetPainter.offered(this.canvas)) return false;
    const container = this.container();
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const wide = ratio * (container?.clientWidth ?? 1280);
    // The work's own width on the canvas, in device pixels, as the plate lays it now.
    const work =
      ratio *
      (container?.querySelector('[data-layer="ink"] .art-media')?.getBoundingClientRect().width ??
        0);
    const still = async (interpretation: ArtInterpretation) => {
      // The sharpest image the plate already shows, when this page may read it; the inline
      // preview is never enough, so a smaller one waits for the work's own rung.
      const shown = [
        ...(container?.querySelectorAll<HTMLImageElement>(
          `[data-layer="${interpretation.id}"] .art-media img`,
        ) ?? []),
      ]
        .filter(readable)
        .sort((a, b) => b.naturalWidth - a.naturalWidth)[0];
      if (shown && shown.naturalWidth >= Math.min(1280, wide)) return snapshot(shown, work);
      const rung = rungFor(interpretation.rungs, Math.min(1920, wide));
      if (!rung) throw new Error('no readable still');
      return snapshot(await load(rung.src), work);
    };
    const stills = [still(ink), still(light)] as const;
    const [inkStill, lightStill, mapI, mapL] = await Promise.all([
      ...stills,
      load(ink.arrival.src),
      load(light.arrival.src),
    ]).catch((failure: unknown) => {
      // A still that did arrive is let go with the rest.
      for (const pending of stills) void pending.then(close, () => {});
      throw failure;
    });
    try {
      // Disposed, lost or overtaken while the images came: nothing is built for no one.
      const current = () => !this.disposed && attempt === this.attempt;
      if (!current()) return false;
      const inkMap = readMap(mapI);
      const lightMap = readMap(mapL);
      if (
        !inkMap ||
        !lightMap ||
        inkMap.width !== lightMap.width ||
        inkMap.height !== lightMap.height
      )
        return false;
      const painter = SheetPainter.on(this.canvas);
      if (!painter) return false;
      painter.stills(inkStill, lightStill);
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
      // The sheets are laid now, while nothing waits on them. A stage that cannot be measured
      // yet (a hidden layer) has them laid when it first can be.
      const layout = this.measure();
      if (layout) await this.lay(layout);
      if (!current() || painter.lost) return false;
      this.ready = true;
      return true;
    } finally {
      // Uploaded once: the textures are the painter's own copies from here on.
      close(inkStill);
      close(lightStill);
    }
  }

  /** Ask for the sheets of a layout, a little deeper than it needs, and take them when they come. */
  private lay(layout: Layout) {
    const { layer } = this;
    if (!layer) return Promise.resolve();
    const asked = spared(layout);
    this.asked = asked;
    return layer.lay(asked.region, asked.art).then((sheets) => {
      // Null: a newer layout was asked for meanwhile, and its answer is on its way.
      if (!sheets || this.disposed || !this.painter || this.painter.lost) return;
      this.painter.lay(sheets);
      this.sheets = sheets;
      this.laid = asked;
      this.reached = null;
      this.onLaid();
    });
  }

  /**
   * Fit the canvas over the whole stage (both layers' screens: plate, walls and strip) and find
   * the work inside it. Null when the plate is not laid out (a hidden layer, a collapsed screen).
   */
  private measure(): Layout | null {
    const container = this.container();
    if (!container) return null;
    const media = container.querySelector<HTMLElement>('[data-layer="ink"] .plate .art-media');
    if (!media) return null;
    const stage = container.getBoundingClientRect();
    const work = media.getBoundingClientRect();
    if (stage.width < 2 || stage.height < 2 || work.width < 2) return null;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.round(stage.width * ratio);
    const height = Math.round(stage.height * ratio);
    Object.assign(this.canvas.style, {
      left: '0px',
      top: '0px',
      width: `${stage.width}px`,
      height: `${stage.height}px`,
    });
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    const header = this.head()?.getBoundingClientRect();
    const head = header && header.width >= 1 && header.height >= 1 ? header : null;
    this.view = { stage, head };
    const screen = container.querySelector<HTMLElement>('[data-layer="ink"] [data-plate-ground]');
    if (screen) this.paper = rgb(getComputedStyle(screen).backgroundColor);
    // The sheet covers the stage and a head's height above it, in the stage's own pixels: at
    // the top of the page the running head lies there, and scrolled it lies over the stage.
    const rise = head ? half(head.height) : 0;
    return {
      region: { x: 0, y: -rise, width: half(stage.width), height: half(stage.height) + rise },
      art: {
        x: half(work.left - stage.left),
        y: half(work.top - stage.top),
        width: half(work.width),
        height: half(work.height),
      },
    };
  }

  /**
   * Whether a frame can be painted now: the stage can be measured and the sheets fit it. Where
   * they do not (a new width, a strip grown past its spare), sheets that do are asked for.
   */
  fits(): boolean {
    if (!this.ready || !this.painter || this.painter.lost) return false;
    const layout = this.measure();
    if (!layout) return false;
    if (this.laid && this.sheets && serves(this.laid, layout)) return true;
    if (!this.asked || !serves(this.asked, layout)) void this.lay(layout);
    return false;
  }

  /**
   * The frame the departing layer's film is showing, given to the painter, and how much of the
   * layer it is: the film's own opacity, since the page fades a film in over its still and out
   * again. A film that begins to fade in mid-Turn then comes in as gradually on the canvas as on
   * the page. Zero where the layer shows its still (or a frame this canvas may not read).
   */
  private film(expression: Expression): number {
    const video = this.container()?.querySelector<HTMLVideoElement>(
      `[data-layer="${expression}"] .art-media video`,
    );
    if (!this.painter || !video || video.readyState < 2 || video.ended || video.currentTime === 0)
      return 0;
    const shown = Number(getComputedStyle(video).opacity);
    if (!(shown > 0) || !this.painter.film(video)) return 0;
    return Math.min(1, shown);
  }

  /**
   * Paint the sheet at a seam position. Toward night the front follows the Light film's order;
   * toward paper the Ink film's. The stage's canvas, the head's and the page's grounds and every
   * word are set from the one field in the one frame. False when it cannot be painted, so the
   * straight seam shows.
   */
  render(seam: number, { toward, leaving, clock }: Reading) {
    if (!this.fits() || !this.sheets || !this.view || !this.painter) return false;
    const sheet = this.sheets[toward];
    if (!this.worn) this.pageTurns = document.documentElement.getAttribute('data-room') !== toward;
    const travel = travelled(seam, toward);
    // The ends are the ends exactly, whatever a clock rounds them to.
    const share = travel <= 0 ? 0 : travel >= 1 ? 1 : clock ? clock(travel) : travel;
    const front = frontAt(sheet, share, this.reach(sheet));
    const ratio = this.canvas.width / this.view.stage.width;
    this.painter.paint(
      {
        toward,
        sheet,
        front,
        share,
        edge: edgeOf(sheet),
        trail: trailOf(sheet),
        ratio,
        art: {
          x: sheet.art.x * ratio,
          y: sheet.art.y * ratio,
          width: sheet.art.width * ratio,
          height: sheet.art.height * ratio,
        },
        paper: this.paper,
        leaving,
        film: this.film(leaving),
      },
      this.canvas.width,
      this.canvas.height,
    );
    this.chrome(sheet, front, share, toward);
    return true;
  }

  /**
   * The running head's ground, the page's ground and every word, from the same sheet in the
   * same frame as the stage.
   */
  private chrome(sheet: Sheet, front: number, share: number, toward: Toward) {
    const container = this.container();
    const view = this.view;
    if (!container || !view) return;
    const edge = edgeOf(sheet);
    /** How far the front has passed a point of the viewport: the sheet lies in the stage's pixels. */
    const turned = (x: number, y: number) =>
      share <= 0
        ? 0
        : share >= 1
          ? 1
          : passed(sheetTime(sheet, x - view.stage.left, y - view.stage.top), front, edge);
    const header = this.head();
    const page = this.pageShows();
    if (!this.worn) {
      this.worn = true;
      this.pagePaper = rgb(getComputedStyle(document.documentElement).getPropertyValue('--paper'));
      this.words.measure(
        header?.querySelector<HTMLElement>(':scope > .head-row') ?? null,
        container,
        page ? document.querySelector<HTMLElement>('main') : null,
      );
      container.setAttribute('data-sheet-active', '');
      header?.setAttribute('data-sheet-active', '');
    }
    this.words.paint(
      (x, y, anchor) =>
        anchor === 'head'
          ? turned((view.head?.left ?? 0) + x, (view.head?.top ?? 0) + y)
          : anchor === 'page'
            ? turned(x - window.scrollX, y - window.scrollY)
            : turned(view.stage.left + x, view.stage.top + y),
      toward,
      toward === 'night' ? 'light' : 'ink',
    );
    /** How much of the paper stands at a point: the ground the canvases paint. */
    const ground = (x: number, y: number) => (toward === 'night' ? 1 - turned(x, y) : turned(x, y));
    const headCanvas = header?.querySelector<HTMLCanvasElement>('canvas.head-sheet');
    if (headCanvas && view.head) paintGround(headCanvas, view.head, HEAD_CELL, this.paper, ground);
    const pageCanvas = document.querySelector<HTMLCanvasElement>('canvas.page-sheet');
    if (pageCanvas && page && paintGround(pageCanvas, page, PAGE_CELL, this.pagePaper, ground))
      document.documentElement.setAttribute('data-sheet-page', '');
    else document.documentElement.removeAttribute('data-sheet-page');
  }

  /**
   * The part of the viewport the stage does not cover, where the page beyond it turns with this
   * Turn; null when the stage fills the screen, or the room already stands on the ground the
   * Turn brings (the Overture's landing crosses the plate alone: the page opened on its ground).
   */
  private pageShows() {
    const view = this.view;
    if (!view || !this.pageTurns) return null;
    const top = view.head ? view.head.bottom : 0;
    const covered = view.stage.top <= top + 0.5 && view.stage.bottom >= window.innerHeight - 0.5;
    return covered
      ? null
      : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  }

  /**
   * The latest time of any bare ground the screen shows beyond the sheet. The page is looked at
   * once a Turn, and again when it has scrolled, on a coarse grid: a point counts where nothing
   * over it paints a ground of its own (a plate, a picture, a section on its own night), so the
   * front is not waited for where it could not be seen.
   */
  private reach(sheet: Sheet) {
    const view = this.view;
    if (!view || !this.pageShows()) return sheet.last;
    const scroll = window.scrollY;
    if (this.reached?.sheet === sheet && Math.abs(this.reached.scroll - scroll) < LOOK)
      return this.reached.time;
    const page = document.querySelector('main');
    const header = this.head();
    const container = this.container();
    const bare = (element: Element | null): boolean => {
      if (!element || !page?.contains(element)) return false;
      for (let node: Element | null = element; node && node !== page; node = node.parentElement) {
        if (node === container || node === header) return false;
        if (/^(IMG|VIDEO|CANVAS|PICTURE)$/.test(node.tagName)) return false;
        if (!paintsNothing(getComputedStyle(node).backgroundColor)) return false;
      }
      return true;
    };
    let latest = sheet.last;
    if (typeof document.elementFromPoint !== 'function') return latest;
    for (let y = LOOK / 2; y < window.innerHeight; y += LOOK)
      for (let x = LOOK / 2; x < window.innerWidth; x += LOOK)
        if (bare(document.elementFromPoint(x, y)))
          latest = Math.max(
            latest,
            sheetTime(sheet, x - view.stage.left, y - view.stage.top) + sheet.pace * LOOK,
          );
    this.reached = { sheet, scroll, time: latest };
    return latest;
  }

  /** The running head, the strip, the page and the words go back to their own rules. */
  release() {
    if (!this.worn) return;
    this.worn = false;
    this.reached = null;
    this.words.release();
    this.container()?.removeAttribute('data-sheet-active');
    this.head()?.removeAttribute('data-sheet-active');
    document.documentElement.removeAttribute('data-sheet-page');
  }

  /**
   * Release everything this instance made, but keep the context: the canvas outlives the
   * instance, and a context lost on purpose would stay lost for the next one.
   */
  dispose() {
    this.disposed = true;
    this.ready = false;
    this.release();
    this.canvas.removeEventListener('webglcontextlost', this.lost);
    this.canvas.removeEventListener('webglcontextrestored', this.restored);
    this.painter?.dispose();
    this.painter = null;
    this.layer?.dispose();
    this.layer = null;
    this.sheets = null;
  }
}

/**
 * The crossing for one viewer. Prepared at idle once the plate has settled; while it is ready,
 * <html data-crossing="arrival"> lets the seam take the crossing's longer token.
 *
 * Each Turn is the crossing's only if it could be painted when the Turn began, and it is read
 * once, then: the order it follows and the layer it leaves hold until the Turn ends, so a
 * reversal, a spring-back, a finger or the commit itself never switches pictures mid-way. The
 * order is that of the expression arriving: Light's toward the night, Ink's toward the paper,
 * except where a plate rests partly under its wing, which is drawn in the twin's order and so
 * retraced in it: the night wing's in Light's, the paper wing's in Ink's. Between Turns, inside
 * the wing, the crossing paints wherever the hand has drawn the twin.
 */
export function useArrivalCrossing({
  seam,
  ink,
  light,
  expression,
  twin = 'light',
  enabled,
  wingSeam,
}: {
  seam: SeamController;
  ink?: ArtInterpretation;
  light?: ArtInterpretation;
  expression: string;
  /** The expression the wing hangs beneath the plate: Light (the night wing) or Ink (the paper wing). */
  twin?: Expression;
  /** Both maps are bound and crossings travel (not reduced, paused or hushed). */
  enabled: boolean;
  /** Where the plate rests inside its wing (wherever the hand has drawn the twin), else null. */
  wingSeam: () => number | null;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const crossing = useRef<ArrivalCrossing | null>(null);
  /** The plate's rest inside the wing while the twin is partly drawn there; null otherwise. */
  const partial = useEffectEvent(() => {
    const value = wingSeam();
    return value !== null && value > 0 && value < 100 ? value : null;
  });
  const reading = useEffectEvent((): Reading => {
    const leaving: Expression = expression === 'light' ? 'light' : 'ink';
    // Inside a partly drawn wing every crossing follows the twin's order; elsewhere the
    // expression arriving sets it.
    const arriving = leaving !== twin || partial() !== null ? twin : twinOf(leaving);
    const toward = arriving === 'light' ? 'night' : 'paper';
    // A finger and the wing place the seam themselves; time places it on a curve.
    const root = document.documentElement;
    const mode = root.getAttribute('data-turning');
    if (mode !== 'time' && mode !== 'overture') return { toward, leaving };
    const curve = getComputedStyle(root).getPropertyValue(
      mode === 'overture' ? '--ease-overture' : '--ease-turn',
    );
    return { toward, leaving, clock: invertEasing(parseEasing(curve)) };
  });
  /** Between Turns: the wing's twin over the plate, the only seam that rests partway. */
  const resting = useEffectEvent(() => (expression === twin ? null : partial()));

  useEffect(() => {
    const node = canvas.current;
    if (!enabled || !node || !ink?.arrival || !light?.arrival) return;
    const root = document.documentElement;
    let cancelled = false;
    let frame = 0;
    let turning = root.hasAttribute('data-turning');
    /** The Turn in flight as the crossing reads it; null while it is the straight seam's. */
    let turn: Reading | null = null;
    const hide = () => {
      node.removeAttribute('data-active');
      instance.release();
    };
    const paint = () => {
      frame = 0;
      if (!instance.ready) return hide();
      const value = turning ? turn && seam.current() : resting();
      const shown = value !== null && instance.render(value, turn ?? reading());
      if (shown) node.setAttribute('data-active', '');
      else hide();
      if (turn) frame = requestAnimationFrame(paint);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const instance = new ArrivalCrossing(node, () => node.parentElement, {
      onLost: () => {
        root.removeAttribute('data-crossing');
        turn = null;
        hide();
      },
      // Sheets for a new layout have come: a plate resting under its wing is drawn again.
      onLaid: () => {
        if (!cancelled && instance.ready) schedule();
      },
    });
    crossing.current = instance;
    const start = () => {
      void instance.prepare(ink, light).then((ok) => {
        if (cancelled || !ok) return;
        root.setAttribute('data-crossing', 'arrival');
        // Ready inside the wing: draw the night the hand has already drawn.
        schedule();
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
    const restored = () => {
      if (!cancelled) start();
    };
    node.addEventListener('webglcontextrestored', restored);
    const watch = new MutationObserver(() => {
      const now = root.hasAttribute('data-turning');
      if (now === turning) return;
      turning = now;
      // A Turn begins: the crossing's if it can be painted now, read once. A Turn ends: the
      // seam's own rules take the head and the strip back at once.
      turn = now && instance.fits() ? reading() : null;
      if (!now) instance.release();
      cancelAnimationFrame(frame);
      frame = 0;
      schedule();
    });
    watch.observe(root, { attributes: true, attributeFilter: ['data-turning'] });
    // A new width or a taller strip needs new sheets: they are asked for as the stage changes,
    // so that the next Turn finds them laid.
    const refit = () => {
      if (!turning) instance.fits();
      schedule();
    };
    const sized =
      typeof ResizeObserver === 'function' && node.parentElement ? new ResizeObserver(refit) : null;
    if (node.parentElement) sized?.observe(node.parentElement);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', refit);
    return () => {
      cancelled = true;
      cancelIdle();
      cancelAnimationFrame(frame);
      watch.disconnect();
      sized?.disconnect();
      node.removeEventListener('webglcontextrestored', restored);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', refit);
      root.removeAttribute('data-crossing');
      hide();
      instance.dispose();
      if (crossing.current === instance) crossing.current = null;
    };
  }, [enabled, ink, light, seam]);

  /** Wait a moment for a crossing still being prepared; a Turn never waits longer. */
  const whenReady = (within: number) => {
    const instance = crossing.current;
    if (!instance || instance.ready || !ink || !light) return Promise.resolve();
    return Promise.race([
      instance.prepare(ink, light).then((ok) => {
        // Only the instance still in place may mark the page: a disposed one may still resolve.
        if (ok && crossing.current === instance)
          document.documentElement.setAttribute('data-crossing', 'arrival');
      }),
      new Promise<void>((resolve) => setTimeout(resolve, within)),
    ]);
  };

  return { canvas: canvas as RefObject<HTMLCanvasElement | null>, whenReady };
}
