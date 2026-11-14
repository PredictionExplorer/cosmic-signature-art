import { describe, expect, it, vi } from 'vitest';
import type { OrbitWindow } from './orbit';
import { lightFilmDuration, stepsDrawnAt } from './light-film';
import { bodyGlow, bodyReach } from './body-light';
import { ORRERY, OrreryEngine, bodyStrokes, planeFit, type Bitmap, type Surface } from './orrery';

/** A small window: three bodies on a triangle, 3,600 steps, a 30-second Light film. */
const window: OrbitWindow = {
  masses: [100, 100, 100],
  dt: 0.001,
  steps: 3600,
  positions: [10, 0, 0, -5, 8.66, 0, -5, -8.66, 0],
  velocities: [0, 3, 0, -2.6, -1.5, 0, 2.6, -1.5, 0],
  plane: {
    mean: [0, 0, 0],
    axes: [
      [1, 0, 0],
      [0, 1, 0],
    ],
    bounds: [-12, 12, -12, 12],
  },
};
const hues = [10, 130, 250] as const;

/** A recording that keeps no pixels does nothing with a head's calls. */
const unlit = {
  fillStyle: '' as Surface['fillStyle'],
  arc: () => {},
  fill: () => {},
  createRadialGradient: () => ({ addColorStop: () => {} }) as unknown as CanvasGradient,
  setTransform: () => {},
  drawImage: () => {},
};

function surface(width = 200, height = 130) {
  const calls = { clears: 0, strokes: 0, points: 0 };
  const recording: Surface & { calls: typeof calls } = {
    calls,
    canvas: { width, height },
    globalCompositeOperation: 'source-over',
    lineWidth: 1,
    lineJoin: 'miter',
    strokeStyle: '',
    clearRect: () => void (calls.clears += 1),
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => void (calls.points += 1),
    stroke: () => void (calls.strokes += 1),
    ...unlit,
  };
  return recording;
}

/** A surface that keeps every path it strokes: its style, its width and its points, in order. */
function tracing() {
  const paths: { style: string; width: number; points: number[] }[] = [];
  let points: number[] = [];
  const trace: Surface & { paths: typeof paths } = {
    paths,
    canvas: { width: 200, height: 130 },
    globalCompositeOperation: 'source-over',
    lineWidth: 1,
    lineJoin: 'miter',
    strokeStyle: '',
    clearRect: () => void paths.splice(0),
    beginPath: () => void (points = []),
    moveTo: (x, y) => void points.push(x, y),
    lineTo: (x, y) => void points.push(x, y),
    stroke() {
      paths.push({ style: String(this.strokeStyle), width: this.lineWidth, points });
    },
    ...unlit,
  };
  return trace;
}

/** Every mark drawn on a test's rasters, numbered by what it draws: the same mark, one number. */
type Marks = Map<string, number>;

/** A radial gradient as a raster records it: its circles and its stops. */
interface Light {
  circles: number[];
  stops: [number, string][];
}

/**
 * A surface that keeps, for each of its pixels, a fingerprint of everything drawn there in order,
 * and the mark on top. Two drawings are one picture when their fingerprints agree, and a rect
 * copied from raster to raster, or through a bitmap taken off one, carries its fingerprints
 * exactly. A stroke marks each segment's box, widened by half its width and a pixel for its
 * softened edge; a fill marks its arc's box, where a translation sets it, and a pixel more: as
 * far as a canvas's antialiasing reaches.
 */
function raster(across = 200, down = 130, marks: Marks = new Map()) {
  let [width, height] = [across, down];
  let prints = new Uint32Array(width * height);
  let tops = new Uint32Array(width * height);
  // A canvas given a new size starts again empty, as a real one does.
  const resized = () => {
    prints = new Uint32Array(width * height);
    tops = new Uint32Array(width * height);
  };
  /** The bitmaps taken off this canvas and not yet closed, and how many were ever taken. */
  const open = new Set<object>();
  let taken = 0;
  const canvas = {
    open,
    get taken() {
      return taken;
    },
    /** What is drawn here, taken away as a bitmap of its own; the canvas is left clear. */
    transferToImageBitmap() {
      const bitmap = {
        width,
        height,
        prints,
        tops,
        closed: false,
        close() {
          expect(bitmap.closed).toBe(false);
          bitmap.closed = true;
          open.delete(bitmap);
        },
      };
      open.add(bitmap);
      taken += 1;
      resized();
      return bitmap;
    },
    get width() {
      return width;
    },
    set width(value: number) {
      width = value;
      resized();
    },
    get height() {
      return height;
    },
    set height(value: number) {
      height = value;
      resized();
    },
    get prints() {
      return prints;
    },
    get tops() {
      return tops;
    },
  };
  /** Every fill drawn: the heads, in order. */
  const fills: { x: number; y: number; reach: number; light: Light; mode: string; mark: number }[] =
    [];
  /** Every stroke drawn: the trails, in order. */
  const strokes: { style: string; points: number[] }[] = [];
  const heads = new Set<number>();
  let points: number[] = [];
  let arcs: number[][] = [];
  /** Where the origin stands: a translation is the only transform the engine sets. */
  let origin = [0, 0];
  const numbered = (key: string) => {
    let mark = marks.get(key);
    if (mark === undefined) marks.set(key, (mark = marks.size + 1));
    return mark;
  };
  const over = (pixel: number, print: number, top: number) => {
    const below = prints[pixel];
    prints[pixel] = below
      ? Math.imul(below ^ Math.imul(print, 0x9e3779b1), 0x85ebca6b) >>> 0 || 1
      : print;
    tops[pixel] = top;
  };
  const mark = (x0: number, y0: number, x1: number, y1: number, made: number) => {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(height, Math.ceil(y1)); y++)
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(width, Math.ceil(x1)); x++)
        over(y * width + x, made, made);
  };
  const recording = {
    canvas,
    fills,
    strokes,
    globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
    lineWidth: 1,
    lineJoin: 'miter' as CanvasLineJoin,
    strokeStyle: '' as Surface['strokeStyle'],
    fillStyle: '' as Surface['fillStyle'],
    clearRect(x: number, y: number, across: number, down: number) {
      for (let row = Math.max(0, y); row < Math.min(height, y + down); row++)
        for (let col = Math.max(0, x); col < Math.min(width, x + across); col++) {
          prints[row * width + col] = 0;
          tops[row * width + col] = 0;
        }
    },
    beginPath() {
      points = [];
      arcs = [];
    },
    moveTo: (x: number, y: number) => void points.push(x, y),
    lineTo: (x: number, y: number) => void points.push(x, y),
    arc: (x: number, y: number, reach: number) =>
      void arcs.push([origin[0] + x, origin[1] + y, reach]),
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
      expect([a, b, c, d]).toEqual([1, 0, 0, 1]);
      origin = [e, f];
    },
    stroke() {
      // A trail is drawn where it lies: the bodies' translation is undone before it.
      expect(origin).toEqual([0, 0]);
      const style = String(this.strokeStyle);
      strokes.push({ style, points });
      const made = numbered(
        `${this.globalCompositeOperation} ${style} ${this.lineWidth} ${points}`,
      );
      const half = this.lineWidth / 2 + 1;
      for (let k = 0; k + 3 < points.length; k += 2) {
        const [x0, y0, x1, y1] = points.slice(k, k + 4);
        mark(
          Math.min(x0, x1) - half,
          Math.min(y0, y1) - half,
          Math.max(x0, x1) + half,
          Math.max(y0, y1) + half,
          made,
        );
      }
    },
    fill() {
      const light = this.fillStyle as unknown as Light;
      for (const [x, y, reach] of arcs) {
        const mode = this.globalCompositeOperation;
        const made = numbered(`${mode} ${JSON.stringify(light)} ${x} ${y} ${reach}`);
        heads.add(made);
        fills.push({ x, y, reach, light, mode, mark: made });
        mark(x - reach - 1, y - reach - 1, x + reach + 1, y + reach + 1, made);
      }
    },
    createRadialGradient(...circles: number[]) {
      const stops: [number, string][] = [];
      const light = {
        circles,
        stops,
        addColorStop: (at: number, colour: string) => stops.push([at, colour]),
      };
      return light as unknown as CanvasGradient;
    },
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
    ) {
      const source = image as typeof canvas & { closed?: boolean };
      // Never a bitmap once it is closed.
      expect(source.closed).toBeFalsy();
      // Only exact copies: whole pixels, one for one, within both canvases, laid over nothing.
      expect([sx, sy, sw, sh, dx, dy].every(Number.isInteger)).toBe(true);
      expect([dw, dh]).toEqual([sw, sh]);
      expect(sx >= 0 && sy >= 0 && sx + sw <= source.width && sy + sh <= source.height).toBe(true);
      expect(dx >= 0 && dy >= 0 && dx + dw <= width && dy + dh <= height).toBe(true);
      expect(this.globalCompositeOperation).toBe('source-over');
      for (let row = 0; row < sh; row++)
        for (let col = 0; col < sw; col++) {
          const from = (sy + row) * source.width + sx + col;
          if (source.prints[from])
            over((dy + row) * width + dx + col, source.prints[from], source.tops[from]);
        }
    },
    /** The heads on the canvas now: the fills whose light lies on top somewhere. */
    lying() {
      const found = new Set<number>();
      for (const top of tops) if (heads.has(top)) found.add(top);
      // In the order they were laid, body by body. A head laid again just where one lay before
      // is the same mark: the latest is the one.
      return [...found]
        .map((made) => fills.map((fill) => fill.mark).lastIndexOf(made))
        .sort((a, b) => a - b)
        .map((at) => fills[at]);
    },
  };
  return recording satisfies Surface;
}

/**
 * The engine with a spare canvas of the test's own, a raster numbering its marks in common with
 * the cells', and kept in `spares` for the test to read.
 */
function lit(
  moving: boolean,
  marks: Marks,
  options: { clock?: () => number; onDrawn?: () => void } = {},
  spares: ReturnType<typeof raster>[] = [],
) {
  return new OrreryEngine(2, moving, {
    ...timeless,
    ...options,
    spare: (width, height) => spares[spares.push(raster(width, height, marks)) - 1],
  });
}

/** Where each body's trail now ends: the last point of its last line. */
function fronts(canvas: ReturnType<typeof raster>) {
  const lines = bodyStrokes(hues).map(({ line }) => line);
  return lines.map((line) => {
    const last = canvas.strokes.filter((stroke) => stroke.style === line).at(-1)!.points;
    return [last.at(-2), last.at(-1)];
  });
}

/** Frames at a display's pace from `from` to `to`, as a page in view gives them. */
function play(engine: OrreryEngine, from: number, to: number, fps = 60) {
  for (let now = from; now < to; now += 1000 / fps) engine.frame(now);
  engine.frame(to);
}

/** A clock that stands still, so a frame's time is never spent: the steps alone bound it. */
const timeless = { clock: () => 0 };

/** A clock on which every look costs a millisecond, as on a machine far slower than this one. */
function slowClock() {
  let ms = 0;
  return { clock: () => (ms += 1), elapsed: () => ms };
}

describe('the Orrery', () => {
  it('fits the plane on the cell, centred, a margin on every side', () => {
    const fit = planeFit([-10, 10, -5, 5], 220, 120, 10);
    expect(fit.scale).toBe(10);
    expect(fit.x + -10 * fit.scale).toBe(10);
    expect(fit.x + 10 * fit.scale).toBe(210);
    expect(fit.y + 0 * fit.scale).toBe(60);
  });

  it('performs a cell in view at the Light film’s pace, in light, one path per body', () => {
    const engine = new OrreryEngine(2, true, timeless);
    const canvas = surface();
    engine.add(31, canvas, window, hues);
    expect(engine.frame(0)).toBe(false);
    engine.visible(31, true, 0);
    expect(engine.frame(0)).toBe(true);
    expect(engine.stepOf(31)).toBe(stepsDrawnAt(0, window.steps) + 1);
    play(engine, 0, 1000);
    expect(engine.stepOf(31)).toBe(stepsDrawnAt(1, window.steps) + 1);
    expect(canvas.globalCompositeOperation).toBe('lighter');
    // The last stroke is a line: the venue's one weight, a CSS pixel at the canvas's density.
    expect(canvas.lineWidth).toBe(2);
    // One path a body for every film frame complete so far, stroked as its glow and its line.
    expect(canvas.calls.strokes % 6).toBe(0);
    expect(canvas.calls.strokes).toBeGreaterThan(0);
    expect(canvas.strokeStyle).toBe(bodyStrokes(hues)[2].line);
    expect(canvas.strokeStyle).toMatch(/^oklch\(0\.84 0\.\d{1,3} 250 \/ 0\.5\)$/);
  });

  it('strokes each body in its own hue, its glow beneath its line along the very same path', () => {
    const trace = tracing();
    const engine = new OrreryEngine(2, false, timeless);
    engine.add(1, trace, window, hues);
    engine.visible(1, true, 0);
    engine.frame(0);
    const lights = bodyStrokes(hues);
    expect(trace.paths.length % 6).toBe(0);
    for (let k = 0; k < trace.paths.length; k += 2) {
      const [glow, line] = [trace.paths[k], trace.paths[k + 1]];
      const body = (k / 2) % 3;
      expect(glow).toMatchObject({ style: lights[body].glow, width: ORRERY.glow.width * 2 });
      expect(line).toMatchObject({ style: lights[body].line, width: 2 });
      expect(line.points).toEqual(glow.points);
    }
    // Each body's light is its published hue, and its three bodies differ.
    expect(lights.map(({ line }) => line.split(' ')[2])).toEqual(['10', '130', '250']);
    expect(new Set(lights.map(({ glow }) => glow)).size).toBe(3);
  });

  it('lets a cell out of view wait where it is, and resume from there', () => {
    const engine = new OrreryEngine(1, true, timeless);
    engine.add(1, surface(), window, hues);
    engine.visible(1, true, 0);
    play(engine, 0, 2000);
    const left = engine.stepOf(1);
    engine.visible(1, false, 2000);
    expect(engine.frame(9000)).toBe(false);
    expect(engine.stepOf(1)).toBe(left);
    engine.visible(1, true, 9000);
    engine.frame(9000);
    expect(engine.stepOf(1)).toBe(left);
    play(engine, 9000, 10_000);
    expect(engine.stepOf(1)).toBe(stepsDrawnAt(3, window.steps) + 1);
  });

  it('holds a finished window, then begins again from its first step', () => {
    const engine = new OrreryEngine(1, true, timeless);
    const canvas = surface();
    engine.add(1, canvas, window, hues);
    engine.visible(1, true, 0);
    // The window is complete on the film's last frame, a frame before the film's end.
    engine.frame(0);
    let finished = 0;
    while (engine.stepOf(1)! < window.steps) engine.frame((finished += 1000 / 60));
    expect(finished).toBeLessThanOrEqual(lightFilmDuration(window.steps) * 1000);
    play(engine, finished, finished + ORRERY.holdMs - 1);
    expect(canvas.calls.clears).toBe(0);
    engine.frame(finished + ORRERY.holdMs);
    expect(canvas.calls.clears).toBe(1);
    expect(engine.stepOf(1)).toBe(stepsDrawnAt(0, window.steps) + 1);
  });

  it('draws each cell whole under a still preference, one a frame, and says so', () => {
    const drawn = vi.fn();
    const engine = new OrreryEngine(1, false, { ...timeless, onDrawn: drawn });
    engine.add(1, surface(), window, hues);
    engine.add(2, surface(), window, hues);
    engine.add(3, surface(), window, hues);
    engine.visible(1, true, 0);
    engine.visible(2, true, 0);
    expect(engine.frame(0)).toBe(true);
    expect(drawn).toHaveBeenLastCalledWith(1);
    expect(engine.stepOf(1)).toBe(window.steps);
    expect(engine.frame(16)).toBe(false);
    expect(drawn).toHaveBeenLastCalledWith(2);
    expect(engine.stepOf(3)).toBe(0);
    expect(engine.frame(32)).toBe(false);
  });

  it('shares a short budget, and a cell short of it slows rather than jumps', () => {
    // Two thousand steps a film frame: frames 200 ms apart ask 24,000 of each of eight cells.
    const big: OrbitWindow = { ...window, steps: 3_600_000 };
    const engine = new OrreryEngine(1, true, timeless);
    const ids = [0, 1, 2, 3, 4, 5, 6, 7];
    for (const id of ids) {
      engine.add(id, surface(), big, hues);
      engine.visible(id, true, 0);
    }
    engine.frame(0);
    let starved = 0;
    for (let now = 200; now <= 600; now += 200) {
      const before = ids.map((id) => engine.stepOf(id)!);
      engine.frame(now);
      const taken = ids.map((id, k) => engine.stepOf(id)! - before[k]);
      expect(taken.reduce((sum, steps) => sum + steps, 0)).toBeLessThanOrEqual(ORRERY.budget);
      for (const steps of taken) expect(steps).toBeLessThanOrEqual(24_000 + 2_000);
      starved += taken.filter((steps) => steps < 24_000).length;
    }
    expect(starved).toBeGreaterThan(0);
  });

  it('keeps a frame within its time: a slow machine performs more slowly, never stalls the page', () => {
    // Two thousand steps a film frame: frames 200 ms apart ask 24,000 of each of eight cells.
    const big: OrbitWindow = { ...window, steps: 3_600_000 };
    const slow = slowClock();
    const engine = new OrreryEngine(1, true, slow);
    const ids = [0, 1, 2, 3, 4, 5, 6, 7];
    for (const id of ids) {
      engine.add(id, surface(), big, hues);
      engine.visible(id, true, 0);
    }
    engine.frame(0);
    const first = engine.stepOf(0)!;
    for (let now = 200; now <= 1800; now += 200) {
      const before = ids.map((id) => engine.stepOf(id)!);
      const looked = slow.elapsed();
      engine.frame(now);
      const taken = ids.reduce((sum, id, k) => sum + engine.stepOf(id)! - before[k], 0);
      // The frame stops soon after its time is spent: some cell has moved, but by far fewer
      // steps than the step budget alone would allow.
      expect(slow.elapsed() - looked).toBeLessThanOrEqual(ORRERY.frameMs + 3);
      expect(taken).toBeGreaterThan(0);
      expect(taken).toBeLessThanOrEqual((ORRERY.frameMs + 1) * ORRERY.chunk);
      expect(taken).toBeLessThan(ORRERY.budget / 4);
    }
    // Shared in turn, every cell has gone on, more slowly than the film and without a jump.
    for (const id of ids) expect(engine.stepOf(id)).toBeGreaterThan(first);
    for (const id of ids) expect(engine.stepOf(id)).toBeLessThan(stepsDrawnAt(1.8, big.steps));
  });

  it('draws a still cell over several frames, and shows it only once it is whole', () => {
    const long: OrbitWindow = { ...window, steps: 180_000 };
    const onDrawn = vi.fn();
    const trace = tracing();
    const engine = new OrreryEngine(1, false, { ...slowClock(), onDrawn });
    engine.add(1, trace, long, hues);
    engine.visible(1, true, 0);
    expect(engine.frame(0)).toBe(true);
    // A slice of the window is integrated, and nothing of it is on the canvas yet.
    expect(engine.stepOf(1)).toBeGreaterThan(0);
    expect(engine.stepOf(1)).toBeLessThan(long.steps);
    expect(trace.paths).toHaveLength(0);
    expect(onDrawn).not.toHaveBeenCalled();
    let frames = 1;
    while (engine.frame(frames * 16)) frames += 1;
    expect(frames).toBeGreaterThan(1);
    expect(onDrawn).toHaveBeenCalledTimes(1);
    expect(onDrawn).toHaveBeenCalledWith(1);
    // The very picture the cell makes drawn in a single frame.
    const once = tracing();
    const quick = new OrreryEngine(1, false, timeless);
    quick.add(1, once, long, hues);
    quick.visible(1, true, 0);
    quick.frame(0);
    expect(trace.paths).toEqual(once.paths);
  });

  it('takes a silence between frames as a pause, so every cell resumes where it stood', () => {
    // A hundred steps a film frame.
    const long: OrbitWindow = { ...window, steps: 180_000 };
    const engine = new OrreryEngine(1, true, timeless);
    const ids = [0, 1, 2, 3];
    for (const id of ids) {
      engine.add(id, surface(), long, hues);
      engine.visible(id, true, 0);
    }
    play(engine, 0, 1000);
    const before = ids.map((id) => engine.stepOf(id)!);
    // A minute with no frames at all, as from a thread busy elsewhere: a moment of it is
    // performed, and no more.
    engine.frame(61_000);
    const after = ids.map((id) => engine.stepOf(id)!);
    const moment = stepsDrawnAt(ORRERY.gapMs / 1000, long.steps);
    ids.forEach((_, k) => expect(after[k] - before[k]).toBeLessThanOrEqual(moment));
    // A second later every cell has gone on by about a second of the film; none stands frozen.
    play(engine, 61_000, 62_000);
    ids.forEach((id, k) => expect(engine.stepOf(id)! - after[k]).toBeGreaterThan(5000));
  });

  it('goes on at the pace of a page that draws only a few frames a second', () => {
    // A hundred steps a film frame, and a page that draws a frame every 400 ms.
    const long: OrbitWindow = { ...window, steps: 180_000 };
    const engine = new OrreryEngine(1, true, timeless);
    engine.add(1, surface(), long, hues);
    engine.visible(1, true, 0);
    engine.frame(0);
    let last = engine.stepOf(1)!;
    for (let now = 400; now <= 4000; now += 400) {
      engine.frame(now);
      // Each frame performs a moment of the film: slower than the film, never standing still.
      expect(engine.stepOf(1)!).toBeGreaterThan(last);
      last = engine.stepOf(1)!;
    }
    expect(last).toBeGreaterThanOrEqual(stepsDrawnAt((10 * ORRERY.gapMs) / 1000, long.steps));
    expect(last).toBeLessThan(stepsDrawnAt(4, long.steps));
  });

  it('ends a performance on the very picture the whole drawing makes, at any display’s pace', () => {
    const picture = (fps: number | null) => {
      const trace = tracing();
      const engine = new OrreryEngine(1, fps !== null, timeless);
      engine.add(1, trace, window, hues);
      engine.visible(1, true, 0);
      if (fps === null) engine.frame(0);
      else play(engine, 0, lightFilmDuration(window.steps) * 1000 + 100, fps);
      return trace.paths;
    };
    const whole = picture(null);
    expect(whole.length).toBeGreaterThan(30);
    for (const fps of [24, 60, 144]) expect(picture(fps)).toEqual(whole);
  });

  it('begins a cell again when its canvas changes size, and not when it keeps it', () => {
    const engine = new OrreryEngine(1, true, timeless);
    const canvas = surface(200, 130);
    engine.add(1, canvas, window, hues);
    engine.visible(1, true, 0);
    engine.frame(0);
    engine.frame(2000);
    engine.resize(1, 200, 130);
    expect(canvas.calls.clears).toBe(0);
    engine.resize(1, 300, 194);
    expect(canvas.canvas).toEqual({ width: 300, height: 194 });
    expect(canvas.calls.clears).toBe(1);
    expect(engine.stepOf(1)).toBe(0);
    engine.resize(1, 0, 194);
    expect(canvas.canvas.width).toBe(300);
  });

  it('begins every cell again when motion is welcomed or put away', () => {
    const drawn = vi.fn();
    const engine = new OrreryEngine(1, true, { ...timeless, onDrawn: drawn });
    const canvas = surface();
    engine.add(1, canvas, window, hues);
    engine.visible(1, true, 0);
    engine.frame(0);
    engine.setMoving(false);
    expect(canvas.calls.clears).toBe(1);
    engine.frame(16);
    expect(drawn).toHaveBeenCalledWith(1);
    engine.setMoving(false);
    expect(canvas.calls.clears).toBe(1);
    engine.setMoving(true);
    expect(canvas.calls.clears).toBe(2);
    expect(engine.stepOf(1)).toBe(0);
  });
});

describe('the bodies at the heads of their trails', () => {
  /**
   * The small window's orbit taken in fifty times as many steps, so it stays on the canvas: a
   * hundred steps a film frame, and a frame at a display's pace draws a film frame.
   */
  const long: OrbitWindow = { ...window, steps: 180_000, dt: window.dt / 50 };
  const places = (heads: { x: number; y: number }[]) => heads.map(({ x, y }) => [x, y]);

  it('lays each body at the front of its trail, and moves it on as the trail goes on', () => {
    const marks: Marks = new Map();
    const canvas = raster(200, 130, marks);
    const engine = lit(true, marks);
    engine.add(1, canvas, long, hues);
    engine.visible(1, true, 0);
    let before: number[][] | null = null;
    let moved = 0;
    for (let now = 0; now < 4000; now += 1000 / 60) {
      const strokes = canvas.strokes.length;
      engine.frame(now);
      const lying = canvas.lying();
      // Nothing is laid before the first film frame is drawn.
      if (!canvas.strokes.length) {
        expect(lying).toHaveLength(0);
        continue;
      }
      // Three bodies on the canvas, each where its own trail ends; no head is left behind.
      expect(lying).toHaveLength(3);
      expect(places(lying)).toEqual(fronts(canvas));
      if (canvas.strokes.length > strokes) {
        // Laid over the trail drawn in the same frame, and somewhere new.
        expect(canvas.fills.slice(-3)).toEqual(lying);
        if (before) expect(places(lying)).not.toEqual(before);
        moved += 1;
      } else expect(places(lying)).toEqual(before);
      before = places(lying);
    }
    // At a display's pace nearly every frame draws a film frame, and the bodies move with it.
    expect(moved).toBeGreaterThan(0.9 * 240);
  });

  it('leaves no mark behind: a performance ends on the very picture drawn whole, bodies and all', () => {
    const marks: Marks = new Map();
    const picture = (fps: number | null) => {
      const canvas = raster(200, 130, marks);
      const engine = lit(fps !== null, marks);
      engine.add(1, canvas, window, hues);
      engine.visible(1, true, 0);
      if (fps === null) engine.frame(0);
      else play(engine, 0, lightFilmDuration(window.steps) * 1000 + 100, fps);
      return canvas;
    };
    const whole = picture(null);
    expect(whole.lying()).toHaveLength(3);
    for (const fps of [24, 60, 144]) {
      const performed = picture(fps);
      // Laid and lifted once for each film frame drawn, and gone without a trace each time.
      expect(performed.fills.length).toBeGreaterThan(3 * 30);
      const differ = performed.canvas.prints.filter((print, k) => print !== whole.canvas.prints[k]);
      expect(differ.length).toBe(0);
      expect(places(performed.lying())).toEqual(places(whole.lying()));
    }
  });

  it('rests each body where the window leaves it under a still preference, and shows none before', () => {
    const marks: Marks = new Map();
    const canvas = raster(200, 130, marks);
    const spare = vi.fn((width: number, height: number) => raster(width, height, marks));
    const onDrawn = vi.fn();
    const engine = new OrreryEngine(2, false, { ...slowClock(), onDrawn, spare });
    engine.add(1, canvas, long, hues);
    engine.visible(1, true, 0);
    let frames = 0;
    while (engine.frame(frames * 16)) {
      frames += 1;
      // Drawn over several frames, and nothing is shown until the cell is whole.
      expect(canvas.fills).toHaveLength(0);
    }
    expect(frames).toBeGreaterThan(1);
    expect(onDrawn).toHaveBeenCalledWith(1);
    // Laid once, over every trail, at the window's end.
    expect(canvas.fills).toHaveLength(3);
    expect(places(canvas.lying())).toEqual(fronts(canvas));
    expect(spare).toHaveBeenCalledTimes(1);
    engine.frame(frames * 16 + 16);
    expect(canvas.fills).toHaveLength(3);
  });

  it('lights each body as the work page does, in its hue, reaching by its mass', () => {
    const marks: Marks = new Map();
    const canvas = raster(200, 130, marks);
    const weighed: OrbitWindow = { ...window, masses: [100, 200, 300] };
    const engine = lit(false, marks);
    engine.add(1, canvas, weighed, hues);
    engine.visible(1, true, 0);
    engine.frame(0);
    const heads = canvas.lying();
    expect(heads).toHaveLength(3);
    heads.forEach(({ x, y, reach, light, mode }, body) => {
      // Made once, centred on its origin, and set where the body stands.
      expect(light.stops).toEqual(bodyGlow(hues[body]));
      expect(light.circles).toEqual([0, 0, 0, 0, 0, reach]);
      expect([x, y]).toEqual(fronts(canvas)[body]);
      expect(reach).toBeCloseTo(bodyReach(weighed.masses[body]) * ORRERY.head.scale * 2, 9);
      // A body lies over the light it leaves, and reaches past the glow of its own trail.
      expect(mode).toBe('source-over');
      expect(reach).toBeGreaterThan(ORRERY.glow.width);
    });
    expect(heads[0].reach).toBeLessThan(heads[1].reach);
    expect(heads[1].reach).toBeLessThan(heads[2].reach);
    // In CSS pixels, as the line is: 5.6 to 8 at the collection's least and greatest masses.
    expect(bodyReach(100) * ORRERY.head.scale).toBeCloseTo(5.57, 2);
    expect(bodyReach(300) * ORRERY.head.scale).toBeCloseTo(8.03, 2);
  });

  it('draws the trails alone where it has no spare canvas to keep what lies under a body', () => {
    const none = vi.fn(() => null);
    for (const spare of [undefined, none]) {
      const canvas = raster();
      const engine = new OrreryEngine(2, true, { ...timeless, ...(spare ? { spare } : {}) });
      engine.add(1, canvas, window, hues);
      engine.visible(1, true, 0);
      play(engine, 0, 4000);
      expect(canvas.strokes.length).toBeGreaterThan(0);
      expect(canvas.fills).toHaveLength(0);
    }
    // Asked for once, not again at every frame.
    expect(none).toHaveBeenCalledTimes(1);
  });

  it('clears the bodies with the trails whenever a cell begins again', () => {
    const marks: Marks = new Map();
    const canvas = raster(200, 130, marks);
    const spares: ReturnType<typeof raster>[] = [];
    const engine = lit(true, marks, {}, spares);
    engine.add(1, canvas, window, hues);
    engine.visible(1, true, 0);
    // Held at the window's end, the bodies rest where it left them, with nothing kept for them.
    const end = lightFilmDuration(window.steps) * 1000 + 100;
    play(engine, 0, end);
    const held = places(canvas.lying());
    play(engine, end, end + ORRERY.holdMs - 200);
    expect(places(canvas.lying())).toEqual(held);
    expect(spares[0].canvas.open.size).toBe(0);
    // The next performance begins on a clear canvas, its bodies where it starts.
    play(engine, end + ORRERY.holdMs - 200, end + ORRERY.holdMs + 1000);
    expect(canvas.lying()).toHaveLength(3);
    expect(places(canvas.lying())).not.toEqual(held);
    expect(places(canvas.lying())).toEqual(fronts(canvas));
    // One bitmap of what lies under moving bodies, and no more.
    expect(spares).toHaveLength(1);
    expect(spares[0].canvas.open.size).toBe(1);
    // A new size begins again from nothing, and so does a change of motion.
    engine.resize(1, 180, 117);
    expect(canvas.lying()).toHaveLength(0);
    expect(spares[0].canvas.open.size).toBe(0);
    engine.setMoving(false);
    engine.frame(end + ORRERY.holdMs + 1100);
    expect(places(canvas.lying())).toEqual(fronts(canvas));
    expect(spares[0].canvas.open.size).toBe(0);
  });

  it('copies under every cell’s bodies at once, into one bitmap a frame', () => {
    const marks: Marks = new Map();
    const spares: ReturnType<typeof raster>[] = [];
    const engine = lit(true, marks, {}, spares);
    const canvases = [1, 2, 3, 4].map((id) => {
      const canvas = raster(200, 130, marks);
      engine.add(id, canvas, long, hues);
      engine.visible(id, true, 0);
      return canvas;
    });
    let frames = 0;
    for (let now = 0; now < 2000; now += 1000 / 60) {
      const taken = spares[0]?.canvas.taken ?? 0;
      engine.frame(now);
      if (!spares.length) continue;
      // However many cells moved, the frame took one bitmap, and the last frame's is closed.
      expect(spares[0].canvas.taken - taken).toBeLessThanOrEqual(1);
      expect(spares[0].canvas.open.size).toBeLessThanOrEqual(1);
      frames += 1;
    }
    expect(spares).toHaveLength(1);
    expect(spares[0].canvas.taken).toBeGreaterThan(0.9 * frames);
    for (const canvas of canvases) {
      expect(canvas.lying()).toHaveLength(3);
      expect(places(canvas.lying())).toEqual(fronts(canvas));
    }
  });

  it('lifts the bodies of a cell that leaves the view, and lays them again on its return', () => {
    const marks: Marks = new Map();
    const canvas = raster(200, 130, marks);
    const spares: ReturnType<typeof raster>[] = [];
    const engine = lit(true, marks, {}, spares);
    engine.add(1, canvas, long, hues);
    engine.visible(1, true, 0);
    play(engine, 0, 1000);
    const there = places(canvas.lying());
    expect(there).toHaveLength(3);
    // Away, it keeps nothing of a frame's bitmap, and its trails are as they were drawn.
    engine.visible(1, false, 1000);
    expect(canvas.lying()).toHaveLength(0);
    expect(spares[0].canvas.open.size).toBe(0);
    // Back, its bodies stand where they were before its trails go on.
    engine.visible(1, true, 5000);
    engine.frame(5000);
    expect(places(canvas.lying())).toEqual(fronts(canvas));
    expect(canvas.lying()).toHaveLength(3);
  });
});
