import { describe, expect, it } from 'vitest';
import {
  inkFilmFirstInked,
  inkFilmSchedule,
  inkFilmStep,
  inkFluidTime,
  inkShownAt,
} from './ink-film';
import { lightFilmFrame, lightFilmFrames, stepsDrawnAt } from './light-film';

const STEPS = 1_000_000;

describe("the Ink film's clock", () => {
  it('shows the Light film’s checkpoints, frame for frame', () => {
    const schedule = inkFilmSchedule(STEPS);
    expect(schedule).toHaveLength(lightFilmFrames(STEPS));
    expect(schedule.slice(0, 3)).toEqual([555, 1_110, 1_665]);
    expect(schedule.slice(-2)).toEqual([999_555, 999_999]);
    schedule.forEach((step, frame) => {
      expect(step).toBe(stepsDrawnAt(frame / 60, STEPS));
      // The Light film first draws that step on the same frame.
      expect(lightFilmFrame(step, STEPS)).toBe(frame);
    });
    expect(inkFilmStep(460, STEPS)).toBe(255_855);
  });

  it('runs the window’s fluid time as the generator does: (T·k)/(N − 1), and T at the end', () => {
    const T = 12.578588931086504;
    expect(inkFluidTime(0, STEPS, T)).toBe(0);
    expect(inkFluidTime(39_960, STEPS, T)).toBe((T * 39_960) / 999_999);
    // (T·(N − 1))/(N − 1) may miss T by an ulp; the last knot is T itself.
    expect(inkFluidTime(STEPS - 1, STEPS, T)).toBe(T);
  });

  // The durations are the published certificates' (metadata/ember.json, derived.duration).
  it.each([
    [31, 12.578588931086504, 71],
    [1, 2.1643132141777994, 416],
    [47, 21.96435096328014, 41],
    [50, 8.461940154261331, 106],
  ])('finds № %i’s first ink where its pre-roll of 0.5 ends', (_, duration, frame) => {
    const first = inkFilmFirstInked(STEPS, duration, 0.5);
    expect(first).toBe(frame);
    expect(inkFluidTime(inkFilmStep(first, STEPS), STEPS, duration)).toBeGreaterThanOrEqual(0.5);
    expect(inkFluidTime(inkFilmStep(first - 1, STEPS), STEPS, duration)).toBeLessThan(0.5);
  });

  it('inks a frame whose time is the pre-roll exactly, and the last frame when none reaches it', () => {
    // Over 1,800 steps of duration 1,799 each step is one unit of fluid time.
    expect(inkFilmFirstInked(1_800, 1_799, 3)).toBe(2);
    expect(inkFilmFirstInked(1_800, 1_799, 0)).toBe(0);
    expect(inkFilmFirstInked(STEPS, 0.25, 0.5)).toBe(lightFilmFrames(STEPS) - 1);
  });

  it('shows ink from the first inked frame’s own moment', () => {
    expect(inkShownAt(70 / 60, 71)).toBe(false);
    expect(inkShownAt(71 / 60, 71)).toBe(true);
    expect(inkShownAt(71 / 60 - 1e-12, 71)).toBe(true);
    expect(inkShownAt(0, 0)).toBe(true);
  });
});
