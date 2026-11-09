import { describe, expect, it } from 'vitest';
import { performedOrbits } from '@/lib/art/orbit-windows';
import { plateFrame } from '@/lib/art/orbit-frames';
import type { WindowStart } from './framing';
import {
  NUDGE,
  PART_PIXELS,
  doublingOf,
  gapAt,
  gapBetween,
  nudged,
  twinPace,
  twinRun,
} from './twin';

/** A work's window cut short: the same first state, so its first steps are the window's own. */
function opening(id: number, steps: number): WindowStart {
  const [performed] = performedOrbits([id]);
  return { ...performed.window, steps };
}

describe('one part in a trillion', () => {
  it('moves one body along one axis by exactly the nudge, and nothing else', () => {
    const start = opening(31, 1_000);
    const twin = nudged(start, 1, 2, NUDGE);
    for (let i = 0; i < 9; i++) {
      const moved = i === 1 * 3 + 2;
      expect(twin.positions[i]).toBe(moved ? start.positions[i] + NUDGE : start.positions[i]);
      expect(twin.velocities[i]).toBe(start.velocities[i]);
    }
    // The work's own first state is untouched.
    expect(start.positions).toBe(performedOrbits([31])[0].window.positions);
  });

  it('is the work itself when nothing is moved: no gap, no parting', () => {
    const run = twinRun(opening(31, 3_000), plateFrame(31)!, { horizon: 6_000, nudge: 0 });
    expect([...run.gaps].every((gap) => gap === 0)).toBe(true);
    expect(run.gaps).toHaveLength(7);
    expect(run.parted).toBeNull();
    expect(run.doubling).toBeNull();
    expect(run.until).toBe(6_000);
  });

  it('starts a trillionth apart, and grows exponentially, doubling at the physics’ own rate', () => {
    // № 060's gap doubles fastest of those probed, about every 33,000 steps.
    const run = twinRun(opening(60, 200_000), plateFrame(60)!, { horizon: 400_000 });
    expect(run.gaps[0]).toBeCloseTo(NUDGE, 13);
    expect(run.gaps.at(-1)!).toBeGreaterThan(1e-10);
    expect(run.doubling).toBeGreaterThan(20_000);
    expect(run.doubling).toBeLessThan(60_000);
    // Still one line on the plate: a trillionth takes far longer than this to show.
    expect(run.parted).toBeNull();
    // The same arithmetic, the same bits.
    const again = twinRun(opening(60, 200_000), plateFrame(60)!, { horizon: 400_000 });
    expect([...again.gaps]).toEqual([...run.gaps]);
    expect([...again.windowEnd.positions]).toEqual([...run.windowEnd.positions]);
  });

  it('parts when a body stands pixels from the work’s on the plate, and is followed a little on', () => {
    const run = twinRun(opening(31, 2_000), plateFrame(31)!, { horizon: 50_000, nudge: 5 });
    expect(run.parted).not.toBeNull();
    expect(run.until).toBeGreaterThan(run.parted!);
    expect(run.until).toBeLessThanOrEqual(50_000);
    expect(PART_PIXELS).toBeGreaterThanOrEqual(1);
  });

  it('measures the gap body by body, and reads it between the kept ones', () => {
    expect(gapBetween([0, 0, 0, 1, 1, 1, 2, 2, 2], [0, 0, 0, 1, 1, 1, 2, 2, 2])).toBe(0);
    expect(gapBetween([0, 0, 0, 0, 0, 0, 0, 0, 0], [3, 4, 0, 0, 0, 1, 0, 0, 0])).toBe(5);
    const run = { gaps: Float64Array.from([1e-12, 1e-10, 1e-8]), every: 1_000 };
    expect(gapAt(run, 0)).toBe(1e-12);
    expect(gapAt(run, 500)).toBeCloseTo(1e-11, 20);
    expect(gapAt(run, 9_999)).toBe(1e-8);
  });

  it('fits the doubling only to clean growth', () => {
    const doubling = 40_000;
    const gaps = Float64Array.from(
      { length: 1_000 },
      (_, i) => 1e-12 * 2 ** ((i * 1_000) / doubling),
    );
    expect(doublingOf(gaps, 1_000)).toBeCloseTo(doubling, 6);
    expect(doublingOf(new Float64Array(100).fill(1e-12), 1_000)).toBeNull();
  });

  it('carries the pair at the film’s pace, or fast enough to part in about ten seconds', () => {
    const film = 33_300;
    expect(twinPace({ parted: 1_100_000, until: 1_200_000 }, 1_000_000, film)).toBe(film);
    expect(twinPace({ parted: 3_000_000, until: 3_800_000 }, 1_000_000, film)).toBe(200_000);
    // One that never parts reaches its horizon in about twenty.
    expect(twinPace({ parted: null, until: 8_000_000 }, 1_000_000, film)).toBe(350_000);
  });
});
