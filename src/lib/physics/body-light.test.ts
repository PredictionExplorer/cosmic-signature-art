import { describe, expect, it } from 'vitest';
import records from '@/lib/art/orbit-records.json';
import { bodyLight, inSrgb, srgbChroma } from './body-light';
import { ORRERY } from './orrery';

/** OKLCh read back out of the CSS colour bodyLight writes. */
function parse(colour: string) {
  const match = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+) \/ ([\d.]+)\)$/.exec(colour);
  if (!match) throw new Error(`not an OKLCh colour: ${colour}`);
  const [lightness, chroma, hue, alpha] = match.slice(1).map(Number);
  return { lightness, chroma, hue, alpha };
}

describe('a body’s light', () => {
  it('knows sRGB’s edges: grey is inside, white and black are its corners, no colour is past them', () => {
    expect(inSrgb(0.5, 0, 0)).toBe(true);
    expect(inSrgb(1, 0, 0)).toBe(true);
    expect(inSrgb(0, 0, 0)).toBe(true);
    expect(inSrgb(1.01, 0, 0)).toBe(false);
    // sRGB's red is OKLCh 0.628 0.258 29.2; a little more chroma there leaves the gamut.
    expect(inSrgb(0.627, 0.25, 29.2)).toBe(true);
    expect(inSrgb(0.628, 0.3, 29.2)).toBe(false);
  });

  it('finds the most chroma sRGB holds at a lightness and hue, and no more', () => {
    for (const [lightness, hue] of [
      [0.84, 250],
      [0.84, 110],
      [0.7, 30],
      [0.7, 145],
      [0.5, 300],
    ]) {
      const most = srgbChroma(lightness, hue);
      expect(most).toBeGreaterThan(0.03);
      expect(inSrgb(lightness, most, hue)).toBe(true);
      expect(inSrgb(lightness, most + 0.002, hue)).toBe(false);
    }
    // Blue holds little chroma when light, yellow a great deal.
    expect(srgbChroma(0.84, 265)).toBeLessThan(0.1);
    expect(srgbChroma(0.84, 110)).toBeGreaterThan(0.15);
    // Past white there is no colour at all.
    expect(srgbChroma(1.2, 40)).toBe(0);
  });

  it('writes the body’s published hue at the stated lightness, share and alpha, inside sRGB', () => {
    const colour = parse(bodyLight(247.5, { lightness: 0.84, share: 0.85, alpha: 0.5 }));
    expect(colour).toMatchObject({ lightness: 0.84, hue: 247.5, alpha: 0.5 });
    expect(colour.chroma).toBeLessThanOrEqual(srgbChroma(0.84, 247.5) * 0.85);
    expect(colour.chroma).toBeGreaterThan(srgbChroma(0.84, 247.5) * 0.85 - 0.001);
  });

  it('keeps every work’s every body inside sRGB, line and glow, in its own hue', () => {
    let bodies = 0;
    for (const record of records.records)
      for (const hue of record.bodyHues)
        for (const tone of [ORRERY.line, ORRERY.glow]) {
          const colour = parse(bodyLight(hue, tone));
          expect(colour.hue).toBe(hue);
          expect(inSrgb(colour.lightness, colour.chroma, colour.hue)).toBe(true);
          // Every hue is drawn as a colour, never as grey.
          expect(colour.chroma).toBeGreaterThan(0.04);
          bodies += 1;
        }
    expect(bodies).toBe(records.records.length * 3 * 2);
  });
});
