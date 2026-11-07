import { describe, expect, it } from 'vitest';
import type { FramedSamples } from '@/lib/physics/framing';
import type { Plane } from '@/lib/physics/plane';
import { INK_BODY_RADIUS, MATERIALS, planePicture, platePicture } from './orbit-picture';

/** Two samples and the still's step, in two copies: each x is 100 × its pair's index, each y 50. */
const framed: FramedSamples = {
  stride: 100,
  count: 2,
  copies: 2,
  pixels: Float32Array.from({ length: 3 * 2 * 6 }, (_, i) => (i % 2 ? 50 : 100 * (i >> 1))),
};
const frame = { width: 3456, height: 2234 };

describe('the orbit’s picture', () => {
  it('places each body on the plate where the frame puts it, scaled to the canvas', () => {
    const light = platePicture(framed, frame, 'light', 864, 558.5, 2);
    expect(light).toMatchObject({ kind: 'plate', material: 'light', drawn: 6, last: 2 });
    // Sample 1 is pairs 6 to 11; copy 1's body 2 is its sixth, pair 11.
    expect(light.x(1, 5)).toBeCloseTo(100 * 11 * 0.25, 9);
    expect(light.y(1, 5)).toBeCloseTo(50 * 0.25, 9);
    expect(light.body(5)).toBe(2);
    // The still's own step comes after the samples: pair 12 is its first.
    expect(light.x(2, 0)).toBeCloseTo(100 * 12 * 0.25, 9);
  });

  it('draws only the primary copy on Ink, each body at the Ink edition’s size', () => {
    const ink = platePicture(framed, frame, 'ink', 864, 558.5, 2);
    expect(ink.drawn).toBe(3);
    expect(ink.reach(250)).toBeCloseTo(INK_BODY_RADIUS * 558.5, 9);
    // Light's reach follows the mass, but never past a share of the plate.
    const light = platePicture(framed, frame, 'light', 1728, 1117, 2);
    expect(light.reach(125)).toBeCloseTo(Math.cbrt(125) * 0.6 * 2 * 4, 9);
    expect(platePicture(framed, frame, 'light', 358, 231, 2).reach(250)).toBeCloseTo(
      0.035 * 231,
      9,
    );
  });

  it('reads a continuation’s path on the plate, every copy of it', () => {
    const ink = platePicture(framed, frame, 'ink', 3456, 2234, 1);
    const path = Float32Array.from({ length: 2 * 12 }, (_, i) => i);
    expect(ink.continued(path, 12, 1, 2)).toEqual([16, 17]);
  });

  it('fits the plane inside its margin, as Phase A drew it', () => {
    const plane: Plane = {
      u: Float32Array.from([0, 10, 20, 0, 10, 20]),
      v: Float32Array.from([0, 5, 10, 0, 5, 10]),
      bounds: { u0: 0, u1: 20, v0: 0, v1: 10 },
      mean: [0, 0, 0],
      axes: [
        [1, 0, 0],
        [0, 1, 0],
      ],
    };
    const picture = planePicture(plane, 2, 248, 148, 1);
    expect(picture).toMatchObject({ kind: 'plane', material: 'light', drawn: 3, last: 1 });
    // A 200 × 100 window inside 24 px margins, centred: a scale of ten.
    expect(picture.x(0, 0)).toBe(24);
    expect(picture.y(1, 2)).toBe(124);
    expect(picture.continued(Float32Array.from([20, 10, 0, 0, 0, 0]), 6, 0, 0)).toEqual([224, 124]);
  });

  it('paints light adding on night, and ink darkening paper', () => {
    expect(MATERIALS.light.blend).toBe('lighter');
    expect(MATERIALS.ink.blend).toBe('multiply');
    expect(MATERIALS.light.trail(20, 0.2)).toBe('oklch(0.84 0.075 20 / 0.2)');
    expect(MATERIALS.ink.trail(20, 0.2)).toBe('oklch(0.32 0.02 20 / 0.13999999999999999)');
  });
});
