import { describe, expect, it } from 'vitest';
import {
  GAMMA,
  absorbance,
  encode,
  hexToLinear,
  inkBody,
  inkOnPaper,
  inkTrail,
  oklchToEngine,
  oklchToLinear,
} from './material';

describe('the materials, as the engine draws them', () => {
  it('reads a sheet’s hex tone into the engine’s light', () => {
    expect(hexToLinear('#ffffff')).toEqual([1, 1, 1]);
    expect(hexToLinear('#000')).toEqual([0, 0, 0]);
    const [r] = hexToLinear('#808080')!;
    expect(r).toBeCloseTo((128 / 255) ** GAMMA, 12);
    expect(hexToLinear('rgb(1 2 3)')).toBeNull();
    expect(hexToLinear('#12345')).toBeNull();
  });

  it('gives back the sheet’s own tone exactly where no ink lies', () => {
    const tone = '#efe8dc';
    const paper = hexToLinear(tone)!;
    const shown = inkOnPaper(paper, [0, 0, 0]).map((channel) =>
      Math.round(encode(channel) * 255)
        .toString(16)
        .padStart(2, '0'),
    );
    expect(`#${shown.join('')}`).toBe(tone);
  });

  it('darkens the sheet as density gathers, never past black', () => {
    const paper = hexToLinear('#efe8dc')!;
    const ink = inkTrail(30);
    const one = inkOnPaper(paper, ink);
    const two = inkOnPaper(paper, [ink[0] * 2, ink[1] * 2, ink[2] * 2]);
    for (let channel = 0; channel < 3; channel++) {
      expect(one[channel]).toBeLessThan(paper[channel]);
      expect(two[channel]).toBeLessThan(one[channel]);
      expect(two[channel]).toBeGreaterThan(0);
    }
  });

  it('turns OKLCH into linear sRGB: white, black and a grey on its own axis', () => {
    expect(oklchToLinear(1, 0, 0).map((c) => +c.toFixed(6))).toEqual([1, 1, 1]);
    expect(oklchToLinear(0, 0, 0)).toEqual([0, 0, 0]);
    const [r, g, b] = oklchToLinear(0.5, 0, 0);
    expect(r).toBeCloseTo(g, 6);
    expect(g).toBeCloseTo(b, 6);
    // Out of gamut, it is clipped to the gamut.
    for (const channel of oklchToLinear(0.9, 0.4, 150)) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(1);
    }
    expect(oklchToEngine(1, 0, 0).map((c) => +c.toFixed(6))).toEqual([1, 1, 1]);
  });

  it('scales an absorbance so its strongest channel is one', () => {
    const taken = absorbance([0.5, 0.25, 0.125]);
    expect(Math.max(...taken)).toBe(1);
    expect(taken[0]).toBeCloseTo(Math.log(2) / Math.log(8), 12);
    for (const hue of [0, 120, 240]) {
      expect(Math.max(...inkTrail(hue))).toBe(1);
      expect(Math.max(...inkBody(hue))).toBe(1);
    }
  });
});
