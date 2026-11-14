import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Clock, WindowScene } from './orbit-window';
import { useWindowClock } from './orbit-clock';

/** A film thirty seconds long. */
const film = 30;

/** A scene that keeps what the clock asked of it. */
function laid() {
  const asked: string[] = [];
  const scene: WindowScene = {
    paint: (seconds) => asked.push(`paint ${seconds}`),
    speak: () => asked.push('speak'),
    run: () => asked.push('run'),
  };
  return { scene, asked };
}

const staged = (still = false) =>
  renderHook(({ still }) => useWindowClock({ film, still }), { initialProps: { still } });

describe('the recorded window’s clock', () => {
  it('begins playing from the window’s first step, untouched', () => {
    const { result: clock } = staged();
    expect(clock.current).toMatchObject({
      state: { kind: 'playing', seconds: 0 },
      line: null,
      chosen: false,
      untouched: false,
      playing: true,
      atEnd: false,
      finished: false,
    });
    expect(clock.current.forDrawing.transport.current).toEqual({
      kind: 'playing',
      seconds: 0,
      slowAt: null,
    });
  });

  it('keeps what the drawing says of it: the clock, the line, and that it has ended', () => {
    const { result: clock } = staged();
    const now: Clock = { kind: 'playing', seconds: 12 };
    act(() => clock.current.forDrawing.said(now, 'Step 400,155 of 1,000,000'));
    expect(clock.current).toMatchObject({ state: now, line: 'Step 400,155 of 1,000,000' });
    expect(clock.current.finished).toBe(false);
    act(() => {
      clock.current.forDrawing.said({ kind: 'resting', seconds: film }, null);
      clock.current.forDrawing.ended();
    });
    expect(clock.current).toMatchObject({
      line: null,
      atEnd: true,
      finished: true,
      playing: false,
    });
  });

  it('pauses and plays on at the visitor’s word, and moves the drawing at once', () => {
    const { result: clock } = staged();
    const { scene, asked } = laid();
    const { transport } = clock.current.forDrawing;
    act(() => {
      clock.current.forDrawing.laid(scene);
      transport.current = { kind: 'playing', seconds: 7, slowAt: null };
      clock.current.playPause();
    });
    expect(transport.current).toEqual({ kind: 'resting', seconds: 7 });
    expect(clock.current).toMatchObject({
      state: { kind: 'resting', seconds: 7 },
      chosen: true,
      playing: false,
    });
    expect(asked).toEqual(['paint 7', 'speak', 'run']);
    act(() => clock.current.playPause());
    expect(transport.current).toEqual({ kind: 'playing', seconds: 7, slowAt: null });
    expect(clock.current.playing).toBe(true);
  });

  it('plays again from the first step at the window’s end', () => {
    const { result: clock } = staged();
    act(() => {
      clock.current.forDrawing.transport.current = { kind: 'resting', seconds: film };
      clock.current.forDrawing.said({ kind: 'resting', seconds: film }, null);
      clock.current.forDrawing.ended();
    });
    expect(clock.current.finished).toBe(true);
    act(() => clock.current.playPause());
    expect(clock.current.state).toEqual({ kind: 'playing', seconds: 0 });
    // A window being performed again is no longer done.
    expect(clock.current.finished).toBe(false);
  });

  it('holds the moment the slider sets, and plays on when let go if it was playing', () => {
    const { result: clock } = staged();
    const { scene, asked } = laid();
    act(() => clock.current.forDrawing.laid(scene));
    // The slider counts the film's frames, sixty to a second.
    act(() => clock.current.scrub(600, false));
    expect(clock.current.state).toEqual({ kind: 'scrubbing', seconds: 10 });
    expect(asked.slice(0, 1)).toEqual(['paint 10']);
    act(() => clock.current.scrub(660, true));
    expect(clock.current.state).toEqual({ kind: 'playing', seconds: 11 });
    // Paused first, it rests where it is let go.
    act(() => clock.current.playPause());
    act(() => clock.current.scrub(60, true));
    expect(clock.current.state).toEqual({ kind: 'resting', seconds: 1 });
  });

  it('goes to the closest approach: played slowly from before it', () => {
    const { result: clock } = staged();
    act(() => clock.current.toClosest(12));
    expect(clock.current.forDrawing.transport.current).toEqual({
      kind: 'playing',
      seconds: 10,
      slowAt: 12,
    });
  });

  describe('where motion is unwelcome', () => {
    it('stands whole and untouched until the visitor takes it, whatever it would have played', () => {
      const { result: clock } = staged(true);
      // The transport still holds the performance it would begin where motion is welcome.
      expect(clock.current).toMatchObject({ untouched: true, playing: false, finished: true });
      // The word the visitor finds is Play, and it plays from the first step: the window they
      // see is whole.
      act(() => clock.current.playPause());
      expect(clock.current).toMatchObject({
        state: { kind: 'playing', seconds: 0 },
        chosen: true,
        untouched: false,
        playing: true,
      });
    });

    it('takes a slider moved before the first drawing as moving the whole window', () => {
      const { result: clock } = staged(true);
      act(() => clock.current.scrub(600, true));
      // Let go, it rests: nothing was playing in what the visitor saw.
      expect(clock.current.state).toEqual({ kind: 'resting', seconds: 10 });
    });

    it('rests on the closest approach itself', () => {
      const { result: clock } = staged(true);
      act(() => clock.current.toClosest(12));
      expect(clock.current.state).toEqual({ kind: 'resting', seconds: 12 });
    });
  });

  it('comes back from past the frame with the window whole, and nothing left said', () => {
    const { result: clock } = staged();
    act(() => clock.current.forDrawing.said({ kind: 'playing', seconds: 3 }, 'Step 100,455'));
    act(() => clock.current.rest());
    expect(clock.current).toMatchObject({
      state: { kind: 'resting', seconds: film },
      line: null,
      finished: true,
      atEnd: true,
    });
    expect(clock.current.forDrawing.transport.current).toEqual({ kind: 'resting', seconds: film });
  });

  it('holds the window whole for the drawing, and forgets a scene no longer on the stage', () => {
    const { result: clock } = staged();
    const { scene, asked } = laid();
    act(() => {
      clock.current.forDrawing.laid(scene);
      clock.current.forDrawing.holdWhole();
      clock.current.forDrawing.laid(null);
      clock.current.playPause();
    });
    expect(clock.current.forDrawing.transport.current).toEqual({
      kind: 'playing',
      seconds: 0,
      slowAt: null,
    });
    // With no scene laid out, the clock is set and nothing is drawn.
    expect(asked).toEqual([]);
  });
});
