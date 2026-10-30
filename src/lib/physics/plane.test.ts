import { describe, expect, it } from 'vitest';
import { principalPlane } from './plane';

describe('the plane of greatest extent', () => {
  it('finds a tilted plane and keeps distances within it', () => {
    // Three bodies on circles of radius 10, 6 and 3 in the plane z = x, sampled 64 times.
    const count = 64;
    const positions = new Float32Array(count * 9);
    const radii = [10, 6, 3];
    for (let s = 0; s < count; s++) {
      const angle = (s / count) * Math.PI * 2;
      radii.forEach((r, b) => {
        const x = r * Math.cos(angle + b);
        const y = r * Math.sin(angle + b);
        positions.set([x / Math.SQRT2, y, x / Math.SQRT2], s * 9 + b * 3);
      });
    }
    const { u, v, bounds } = principalPlane(positions, count);
    for (let s = 0; s < count; s++) {
      for (let b = 0; b < 3; b++) {
        const i = s * 3 + b;
        expect(Math.hypot(u[i], v[i])).toBeCloseTo(radii[b], 3);
      }
    }
    expect(bounds.u1 - bounds.u0).toBeGreaterThan(19);
    expect(bounds.v1 - bounds.v0).toBeGreaterThan(19);
  });
});
