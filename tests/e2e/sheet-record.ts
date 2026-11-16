import type { Page } from './fixtures';

/*
  The Turn drawn as one sheet, read back in the page itself, frame by frame.

  One field says where the front stands (src/lib/crossing/sheet.ts), and three things are drawn
  from it on every frame: the stage's canvas, the canvases behind the running head and the page,
  and the ink of every word. These helpers read all three as the page paints them and say whether
  they agree: where each canvas shows the front, what ground lies under each glyph, and what ink
  that glyph wears. A screenshot would take a second where WebGL draws without a GPU, and the
  front would have moved on; the page's own record misses nothing it painted.
*/

/** What the page kept of a Turn, and what it found. */
export type SheetRecord = {
  /** Frames kept while the sheet was painted. */
  frames: number;
  /**
   * Of the bare ground the screen showed, the largest share that was neither ground on any one
   * frame: a front leaves a few pixels in a hundred mid-way, a ground faded as one leaves all.
   */
  greyest: number;
  /** Frames on which both grounds stood at once, each over a tenth of the bare ground. */
  fronts: number;
  /** Glyphs checked against the ground the canvas showed beneath them, over all frames. */
  glyphs: number;
  /** Glyphs that wore the ink of the other ground: where, on which frame, and what it said. */
  misinked: string[];
  /** Words whose fill changed inside a glyph, so that the glyph was of two colours. */
  split: string[];
  /**
   * Words of two strips set in one place on one frame: where the two expressions' strips lay their
   * words differently, a word that arrives may not be set until the word it would lie across has gone.
   */
  shared: string[];
  /** Where the head's canvas and the stage's put the front on the line between them, in pixels apart. */
  seams: number[];
  /** The same for the page's canvas and the stage's, where the page beyond the stage turned. */
  pageSeams: number[];
  /** What the sheet left set on the page when the record was read. */
  left: string[];
  /**
   * The Turn's course: at each frame kept, the time and the share of the bare ground the front
   * had passed; and the time a key was first let go, if one was.
   */
  course: [number, number][];
  released: number | null;
};

type Scope = 'page' | 'room';

/**
 * Begin keeping a Turn's frames in the page: on the work's own page, or in its viewing room.
 * `toward` is the ground the Turn brings. Called once the page rests, before the Turn is asked for.
 */
export async function recordSheet(
  page: Page,
  { scope, toward, every = 60 }: { scope: Scope; toward: 'night' | 'paper'; every?: number },
) {
  await page.evaluate(
    ({ scope, toward, every }) => {
      type Glyph = {
        unit: HTMLElement;
        /** Its middle, in the viewport. */
        x: number;
        y: number;
        /** Its place along its word's lines laid end to end. */
        from: number;
        to: number;
        /** Which canvas lies beneath it. */
        on: 'stage' | 'head';
        said: string;
      };
      type Kept = {
        /** When the frame was kept, by the page's own clock. */
        at: number;
        /** How far the front has passed each probe of bare ground, 0 to 1. */
        probes: Float32Array;
        misinked: string[];
        split: string[];
        shared: string[];
        glyphs: number;
        /**
         * Rows of the canvases, to find the front on, three at a time: the head's three lowest
         * and the stage's three highest, either side of the line between them; and, in the
         * strip, three of the page's rows with the stage's nearest each.
         */
        head: Line[];
        stageAtHead: Line[];
        page: Line[];
        stageAtPage: Line[];
        /** Where the head's line lies on this frame. */
        seam: number;
      };
      /** One row of a canvas: its middle's height in the viewport, where it begins, how wide it is shown, and its luma by pixel. */
      type Line = { y: number; left: number; span: number; values: Float32Array };
      const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const channels = (colour: string) => (colour.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      const frame =
        scope === 'room'
          ? document.querySelector<HTMLElement>('dialog [data-material]')!
          : document.querySelector<HTMLElement>(
              '[data-artwork-stage="page"] canvas[class*="crossing"]',
            )!.parentElement!;
      const canvas = frame.querySelector<HTMLCanvasElement>(
        scope === 'room' ? 'canvas[class*="sheet"]' : 'canvas[class*="crossing"]',
      )!;
      const header = scope === 'page' ? document.querySelector<HTMLElement>('.site-header') : null;
      const headCanvas = header?.querySelector<HTMLCanvasElement>('canvas.head-sheet') ?? null;
      const pageCanvas =
        scope === 'page' ? document.querySelector<HTMLCanvasElement>('canvas.page-sheet') : null;
      // The sheet's own tone: the paper the canvases paint.
      const paperOf = (element: Element | null) => {
        const [r, g, b] = element ? channels(getComputedStyle(element).backgroundColor) : [];
        return luma(r ?? 241, g ?? 235, b ?? 223);
      };
      const paper =
        scope === 'room'
          ? (() => {
              // The room's ground in Ink, whichever expression it shows now.
              const probe = document.createElement('div');
              probe.style.cssText = 'position:absolute;width:0;height:0;';
              frame.appendChild(probe);
              probe.style.background =
                frame.getAttribute('data-material') === 'ink' ? 'var(--room-surface)' : '#f1ebdf';
              const value = paperOf(probe);
              probe.remove();
              return value;
            })()
          : paperOf(frame.querySelector('[data-layer="ink"] [data-plate-ground]'));
      /* Every glyph of every word the sheet turns, measured once, as the sheet measures them. */
      const glyphs: Glyph[] = [];
      const collect = (root: Element | null, on: Glyph['on']) => {
        if (!root) return;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const unit = node.parentElement;
          const text = (node as Text).data;
          if (!unit || !text.trim()) continue;
          const style = getComputedStyle(unit);
          const box = unit.getBoundingClientRect();
          if (box.width < 2 || box.height < 2 || style.visibility === 'hidden') continue;
          const lines = [...unit.getClientRects()];
          const range = document.createRange();
          let offset = 0;
          for (const character of text) {
            const start = offset;
            offset += character.length;
            if (!character.trim()) continue;
            range.setStart(node, start);
            range.setEnd(node, offset);
            const rect = range.getBoundingClientRect();
            if (rect.width < 0.5 || rect.height < 0.5) continue;
            const middle = rect.top + rect.height / 2;
            let before = 0;
            let line = lines[0];
            for (const candidate of lines) {
              if (middle >= candidate.top && middle <= candidate.bottom) {
                line = candidate;
                break;
              }
              before += candidate.width;
            }
            glyphs.push({
              unit,
              x: rect.left + rect.width / 2,
              y: middle,
              from: before + rect.left - line.left,
              to: before + rect.right - line.left,
              on,
              said: text.trim().slice(0, 24),
            });
          }
        }
      };
      if (scope === 'page') {
        collect(header?.querySelector(':scope > .head-row') ?? null, 'head');
        for (const strip of frame.querySelectorAll('[data-layer] .strip')) collect(strip, 'stage');
      } else {
        collect(frame.querySelector('[data-strip]'), 'stage');
        collect(frame.querySelector('[data-room-said]'), 'stage');
      }

      /*
        Words of different strips that would lie in one place, found once, since nothing moves
        while a Turn travels. A word is where its glyphs are: a set word by its text's own lines,
        a held word (drawn from an attribute, which no range can measure) by its lines' middles
        and its type's size. A control's box is taller than its word and says nothing here.
      */
      type Inked = { left: number; top: number; right: number; bottom: number };
      type Word = { unit: Element; said: string; boxes: Inked[] };
      const wordsOf = (root: Element): Word[] => {
        const found: Word[] = [];
        for (const held of root.querySelectorAll<HTMLElement>('[data-line]')) {
          const half = parseFloat(getComputedStyle(held).fontSize) * 0.6;
          const boxes = [...held.getClientRects()]
            .filter((line) => line.width >= 2 && line.height >= 2)
            .map((line) => {
              const middle = line.top + line.height / 2;
              return {
                left: line.left,
                right: line.right,
                top: middle - half,
                bottom: middle + half,
              };
            });
          if (boxes.length)
            found.push({ unit: held, said: held.getAttribute('data-line') ?? '', boxes });
        }
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const unit = node.parentElement;
          const text = (node as Text).data.trim();
          if (!unit || !text) continue;
          // A word kept for a screen reader alone is laid out and clipped to nothing: its text
          // has lines, and no one sees them.
          const seen = unit.getBoundingClientRect();
          if (seen.width < 2 || seen.height < 2) continue;
          range.selectNodeContents(node);
          const boxes = [...range.getClientRects()]
            .filter((line) => line.width >= 2 && line.height >= 2)
            .map(({ left, top, right, bottom }) => ({ left, top, right, bottom }));
          if (boxes.length) found.push({ unit, said: text.slice(0, 24), boxes });
        }
        return found;
      };
      const strips =
        scope === 'room'
          ? [...frame.querySelectorAll('[data-strip], [data-strip-room]')]
          : [...frame.querySelectorAll('[data-layer] .strip')];
      const stripWords = strips.map(wordsOf);
      const meet = (a: Inked, b: Inked) =>
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1.5 &&
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1.5;
      const pairs: [Word, Word][] = [];
      stripWords.forEach((words, index) => {
        for (const other of stripWords.slice(index + 1))
          for (const a of words)
            for (const b of other)
              if (a.boxes.some((box) => b.boxes.some((against) => meet(box, against))))
                pairs.push([a, b]);
      });
      /** Whether a word is set on this frame: nothing it stands in is taken out or unseen. */
      const set = (word: Word) => {
        if (!word.unit.isConnected || word.unit.closest('[data-sheet-out]')) return false;
        const style = getComputedStyle(word.unit);
        return style.visibility !== 'hidden' && style.opacity !== '0';
      };

      /* Probes of bare ground: the strip's own band of the stage, clear of every word. */
      const from = toward === 'night' ? 'paper' : 'night';
      const groundOfInk = (ink: string) =>
        /night-type|#b8b5ad/i.test(ink) ? 'night' : /paper-type|muted/i.test(ink) ? 'paper' : null;
      /** The ink a word wears at a place along its lines, and whether a glyph there is whole. */
      const inkAt = (unit: HTMLElement, glyph: Glyph) => {
        const fill = unit.hasAttribute('data-sheet-fill') ? unit.style.backgroundImage : '';
        if (!fill) return { ground: unit.getAttribute('data-sheet'), whole: true };
        const stops = fill
          .slice(fill.indexOf('to right,') + 9, fill.lastIndexOf(')'))
          .split(/,(?![^(]*\))/)
          .map((stop) => {
            const lengths = [...stop.matchAll(/(-?[\d.]+)px/g)].map((match) => Number(match[1]));
            return { ground: groundOfInk(stop), from: lengths[0] ?? 0, to: lengths[1] ?? Infinity };
          });
        const middle = (glyph.from + glyph.to) / 2;
        const stop = stops.find((candidate) => middle >= candidate.from && middle < candidate.to);
        // A stop that falls inside the glyph, clear of its edges, paints it in two colours.
        const whole = !stops.some(
          (candidate) => candidate.to > glyph.from + 0.75 && candidate.to < glyph.to - 0.75,
        );
        return { ground: stop?.ground ?? null, whole };
      };

      const gl = canvas.getContext('webgl')!;
      const kept: Kept[] = [];
      let last = -Infinity;
      const look = (now: number) => {
        if (state.stopped) return;
        requestAnimationFrame(look);
        if (!canvas.hasAttribute('data-active') || now - last < every) return;
        last = now;
        const box = frame.getBoundingClientRect();
        const ratio = canvas.width / box.width;
        // The whole canvas, read once: its rows run from the bottom up.
        const pixels = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        const at = (x: number, y: number) => {
          const column = Math.min(
            canvas.width - 1,
            Math.max(0, Math.round((x - box.left) * ratio)),
          );
          const row = Math.min(canvas.height - 1, Math.max(0, Math.round((y - box.top) * ratio)));
          return ((canvas.height - 1 - row) * canvas.width + column) * 4;
        };
        /** How far the front has passed a point of the stage's bare ground. */
        const passedOnStage = (x: number, y: number) => {
          const i = at(x, y);
          // Painted through, the room's canvas covers by as much as the front has passed.
          if (scope === 'room') return pixels[i + 3] / 255;
          const share = Math.min(1, luma(pixels[i], pixels[i + 1], pixels[i + 2]) / paper);
          return toward === 'night' ? 1 - share : share;
        };
        const head = headCanvas && headCanvas.width > 1 ? headCanvas : null;
        const headBox = head ? header!.getBoundingClientRect() : null;
        const headPixels = head
          ? head.getContext('2d')!.getImageData(0, 0, head.width, head.height).data
          : null;
        const passedOnHead = (x: number, y: number) => {
          if (!head || !headBox || !headPixels) return null;
          const column = Math.min(
            head.width - 1,
            Math.max(0, Math.floor(((x - headBox.left) / headBox.width) * head.width)),
          );
          const row = Math.min(
            head.height - 1,
            Math.max(0, Math.floor(((y - headBox.top) / headBox.height) * head.height)),
          );
          const i = (row * head.width + column) * 4;
          const share = Math.min(
            1,
            luma(headPixels[i], headPixels[i + 1], headPixels[i + 2]) / paper,
          );
          return toward === 'night' ? 1 - share : share;
        };

        const record: Kept = {
          at: now,
          probes: new Float32Array(0),
          misinked: [],
          split: [],
          shared: [],
          glyphs: 0,
          head: [],
          stageAtHead: [],
          page: [],
          stageAtPage: [],
          seam: box.top,
        };
        // The bare ground the screen shows: a grid over the strip's band and the head.
        const probes: number[] = [];
        const strip = frame.querySelector(
          scope === 'room' ? '[data-strip]' : '[data-layer-state="current"] .strip',
        );
        const band = strip?.getBoundingClientRect();
        if (band)
          for (let y = band.top + 3; y < Math.min(band.bottom, innerHeight) - 2; y += 6)
            for (let x = box.left + 3; x < box.right - 2; x += 6)
              if (y > box.top && y < box.bottom) probes.push(passedOnStage(x, y));
        if (head && headBox)
          for (let y = headBox.top + 3; y < headBox.bottom - 2; y += 6)
            for (let x = headBox.left + 3; x < headBox.right - 2; x += 6) {
              const passed = passedOnHead(x, y);
              if (passed !== null) probes.push(passed);
            }
        record.probes = Float32Array.from(probes);
        state.turned = probes.length
          ? probes.filter((passed) => passed >= 0.5).length / probes.length
          : 0;

        // Each glyph against the ground beneath it, while the words wear the sheet. (As a Turn
        // lands they are the page's own again a frame before the canvas goes.)
        const worn = frame.hasAttribute('data-sheet-active');
        for (const glyph of glyphs) {
          const { unit } = glyph;
          if (!worn || !unit.isConnected || unit.closest('[data-sheet-out]')) continue;
          const passed =
            glyph.on === 'head' ? passedOnHead(glyph.x, glyph.y) : passedOnStage(glyph.x, glyph.y);
          if (passed === null) continue;
          const { ground, whole } = inkAt(unit, glyph);
          if (!whole)
            record.split.push(`${glyph.said} @${Math.round(glyph.x)},${Math.round(glyph.y)}`);
          // On the soft edge either ink may stand: the canvas mixes the two grounds there.
          if (passed > 0.12 && passed < 0.88) continue;
          record.glyphs += 1;
          const beneath = passed >= 0.5 ? toward : from;
          if (ground !== beneath)
            record.misinked.push(
              `${glyph.said} @${Math.round(glyph.x)},${Math.round(glyph.y)}: ${ground} ink on ${beneath} (passed ${passed.toFixed(2)})`,
            );
        }
        // Two words of different strips that would lie in one place are never both set.
        if (worn)
          for (const [a, b] of pairs)
            if (set(a) && set(b)) record.shared.push(`"${a.said}" across "${b.said}"`);

        /** The stage's row nearest a height of the viewport: at its own middle, which is noted. */
        const stageLine = (y: number): Line => {
          const index = Math.min(
            canvas.height - 1,
            Math.max(0, Math.round((y - box.top) * ratio - 0.5)),
          );
          const values = new Float32Array(canvas.width);
          for (let column = 0; column < canvas.width; column++) {
            const i = ((canvas.height - 1 - index) * canvas.width + column) * 4;
            values[column] = luma(pixels[i], pixels[i + 1], pixels[i + 2]);
          }
          return { y: box.top + (index + 0.5) / ratio, left: box.left, span: box.width, values };
        };
        /** A row of cells of one of the grounds' canvases, laid over a box of the viewport. */
        const groundLine = (
          data: Uint8ClampedArray,
          cols: number,
          rows: number,
          row: number,
          over: { left: number; top: number; width: number; height: number },
        ): Line => {
          const values = new Float32Array(cols);
          for (let column = 0; column < cols; column++) {
            const i = (row * cols + column) * 4;
            values[column] = luma(data[i], data[i + 1], data[i + 2]);
          }
          return {
            y: over.top + ((row + 0.5) * over.height) / rows,
            left: over.left,
            span: over.width,
            values,
          };
        };
        // The line between the head and the stage: two rows of each, either side of it.
        if (
          head &&
          headBox &&
          headPixels &&
          scope === 'page' &&
          head.height > 3 &&
          Math.abs(headBox.bottom - box.top) < 0.75
        ) {
          record.head = [1, 2, 3].map((up) =>
            groundLine(headPixels, head.width, head.height, head.height - up, headBox),
          );
          record.stageAtHead = [1, 3, 5].map((down) => stageLine(box.top + down));
        }
        // The page beyond the stage, where it turns: its canvas lies behind the whole screen,
        // the stage's over it. In the strip, clear of the work, both show the same ground: two
        // rows of the page's cells there, and the stage's rows nearest each.
        if (pageCanvas && band && document.documentElement.hasAttribute('data-sheet-page')) {
          const screen = { left: 0, top: 0, width: innerWidth, height: innerHeight };
          const cell = innerHeight / pageCanvas.height;
          const data = pageCanvas
            .getContext('2d')!
            .getImageData(0, 0, pageCanvas.width, pageCanvas.height).data;
          for (const share of [0.2, 0.5, 0.8]) {
            const row = Math.floor((band.top + band.height * share) / cell);
            const from = (row + 0.5) * cell;
            const to = (row + 2.5) * cell;
            if (from <= box.top + 2 || to >= Math.min(box.bottom, innerHeight) - 2) continue;
            for (const r of [row, row + 1, row + 2]) {
              const line = groundLine(data, pageCanvas.width, pageCanvas.height, r, screen);
              record.page.push(line);
              record.stageAtPage.push(stageLine(line.y));
            }
          }
        }
        kept.push(record);
      };
      const state = {
        stopped: false,
        /** The share of the bare ground the front has passed, on the last frame kept. */
        turned: 0,
        /** When a key was first let go. */
        released: null as number | null,

        kept,
        frame,
        canvas,
        headWidth: () => headCanvas?.width ?? 0,
        pageWidth: () => pageCanvas?.width ?? 0,
        paper,
      };
      Object.assign(window, { __sheet: state });
      addEventListener('keyup', () => (state.released ??= performance.now()), { capture: true });
      requestAnimationFrame(look);
    },
    { scope, toward, every },
  );
}

/** Stop keeping frames, and say what was found. */
export function sheetRecorded(page: Page): Promise<SheetRecord> {
  return page.evaluate(() => {
    type Line = { y: number; left: number; span: number; values: Float32Array };
    type Kept = {
      at: number;
      probes: Float32Array;
      misinked: string[];
      split: string[];
      shared: string[];
      glyphs: number;
      head: Line[];
      stageAtHead: Line[];
      page: Line[];
      stageAtPage: Line[];
      seam: number;
    };
    const state = (
      window as unknown as {
        __sheet: {
          stopped: boolean;
          released: number | null;
          kept: Kept[];
          frame: HTMLElement;
          canvas: HTMLCanvasElement;
          paper: number;
        };
      }
    ).__sheet;
    state.stopped = true;
    const { kept, canvas } = state;

    /**
     * Where a row crosses half-way between its two grounds, in pixels of the viewport. `first`
     * and `last` are the row before and after the Turn. Only bare ground is read: a pixel that
     * is the sheet at one end of the Turn and the night at the other. There its brightness is
     * the share of the front that has passed it; on one of the work's own marks the light that
     * arrives behind the front, or the ink that lifts, moves the half-way point by a pixel or two.
     */
    const crossings = (line: Line, first: Line, last: Line) => {
      const { values } = line;
      const scale = line.span / values.length;
      const found: number[] = [];
      let before: { x: number; share: number } | null = null;
      for (let i = 0; i < values.length; i++) {
        const span = first.values[i] - last.values[i];
        const bare =
          Math.max(first.values[i], last.values[i]) >= 0.85 * state.paper &&
          Math.min(first.values[i], last.values[i]) <= 0.08 * state.paper;
        if (!bare) {
          before = null;
          continue;
        }
        const here = {
          x: line.left + (i + 0.5) * scale,
          share: (values[i] - last.values[i]) / span,
        };
        if (before && (before.share - 0.5) * (here.share - 0.5) < 0)
          found.push(
            before.x + ((0.5 - before.share) / (here.share - before.share)) * (here.x - before.x),
          );
        before = here;
      }
      return found;
    };
    /** The crossings that stand alone on their row: none other within a dozen pixels. */
    const alone = (xs: number[]) =>
      xs.filter((x, i) => xs.every((other, j) => i === j || Math.abs(other - x) > 12));
    /** Each of some places with the nearest of some others, where one lies within reach. */
    const pairs = (a: number[], b: number[], within: number) =>
      a.flatMap((x) => {
        const nearest = b.reduce(
          (best, other) => (Math.abs(other - x) < Math.abs(best - x) ? other : best),
          Infinity,
        );
        return Math.abs(nearest - x) <= within ? [[x, nearest] as const] : [];
      });
    type Read = { y: number; xs: number[] };
    /**
     * The fronts three rows of one canvas all see, each as the line through its crossings: where
     * that front stands at any height near them. Only a front that is a line there: one that
     * crosses the rows no shallower than half a right angle (a front that runs along them is
     * found at a place a hair's change of height moves by pixels), and that is found on the third
     * row where the first two say. Where two of the work's spreading marks meet, the front has a
     * corner, and no line through it says where it stands a pixel on.
     */
    const frontsOf = (a: Read, b: Read, c: Read) =>
      pairs(alone(a.xs), alone(b.xs), Math.abs(b.y - a.y)).flatMap(([xa, xb]) => {
        const front = (y: number) => xa + ((xb - xa) * (y - a.y)) / (b.y - a.y);
        return pairs([front(c.y)], c.xs, 0.35).length ? [front] : [];
      });
    /** A front that stands alone on each of its three rows: no second crossing within a dozen pixels of its line. */
    const alone3 = (front: (y: number) => number, rows: Read[]) =>
      rows.every((row) => row.xs.filter((x) => Math.abs(x - front(row.y)) <= 12).length === 1);
    /** How far apart two canvases put each front, at one height, over every frame but the ends. */
    const apart = (
      one: (record: Kept) => Line[],
      other: (record: Kept) => Line[],
      at: (record: Kept, lines: Line[]) => number,
    ) => {
      const found: number[] = [];
      const seen = kept.filter((record) => one(record).length >= 3 && other(record).length >= 3);
      if (seen.length < 3) return found;
      const first = seen[0];
      const last = seen[seen.length - 1];
      for (const record of seen.slice(1, -1)) {
        const count = Math.min(one(record).length, one(first).length, one(last).length);
        // Three rows at a time: each three is one place where the two canvases are read.
        for (let index = 0; index + 2 < count; index += 3) {
          const read = (lines: (record: Kept) => Line[]) =>
            [index, index + 1, index + 2].map((i) => ({
              y: lines(record)[i].y,
              xs: crossings(lines(record)[i], lines(first)[i], lines(last)[i]),
            }));
          const ours = read(one);
          const theirs = read(other);
          const height = at(record, one(record).slice(index, index + 3));
          const here = frontsOf(ours[0], ours[1], ours[2])
            .filter((front) => alone3(front, ours))
            .map((front) => front(height));
          const there = frontsOf(theirs[0], theirs[1], theirs[2])
            .filter((front) => alone3(front, theirs))
            .map((front) => front(height));
          // One front on each canvas, each the other's only neighbour. Where two of the work's
          // spreading marks are about to meet, two fronts stand a few pixels apart; a canvas
          // that could read only one of them as a line would have it paired with the other's
          // other front, and the pair would say the canvases disagree by the gap between them.
          for (const x of here) {
            const fellows = there.filter((y) => Math.abs(y - x) <= 8);
            const beside = here.filter((other) => Math.abs(other - x) <= 8);
            if (fellows.length === 1 && beside.length === 1) found.push(Math.abs(fellows[0] - x));
          }
        }
      }
      return found;
    };
    // The head's ground and the stage's, on the line between them; and the page's ground and
    // the stage's, at the middle one of the page's three rows.
    const seams = apart(
      (record) => record.head,
      (record) => record.stageAtHead,
      (record) => record.seam,
    );
    const pageSeams = apart(
      (record) => record.page,
      (record) => record.stageAtPage,
      (_, [, middle]) => middle.y,
    );

    let greyest = 0;
    let fronts = 0;
    for (const { probes } of kept) {
      if (!probes.length) continue;
      let grey = 0;
      let turned = 0;
      let waiting = 0;
      for (const passed of probes) {
        if (passed > 0.2 && passed < 0.8) grey += 1;
        else if (passed >= 0.8) turned += 1;
        else waiting += 1;
      }
      greyest = Math.max(greyest, grey / probes.length);
      if (turned > probes.length / 10 && waiting > probes.length / 10) fronts += 1;
    }
    const left = [
      ...document.querySelectorAll(
        '[data-sheet], [data-sheet-out], [data-sheet-fill], [data-sheet-muted], [data-sheet-unlined], [data-sheet-focus], [data-sheet-active]',
      ),
    ].map((element) => `${element.tagName.toLowerCase()} ${element.textContent?.slice(0, 20)}`);
    if (canvas.hasAttribute('data-active')) left.push('canvas still shown');
    if (document.documentElement.hasAttribute('data-sheet-page')) left.push('page ground');
    return {
      frames: kept.length,
      greyest,
      fronts,
      glyphs: kept.reduce((sum, record) => sum + record.glyphs, 0),
      misinked: kept.flatMap((record, index) =>
        record.misinked.map((line) => `frame ${index}: ${line}`),
      ),
      split: kept.flatMap((record, index) => record.split.map((line) => `frame ${index}: ${line}`)),
      shared: kept.flatMap((record, index) =>
        record.shared.map((line) => `frame ${index}: ${line}`),
      ),
      seams,
      pageSeams,
      left,
      course: kept.map(({ at, probes }) => [
        at,
        probes.length ? probes.filter((passed) => passed >= 0.5).length / probes.length : 0,
      ]),
      released: state.released,
    };
  });
}

/** The share of the bare ground the front has passed, as the page last kept it. */
export function sheetTurned(page: Page) {
  return page.evaluate(() => (window as unknown as { __sheet: { turned: number } }).__sheet.turned);
}
