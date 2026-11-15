import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

const staged = (still = false, onTake?: (leavesEnd: boolean) => void) =>
  renderHook(({ still }) => useWindowClock({ film, still, onTake }), { initialProps: { still } });
/** An ordinary frame of a display, in seconds. */
const A_FRAME = 1 / 60;
/** The slider's last notch: the last of the film's frames, sixty to a second. */
const LAST_NOTCH = film * 60 - 1;

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
      clock.current.forDrawing.ended(A_FRAME);
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
      clock.current.forDrawing.ended(A_FRAME);
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

  describe('how it came to stand at its end', () => {
    /** The drawing reports the film's end, having passed over `leapt` seconds of it unseen. */
    const runOut = (clock: ReturnType<typeof staged>['result'], leapt: number) =>
      act(() => {
        clock.current.forDrawing.transport.current = { kind: 'resting', seconds: film };
        clock.current.forDrawing.said({ kind: 'resting', seconds: film }, null);
        clock.current.forDrawing.ended(leapt);
      });

    it('has none while it plays, and none where it stands whole unwatched', () => {
      expect(staged().result.current.end).toBeNull();
      // Where motion is unwelcome the window is whole from the first: nothing was watched to
      // an end, and no hand set it there.
      const { result: whole } = staged(true);
      expect(whole.current).toMatchObject({ finished: true, end: null });
      act(() => whole.current.forDrawing.holdWhole());
      expect(whole.current.end).toBeNull();
    });

    it('played out where the film’s last frame was an ordinary one', () => {
      const { result: clock } = staged();
      runOut(clock, A_FRAME);
      expect(clock.current).toMatchObject({ finished: true, atEnd: true, end: 'played' });
      // A slow frame is still the film watched: a runner without a GPU takes a third of a
      // second over one.
      const { result: slow } = staged();
      runOut(slow, 0.35);
      expect(slow.current.end).toBe('played');
    });

    it('came late where one frame leapt to it: a tab that came back to a film long over', () => {
      const { result: clock } = staged();
      runOut(clock, 1);
      expect(clock.current).toMatchObject({ finished: true, atEnd: true, end: 'late' });
      const { result: longer } = staged();
      runOut(longer, 300);
      expect(longer.current.end).toBe('late');
    });

    it('was set there by hand where the slider is let go on its last notch, and not while held', () => {
      const { result: clock } = staged();
      act(() => clock.current.playPause());
      act(() => clock.current.scrub(LAST_NOTCH, false));
      // The last notch is the film's end, not a frame short of it. Held there, the window does
      // not yet stand at its end: the hand may carry it back, and what the end offers would
      // come and go under it.
      expect(clock.current).toMatchObject({
        state: { kind: 'scrubbing', seconds: film },
        atEnd: false,
        finished: false,
        end: null,
      });
      act(() => clock.current.scrub(LAST_NOTCH, true));
      expect(clock.current).toMatchObject({
        state: { kind: 'resting', seconds: film },
        atEnd: true,
        finished: true,
        end: 'hand',
      });
      // A notch back, it is in the record again.
      act(() => clock.current.scrub(LAST_NOTCH - 1, true));
      expect(clock.current).toMatchObject({ atEnd: false, end: null });
      expect(clock.current.state.seconds).toBeCloseTo((LAST_NOTCH - 1) / 60, 9);
    });

    it('is set there by hand from a playing window too: let go at the end, it rests there', () => {
      const { result: clock } = staged();
      act(() => clock.current.scrub(LAST_NOTCH, true));
      expect(clock.current).toMatchObject({
        state: { kind: 'resting', seconds: film },
        end: 'hand',
      });
    });

    it('was brought back, from past the frame or from beside the twin', () => {
      const { result: clock } = staged();
      runOut(clock, A_FRAME);
      act(() => clock.current.rest());
      expect(clock.current).toMatchObject({ finished: true, atEnd: true, end: 'returned' });
    });

    it('has none again once the visitor takes the clock from the end', () => {
      for (const take of [
        (clock: ReturnType<typeof staged>['result']) => clock.current.playPause(),
        (clock: ReturnType<typeof staged>['result']) => clock.current.toClosest(12),
        (clock: ReturnType<typeof staged>['result']) => clock.current.scrub(600, false),
      ]) {
        const { result: clock } = staged();
        runOut(clock, A_FRAME);
        expect(clock.current.end).toBe('played');
        act(() => take(clock));
        expect(clock.current.end).toBeNull();
      }
    });

    it('says the clock is being taken before it moves, and whether the window will stand whole no longer', () => {
      let before: unknown = null;
      const onTake = vi.fn((leavesEnd: boolean) => {
        // The clock has not moved yet: what stood because of where it was is still there to
        // ask. (Every take puts a new clock in its place, so the very one is the witness.)
        expect(clock.current.forDrawing.transport.current).toBe(before);
        expect(leavesEnd).toBe(true);
      });
      const { result: clock } = staged(false, onTake);
      runOut(clock, A_FRAME);
      before = clock.current.forDrawing.transport.current;
      // Again: the film is played from its first step, and the words its end offered go.
      act(() => clock.current.playPause());
      expect(onTake).toHaveBeenCalledTimes(1);
      expect(clock.current.forDrawing.transport.current).not.toBe(before);
      onTake.mockImplementation(() => {});
      act(() => clock.current.toClosest(12));
      act(() => clock.current.scrub(600, true));
      expect(onTake).toHaveBeenCalledTimes(3);
      // Brought back whole is no act of the visitor's on the clock.
      act(() => clock.current.rest());
      expect(onTake).toHaveBeenCalledTimes(3);
    });

    it('says whether it stands at the film’s end, as the visitor finds it now', () => {
      const { result: clock } = staged();
      // A film that has yet to begin does not, whatever the slider's own value says.
      expect(clock.current.standsAtEnd()).toBe(false);
      runOut(clock, A_FRAME);
      expect(clock.current.standsAtEnd()).toBe(true);
      // Held on the last notch it does not yet; let go there, it does.
      act(() => clock.current.scrub(LAST_NOTCH, false));
      expect(clock.current.standsAtEnd()).toBe(false);
      act(() => clock.current.scrub(LAST_NOTCH, true));
      expect(clock.current.standsAtEnd()).toBe(true);
      act(() => clock.current.playPause());
      expect(clock.current.standsAtEnd()).toBe(false);
      // Drawn whole where nothing plays, and untouched, it stands there.
      expect(staged(true).result.current.standsAtEnd()).toBe(true);
    });

    it('says the window stands whole all the same where it does', () => {
      // A window performed to its end stays whole under a slider carried back while paused…
      const taken: boolean[] = [];
      const { result: clock } = staged(false, (leavesEnd) => void taken.push(leavesEnd));
      runOut(clock, A_FRAME);
      act(() => clock.current.scrub(600, true));
      // …and one set on its last notch by hand stands there.
      act(() => clock.current.scrub(LAST_NOTCH, true));
      expect(taken).toEqual([false, false]);
      // Where motion is unwelcome it stands whole whatever the clock is asked to do.
      const still: boolean[] = [];
      const { result: whole } = staged(true, (leavesEnd) => void still.push(leavesEnd));
      act(() => whole.current.playPause());
      act(() => whole.current.scrub(600, true));
      expect(still).toEqual([false, false]);
    });
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
