import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  INK_BAND,
  PAPER_DEPTH,
  materialPixel,
  matterOf,
  paperBeneath,
  travelled,
  type Rgb,
  type Toward,
} from './material';

const PAPER: Rgb = [239 / 255, 233 / 255, 221 / 255];
const BLACK: Rgb = [0, 0, 0];
const towards: Toward[] = ['night', 'paper'];

const channel = fc.double({ min: 0, max: 1, noNaN: true });
const colour = fc.tuple(channel, channel, channel);
const share = fc.double({ min: 0, max: 1, noNaN: true });
/** An Ink still's pixel: never brighter than its sheet. */
const inked = fc
  .tuple(share, share, share)
  .map(([r, g, b]) => [PAPER[0] * r, PAPER[1] * g, PAPER[2] * b] as Rgb);

describe('what a place is made of as the front passes', () => {
  it('measures a Turn from the still it leaves', () => {
    expect(travelled(100, 'night')).toBe(0);
    expect(travelled(25, 'night')).toBe(0.75);
    expect(travelled(0, 'night')).toBe(1);
    expect(travelled(0, 'paper')).toBe(0);
    expect(travelled(25, 'paper')).toBe(0.25);
    expect(travelled(140, 'paper')).toBe(1);
    expect(travelled(-10, 'paper')).toBe(0);
  });

  it('is the departing still’s where the front has not reached', () => {
    expect(matterOf(0, 0, 'night')).toEqual({ ground: 1, ink: 1, light: 0 });
    expect(matterOf(0, 0, 'paper')).toEqual({ ground: 0, ink: 0, light: 1 });
  });

  it('is the arriving still’s a trail behind the front', () => {
    expect(matterOf(1, 1, 'night')).toEqual({ ground: 0, ink: 0, light: 1 });
    expect(matterOf(1, 1, 'paper')).toEqual({ ground: 1, ink: 1, light: 0 });
  });

  it('turns the ground and the departing marks with the edge, and brings the arriving marks after', () => {
    // The front has passed and the mark has yet to arrive: bare ground of the arriving kind.
    expect(matterOf(1, 0, 'night')).toEqual({ ground: 0, ink: 0, light: 0 });
    expect(matterOf(1, 0, 'paper')).toEqual({ ground: 1, ink: 0, light: 0 });
    // Half-way across the edge the departing marks are half gone with their ground.
    expect(matterOf(0.5, 0, 'night')).toEqual({ ground: 0.5, ink: 0.5, light: 0 });
    expect(matterOf(0.5, 0, 'paper')).toEqual({ ground: 0.5, ink: 0, light: 0.5 });
  });

  it('paints the Ink still itself where the ground is paper and the ink whole', () => {
    fc.assert(
      fc.property(inked, colour, (ink, light) => {
        const pixel = materialPixel(ink, light, PAPER, { ground: 1, ink: 1, light: 0 });
        pixel.forEach((value, c) => expect(value).toBeCloseTo(Math.max(ink[c], 1 / 1024), 6));
      }),
    );
  });

  it('paints the Light still itself where the ground is night and the light whole', () => {
    fc.assert(
      fc.property(inked, colour, (ink, light) => {
        const pixel = materialPixel(ink, light, PAPER, { ground: 0, ink: 0, light: 1 });
        pixel.forEach((value, c) => expect(value).toBeCloseTo(light[c], 9));
      }),
    );
  });

  it('paints a wall beyond the work in one ground, from night to the sheet’s tone', () => {
    // Beyond the work the Ink still is the sheet's tone and the Light still black.
    for (const toward of towards)
      for (const passed of [0, 0.25, 0.5, 0.75, 1]) {
        const matter = matterOf(passed, passed, toward);
        const pixel = materialPixel(PAPER, BLACK, PAPER, matter);
        pixel.forEach((value, c) => expect(value).toBeCloseTo(PAPER[c] * matter.ground, 9));
      }
  });

  it('never leaves the range a canvas can paint', () => {
    fc.assert(
      fc.property(inked, colour, share, share, (ink, light, passed, arrived) => {
        for (const toward of towards)
          for (const value of materialPixel(ink, light, PAPER, matterOf(passed, arrived, toward))) {
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(1);
          }
      }),
    );
  });

  it('blooms the ink darker and darker on its paper, never lighter', () => {
    const ink: Rgb = [0.2, 0.19, 0.18];
    let before = Infinity;
    for (const bloomed of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      const [r] = materialPixel(ink, BLACK, PAPER, { ground: 1, ink: bloomed, light: 0 });
      expect(r).toBeLessThan(before);
      before = r;
    }
  });

  it('raises the light brighter and brighter on the night', () => {
    const light: Rgb = [0.6, 0.3, 0.8];
    let before = -1;
    for (const lit of [0, 0.25, 0.5, 0.75, 1]) {
      const [r] = materialPixel(PAPER, light, PAPER, { ground: 0, ink: 0, light: lit });
      expect(r).toBeGreaterThan(before);
      before = r;
    }
  });

  it('adds the light to the ground as light adds, never past white', () => {
    // On the edge, light and paper share a pixel: brighter than either alone, and no brighter than 1.
    const light: Rgb = [0.9, 0.9, 0.9];
    const [r] = materialPixel(PAPER, light, PAPER, { ground: 0.5, ink: 0, light: 0.5 });
    expect(r).toBeGreaterThan(PAPER[0] * 0.5);
    expect(r).toBeGreaterThan(light[0] * 0.5);
    expect(r).toBeLessThanOrEqual(1);
  });

  it('finds the paper beneath the ink: the sheet’s own fibres, and its tone under ink', () => {
    // A pixel lighter than the sheet's depth is the sheet itself: its fibres are kept.
    const fibre: Rgb = [PAPER[0] * 0.99, PAPER[1] * 0.98, PAPER[2]];
    expect(paperBeneath(fibre, PAPER)).toEqual([...fibre]);
    // Under deep ink the paper is the sheet's whole tone.
    const beneath = paperBeneath([0.1, 0.1, 0.1], PAPER);
    beneath.forEach((value, c) => expect(value).toBeCloseTo(PAPER[c], 9));
    // Between the two it rises smoothly, never darker than the sheet's depth.
    const wash = paperBeneath([PAPER[0] * (PAPER_DEPTH - INK_BAND / 2), 0.5, 0.5], PAPER);
    expect(wash[0]).toBeGreaterThan(PAPER[0] * PAPER_DEPTH);
    expect(wash[0]).toBeLessThan(PAPER[0]);
  });

  it('keeps the ink’s transmittance defined on a black sheet', () => {
    const pixel = materialPixel(BLACK, BLACK, BLACK, { ground: 1, ink: 1, light: 0 });
    pixel.forEach((value) => expect(Number.isFinite(value)).toBe(true));
  });
});
