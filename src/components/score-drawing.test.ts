import { describe, expect, it } from 'vitest';
import { drawScore, pairHue, type ScoreTrace } from './score-drawing';

/** A context that records what is drawn, in the order it is drawn. */
function recorder() {
  const calls: { op: string; args: unknown[]; style?: string; alpha?: number }[] = [];
  const state = { strokeStyle: '', fillStyle: '', globalAlpha: 1, lineWidth: 1 };
  const context = new Proxy(state, {
    get(target, key: string) {
      if (key in target) return target[key as keyof typeof target];
      return (...args: unknown[]) =>
        calls.push({
          op: key,
          args,
          style: key === 'fillRect' ? target.fillStyle : target.strokeStyle,
          alpha: target.globalAlpha,
        });
    },
    set(target, key: string, value) {
      (target as Record<string, unknown>)[key] = value;
      return true;
    },
  });
  return { context: context as unknown as CanvasRenderingContext2D, calls, state };
}

const trace: ScoreTrace = {
  // Four samples of the three separations: 1–2 nears at the third, 2–3 stays wide.
  separations: Float32Array.from([10, 20, 100, 5, 20, 100, 1, 20, 100, 10, 20, 100]),
  count: 4,
  stride: 10,
  closestApproach: { step: 20 },
  syzygies: [15],
  crossings: [5, 25],
};

describe('the score as it is drawn', () => {
  it('takes the hue between two bodies the short way round the circle', () => {
    expect(pairHue([10, 30, 0], [0, 1])).toBeCloseTo(20, 9);
    // № 035's bodies 1 and 2 sit either side of red: their pair is red, not cyan.
    expect(pairHue([344.0948245538694, 33.17474751689802, 0], [0, 1])).toBeCloseTo(8.635, 3);
    expect(pairHue([350, 10, 0], [0, 1])).toBeCloseTo(0, 9);
    expect(pairHue([10, 350, 0], [0, 1])).toBeCloseTo(0, 9);
    expect(pairHue([0, 0, 200], [1, 2])).toBeCloseTo(280, 9);
  });

  it('draws each pair apart upward in its hue, and ticks the events from the base', () => {
    const { context, calls, state } = recorder();
    drawScore(context, trace, [0, 120, 240], {
      ratio: 2,
      x: (step) => step * 10,
      lane: { top: 2, height: 20 },
      base: 30,
      ticks: { crossing: 3, syzygy: 6, closest: 15 },
      lineAlpha: 0.5,
      ink: 'rgb(241 235 223)',
    });
    const strokes = calls.filter((call) => call.op === 'stroke');
    expect(strokes.map((call) => call.style)).toEqual([
      'oklch(0.8 0.07 60 / 0.5)',
      'oklch(0.8 0.07 300 / 0.5)',
      'oklch(0.8 0.07 180 / 0.5)',
    ]);
    // Pair 1–2: logarithmic between the nearest (1, at the lane's foot) and widest (100, its top).
    const first = calls.slice(
      0,
      calls.findIndex((call) => call.op === 'stroke'),
    );
    const points = first.filter((call) => call.op === 'moveTo' || call.op === 'lineTo');
    expect(points.map((call) => call.args[0])).toEqual([0, 100, 200, 300]);
    expect(points[2].args[1]).toBeCloseTo(22, 9);
    expect(points[0].args[1]).toBeCloseTo(2 + (1 - Math.log(10) / Math.log(100)) * 20, 9);
    const ticks = calls.filter((call) => call.op === 'fillRect');
    expect(ticks.map((call) => [call.args, call.alpha])).toEqual([
      [[50, 24, 2, 6], 0.4],
      [[250, 24, 2, 6], 0.4],
      [[150, 18, 2, 12], 0.8],
      [[200, 0, 2, 30], 1],
    ]);
    expect(ticks.every((call) => call.style === 'rgb(241 235 223)')).toBe(true);
    expect(state.globalAlpha).toBe(1);
  });

  it('draws every nth sample when asked, and a flat score without dividing by nothing', () => {
    const { context, calls } = recorder();
    const flat = { ...trace, separations: new Float32Array(12).fill(7) };
    drawScore(context, flat, [0, 0, 0], {
      ratio: 1,
      x: (step) => step,
      lane: { top: 0, height: 10 },
      base: 10,
      ticks: { crossing: 1, syzygy: 2, closest: 3 },
      lineAlpha: 1,
      ink: 'white',
      every: 2,
    });
    const points = calls.filter((call) => call.op === 'moveTo' || call.op === 'lineTo');
    expect(points).toHaveLength(6);
    expect(points.every((call) => call.args[1] === 10)).toBe(true);
  });
});
