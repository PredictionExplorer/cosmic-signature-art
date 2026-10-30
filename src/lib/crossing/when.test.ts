import { describe, expect, it } from 'vitest';
import {
  WHEN_GROUND,
  WHEN_RAMP,
  hexLuminance,
  luminance,
  markWeight,
  paintWhen,
  rampAt,
} from './when';

const rgba = (...pixels: number[][]) => Uint8ClampedArray.from(pixels.flat());

describe('the When lens', () => {
  it('runs its stated ramp from blue, through rose, to pale gold', () => {
    expect(rampAt(0)).toEqual([...WHEN_RAMP[0]]);
    expect(rampAt(0.5)).toEqual([...WHEN_RAMP[1]]);
    expect(rampAt(1)).toEqual([...WHEN_RAMP[2]]);
    expect(rampAt(-1)).toEqual(rampAt(0));
    expect(rampAt(0.25)[0]).toBeCloseTo((WHEN_RAMP[0][0] + WHEN_RAMP[1][0]) / 2, 9);
  });

  it('weighs a mark by its brightness in Light and its darkness on the paper in Ink', () => {
    expect(markWeight('light', 0, 0.9)).toBe(0);
    expect(markWeight('light', 0.8, 0.9)).toBe(1);
    const paper = hexLuminance('#f1ebdf');
    expect(paper).toBeCloseTo(luminance(241, 235, 223), 12);
    expect(markWeight('ink', paper, paper)).toBe(0);
    expect(markWeight('ink', 0.05, paper)).toBe(1);
    expect(hexLuminance('not a colour')).toBe(paper);
  });

  it('colours the marks by their own first and last times and darkens the ground', () => {
    // Light: a mark at time 64, another at time 192, and bare black ground at time 255.
    const still = rgba([255, 255, 255, 255], [200, 200, 200, 255], [0, 0, 0, 255]);
    const map = rgba([64, 64, 64, 255], [192, 192, 192, 255], [255, 255, 255, 255]);
    const out = new Uint8ClampedArray(still.length);
    expect(paintWhen(still, map, out, 'light', 0)).toEqual({ first: 64 / 255, last: 192 / 255 });
    expect([...out.slice(0, 3)]).toEqual([...WHEN_RAMP[0]]);
    expect([...out.slice(4, 7)]).toEqual([...WHEN_RAMP[2]]);
    expect([...out.slice(8, 11)]).toEqual([...WHEN_GROUND]);
    expect(out[11]).toBe(255);
  });

  it('reads Ink as sumi on its own paper', () => {
    const paper = hexLuminance('#f1ebdf');
    const still = rgba([20, 20, 20, 255], [241, 235, 223, 255]);
    const map = rgba([10, 0, 0, 255], [250, 0, 0, 255]);
    const out = new Uint8ClampedArray(still.length);
    paintWhen(still, map, out, 'ink', paper);
    expect([...out.slice(0, 3)]).toEqual([...WHEN_RAMP[0]]);
    expect([...out.slice(4, 7)]).toEqual([...WHEN_GROUND]);
  });
});
