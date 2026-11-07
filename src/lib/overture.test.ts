import { describe, expect, it } from 'vitest';
import { FRONT_EDGE } from './crossing/timing';
import {
  framePoint,
  overtureLayout,
  overtureShare,
  plateTransform,
  revealAtShare,
} from './overture';

describe('where the Overture stands', () => {
  it('draws a registered score on the plate, in the plate’s own place, on a desk or a phone', () => {
    for (const [viewport, plate] of [
      [
        { width: 1440, height: 1000 },
        { x: 27, y: 52, width: 1386, height: 896 },
      ],
      [
        { width: 390, height: 844 },
        { x: 0, y: 48, width: 390, height: 252 },
      ],
    ] as const)
      expect(overtureLayout(viewport, plate, 20, { registered: true })).toEqual({
        arrangement: 'registered',
        plate,
        score: plate,
      });
  });

  it('scales the film’s frame onto the box laid over the plate', () => {
    const frame = { width: 3456, height: 2234 };
    expect(framePoint(0, 0, frame, { width: 1386, height: 896 })).toEqual([0, 0]);
    expect(framePoint(1728, 1117, frame, { width: 1386, height: 896 })).toEqual([693, 448]);
    expect(framePoint(3456, 2234, frame, { width: 780, height: 504 })).toEqual([780, 504]);
  });

  it('condenses a phone’s plate in its own place, with the score beneath it', () => {
    const plate = { x: 0, y: 48, width: 390, height: 252 };
    const layout = overtureLayout({ width: 390, height: 844 }, plate, 20);
    expect(layout.arrangement).toBe('stacked');
    expect(layout.plate).toEqual(plate);
    expect(layout.score).toEqual({ x: 20, y: 320, width: 350, height: 504 });
  });

  it('sets a desk’s plate beside the score, smaller, both on the screen’s middle', () => {
    const plate = { x: 27, y: 52, width: 1386, height: 896 };
    const {
      arrangement,
      plate: beside,
      score,
    } = overtureLayout({ width: 1440, height: 1000 }, plate, 32);
    expect(arrangement).toBe('beside');
    // The plate keeps its shape, inside the right-hand share and the height.
    expect(beside.width / beside.height).toBeCloseTo(plate.width / plate.height, 9);
    expect(beside.x).toBeGreaterThanOrEqual(1440 * 0.38);
    expect(beside.x + beside.width).toBeLessThanOrEqual(1440 - 32 + 1e-9);
    expect(beside.height).toBeLessThanOrEqual(760);
    expect(beside.y + beside.height / 2).toBeCloseTo(500, 9);
    // The score is square, left of the plate, on the same middle.
    expect(score.width).toBe(score.height);
    expect(score.x + score.width).toBeLessThanOrEqual(beside.x);
    expect(score.y + score.height / 2).toBeCloseTo(500, 9);
  });

  it('scales the plate down from its own place, so it lands at its own size', () => {
    expect(
      plateTransform(
        { x: 27, y: 52, width: 1386, height: 896 },
        { x: 600, y: 250, width: 693, height: 448 },
      ),
    ).toBe('translate(573px, 198px) scale(0.5)');
  });
});

describe('the Overture’s one clock', () => {
  it('runs the share from nothing to all, and holds it there', () => {
    expect([-5, 0, 3_250, 6_500, 9_000].map((at) => overtureShare(at, 6_500))).toEqual([
      0, 0, 0.5, 1, 1,
    ]);
    expect(overtureShare(10, 0)).toBe(1);
  });

  it('reveals the still’s order from just before its first mark to just past its last', () => {
    expect(revealAtShare(0)).toBeCloseTo(-FRONT_EDGE, 12);
    expect(revealAtShare(1)).toBeCloseTo(1 + FRONT_EDGE, 12);
    expect(revealAtShare(0.5)).toBeCloseTo(0.5, 12);
  });
});
