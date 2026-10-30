import { describe, expect, it } from 'vitest';
import {
  FRONT_EDGE,
  cubicBezier,
  parseEasing,
  revealAt,
  revealEnd,
  spreadPerPlate,
} from './timing';

describe('the crossing clock', () => {
  it('solves cubic-bezier curves as browsers do', () => {
    const linear = cubicBezier(0, 0, 1, 1);
    for (const x of [0, 0.1, 0.5, 0.9, 1]) expect(linear(x)).toBeCloseTo(x, 5);
    const turn = cubicBezier(0.76, 0, 0.24, 1);
    expect(turn(0)).toBe(0);
    expect(turn(1)).toBe(1);
    expect(turn(0.5)).toBeCloseTo(0.5, 5);
    // A strong ease-in-out: little travel in the first fifth, most of it by four fifths.
    expect(turn(0.2)).toBeLessThan(0.05);
    expect(turn(0.8)).toBeGreaterThan(0.95);
    // ease (0.25, 0.1, 0.25, 1) at x = 0.5 is about 0.8024 in every engine.
    expect(cubicBezier(0.25, 0.1, 0.25, 1)(0.5)).toBeCloseTo(0.8024, 3);
    // Where the curve leaves x = 0 flat, Newton cannot step and bisection finds t: here
    // x = t³, so t = ∛0.00001 and y = 3t² − 2t³.
    const t = Math.cbrt(1e-5);
    expect(cubicBezier(0, 0, 0, 1)(1e-5)).toBeCloseTo(3 * t * t - 2 * t * t * t, 4);
  });

  it('reads the tokens the stylesheet writes, and falls back to linear', () => {
    expect(parseEasing(' cubic-bezier(0.76, 0, 0.24, 1)')(0.5)).toBeCloseTo(0.5, 5);
    expect(parseEasing('ease-in-out')(0.3)).toBe(0.3);
    expect(parseEasing('')(2)).toBe(1);
  });

  it('maps the seam to the reveal, from before the first mark to past the farthest wall', () => {
    expect(revealAt(100, 'night', 1.5)).toBe(-FRONT_EDGE);
    expect(revealAt(0, 'night', 1.5)).toBeCloseTo(1.5, 12);
    expect(revealAt(0, 'paper', 1.5)).toBe(-FRONT_EDGE);
    expect(revealAt(100, 'paper', 1.5)).toBeCloseTo(1.5, 12);
    expect(revealAt(50, 'night', 1)).toBeCloseTo(-FRONT_EDGE + 0.5 * (1 + FRONT_EDGE), 12);
    expect(revealAt(130, 'paper', 1)).toBeCloseTo(1, 12);
  });

  it('counts the walls in plate heights and the map’s spread per frame diagonal', () => {
    // A plate filling its canvas ends at the map's own end plus the soft edge.
    expect(revealEnd({ width: 100, height: 50 }, { x: 0, y: 0, width: 100, height: 50 }, 0.2)).toBe(
      1 + FRONT_EDGE,
    );
    // Walls a hundred pixels wide either side of a fifty-pixel-high plate: the farthest corner
    // lies two plate heights from the plate's nearest edge.
    const end = revealEnd(
      { width: 300, height: 50 },
      { x: 100, y: 0, width: 100, height: 50 },
      0.2,
    );
    expect(end).toBeCloseTo(1 + 0.2 * 2 + FRONT_EDGE, 12);
    // A running head fifty pixels above the plate is one plate height further from the work.
    expect(
      revealEnd(
        { x: 0, y: -50, width: 100, height: 100 },
        { x: 0, y: 0, width: 100, height: 50 },
        0.2,
      ),
    ).toBeCloseTo(1 + 0.2 + FRONT_EDGE, 12);
    expect(spreadPerPlate(0.35, 576, 372)).toBeCloseTo(0.35 * (372 / Math.hypot(576, 372)), 12);
  });
});
