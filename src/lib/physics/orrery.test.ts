import { describe, expect, it, vi } from 'vitest';
import type { OrbitWindow } from './orbit';
import { lightFilmDuration, stepsDrawnAt } from './light-film';
import { ORRERY, OrreryEngine, planeFit, type Surface } from './orrery';

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
  };
  return recording;
}

/** A surface that keeps every path it strokes: its style and its points, in order. */
function tracing() {
  const paths: { style: string; points: number[] }[] = [];
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
      paths.push({ style: String(this.strokeStyle), points });
    },
  };
  return trace;
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
    expect(canvas.lineWidth).toBe(2);
    // One path a body for every film frame complete so far.
    expect(canvas.calls.strokes % 3).toBe(0);
    expect(canvas.calls.strokes).toBeGreaterThan(0);
    expect(canvas.strokeStyle).toBe('oklch(0.84 0.075 250 / 0.2)');
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
    // A minute with no frames at all, as in a hidden tab.
    engine.frame(61_000);
    const after = ids.map((id) => engine.stepOf(id)!);
    ids.forEach((_, k) => expect(after[k] - before[k]).toBeLessThanOrEqual(100));
    // A second later every cell has gone on by about a second of the film; none stands frozen.
    play(engine, 61_000, 62_000);
    ids.forEach((id, k) => expect(engine.stepOf(id)! - after[k]).toBeGreaterThan(5000));
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
