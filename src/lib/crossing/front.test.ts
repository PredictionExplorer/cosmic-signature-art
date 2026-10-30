import { describe, expect, it } from 'vitest';
import { bandClip, bandFront, sampleField, timeAt, type Field } from './front';

const flat = (value: number, width = 4, height = 4): Field => ({
  data: new Uint8Array(width * height).fill(value),
  width,
  height,
});
const art = { x: 0, y: 100, width: 200, height: 100 };

describe('the front beyond the plate', () => {
  it('samples a map as the GPU does, between texel centres and clamped at the edges', () => {
    const ramp: Field = { data: Uint8Array.from([0, 255]), width: 2, height: 1 };
    expect(sampleField(ramp, 0.25, 0.5)).toBe(0);
    expect(sampleField(ramp, 0.75, 0.5)).toBe(1);
    expect(sampleField(ramp, 0.5, 0.5)).toBeCloseTo(0.5, 12);
    expect(sampleField(ramp, -1, 0.5)).toBe(0);
    expect(sampleField(ramp, 2, 9)).toBe(1);
  });

  it('gives the work its own time and a wall the nearest edge’s time plus the travel', () => {
    const map = flat(51);
    expect(timeAt(map, 100, 150, art, 0.5)).toBeCloseTo(0.2, 12);
    // Half a plate height above the work: the edge's time, then half the travel.
    expect(timeAt(map, 100, 50, art, 0.5)).toBeCloseTo(0.2 + 0.25, 12);
    // Beyond a corner the distance is the corner's.
    expect(timeAt(map, 230, 60, art, 0.5)).toBeCloseTo(0.2 + 0.5 * 0.5, 12);
  });

  it('places the front in each column of the band above, from the edge nearest the work', () => {
    const head = { x: 0, y: 40, width: 200, height: 60 };
    const map = flat(51);
    // The near edge turns at 0.2 and the far edge at 0.2 + 0.5 × 0.6 = 0.5.
    const halfway = bandFront(map, head, art, 0.35, 0.5, 4);
    expect(halfway.nearY).toBe(100);
    expect(halfway.farY).toBe(40);
    expect(halfway.points).toHaveLength(5);
    halfway.points.forEach(({ y }) => expect(y).toBeCloseTo(70, 9));
    expect(bandFront(map, head, art, 0.1, 0.5, 4).points.every(({ y }) => y === 100)).toBe(true);
    expect(bandFront(map, head, art, 0.6, 0.5, 4).points.every(({ y }) => y === 40)).toBe(true);
    // The strip below the work: its near edge is its top.
    const strip = bandFront(map, { x: 0, y: 200, width: 200, height: 40 }, art, 1, 0.5, 2);
    expect([strip.nearY, strip.farY]).toEqual([200, 240]);
  });

  it('follows the work’s order along the band: an early edge lets the front in sooner', () => {
    // Left half of the work arrives first, right half last.
    const split: Field = { data: Uint8Array.from([0, 0, 255, 255]), width: 4, height: 1 };
    const front = bandFront(split, { x: 0, y: 40, width: 200, height: 60 }, art, 0.3, 0.5, 2);
    expect(front.points[0].y).toBeLessThan(front.points[2].y);
  });

  it('clips either side of the front, in the clipped element’s own pixels', () => {
    const front = {
      nearY: 100,
      farY: 40,
      points: [
        { x: 0, y: 70 },
        { x: 100, y: 55.04 },
        { x: 200, y: 100 },
      ],
    };
    expect(bandClip(front, 'near', { x: 0, y: 40 })).toBe(
      'polygon(0px 60px, 200px 60px, 200px 60px, 100px 15px, 0px 30px)',
    );
    expect(bandClip(front, 'far', { x: 0, y: 40 })).toBe(
      'polygon(0px 0px, 200px 0px, 200px 60px, 100px 15px, 0px 30px)',
    );
  });
});
