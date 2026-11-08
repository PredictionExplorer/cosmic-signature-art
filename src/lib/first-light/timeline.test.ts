import { describe, expect, it } from 'vitest';
import { FLAT } from './camera';
import { BEATS, DURATION, momentAt, type Choreography } from './timeline';

const CHOREOGRAPHY: Choreography = {
  open: { yaw: 0.6, pitch: 0.25, lens: 0.42, zoom: 1.4, drift: 0, focus: 1 },
  travel: 0.9,
  clock: (share) => share,
  peak: 0.4,
};

const at = (ms: number) => momentAt(ms, CHOREOGRAPHY);
const beginnings = [
  BEATS.open,
  BEATS.open + BEATS.rewind,
  BEATS.open + BEATS.rewind + BEATS.dance,
  BEATS.open + BEATS.rewind + BEATS.dance + BEATS.land,
  DURATION,
];

describe('First Light’s performance', () => {
  it('begins on the still, in the generator’s flat view, with the whole window drawn', () => {
    const moment = at(0);
    expect(moment.beat).toBe('open');
    expect(moment.shot).toEqual(FLAT);
    expect(moment.still).toBe(1);
    expect(moment.drawn).toBe(1);
    expect(moment.heads).toBe(0);
  });

  it('gives the still to its light within the lift, as the picture opens', () => {
    expect(at(BEATS.lift / 2).still).toBeCloseTo(0.5, 9);
    expect(at(BEATS.lift).still).toBe(0);
    expect(at(BEATS.open - 1).shot.lens).toBeCloseTo(CHOREOGRAPHY.open.lens, 3);
  });

  it('ends on the still, flat and whole', () => {
    for (const ms of [DURATION, DURATION + 5_000]) {
      const moment = at(ms);
      expect(moment.beat).toBe('done');
      expect(moment.shot).toEqual(FLAT);
      expect(moment.still).toBe(1);
      expect(moment.drawn).toBe(1);
    }
    // The landing is already flat before the light gives way.
    expect(at(beginnings[3]).shot).toEqual(FLAT);
  });

  it.each(beginnings.slice(0, 4))('moves without a jump where a beat begins (%i ms)', (ms) => {
    const before = at(ms - 0.5);
    const after = at(ms + 0.5);
    for (const key of ['yaw', 'pitch', 'lens', 'zoom', 'drift', 'focus'] as const) {
      expect(Math.abs(after.shot[key] - before.shot[key])).toBeLessThan(2e-3);
    }
    expect(Math.abs(after.drawn - before.drawn)).toBeLessThan(2e-3);
    expect(Math.abs(after.still - before.still)).toBeLessThan(2e-3);
  });

  it('runs the light back into the stars, then draws the window forward on the film’s clock', () => {
    const rewind = [0.1, 0.5, 0.9].map((share) => at(BEATS.open + share * BEATS.rewind).drawn);
    expect(rewind[0]).toBeGreaterThan(rewind[1]);
    expect(rewind[1]).toBeGreaterThan(rewind[2]);
    const start = BEATS.open + BEATS.rewind;
    expect(at(start).drawn).toBe(0);
    expect(at(start + BEATS.dance / 4).drawn).toBeCloseTo(0.25, 9);
    expect(at(start + BEATS.dance - 1).drawn).toBeGreaterThan(0.99);
  });

  it('flares as the bodies pass their closest approach', () => {
    const start = BEATS.open + BEATS.rewind;
    const peak = at(start + CHOREOGRAPHY.peak * BEATS.dance);
    expect(peak.flare).toBeCloseTo(1, 6);
    expect(at(start + 0.1 * BEATS.dance).flare).toBeLessThan(1e-6);
    expect(at(BEATS.open / 2).flare).toBe(0);
  });

  it('travels around the event while it plays, and comes home to land', () => {
    const start = BEATS.open + BEATS.rewind;
    const early = at(start).shot.yaw;
    const late = at(start + BEATS.dance - 1).shot.yaw;
    expect(late).toBeGreaterThan(early);
    expect(late).toBeCloseTo(CHOREOGRAPHY.open.yaw + CHOREOGRAPHY.travel, 3);
    expect(at(beginnings[2] + BEATS.land / 2).beat).toBe('land');
  });

  it('keeps a clock that strays inside the window', () => {
    const wild = momentAt(BEATS.open + BEATS.rewind + 10, { ...CHOREOGRAPHY, clock: () => 7 });
    expect(wild.drawn).toBe(1);
    const shy = momentAt(BEATS.open + BEATS.rewind + 10, { ...CHOREOGRAPHY, clock: () => -3 });
    expect(shy.drawn).toBe(0);
  });
});
