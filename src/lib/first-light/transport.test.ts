import { describe, expect, it } from 'vitest';
import {
  CLOSEST_LEAD,
  SLOWED_RATE,
  advance,
  letGo,
  pause,
  play,
  rateAt,
  restingAt,
  scrub,
  toClosest,
  type Transport,
} from './transport';

const FILM = 30;

describe('the orbit section’s clock', () => {
  it('plays at the film’s own pace and rests when the film has ended', () => {
    let clock: Transport = { kind: 'playing', seconds: 0, slowAt: null };
    clock = advance(clock, 2, FILM);
    expect(clock).toEqual({ kind: 'playing', seconds: expect.closeTo(2, 9), slowAt: null });
    expect(advance(clock, 40, FILM)).toEqual({ kind: 'resting', seconds: FILM });
    // Resting, it stays where it is.
    expect(advance(restingAt(5, FILM), 3, FILM)).toEqual({ kind: 'resting', seconds: 5 });
  });

  it('pauses where it stands and plays on from there; at the end it plays from the start', () => {
    const paused = pause({ kind: 'playing', seconds: 12.5, slowAt: null });
    expect(paused).toEqual({ kind: 'resting', seconds: 12.5 });
    expect(play(paused, FILM)).toEqual({ kind: 'playing', seconds: 12.5, slowAt: null });
    expect(play(restingAt(FILM, FILM), FILM)).toEqual({
      kind: 'playing',
      seconds: 0,
      slowAt: null,
    });
  });

  it('slows to a quarter of its pace about the closest approach, and only there', () => {
    expect(rateAt(10, null)).toBe(1);
    expect(rateAt(10, 10)).toBeCloseTo(SLOWED_RATE, 12);
    expect(rateAt(14, 10)).toBeGreaterThan(0.999);
    // From the lead before it, one second of the visitor's time covers less than a second of film.
    let clock = toClosest(10, false);
    expect(clock).toEqual({ kind: 'playing', seconds: 10 - CLOSEST_LEAD, slowAt: 10 });
    clock = advance(clock, 2, FILM);
    expect(clock.seconds).toBeGreaterThan(8.5);
    expect(clock.seconds).toBeLessThan(10);
  });

  it('rests on the closest approach where motion is unwelcome', () => {
    expect(toClosest(10, true)).toEqual({ kind: 'resting', seconds: 10 });
    expect(toClosest(1, false).seconds).toBe(0);
  });

  it('is held by the slider, and let go plays on only if it was playing', () => {
    const playing: Transport = { kind: 'playing', seconds: 4, slowAt: null };
    const held = scrub(playing, 20, FILM);
    expect(held).toEqual({ kind: 'scrubbing', seconds: 20, resume: true, slowAt: null });
    // Held, time does not pass.
    expect(advance(held, 5, FILM)).toBe(held);
    expect(letGo(scrub(held, 18, FILM), FILM)).toEqual({
      kind: 'playing',
      seconds: 18,
      slowAt: null,
    });
    expect(letGo(scrub(restingAt(3, FILM), 7, FILM), FILM)).toEqual({
      kind: 'resting',
      seconds: 7,
    });
    // Let go at the end, it rests there.
    expect(letGo(scrub(playing, 99, FILM), FILM)).toEqual({ kind: 'resting', seconds: FILM });
    expect(scrub(playing, -5, FILM).seconds).toBe(0);
    // Letting go of a clock that is not held changes nothing.
    expect(letGo(playing, FILM)).toBe(playing);
  });
});
