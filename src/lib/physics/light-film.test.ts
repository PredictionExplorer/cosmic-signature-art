import { describe, expect, it } from 'vitest';
import { lightFilmDuration, lightFilmFrames, lightFilmSeconds, stepsDrawnAt } from './light-film';

describe("the Light film's clock", () => {
  it('runs 1,802 frames at 60 fps over a million steps', () => {
    expect(lightFilmFrames(1_000_000)).toBe(1802);
    expect(lightFilmDuration(1_000_000)).toBeCloseTo(30.0333, 4);
  });

  it('draws 555 steps a frame and closes on the final step', () => {
    expect(stepsDrawnAt(0, 1_000_000)).toBe(555);
    expect(stepsDrawnAt(1 / 60, 1_000_000)).toBe(1_110);
    expect(stepsDrawnAt(1800 / 60, 1_000_000)).toBe(999_555);
    expect(stepsDrawnAt(1801 / 60, 1_000_000)).toBe(999_999);
    expect(stepsDrawnAt(99, 1_000_000)).toBe(999_999);
  });

  it('places a step at the first frame that draws it', () => {
    expect(lightFilmSeconds(0, 1_000_000)).toBe(0);
    expect(lightFilmSeconds(555, 1_000_000)).toBe(0);
    expect(lightFilmSeconds(556, 1_000_000)).toBe(1 / 60);
    // № 031's closest approach
    expect(lightFilmSeconds(255_842, 1_000_000)).toBe(460 / 60);
    expect(lightFilmSeconds(999_999, 1_000_000)).toBe(1801 / 60);
  });

  it('agrees with itself: a step is drawn by the time its frame shows', () => {
    for (const step of [1, 554, 555, 556, 123_456, 999_555, 999_556, 999_999])
      expect(stepsDrawnAt(lightFilmSeconds(step, 1_000_000), 1_000_000)).toBeGreaterThanOrEqual(
        step,
      );
  });

  it('closes on a final multiple without an extra frame', () => {
    expect(lightFilmFrames(1801)).toBe(1800);
    expect(stepsDrawnAt(1799 / 60, 1801)).toBe(1800);
  });
});
