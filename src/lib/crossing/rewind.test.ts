import { describe, expect, it } from 'vitest';
import {
  MARK_FLOOR,
  MARK_FULL,
  REWIND_LEAD_S,
  REWIND_MS,
  GROUND_TURN,
  containRect,
  coverLevels,
  frontAt,
  lastMark,
  markWeights,
  maskFrom,
  openingAt,
  parseDuration,
} from './rewind';
import { FRONT_EDGE } from './timing';

/** A one-row field and a matching still, from per-pixel levels and greys. */
function strip(levels: number[], greys: number[]) {
  const field = { data: Uint8Array.from(levels), width: levels.length, height: 1 };
  const rgba = new Uint8ClampedArray(levels.length * 4);
  greys.forEach((grey, p) => rgba.set([grey, grey, grey, 255], p * 4));
  return { field, rgba };
}

describe('where the plate’s film starts', () => {
  it('starts the lead before the first mark, in the player’s own seconds', () => {
    expect(openingAt({ startSeconds: 0 }, 2.5)).toBeCloseTo(2.5 - REWIND_LEAD_S, 12);
    expect(openingAt(undefined, 1.2)).toBeCloseTo(1.2 - REWIND_LEAD_S, 12);
    // Light's first light comes within the lead: the film starts at its own first frame.
    expect(openingAt({ startSeconds: 0 }, 0.2)).toBe(0);
  });

  it('starts an ending, or a film whose first mark is unknown, at its own first frame', () => {
    expect(openingAt({ startSeconds: 22.03 }, 1.2)).toBe(0);
    expect(openingAt({ startSeconds: 0 }, undefined)).toBe(0);
    expect(openingAt({ startSeconds: 0 }, Number.NaN)).toBe(0);
  });
});

describe('the front', () => {
  it('walks the order evenly without the still: every mark stands at 0, none at 1', () => {
    expect(frontAt(0)).toBeCloseTo(1 + FRONT_EDGE, 12);
    expect(frontAt(1)).toBeCloseTo(-FRONT_EDGE, 12);
    expect(frontAt(0.5)).toBeCloseTo(0.5, 12);
    expect(frontAt(-1)).toBe(frontAt(0));
    expect(frontAt(2)).toBe(frontAt(1));
    expect(frontAt(0.3, new Float64Array(256))).toBe(frontAt(0.3));
  });

  it('crosses bare ground at once and spends the run on the marks, latest first', () => {
    // Marks arrive at levels 50 (twice the weight) and 100; the ground beyond them, at 200 and
    // 255, is bare and weighs nothing.
    const weights = new Float64Array(256);
    weights[50] = 2;
    weights[100] = 1;
    // At the start the front stands just past the last mark, not past the bare ground.
    expect(frontAt(0, weights)).toBeCloseTo(100.5 / 255 + FRONT_EDGE, 12);
    // A third of the run takes the later mark away; the rest takes the earlier, twice as heavy.
    expect(frontAt(1 / 3, weights)).toBeCloseTo(99.5 / 255 + FRONT_EDGE / 3, 12);
    expect(frontAt(2 / 3, weights)).toBeCloseTo(50 / 255 - FRONT_EDGE / 3, 12);
    expect(frontAt(1, weights)).toBeCloseTo(49.5 / 255 - FRONT_EDGE, 12);
    // It only ever moves back through the order.
    let previous = Infinity;
    for (let share = 0; share <= 1; share += 1 / 64) {
      const front = frontAt(share, weights);
      expect(front).toBeLessThanOrEqual(previous);
      previous = front;
    }
  });

  it('shows none of the film’s frame while a mark stands, all of it once the front has passed', () => {
    const start = coverLevels(frontAt(0));
    const end = coverLevels(frontAt(1));
    expect([...start].every((alpha) => alpha === 0)).toBe(true);
    expect([...end].every((alpha) => alpha === 255)).toBe(true);
    // Midway, earlier marks stand and later ones have run back, with a soft edge between.
    const middle = coverLevels(0.5);
    expect(middle[0]).toBe(0);
    expect(middle[255]).toBe(255);
    expect(middle[Math.round(0.5 * 255)]).toBeGreaterThan(100);
    expect(middle[Math.round(0.5 * 255)]).toBeLessThan(155);
    for (let level = 1; level < 256; level += 1)
      expect(middle[level]).toBeGreaterThanOrEqual(middle[level - 1]);
  });

  it('turns the bare ground past the last mark by a crossfade, never with the first frame', () => {
    const weights = new Float64Array(256);
    weights[50] = 2;
    weights[100] = 1;
    expect(lastMark(weights)).toBe(100);
    expect(lastMark(null)).toBe(255);
    expect(lastMark(new Float64Array(256))).toBe(255);
    const front = frontAt(0, weights);
    // At the start the front stands past every mark, and the ground has not begun to turn: the
    // canvas is clear, the plate is the still.
    const start = coverLevels(front, undefined, undefined, { above: 100, share: 0 });
    expect([...start].every((alpha) => alpha === 0)).toBe(true);
    // Halfway through its turn the ground past the last mark shows half the film's sheet.
    const turning = coverLevels(front, undefined, undefined, { above: 100, share: 0.5 });
    expect(turning[255]).toBe(128);
    expect(turning[100]).toBe(0);
    // Turned, it is the film's sheet; the marks still stand until the front reaches them.
    const turned = coverLevels(front, undefined, undefined, { above: 100, share: 1 / GROUND_TURN });
    expect(turned[255]).toBe(255);
    expect(turned[50]).toBe(0);
  });

  it('writes the cover into the mask’s alpha alone, a byte of the map for each pixel', () => {
    const { field } = strip([0, 128, 255], [0, 0, 0]);
    const rgba = new Uint8ClampedArray(12).fill(7);
    maskFrom(field, coverLevels(0.5), rgba);
    expect([rgba[3], rgba[7] > 0 && rgba[7] < 255, rgba[11]]).toEqual([0, true, 255]);
    expect([rgba[0], rgba[4], rgba[8]]).toEqual([7, 7, 7]);
  });
});

describe('the marks’ weights', () => {
  it('weigh each pixel by its departure from the sheet, beyond the sheet’s own grain', () => {
    const paper = 236;
    const { field, rgba } = strip(
      [10, 10, 20, 30, 250, 250, 250, 250],
      [
        paper - 200,
        paper - MARK_FULL,
        paper - (MARK_FLOOR + MARK_FULL) / 2,
        paper - MARK_FLOOR,
        paper,
        paper,
        paper + 3,
        paper,
      ],
    );
    const weights = markWeights(field, rgba);
    expect(weights[10]).toBe(2);
    expect(weights[20]).toBeCloseTo(0.5, 12);
    // Grain within the floor, and the bare ground however late the map has it, weigh nothing.
    expect(weights[30]).toBe(0);
    expect(weights[250]).toBe(0);
  });

  it('find the night as the ground of a Light still, and its light as the marks', () => {
    const { field, rgba } = strip([5, 9, 200, 200, 200], [255, 120, 0, 0, 2]);
    const weights = markWeights(field, rgba);
    expect(weights[5]).toBe(1);
    expect(weights[9]).toBe(1);
    expect(weights[200]).toBe(0);
  });
});

describe('the frame’s place and the run’s length', () => {
  it('lays the film’s frame where object-fit: contain lays the player’s', () => {
    expect(containRect({ width: 1280, height: 828 }, { width: 1280, height: 828 })).toEqual({
      x: 0,
      y: 0,
      width: 1280,
      height: 828,
    });
    const rect = containRect({ width: 1280, height: 828 }, { width: 3456, height: 2234 });
    expect(rect.height).toBeCloseTo(2234, 9);
    expect(rect.x).toBeCloseTo((3456 - (1280 * 2234) / 828) / 2, 9);
    expect(rect.y).toBe(0);
  });

  it('reads the run’s length from its token, in milliseconds or seconds', () => {
    expect(parseDuration('1600ms')).toBe(1600);
    expect(parseDuration(' 1.2s ')).toBe(1200);
    expect(parseDuration('')).toBe(REWIND_MS);
    expect(parseDuration('var(--t-turn)')).toBe(REWIND_MS);
    expect(parseDuration('fast', 900)).toBe(900);
  });
});
