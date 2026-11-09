import { WindowPerformance, type OrbitWindow, type PlanePoints } from './orbit';
import { lightFilmFrame, lightFilmSeconds, stepsDrawnAt } from './light-film';
import { bodyGlow, bodyLight, bodyReach } from './body-light';

/*
  The Orrery: every work's orbit performed at once, each on its own small canvas, from the
  first step of its recorded window (orbit.ts's WindowPerformance). A cell draws its orbit as
  the work page's section draws it: every hundredth step, at the Light film's pace; each body in
  its own published hue, a line of the venue's one weight over a soft glow of the same hue, both
  added as light, so where trails cross they brighten as the Light plates' ribbons do. Each body
  rides at the head of its trail, lit as the work page lights a body, and moves on with it. When
  its window is complete it holds the finished exposure, the bodies where the window left them,
  for a moment and begins again.
  Cells out of view wait where they are. Under a still preference each cell is drawn whole,
  once, and shown only when it is whole, its bodies at rest where the window leaves them. A
  frame's work is bounded by time as well as steps, so a slow machine performs the orbits more
  slowly instead of leaving the page no time of its own. The engine is pure and synchronous;
  the Orrery's worker gives it OffscreenCanvases and a clock, and the tests give it recording
  surfaces and a clock of their own.

  The trails accumulate on the cell's one canvas, so a body drawn there would leave a dotted
  line of its old places behind it. So once a frame's trails are drawn, what lies under every
  body that will move on is copied, a few pixels from canvas to canvas, into a row of the
  engine's one spare canvas, and the rows are taken off together as one bitmap; before a cell's
  trails go on, its row is put back. The trails therefore grow beneath no mark, for a copy and a
  bitmap a frame, where a second canvas for the bodies would cost a whole cell's pixels again
  and a second layer for the page to composite (third-physics-phase-d.md §9).
*/

export const ORRERY = {
  /** The work page samples every hundredth step; the Orrery draws the same samples. */
  stride: 100,
  /** A finished window is held this long before the next performance begins. */
  holdMs: 3000,
  /** Steps a frame may integrate across every cell; a cell short of them slows, never jumps. */
  budget: 150_000,
  /** Milliseconds a frame may work: a fast machine's frame fits well within them. */
  frameMs: 6,
  /** Steps integrated between looks at the clock. */
  chunk: 2000,
  /** The margin around the orbit, as a share of the cell's smaller side. */
  margin: 0.07,
  /** The most of a silence between a cell's frames that is performed; the rest is a pause. */
  gapMs: 250,
  /**
   * A body's line: the venue's one weight (a CSS pixel), lit in the body's own hue at most of
   * the chroma sRGB holds there (src/lib/physics/body-light.ts).
   */
  line: { lightness: 0.84, share: 0.85, alpha: 0.5 },
  /** The glow beneath each line: wider, fainter and deeper in the same hue, in CSS pixels. */
  glow: { width: 7, lightness: 0.7, share: 0.95, alpha: 0.075 },
  /**
   * Each body at the head of its trail, lit as the work page lights a body (body-light.ts), its
   * light reaching this much of the work page's reach: by the cube root of its mass, 5.6 to 8
   * CSS pixels, past the glow of its own trail. Like the line, it is measured in CSS pixels, so
   * a phone's smaller cells show their bodies as plainly as a desk's.
   */
  head: { scale: 0.5 },
} as const;

/** The samples of one Light film frame, x and y pairs per body: one path a body. */
type FilmFrame = { frame: number; points: [number[], number[], number[]] };

/** One body's light: the line it draws and the glow beneath it, both in its own hue. */
export interface BodyStroke {
  line: string;
  glow: string;
}

/** The light the Orrery draws each body of a work in, from the work's published body hues. */
export function bodyStrokes(
  hues: readonly [number, number, number],
): [BodyStroke, BodyStroke, BodyStroke] {
  return [0, 1, 2].map((body) => ({
    line: bodyLight(hues[body], ORRERY.line),
    glow: bodyLight(hues[body], ORRERY.glow),
  })) as [BodyStroke, BodyStroke, BodyStroke];
}

/** The part of a 2D context a cell draws with: a canvas's, or a test's recording. */
export interface Surface {
  readonly canvas: { width: number; height: number };
  globalCompositeOperation: GlobalCompositeOperation;
  lineWidth: number;
  lineJoin: CanvasLineJoin;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  fillStyle: string | CanvasGradient | CanvasPattern;
  clearRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, start: number, end: number): void;
  stroke(): void;
  fill(): void;
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number,
  ): CanvasGradient;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  /** A rect of another surface's canvas, or of a bitmap, copied here pixel for pixel. */
  drawImage(
    image: Surface['canvas'] | Bitmap,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
}

/** A bitmap taken off the spare canvas: an ImageBitmap, or a test's recording of one. */
export interface Bitmap {
  readonly width: number;
  readonly height: number;
  close(): void;
}

/** A canvas of the engine's own, whose drawing can be taken away as a bitmap. */
export interface Spare extends Surface {
  readonly canvas: Surface['canvas'] & { transferToImageBitmap(): Bitmap };
}

/** Makes the engine's spare canvas: an OffscreenCanvas, or a recording. */
export type SpareCanvas = (width: number, height: number) => Spare | null;

/** Where the plane lands on a canvas: the work page's fit, a margin on every side. */
export function planeFit(
  bounds: OrbitWindow['plane']['bounds'],
  width: number,
  height: number,
  margin: number,
) {
  const [u0, u1, v0, v1] = bounds;
  const scale = Math.min(
    (width - 2 * margin) / (u1 - u0 || 1),
    (height - 2 * margin) / (v1 - v0 || 1),
  );
  return {
    scale,
    x: (width - (u1 - u0) * scale) / 2 - u0 * scale,
    y: (height - (v1 - v0) * scale) / 2 - v0 * scale,
  };
}

/** Where a body lies on its cell's canvas: a rect of whole pixels. */
interface Spot {
  left: number;
  top: number;
  across: number;
  down: number;
}

/** A frame's bitmap of what lies under the bodies laid in it, a row a cell. */
interface Sheet {
  bitmap: Bitmap;
  /** The cells whose bodies still lie over their rows; the bitmap is closed when none does. */
  users: number;
}

interface Cell {
  surface: Surface;
  replay: WindowPerformance;
  hues: readonly [number, number, number];
  fit: ReturnType<typeof planeFit>;
  /** The last sample drawn, three bodies' x and y, so the next stroke continues from it. */
  last: Float64Array | null;
  /** The film frame whose samples are gathered but not yet stroked. */
  open: FilmFrame | null;
  /** Film frames complete but kept from the canvas until the cell is drawn whole. */
  unshown: FilmFrame[] | null;
  /** The cell's three bodies' light, one hue a body: each body's line and its glow. */
  styles: readonly [BodyStroke, BodyStroke, BodyStroke];
  /** How far each body's light reaches, in the canvas's pixels. */
  reaches: readonly number[];
  /** Each body's light, made once on the cell's canvas, centred where it is placed. */
  lights: CanvasGradient[] | null;
  /**
   * The bodies on the canvas: none; kept, with what lies under them in a row of a frame's
   * sheet, to be lifted before the trails go on; or at rest where the window ends, for good.
   */
  bodies: 'none' | 'kept' | 'resting';
  /** While the bodies are kept, the sheet and row that hold what lies under them. */
  under: { sheet: Sheet; row: number } | null;
  /** Where each body lies while it is on the canvas. */
  spots: readonly Spot[];
  /** When the cell last advanced, so a silence since can be taken as a pause. */
  lastFrame: number | null;
  visible: boolean;
  /** When the current performance began on the engine's clock, or null before it has. */
  startedAt: number | null;
  pausedAt: number | null;
  heldSince: number | null;
  /** Drawn whole, under a still preference. */
  whole: boolean;
}

/** The messages the Orrery's page sends its worker; a frame is drawn only when asked for. */
export type OrreryRequest =
  | {
      type: 'cells';
      ratio: number;
      moving: boolean;
      cells: {
        id: number;
        canvas: OffscreenCanvas;
        window: OrbitWindow;
        hues: readonly [number, number, number];
      }[];
    }
  | { type: 'visible'; id: number; visible: boolean }
  | { type: 'moving'; moving: boolean }
  | { type: 'size'; id: number; width: number; height: number }
  | { type: 'frame' };

/**
 * The worker's messages: a frame drawn, and whether there is more to draw; a cell drawn whole
 * under a still preference; or no way to draw.
 */
export type OrreryReply =
  { type: 'framed'; more: boolean } | { type: 'drawn'; id: number } | { type: 'failed' };

export class OrreryEngine {
  private readonly cells = new Map<number, Cell>();
  private readonly ratio: number;
  private moving: boolean;
  private readonly onDrawn?: (id: number) => void;
  /** The time a frame's work is measured by, in milliseconds. */
  private readonly clock: () => number;
  /** Makes the spare canvas; without one, the cells draw their trails and no bodies. */
  private readonly makeSpare: SpareCanvas;
  /**
   * The spare canvas, made when the first bodies are laid; null where none can be made, so the
   * cells draw their trails alone.
   */
  private spare: Spare | null | undefined;
  /** A body's place in the spare: square, room for the widest body's light and its soft edge. */
  private slot = 0;
  /** The cell a frame starts from, turned each frame so a short budget is shared fairly. */
  private turn = 0;
  private readonly points: PlanePoints = { u: new Float64Array(3), v: new Float64Array(3) };

  constructor(
    ratio: number,
    moving: boolean,
    {
      onDrawn,
      clock = () => performance.now(),
      spare = () => null,
    }: { onDrawn?: (id: number) => void; clock?: () => number; spare?: SpareCanvas } = {},
  ) {
    this.ratio = ratio;
    this.moving = moving;
    this.onDrawn = onDrawn;
    this.clock = clock;
    this.makeSpare = spare;
  }

  add(id: number, surface: Surface, window: OrbitWindow, hues: readonly [number, number, number]) {
    const reaches = window.masses.map((mass) => bodyReach(mass) * ORRERY.head.scale * this.ratio);
    this.slot = Math.max(this.slot, Math.ceil(2 * Math.max(...reaches)) + 4);
    const cell: Cell = {
      surface,
      replay: new WindowPerformance(window),
      hues,
      fit: this.fit(surface, window),
      last: null,
      open: null,
      unshown: null,
      styles: bodyStrokes(hues),
      reaches,
      lights: null,
      bodies: 'none',
      under: null,
      spots: [0, 1, 2].map(() => ({ left: 0, top: 0, across: 0, down: 0 })),
      lastFrame: null,
      visible: false,
      startedAt: null,
      pausedAt: null,
      heldSince: null,
      whole: false,
    };
    this.cells.set(id, cell);
  }

  /** A cell came into view or left it; a performance waits where it is while unseen. */
  visible(id: number, visible: boolean, now: number) {
    const cell = this.cells.get(id);
    if (!cell || cell.visible === visible) return;
    cell.visible = visible;
    // Out of view, a cell keeps nothing of a frame's sheet: its bodies are laid again on return.
    if (!visible) this.lift(cell);
    // The time away is accounted for here, not again as a silence at the next frame.
    cell.lastFrame = null;
    if (!this.moving || cell.startedAt === null) return;
    if (!visible) cell.pausedAt = now;
    else if (cell.pausedAt !== null) {
      const away = now - cell.pausedAt;
      cell.startedAt += away;
      if (cell.heldSince !== null) cell.heldSince += away;
      cell.pausedAt = null;
    }
  }

  /** Motion welcome or not: every cell begins again, performed or drawn whole. */
  setMoving(moving: boolean) {
    if (moving === this.moving) return;
    this.moving = moving;
    for (const cell of this.cells.values()) this.begin(cell);
  }

  /** A cell's canvas changed size: refit and begin again. */
  resize(id: number, width: number, height: number) {
    const cell = this.cells.get(id);
    if (!cell || width < 1 || height < 1) return;
    const canvas = cell.surface.canvas;
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    cell.fit = this.fit(cell.surface, cell.replay.window);
    this.begin(cell);
  }

  /** Steps a cell has performed of its current window. */
  stepOf(id: number): number | undefined {
    return this.cells.get(id)?.replay.step;
  }

  /** Advance every visible cell to `now`; true while there is more to draw. */
  frame(now: number): boolean {
    const cells = [...this.cells.entries()].filter(([, cell]) => cell.visible);
    if (!cells.length) return false;
    const began = this.clock();
    const spent = () => this.clock() - began >= ORRERY.frameMs;
    if (!this.moving) {
      // Drawn whole, a cell at a time and a slice of its window a frame, and shown only once
      // whole: a still preference never sees an orbit drawn, and the worker never holds long.
      const next = cells.find(([, cell]) => !cell.whole);
      if (!next) return false;
      const [id, cell] = next;
      const { replay } = cell;
      cell.unshown ??= [];
      do {
        this.draw(cell, Math.min(replay.window.steps, replay.step + ORRERY.chunk));
      } while (!replay.done && !spent());
      if (!replay.done) return true;
      for (const frame of cell.unshown) this.paint(cell, frame);
      // The bodies rest where the window leaves them, as a performance holds them at its end.
      this.lay([cell]);
      cell.unshown = null;
      cell.whole = true;
      this.onDrawn?.(id);
      return cells.some(([, other]) => !other.whole);
    }
    let budget = ORRERY.budget;
    /** Cells whose bodies are to be laid once every trail of the frame is drawn. */
    const laying: Cell[] = [];
    this.turn = (this.turn + 1) % cells.length;
    // Every frame moves at least one cell; past its time, the rest wait for the next.
    for (let k = 0; k < cells.length && budget > 0 && (k === 0 || !spent()); k++) {
      const [, cell] = cells[(this.turn + k) % cells.length];
      const steps = cell.replay.window.steps;
      // A silence since the cell last advanced (a busy thread, a page drawing slowly) is
      // performed for a moment at most; the rest is a pause, by which its clocks move on. So it
      // resumes where it stood instead of owing the silence, and a page that draws only a few
      // frames a second still sees every orbit go on, more slowly.
      if (cell.lastFrame !== null && now - cell.lastFrame > ORRERY.gapMs) {
        const away = now - cell.lastFrame - ORRERY.gapMs;
        if (cell.startedAt !== null) cell.startedAt += away;
        if (cell.heldSince !== null) cell.heldSince += away;
      }
      cell.lastFrame = now;
      if (cell.heldSince !== null) {
        if (now - cell.heldSince < ORRERY.holdMs) continue;
        this.begin(cell);
      }
      cell.startedAt ??= now;
      const target = stepsDrawnAt((now - cell.startedAt) / 1000, steps) + 1;
      const wanted = target - cell.replay.step;
      if (wanted > 0) {
        const most = Math.min(wanted, budget);
        let taken = 0;
        do {
          const slice = Math.min(most - taken, ORRERY.chunk);
          this.draw(cell, cell.replay.step + slice);
          taken += slice;
        } while (taken < most && !spent());
        budget -= taken;
        // Short of its frame, a cell's clock is set to where it stands: slower, never a jump.
        if (taken < wanted) cell.startedAt = now - lightFilmSeconds(cell.replay.step, steps) * 1000;
      }
      // The bodies, lifted for any trail drawn or away while the cell was, go down again.
      if (cell.bodies === 'none' && cell.last) laying.push(cell);
      if (cell.replay.done) cell.heldSince ??= now;
    }
    this.lay(laying);
    return true;
  }

  private fit(surface: Surface, window: OrbitWindow) {
    const { width, height } = surface.canvas;
    return planeFit(window.plane.bounds, width, height, ORRERY.margin * Math.min(width, height));
  }

  /** Clear the cell and stand it at its window's first step. */
  private begin(cell: Cell) {
    cell.surface.clearRect(0, 0, cell.surface.canvas.width, cell.surface.canvas.height);
    cell.replay.restart();
    // The bodies went with the rest; what lay under them is no longer needed.
    this.release(cell);
    cell.last = null;
    cell.open = null;
    cell.unshown = null;
    cell.lastFrame = null;
    cell.startedAt = null;
    cell.pausedAt = null;
    cell.heldSince = null;
    cell.whole = false;
  }

  /** Integrate the cell up to `target`, gathering its samples by the film frame that shows them. */
  private draw(cell: Cell, target: number) {
    const { replay, fit } = cell;
    const steps = replay.window.steps;
    replay.run(target, ORRERY.stride, (step) => {
      const frame = lightFilmFrame(step, steps);
      if (cell.open && cell.open.frame !== frame) this.stroke(cell);
      cell.open ??= { frame, points: [[], [], []] };
      replay.project(this.points);
      for (let body = 0; body < 3; body++)
        cell.open.points[body].push(
          fit.x + this.points.u[body] * fit.scale,
          fit.y + this.points.v[body] * fit.scale,
        );
    });
    // The window's last frame is complete once its last step is taken.
    if (replay.done) this.stroke(cell);
  }

  /** Close the gathered film frame: stroke it now, or keep it until the cell is drawn whole. */
  private stroke(cell: Cell) {
    const open = cell.open;
    cell.open = null;
    if (!open) return;
    if (cell.unshown) cell.unshown.push(open);
    else this.paint(cell, open);
  }

  /**
   * Stroke a film frame: one path a body, continuing from the frame before, stroked twice, its
   * glow and then its line, both added as light. The Light film adds each frame's marks as one
   * exposure, so a frame is one path, whether the cell is drawn whole or performed, at any
   * display's pace, and a performance ends on the very picture the whole drawing makes.
   */
  private paint(cell: Cell, open: FilmFrame) {
    const surface = cell.surface;
    this.lift(cell);
    surface.globalCompositeOperation = 'lighter';
    surface.lineJoin = 'round';
    cell.last ??= Float64Array.from(open.points.flatMap((points) => [points[0], points[1]]));
    for (let body = 0; body < 3; body++) {
      const points = open.points[body];
      surface.beginPath();
      surface.moveTo(cell.last[body * 2], cell.last[body * 2 + 1]);
      for (let k = 0; k < points.length; k += 2) surface.lineTo(points[k], points[k + 1]);
      // A stroke leaves its path in place, so the line retraces the glow's path exactly.
      surface.lineWidth = ORRERY.glow.width * this.ratio;
      surface.strokeStyle = cell.styles[body].glow;
      surface.stroke();
      surface.lineWidth = this.ratio;
      surface.strokeStyle = cell.styles[body].line;
      surface.stroke();
      cell.last[body * 2] = points[points.length - 2];
      cell.last[body * 2 + 1] = points[points.length - 1];
    }
  }

  /**
   * Lay the bodies of the cells whose trails were drawn this frame, each at the head of its
   * trail, where its last film frame ends. Where a body will move on, what lies under it is
   * copied first, every cell's into its own row of the spare canvas, all three of a cell's
   * before any is drawn, and the rows are taken off together as one bitmap: a copy and a bitmap
   * a frame, however many cells. Taking it has the copy made then, so no cell is drawn on while
   * a copy of it is still owed. Each body is kept in a rect of whole pixels, a pixel wider on
   * every side than its light reaches, so the copy is exact and holds its soft edge. A body at
   * rest is never lifted, so nothing is kept for it.
   */
  private lay(cells: readonly Cell[]) {
    if (!cells.length) return;
    const spare = this.spareFor();
    if (!spare) return;
    const { slot } = this;
    const moving = cells.filter((cell) => !cell.replay.done);
    let sheet: Sheet | null = null;
    if (moving.length) {
      // Sized for the frame's rows, the spare is clear: new, or left so by the last bitmap.
      if (spare.canvas.height !== moving.length * slot) spare.canvas.height = moving.length * slot;
      moving.forEach((cell, row) => {
        this.place(cell);
        cell.spots.forEach(({ left, top, across, down }, body) => {
          if (across && down)
            spare.drawImage(
              cell.surface.canvas,
              left,
              top,
              across,
              down,
              body * slot,
              row * slot,
              across,
              down,
            );
        });
      });
      sheet = { bitmap: spare.canvas.transferToImageBitmap(), users: moving.length };
    }
    for (const cell of cells) {
      this.light(cell);
      cell.bodies = cell.replay.done ? 'resting' : 'kept';
    }
    if (sheet) moving.forEach((cell, row) => (cell.under = { sheet, row }));
  }

  /**
   * Where each of a cell's bodies lies, at the end of its last film frame: a rect of whole
   * pixels, a pixel wider on every side than its light reaches, within the canvas.
   */
  private place({ last, reaches, spots, surface }: Cell) {
    if (!last) return;
    const { width, height } = surface.canvas;
    spots.forEach((spot, body) => {
      const x = last[body * 2];
      const y = last[body * 2 + 1];
      const reach = reaches[body];
      spot.left = Math.max(0, Math.floor(x - reach) - 1);
      spot.top = Math.max(0, Math.floor(y - reach) - 1);
      spot.across = Math.max(0, Math.min(width, Math.ceil(x + reach) + 1) - spot.left);
      spot.down = Math.max(0, Math.min(height, Math.ceil(y + reach) + 1) - spot.top);
    });
  }

  /** Draw a cell's bodies where its trails end, each over its light, as the work page does. */
  private light(cell: Cell) {
    const { surface, last, reaches } = cell;
    if (!last) return;
    cell.lights ??= cell.hues.map((hue, body) => {
      const light = surface.createRadialGradient(0, 0, 0, 0, 0, reaches[body]);
      for (const [offset, colour] of bodyGlow(hue)) light.addColorStop(offset, colour);
      return light;
    });
    surface.globalCompositeOperation = 'source-over';
    for (let body = 0; body < 3; body++) {
      surface.setTransform(1, 0, 0, 1, last[body * 2], last[body * 2 + 1]);
      surface.fillStyle = cell.lights[body];
      surface.beginPath();
      surface.arc(0, 0, reaches[body], 0, 2 * Math.PI);
      surface.fill();
    }
    surface.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Put back what lay under a cell's kept bodies, so its trails go on beneath no mark. */
  private lift(cell: Cell) {
    const { spots, surface, under } = cell;
    if (cell.bodies !== 'kept' || !under) return;
    const { slot } = this;
    surface.globalCompositeOperation = 'source-over';
    spots.forEach(({ left, top, across, down }, body) => {
      if (!across || !down) return;
      surface.clearRect(left, top, across, down);
      surface.drawImage(
        under.sheet.bitmap,
        body * slot,
        under.row * slot,
        across,
        down,
        left,
        top,
        across,
        down,
      );
    });
    this.release(cell);
  }

  /** The cell's bodies are gone from its canvas, and its row of its sheet with them. */
  private release(cell: Cell) {
    const { under } = cell;
    cell.bodies = 'none';
    cell.under = null;
    if (under && --under.sheet.users === 0) under.sheet.bitmap.close();
  }

  /** The spare canvas, made once, three slots wide; remade if a wider cell comes. */
  private spareFor() {
    const { spare, slot } = this;
    if (spare === null) return null;
    if (spare && spare.canvas.width >= 3 * slot) return spare;
    return (this.spare = this.makeSpare(3 * slot, slot));
  }
}
