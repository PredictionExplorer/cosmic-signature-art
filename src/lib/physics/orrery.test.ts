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

describe('the Orrery', () => {
  it('fits the plane on the cell, centred, a margin on every side', () => {
    const fit = planeFit([-10, 10, -5, 5], 220, 120, 10);
    expect(fit.scale).toBe(10);
    expect(fit.x + -10 * fit.scale).toBe(10);
    expect(fit.x + 10 * fit.scale).toBe(210);
    expect(fit.y + 0 * fit.scale).toBe(60);
  });

  it('performs a cell in view at the Light film’s pace, in light, one path per body', () => {
    const engine = new OrreryEngine(2, true);
    const canvas = surface();
    engine.add(31, canvas, window, hues);
    expect(engine.frame(0)).toBe(false);
    engine.visible(31, true, 0);
    expect(engine.frame(0)).toBe(true);
    expect(engine.stepOf(31)).toBe(stepsDrawnAt(0, window.steps) + 1);
    engine.frame(1000);
    expect(engine.stepOf(31)).toBe(stepsDrawnAt(1, window.steps) + 1);
    expect(canvas.globalCompositeOperation).toBe('lighter');
    expect(canvas.lineWidth).toBe(2);
    expect(canvas.calls.strokes).toBe(6);
    expect(canvas.strokeStyle).toBe('oklch(0.84 0.075 250 / 0.2)');
  });

  it('lets a cell out of view wait where it is, and resume from there', () => {
    const engine = new OrreryEngine(1, true);
    engine.add(1, surface(), window, hues);
    engine.visible(1, true, 0);
    engine.frame(0);
    engine.frame(2000);
    const left = engine.stepOf(1);
    engine.visible(1, false, 2000);
    expect(engine.frame(9000)).toBe(false);
    expect(engine.stepOf(1)).toBe(left);
    engine.visible(1, true, 9000);
    engine.frame(9000);
    expect(engine.stepOf(1)).toBe(left);
    engine.frame(10_000);
    expect(engine.stepOf(1)).toBe(stepsDrawnAt(3, window.steps) + 1);
  });

  it('holds a finished window, then begins again from its first step', () => {
    const engine = new OrreryEngine(1, true);
    const canvas = surface();
    engine.add(1, canvas, window, hues);
    engine.visible(1, true, 0);
    engine.frame(0);
    const end = lightFilmDuration(window.steps) * 1000;
    engine.frame(end);
    expect(engine.stepOf(1)).toBe(window.steps);
    engine.frame(end + ORRERY.holdMs - 1);
    expect(canvas.calls.clears).toBe(0);
    engine.frame(end + ORRERY.holdMs);
    expect(canvas.calls.clears).toBe(1);
    expect(engine.stepOf(1)).toBe(stepsDrawnAt(0, window.steps) + 1);
  });

  it('draws each cell whole under a still preference, one a frame, and says so', () => {
    const drawn = vi.fn();
    const engine = new OrreryEngine(1, false, drawn);
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
    const big: OrbitWindow = { ...window, steps: 3_600_000 };
    const engine = new OrreryEngine(1, true);
    for (let id = 0; id < 4; id++) {
      engine.add(id, surface(), big, hues);
      engine.visible(id, true, 0);
    }
    engine.frame(0);
    const before = [0, 1, 2, 3].map((id) => engine.stepOf(id)!);
    // Thirty seconds at once asks every cell for its whole window; the budget allows a share.
    engine.frame(30_000);
    const taken = [0, 1, 2, 3].map((id, k) => engine.stepOf(id)! - before[k]);
    expect(taken.reduce((sum, steps) => sum + steps, 0)).toBeLessThanOrEqual(ORRERY.budget);
    const starved = [0, 1, 2, 3].find((id) => engine.stepOf(id)! < big.steps)!;
    const standing = engine.stepOf(starved)!;
    engine.frame(30_016);
    expect(engine.stepOf(starved)! - standing).toBeLessThanOrEqual(ORRERY.budget);
  });

  it('begins a cell again when its canvas changes size, and not when it keeps it', () => {
    const engine = new OrreryEngine(1, true);
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
    const engine = new OrreryEngine(1, true, drawn);
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
