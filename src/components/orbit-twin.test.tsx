import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { messages } from '@/lib/i18n/messages';
import type { TwinRun } from '@/lib/physics/twin';
import { recordingContext } from '../../tests/canvas-support';
import { TWIN_TONE, twinGrowth, twinLine, type Twin } from './orbit-twin';

/** A window of 1,000 steps; the twin followed 3,000 past it, its gap kept every 1,000. */
const steps = 1_000;
const run: TwinRun = {
  body: 0,
  axis: 0,
  nudge: 1e-12,
  windowEnd: { positions: new Float64Array(9), velocities: new Float64Array(9) },
  // From a trillionth to a hundred: fourteen decades, the last two above one.
  gaps: Float64Array.from([1e-12, 1e-9, 1e-5, 1e-2, 100]),
  every: 1_000,
  parted: 3_000,
  doubling: 250,
  until: 4_000,
};

/** A strip 800 px wide whose lane is 100 px high, at two pixels to one. */
function strip() {
  const drawn = recordingContext();
  return { drawn, on: { context: drawn.context, width: 800, height: 124, lane: 100, ratio: 2 } };
}
/** The line's points, in order, as [x, y]. */
const points = (drawn: ReturnType<typeof recordingContext>) =>
  drawn.calls
    .filter((call) => call.name === 'moveTo' || call.name === 'lineTo')
    .map((call) => call.args as [number, number]);

describe('the gap’s growth beneath the twin', () => {
  it('rules where the frame ends, and draws the gap only as far as the pair has got', () => {
    const { drawn, on } = strip();
    const growth = twinGrowth(on, run, steps);
    growth(2_500);
    expect(drawn.calls[0]).toMatchObject({ name: 'clearRect', args: [0, 0, 800, 124] });
    // The recorded window is a quarter of what was followed: its end is ruled down the lane.
    expect(drawn.named('fillRect')[0]).toMatchObject({
      args: [200, 0, 2, 100],
      set: { fillStyle: 'rgb(241 235 223 / 0.35)' },
    });
    // The gaps kept at steps 0, 1,000 and 2,000: the next was not reached.
    expect(points(drawn).map(([x]) => x)).toEqual([0, 200, 400]);
    expect(drawn.named('stroke')[0].set).toMatchObject({
      strokeStyle: TWIN_TONE.light(0.95),
      lineWidth: 3,
    });
    // Not parted yet: no dot.
    expect(drawn.named('arc')).toEqual([]);
  });

  it('sets the gap on a log scale, from a trillionth at the lane’s foot to its top decade', () => {
    const { drawn, on } = strip();
    twinGrowth(on, run, steps)(4_000);
    const heights = points(drawn).map(([, y]) => y);
    // The lane, two CSS pixels in from each end: 92 px for the fourteen decades from 10⁻¹² to 10².
    expect(heights[0]).toBeCloseTo(96, 9);
    expect(heights[1]).toBeCloseTo(96 - (3 / 14) * 92, 9);
    expect(heights[4]).toBeCloseTo(4, 9);
    // Steady doubling is a straight line: equal decades rise by equal heights.
    const flat = strip();
    twinGrowth(
      flat.on,
      { ...run, gaps: Float64Array.from([1e-12, 1e-9, 1e-6, 1e-3, 1]), parted: null },
      steps,
    )(4_000);
    const rise = points(flat.drawn).map(([, y]) => y);
    for (let i = 1; i < rise.length; i++) expect(rise[i - 1] - rise[i]).toBeCloseTo(23, 9);
    expect(flat.drawn.named('arc')).toEqual([]);
  });

  it('marks where the twin parted, once the pair has reached it', () => {
    const { drawn, on } = strip();
    const growth = twinGrowth(on, run, steps);
    growth(2_999);
    expect(drawn.named('arc')).toEqual([]);
    drawn.clear();
    growth(3_000);
    const [dot] = drawn.named('arc');
    // At the parting's step across the strip, on the line, three CSS pixels round.
    expect(dot.args[0]).toBe(600);
    expect(dot.args[1]).toBeCloseTo(96 - (10 / 14) * 92, 9);
    expect(dot.args[2]).toBe(6);
    expect(dot.set.fillStyle).toBe(TWIN_TONE.light(1));
  });

  it('keeps the frame’s rule on the strip where the twin was followed no farther than the window', () => {
    const { drawn, on } = strip();
    twinGrowth(on, { ...run, until: 500, parted: null }, steps)(500);
    expect(drawn.named('fillRect')[0].args).toEqual([800, 0, 2, 100]);
  });
});

describe('the twin’s line', () => {
  const t = messages('en');
  const words = { t, number: new Intl.NumberFormat('en'), locale: 'en' };
  /** The line as a visitor reads it. */
  const read = (twin: Twin, taken: number, rested = false, pace = 100) =>
    render(<p>{twinLine(twin, { taken, rested }, { steps, pace }, words)}</p>).container
      .textContent;
  const ready: Twin = { phase: 'ready', run, repeat: 0 };

  it('says that the twin is being followed, or that it cannot be', () => {
    expect(read({ phase: 'following' }, steps)).toBe(t.twinWorking.replace('{body}', '1'));
    expect(read({ phase: 'failed' }, steps)).toBe(t.twinUnavailable);
  });

  it('says how far apart the two stand, and at what pace they are carried', () => {
    // The twin parts 2,000 steps past the window: carried at 100 steps a second it would take
    // twenty, so it is carried at twice the film's pace, to part ten seconds in.
    expect(read(ready, 2_000)).toBe('Apart by 1.0 × 10−5 · step 2,000 · 2 times the film’s pace');
    // Where the film's own pace gets there in time, it is the film's pace.
    expect(read(ready, 2_000, false, 500)).toMatch(/ · at the film’s pace$/);
    // Between two kept gaps, evenly in the logarithm.
    expect(read(ready, 1_500)).toMatch(/^Apart by 1\.0 × 10−7 · step 1,500 /);
  });

  it('says where they parted, and how fast the gap had grown, once the pair has reached it', () => {
    expect(read(ready, 2_999)).toMatch(/· step 2,999 ·/);
    expect(read(ready, 3_000)).toBe('Parted at step 3,000. The gap doubled about every 300 steps.');
    // A doubling that could not be fitted is not made up.
    expect(read({ phase: 'ready', run: { ...run, doubling: null }, repeat: 0 }, 3_000)).toMatch(
      /every — steps\.$/,
    );
  });

  it('says that the two stayed one line where the twin never parted', () => {
    const never: Twin = { phase: 'ready', run: { ...run, parted: null }, repeat: 0 };
    expect(read(never, 4_000, true)).toBe('Still one line at step 4,000, apart by 1.0 × 102');
  });
});
