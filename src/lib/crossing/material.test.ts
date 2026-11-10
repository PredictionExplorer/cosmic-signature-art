import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  INK_BAND,
  MATERIAL_EDGE,
  PAPER_DEPTH,
  TOWARD_NIGHT,
  TOWARD_PAPER,
  changesMaterial,
  groundColour,
  groundToward,
  luma,
  markSpan,
  materialAt,
  materialPixel,
  paperBeneath,
  placeIn,
  smoothstep,
  travelled,
  type Material,
  type Rgb,
  type Toward,
} from './material';
import { cubicBezier, invertEasing } from './timing';

const PAPER: Rgb = [239 / 255, 233 / 255, 221 / 255];
const BLACK: Rgb = [0, 0, 0];
const towards: Toward[] = ['night', 'paper'];
/** The seam at a share of a Turn's travel. */
const seamAt = (share: number, toward: Toward) =>
  toward === 'night' ? 100 - share * 100 : share * 100;

const channel = fc.double({ min: 0, max: 1, noNaN: true });
const colour = fc.tuple(channel, channel, channel);
const time = fc.double({ min: 0, max: 1, noNaN: true });
const share = fc.double({ min: 0, max: 1, noNaN: true });

describe('the Turn as a change of material', () => {
  it('changes material on a Turn by time alone', () => {
    expect(changesMaterial('time')).toBe(true);
    // A finger's Turn is the venue's own gesture, and the Overture lands as it always has.
    expect(changesMaterial('drag')).toBe(false);
    expect(changesMaterial('overture')).toBe(false);
    expect(changesMaterial(null)).toBe(false);
  });

  it('measures a Turn from the still it leaves', () => {
    expect(travelled(100, 'night')).toBe(0);
    expect(travelled(0, 'night')).toBe(1);
    expect(travelled(0, 'paper')).toBe(0);
    expect(travelled(100, 'paper')).toBe(1);
    expect(travelled(25, 'night')).toBe(0.75);
    expect(travelled(-10, 'paper')).toBe(0);
    expect(travelled(130, 'paper')).toBe(1);
  });

  it('stands at either end exactly where the stills do', () => {
    const leaveInk = materialAt(100, 'night');
    expect(leaveInk).toMatchObject({ progress: 0, ground: 1, drain: 0, words: 0 });
    expect(leaveInk.ink).toBe(-MATERIAL_EDGE);
    expect(leaveInk.light).toBe(-MATERIAL_EDGE);
    const atNight = materialAt(0, 'night');
    expect(atNight).toMatchObject({ progress: 1, ground: 0, words: 1 });
    expect(atNight.ink).toBeCloseTo(1 + MATERIAL_EDGE, 12);
    expect(atNight.light).toBeCloseTo(1 + MATERIAL_EDGE, 12);
    const leaveLight = materialAt(0, 'paper');
    expect(leaveLight).toMatchObject({ progress: 0, ground: 0, drain: 0, lit: 1, words: 0 });
    expect(leaveLight.ink).toBe(-MATERIAL_EDGE);
    const atPaper = materialAt(100, 'paper');
    expect(atPaper).toMatchObject({ progress: 1, ground: 1, drain: 1, lit: 0, words: 1 });
    expect(atPaper.ink).toBeCloseTo(1 + MATERIAL_EDGE, 12);
  });

  it('keeps each stage in its order and moving one way through the Turn', () => {
    for (const toward of towards) {
      let last: Material | null = null;
      for (let step = 0; step <= 200; step++) {
        const now = materialAt(seamAt(step / 200, toward), toward);
        if (last) {
          // Toward night the ground only cools; toward paper it only warms. The orders only
          // advance, and the words only change hands one way.
          if (toward === 'night') expect(now.ground).toBeLessThanOrEqual(last.ground);
          else expect(now.ground).toBeGreaterThanOrEqual(last.ground);
          expect(now.ink).toBeGreaterThanOrEqual(last.ink);
          expect(now.light).toBeGreaterThanOrEqual(last.light);
          expect(now.drain).toBeGreaterThanOrEqual(last.drain);
          expect(now.lit).toBeLessThanOrEqual(last.lit);
          expect(now.words).toBeGreaterThanOrEqual(last.words);
        }
        last = now;
      }
    }
    // The stages follow one another as the plan reads: toward paper the ground warms first and
    // the ink blooms last; toward night the ink lifts first and the light rises last.
    expect(TOWARD_PAPER.ground[0]).toBeLessThan(TOWARD_PAPER.drain[0]);
    expect(TOWARD_PAPER.drain[1]).toBeLessThanOrEqual(TOWARD_PAPER.ink[1]);
    expect(TOWARD_PAPER.ink[1]).toBe(1);
    expect(TOWARD_NIGHT.ink[0]).toBe(0);
    expect(TOWARD_NIGHT.ink[0]).toBeLessThan(TOWARD_NIGHT.ground[0]);
    expect(TOWARD_NIGHT.ground[0]).toBeLessThan(TOWARD_NIGHT.light[0]);
    expect(TOWARD_NIGHT.light[1]).toBe(1);
  });

  it('keeps the pace of the Turn’s own time through the seam’s slow ends', () => {
    const ease = cubicBezier(0.76, 0, 0.24, 1);
    const clock = invertEasing(ease);
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(materialAt(seamAt(ease(t), 'paper'), 'paper', clock).progress).toBeCloseTo(t, 6);
      expect(materialAt(seamAt(ease(t), 'night'), 'night', clock).progress).toBeCloseTo(t, 6);
    }
    // Whatever a clock rounds to, the ends are the ends.
    expect(materialAt(0, 'paper', () => 0.2).progress).toBe(0);
    expect(materialAt(100, 'paper', () => 0.8).progress).toBe(1);
    expect(materialAt(50, 'paper', () => 1.2).progress).toBe(1);
  });

  it('turns the head’s overlay as far as the ground has come toward its own', () => {
    const change = materialAt(50, 'night');
    expect(groundToward(change, 'paper')).toBe(change.ground);
    expect(groundToward(change, 'night')).toBeCloseTo(1 - change.ground, 12);
  });

  it('paints each published still itself at either end of the Turn, exactly', () => {
    fc.assert(
      fc.property(colour, colour, colour, time, time, (ink, light, paper, a, b) => {
        const at = { ink: a, light: b };
        expect(materialPixel(ink, light, paper, at, materialAt(100, 'night'), 'night')).toEqual(
          ink,
        );
        expect(materialPixel(ink, light, paper, at, materialAt(0, 'night'), 'night')).toEqual(
          light,
        );
        expect(materialPixel(ink, light, paper, at, materialAt(0, 'paper'), 'paper')).toEqual(
          light,
        );
        expect(materialPixel(ink, light, paper, at, materialAt(100, 'paper'), 'paper')).toEqual(
          ink,
        );
      }),
    );
  });

  it('leaves and lands on the stills without a jump', () => {
    fc.assert(
      fc.property(colour, colour, time, time, (ink, light, a, b) => {
        const at = { ink: a, light: b };
        const near = (got: number[], want: Rgb) =>
          got.forEach((value, c) => expect(Math.abs(value - want[c])).toBeLessThan(2e-3));
        near(materialPixel(ink, light, PAPER, at, materialAt(99.9999, 'night'), 'night'), ink);
        near(materialPixel(ink, light, PAPER, at, materialAt(1e-4, 'night'), 'night'), light);
        near(materialPixel(ink, light, PAPER, at, materialAt(1e-4, 'paper'), 'paper'), light);
        near(materialPixel(ink, light, PAPER, at, materialAt(99.9999, 'paper'), 'paper'), ink);
      }),
    );
  });

  it('lays the walls in one ground between night and paper, never a front', () => {
    fc.assert(
      fc.property(share, time, time, fc.constantFrom(...towards), (travel, a, b, toward) => {
        const change = materialAt(seamAt(travel, toward), toward);
        const wall = materialPixel(PAPER, BLACK, PAPER, { ink: a, light: b }, change, toward);
        // Wherever on the wall, and whatever the orders say there: the paper at the ground's share.
        wall.forEach((value, c) => expect(value).toBeCloseTo(PAPER[c] * change.ground, 6));
      }),
    );
    // Mid-way it is neither: the ground lies between night and paper.
    const mid = materialAt(50, 'night').ground;
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(0.8);
  });

  it('blooms the ink in the order it came to rest', () => {
    const dark: Rgb = [0.1, 0.1, 0.12];
    fc.assert(
      fc.property(share, time, time, (travel, a, b) => {
        const change = materialAt(seamAt(travel, 'paper'), 'paper');
        const [early, late] = a < b ? [a, b] : [b, a];
        const first = materialPixel(dark, BLACK, PAPER, { ink: early, light: 0 }, change, 'paper');
        const then = materialPixel(dark, BLACK, PAPER, { ink: late, light: 0 }, change, 'paper');
        // Ink that came to rest earlier is at least as fully there.
        expect(luma(first)).toBeLessThanOrEqual(luma(then) + 1e-9);
      }),
    );
  });

  it('lifts the ink in the reverse of that order', () => {
    const dark: Rgb = [0.1, 0.1, 0.12];
    fc.assert(
      fc.property(share, time, time, (travel, a, b) => {
        const change = materialAt(seamAt(travel, 'night'), 'night');
        const [early, late] = a < b ? [a, b] : [b, a];
        const first = materialPixel(dark, BLACK, PAPER, { ink: early, light: 0 }, change, 'night');
        const last = materialPixel(dark, BLACK, PAPER, { ink: late, light: 0 }, change, 'night');
        // Ink that came to rest last has lifted at least as far.
        expect(luma(last)).toBeGreaterThanOrEqual(luma(first) - 1e-9);
      }),
    );
  });

  it('raises the light in the order its film drew it', () => {
    const glow: Rgb = [0.9, 0.3, 0.2];
    fc.assert(
      fc.property(share, time, time, (travel, a, b) => {
        const change = materialAt(seamAt(travel, 'night'), 'night');
        const [early, late] = a < b ? [a, b] : [b, a];
        const first = materialPixel(PAPER, glow, PAPER, { ink: 0, light: early }, change, 'night');
        const then = materialPixel(PAPER, glow, PAPER, { ink: 0, light: late }, change, 'night');
        // Light drawn earlier is at least as bright.
        expect(luma(first)).toBeGreaterThanOrEqual(luma(then) - 1e-9);
      }),
    );
  });

  it('drains the light’s colour on its way to paper', () => {
    // Where the ground is still dark and the colour has gone, two lights of one brightness are
    // one grey.
    const change: Material = {
      progress: 0.5,
      ground: 0,
      drain: 1,
      lit: 1,
      ink: -MATERIAL_EDGE,
      light: 1 + MATERIAL_EDGE,
      words: 0,
    };
    const red: Rgb = [0.8, 0.2, 0.2];
    const grey = luma(red);
    const green: Rgb = [grey, grey, grey];
    const at = { ink: 1, light: 0 };
    const a = materialPixel(PAPER, red, PAPER, at, change, 'paper');
    const b = materialPixel(PAPER, green, PAPER, at, change, 'paper');
    a.forEach((value, c) => expect(value).toBeCloseTo(b[c], 9));
    expect(Math.max(...a) - Math.min(...a)).toBeLessThan(1e-9);
    // While its colour is its own, it is its own colour.
    const own = materialPixel(PAPER, red, PAPER, at, { ...change, drain: 0 }, 'paper');
    own.forEach((value, c) => expect(value).toBeCloseTo(red[c], 9));
  });

  it('finds the paper beneath the ink: the sheet’s own fibres, and its tone under ink', () => {
    // Paper as deep as the sheet goes is the still itself, fibres and all.
    const fibre: Rgb = [PAPER[0] * 0.98, PAPER[1] * 1.01, PAPER[2]];
    expect(paperBeneath(fibre, PAPER)).toEqual(fibre);
    // Beneath real ink lies the sheet's whole tone, so a bare ground keeps no ghost of it.
    paperBeneath([0.1, 0.1, 0.1], PAPER).forEach((value, c) =>
      expect(value).toBeCloseTo(PAPER[c], 12),
    );
    // And between, across the faintest washes, it is reached without a step.
    const edge = PAPER.map((v) => v * PAPER_DEPTH) as unknown as Rgb;
    const below = PAPER.map((v) => v * (PAPER_DEPTH - 1e-9)) as unknown as Rgb;
    paperBeneath(below, PAPER).forEach((value, c) => expect(value).toBeCloseTo(edge[c], 6));
    const deep = PAPER.map((v) => v * (PAPER_DEPTH - INK_BAND)) as unknown as Rgb;
    paperBeneath(deep, PAPER).forEach((value, c) => expect(value).toBeCloseTo(PAPER[c], 12));
  });

  it('places a time in an order over its marks’ own span', () => {
    expect(placeIn(0.3, [0.2, 0.6])).toBeCloseTo(0.25, 12);
    expect(placeIn(0.1, [0.2, 0.6])).toBe(0);
    expect(placeIn(0.9, [0.2, 0.6])).toBe(1);
    // A span with no breadth still places every time.
    expect(placeIn(0.5, [0.5, 0.5])).toBe(0);
    expect(placeIn(0.6, [0.5, 0.5])).toBe(1);
  });

  it('reads each order’s span from its marks, not its ground', () => {
    const width = 100;
    const height = 50;
    const times = new Uint8Array(width * height);
    const light = new Uint8ClampedArray(width * height * 4);
    const ink = new Uint8ClampedArray(width * height * 4);
    for (let p = 0; p < width * height; p++) {
      // The ground spreads over the whole order; the marks only over 60–160.
      const mark = p % 5 === 0;
      times[p] = mark ? 60 + (p % 101) : (p * 7) % 256;
      const level = mark ? 200 : 2;
      light.set([level, level, level, 255], p * 4);
      const tone = mark ? 40 : 238;
      ink.set([tone, tone - 4, tone - 14, 255], p * 4);
    }
    const [first, last] = markSpan(times, light, 'light');
    expect(first * 255).toBeGreaterThanOrEqual(60);
    expect(first * 255).toBeLessThan(66);
    expect(last * 255).toBeGreaterThan(154);
    expect(last * 255).toBeLessThanOrEqual(160);
    expect(markSpan(times, ink, 'ink')).toEqual([first, last]);
    // With no marks to read, the order is the whole map's.
    expect(markSpan(times, new Uint8ClampedArray(width * height * 4), 'light')).toEqual([0, 1]);
  });

  it('gives the page’s own surfaces the ground in the bytes the canvas paints', () => {
    expect(groundColour(PAPER, 1)).toBe('rgb(239, 233, 221)');
    expect(groundColour(PAPER, 0)).toBe('rgb(0, 0, 0)');
    expect(groundColour(PAPER, 0.5)).toBe('rgb(120, 117, 111)');
    expect(groundColour(PAPER, 2)).toBe('rgb(239, 233, 221)');
  });

  it('eases as GLSL does', () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
  });
});
