import { describe, expect, it } from 'vitest';
import type { FramedSamples } from '@/lib/physics/framing';
import type { Plane } from '@/lib/physics/plane';
import {
  INK_BODY_RADIUS,
  MATERIALS,
  keptPicture,
  planePicture,
  platePicture,
} from './orbit-picture';

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

  it('stays with one body past the window: the same frame, moved along with it', () => {
    const own = platePicture(framed, frame, 'light', 864, 558.5, 2);
    // Two samples of a path in two copies; body 2 moves 400 right and 100 down between them.
    const path = Float32Array.from([
      ...[1000, 800, 1400, 900, 1700, 1200],
      ...[2400, 1500, 2000, 1300, 1800, 1000],
      ...[1100, 800, 1800, 1000, 1700, 1300],
      ...[2300, 1500, 1600, 1200, 1800, 900],
    ]);
    const kept = keptPicture(own, frame, framed, path, 1, 864, 558.5);
    expect(kept.kept).toMatchObject({ body: 1, towards: 1 });
    // The window is the work's own: only what comes after it is moved.
    expect(kept.x(1, 5)).toBe(own.x(1, 5));
    expect(kept).toMatchObject({ kind: 'plate', material: 'light', drawn: 6, last: 2 });
    // Body 2 holds the middle of the frame at every sample, in both copies…
    for (const sample of [0, 1])
      for (const copy of [0, 1]) {
        const [x, y] = kept.continued(path, 12, sample, copy * 3 + 1);
        expect(x).toBeCloseTo(1728 * 0.25, 9);
        expect(y).toBeCloseTo(1117 * 0.25, 9);
      }
    // …and the others stand from it as they stood: body 1 was 400 left and 100 above it, then
    // 700 left and 200 above.
    expect(kept.continued(path, 12, 0, 0)).toEqual([(1728 - 400) * 0.25, (1117 - 100) * 0.25]);
    expect(kept.continued(path, 12, 1, 0)).toEqual([(1728 - 700) * 0.25, (1117 - 200) * 0.25]);
    // Who is out of it is read in the frame's own pixels, whatever size it is drawn at.
    const far = Float32Array.from([...[100, 1000, 3300, 1100, 1700, 1200]]);
    const lone = keptPicture(
      platePicture(framed, frame, 'ink', 864, 558.5, 2),
      frame,
      framed,
      far,
      0,
      9,
      6,
    );
    // Body 1 can be brought only until body 2 reaches the margin at the right: then body 2
    // is on the picture, and stands outside it once body 1 has moved 300 the other way.
    expect(lone.kept!.towards).toBeGreaterThan(0);
    expect(lone.kept!.towards).toBeLessThan(1);
    expect(lone.outside(far, 6, 0, 1)).toBe(0);
    const later = Float32Array.from([...[-200, 1000, 3300, 1100, 1700, 1200]]);
    expect(lone.outside(Float32Array.from([...far, ...later]), 6, 1, 1)).toBeGreaterThan(0);
    // Where the three stood in the work's own frame as the film ended: where they are brought from.
    expect(kept.kept!.from(path, 12, 3)).toEqual([2400 * 0.25, 1500 * 0.25]);
  });

  it('reads what the film itself showed through the kept picture, once', () => {
    // The film ends with body 1 at the picture's middle and the other two beside it: the
    // picture stays with body 1 there, and nothing is brought.
    const path = Float32Array.from([1728, 1117, 1800, 1117, 2000, 1117]);
    // Three samples of the window (the two, and the still's own step). At the first, body 2
    // stood a tenth of a width to the right of the picture kept on body 1; at the second, body
    // 3 a fifth of a width below it; at the last, body 1 had moved, and body 2 with it.
    const window: FramedSamples = {
      stride: 100,
      count: 2,
      copies: 1,
      pixels: Float32Array.from([
        ...[1728, 1117, 3801.6, 1117, 1728, 1117],
        ...[1728, 1117, 1728, 1117, 1728, 2925.2],
        ...[2728, 1617, 2728, 1617, 1728, 1117],
      ]),
    };
    const own = platePicture(window, frame, 'light', 864, 558.5, 2);
    const kept = keptPicture(own, frame, window, path, 0, 864, 558.5);
    expect(kept.kept!.towards).toBe(1);
    const [one, two, three] = kept.kept!.filmed;
    // The body the picture stays with is never outside it.
    expect(one).toBe(0);
    expect(two).toBeCloseTo(0.1, 6);
    expect(three).toBeCloseTo(0.2, 6);
    // Read when first asked for, and the same reading after.
    expect(kept.kept!.filmed).toBe(kept.kept!.filmed);
    // A body drawn twice is in the picture while either copy is: the film showed it out only
    // as far as the nearer of the two stood.
    const twice: FramedSamples = {
      stride: 100,
      count: 0,
      copies: 2,
      pixels: Float32Array.from([
        ...[1728, 1117, 4492.8, 1117, 1728, 1117],
        ...[1728, 1117, 3801.6, 1117, 1728, 1117],
      ]),
    };
    const both = keptPicture(
      platePicture(twice, frame, 'light', 864, 558.5, 2),
      frame,
      twice,
      Float32Array.from([...path, ...path]),
      0,
      864,
      558.5,
    );
    expect(both.kept!.filmed[1]).toBeCloseTo(0.1, 6);
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
