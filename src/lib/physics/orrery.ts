import { WindowPerformance, type OrbitWindow, type PlanePoints } from './orbit';
import { lightFilmFrame, lightFilmSeconds, stepsDrawnAt } from './light-film';

/*
  The Orrery: every work's orbit performed at once, each on its own small canvas, from the
  first step of its recorded window (orbit.ts's WindowPerformance). A cell draws its orbit as
  the work page's section draws it: every hundredth step, in light, at the Light film's pace;
  when its window is complete it holds the finished exposure for a moment and begins again.
  Cells out of view wait where they are. Under a still preference each cell is drawn whole,
  once, and shown only when it is whole. A frame's work is bounded by time as well as steps,
  so a slow machine performs the orbits more slowly instead of leaving the page no time of
  its own. The engine is pure and synchronous; the Orrery's worker gives it OffscreenCanvases
  and a clock, and the tests give it a recording surface and a clock of their own.
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
  /** A silence longer than this between a cell's frames (a hidden page, a busy thread) is a pause. */
  gapMs: 250,
} as const;

/** The samples of one Light film frame, x and y pairs per body: one path a body. */
type FilmFrame = { frame: number; points: [number[], number[], number[]] };

/** The part of a 2D context a cell draws with: a canvas's, or a test's recording. */
export interface Surface {
  readonly canvas: { width: number; height: number };
  globalCompositeOperation: GlobalCompositeOperation;
  lineWidth: number;
  lineJoin: CanvasLineJoin;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  clearRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
}

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
  /** The cell's three strokes, one hue a body. */
  styles: readonly [string, string, string];
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

/** The messages the Orrery's page sends its worker. */
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
  | { type: 'size'; id: number; width: number; height: number };

/** The worker's messages: a cell drawn whole under a still preference, or no way to draw. */
export type OrreryReply = { type: 'drawn'; id: number } | { type: 'failed' };

export class OrreryEngine {
  private readonly cells = new Map<number, Cell>();
  private readonly ratio: number;
  private moving: boolean;
  private readonly onDrawn?: (id: number) => void;
  /** The time a frame's work is measured by, in milliseconds. */
  private readonly clock: () => number;
  /** The cell a frame starts from, turned each frame so a short budget is shared fairly. */
  private turn = 0;
  private readonly points: PlanePoints = { u: new Float64Array(3), v: new Float64Array(3) };

  constructor(
    ratio: number,
    moving: boolean,
    {
      onDrawn,
      clock = () => performance.now(),
    }: { onDrawn?: (id: number) => void; clock?: () => number } = {},
  ) {
    this.ratio = ratio;
    this.moving = moving;
    this.onDrawn = onDrawn;
    this.clock = clock;
  }

  add(id: number, surface: Surface, window: OrbitWindow, hues: readonly [number, number, number]) {
    const cell: Cell = {
      surface,
      replay: new WindowPerformance(window),
      hues,
      fit: this.fit(surface, window),
      last: null,
      open: null,
      unshown: null,
      styles: [0, 1, 2].map((body) => `oklch(0.84 0.075 ${hues[body]} / 0.2)`) as [
        string,
        string,
        string,
      ],
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
      cell.unshown = null;
      cell.whole = true;
      this.onDrawn?.(id);
      return cells.some(([, other]) => !other.whole);
    }
    let budget = ORRERY.budget;
    this.turn = (this.turn + 1) % cells.length;
    // Every frame moves at least one cell; past its time, the rest wait for the next.
    for (let k = 0; k < cells.length && budget > 0 && (k === 0 || !spent()); k++) {
      const [, cell] = cells[(this.turn + k) % cells.length];
      const steps = cell.replay.window.steps;
      // A silence since the cell last advanced (a hidden page, a busy thread) is a pause: its
      // clocks move on by it, so it resumes where it stood instead of owing the silence.
      if (cell.lastFrame !== null && now - cell.lastFrame > ORRERY.gapMs) {
        const away = now - cell.lastFrame;
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
      if (cell.replay.done) cell.heldSince ??= now;
    }
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
   * Stroke a film frame: one path a body, continuing from the frame before. The Light film adds
   * each frame's marks as one exposure, so a frame is one path, whether the cell is drawn whole
   * or performed, at any display's pace, and a performance ends on the very picture the whole
   * drawing makes.
   */
  private paint(cell: Cell, open: FilmFrame) {
    const surface = cell.surface;
    surface.globalCompositeOperation = 'lighter';
    surface.lineWidth = this.ratio;
    surface.lineJoin = 'round';
    cell.last ??= Float64Array.from(open.points.flatMap((points) => [points[0], points[1]]));
    for (let body = 0; body < 3; body++) {
      const points = open.points[body];
      surface.strokeStyle = cell.styles[body];
      surface.beginPath();
      surface.moveTo(cell.last[body * 2], cell.last[body * 2 + 1]);
      for (let k = 0; k < points.length; k += 2) surface.lineTo(points[k], points[k + 1]);
      surface.stroke();
      cell.last[body * 2] = points[points.length - 2];
      cell.last[body * 2 + 1] = points[points.length - 1];
    }
  }
}
