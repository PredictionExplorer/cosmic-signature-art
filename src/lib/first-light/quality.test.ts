import { describe, expect, it } from 'vitest';
import { Pace } from './quality';

const feed = (pace: Pace, ms: number, frames: number, ratio: number) => {
  let at = ratio;
  for (let i = 0; i < frames; i++) at = pace.next(ms, at);
  return at;
};

describe('First Light’s pace', () => {
  it('keeps the screen’s own density where the device keeps up', () => {
    expect(feed(new Pace(), 8.3, 240, 2)).toBe(2);
    expect(feed(new Pace(), 16.7, 240, 2)).toBe(2);
  });

  it('gives way twice at most where the frames come slowly, never below the CSS pixels', () => {
    const pace = new Pace();
    expect(feed(pace, 40, 24, 2)).toBeCloseTo(4 / 3, 12);
    expect(feed(pace, 40, 24, 4 / 3)).toBe(1);
    expect(feed(pace, 40, 240, 1)).toBe(1);
    const sharp = new Pace();
    expect(feed(sharp, 40, 24, 3)).toBe(2);
    expect(feed(sharp, 40, 24, 2)).toBeCloseTo(4 / 3, 12);
    expect(feed(sharp, 40, 240, 4 / 3)).toBeCloseTo(4 / 3, 12);
  });

  it('pays no heed to a frame held up by a tab coming back, or by a compile', () => {
    const pace = new Pace();
    expect(feed(pace, 900, 100, 2)).toBe(2);
    expect(feed(pace, 0, 100, 2)).toBe(2);
    // One slow frame among quick ones is not a slow device.
    let at = 2;
    for (let i = 0; i < 48; i++) at = pace.next(i % 12 === 0 ? 60 : 9, at);
    expect(at).toBe(2);
  });
});
