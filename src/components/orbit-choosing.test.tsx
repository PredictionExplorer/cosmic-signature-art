import { act, renderHook } from '@testing-library/react';
import type { MouseEvent, PointerEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Choice } from './orbit-choice';
import { usePicturePresses, useRing } from './orbit-choosing';
import type { TooSoon } from './orbit-word';

describe('what is pointed at while the visitor chooses', () => {
  it('rings each body pointed at once, whatever the reasons', () => {
    const { result: ring } = renderHook(() => useRing());
    expect(ring.current).toMatchObject({ ringed: [], aiming: false });
    act(() => ring.current.point('focus', 2));
    act(() => ring.current.point('hover', 0));
    act(() => ring.current.point('aim', 2));
    // The focus, a mouse over a word, a mouse on a body: body 3 twice, ringed once.
    expect(ring.current.ringed).toEqual([2, 0]);
    expect(ring.current.aiming).toBe(true);
    act(() => ring.current.doubt([0, 1]));
    expect(ring.current.ringed).toEqual([2, 0, 1]);
    // One reason gone, the others hold.
    act(() => ring.current.point('focus', null));
    expect(ring.current.ringed).toEqual([0, 2, 1]);
  });

  it('keeps the same list while nothing changes, so the numbers are not drawn again', () => {
    const { result: ring } = renderHook(() => useRing());
    act(() => ring.current.point('aim', 1));
    const ringed = ring.current.ringed;
    // A mouse moving on the same body, a focus that was not there leaving, no doubt again.
    act(() => ring.current.point('aim', 1));
    act(() => ring.current.point('focus', null));
    act(() => ring.current.doubt(ringed.slice(0, 0)));
    act(() => ring.current.doubt([]));
    expect(ring.current.ringed).toEqual([1]);
  });

  it('lets everything go at once: a new question, an answer, or the way out', () => {
    const { result: ring } = renderHook(() => useRing());
    act(() => {
      ring.current.point('focus', 0);
      ring.current.point('aim', 1);
      ring.current.doubt([1, 2]);
    });
    expect(ring.current.ringed).toEqual([0, 1, 2]);
    act(() => ring.current.unpoint());
    expect(ring.current).toMatchObject({ ringed: [], aiming: false });
  });
});

describe('a press on the picture while the visitor chooses', () => {
  let clockNow = 0;
  beforeEach(() => {
    clockNow = 1_000;
    vi.spyOn(performance, 'now').mockImplementation(() => clockNow);
  });
  afterEach(() => vi.restoreAllMocks());

  /**
   * A picture 10 px in and 20 px down the window. In it, body 1 is found within 5 px of
   * (100, 100), body 3 within 5 px of (200, 100), and a finger between them, at (150, 100),
   * cannot tell the two apart.
   */
  function staged(asked: number | null = 1) {
    const stage = document.createElement('div');
    stage.getBoundingClientRect = () => ({ left: 10, top: 20 }) as DOMRect;
    const found: Choice['pressed'] = (x, y, finger) =>
      Math.hypot(x - 100, y - 100) <= 5
        ? { body: 0 }
        : Math.hypot(x - 200, y - 100) <= 5
          ? { body: 2 }
          : finger && Math.hypot(x - 150, y - 100) <= 5
            ? { unsure: [0, 2] }
            : null;
    const picture = {
      stage: { current: stage },
      choice: { current: { ring() {}, pressed: found } },
    };
    const ring = { point: vi.fn(), doubt: vi.fn() };
    const onStay = vi.fn();
    const tooSoon = vi.fn<TooSoon>(() => false);
    const hook = renderHook(
      ({ asked }: { asked: number | null }) =>
        usePicturePresses({ ...picture, asked, tooSoon, ring, onStay }),
      { initialProps: { asked } },
    );
    /** A pointer event at a place in the picture. */
    const at = (x: number, y: number, more: { pointerType?: string; detail?: number } = {}) =>
      ({
        clientX: x + 10,
        clientY: y + 20,
        pointerType: 'mouse',
        detail: 1,
        ...more,
      }) as unknown as PointerEvent<HTMLDivElement> & MouseEvent<HTMLDivElement>;
    /** A press and its letting go. */
    const press = (down: ReturnType<typeof at>, up = down) => {
      hook.result.current.hand!.onPointerDown(down);
      hook.result.current.hand!.onClick(up);
    };
    return {
      ...hook,
      hand: () => hook.result.current.hand!,
      at,
      press,
      ring,
      onStay,
      tooSoon,
      picture,
    };
  }

  it('takes no press while no question is asked', () => {
    expect(staged(null).result.current.hand).toBeNull();
  });

  it('stays with the body a press went down on and came up on', () => {
    const { press, at, onStay } = staged();
    press(at(101, 99));
    expect(onStay).toHaveBeenCalledWith(0);
    press(at(200, 100));
    expect(onStay).toHaveBeenLastCalledWith(2);
    // Beside them, nothing.
    press(at(150, 100));
    expect(onStay).toHaveBeenCalledTimes(2);
  });

  it('does not take a drag that happens to end on a body', () => {
    const { press, at, onStay } = staged();
    press(at(150, 60), at(100, 100));
    press(at(200, 100), at(100, 100));
    expect(onStay).not.toHaveBeenCalled();
  });

  it('does not take the letting go of a hold begun before the question, but takes a key', () => {
    const { hand, at, onStay } = staged();
    // A pointer's click with no press on the picture since it asked.
    hand().onClick(at(100, 100));
    expect(onStay).not.toHaveBeenCalled();
    // A key's click counts no presses: it is taken where it lands.
    hand().onClick(at(100, 100, { detail: 0 }));
    expect(onStay).toHaveBeenCalledWith(0);
  });

  it('forgets a press that went down before the question now asked', () => {
    const { hand, at, onStay, rerender } = staged(1);
    hand().onPointerDown(at(100, 100));
    rerender({ asked: 2 });
    hand().onClick(at(100, 100));
    expect(onStay).not.toHaveBeenCalled();
  });

  it('shows a finger the bodies it could not tell apart, and lets the next press clear them', () => {
    const { press, hand, at, ring, onStay } = staged();
    const finger = { pointerType: 'touch' };
    press(at(150, 100, finger));
    expect(ring.doubt).toHaveBeenLastCalledWith([0, 2]);
    expect(onStay).not.toHaveBeenCalled();
    // The next press going down, whatever it finds: the doubt is no longer shown.
    hand().onPointerDown(at(100, 100, finger));
    expect(ring.doubt).toHaveBeenLastCalledWith([]);
    // A mouse at the same place points finely: it finds nothing there, and doubts nothing.
    ring.doubt.mockClear();
    press(at(150, 100));
    expect(ring.doubt).toHaveBeenCalledTimes(1);
    expect(ring.doubt).toHaveBeenLastCalledWith([]);
  });

  it('aims a mouse at the body it is on, and never a finger', () => {
    const { hand, at, ring } = staged();
    hand().onPointerMove(at(100, 100));
    expect(ring.point).toHaveBeenLastCalledWith('aim', 0);
    hand().onPointerMove(at(150, 100));
    expect(ring.point).toHaveBeenLastCalledWith('aim', null);
    hand().onPointerMove(at(200, 100));
    hand().onPointerLeave(at(400, 400));
    expect(ring.point).toHaveBeenLastCalledWith('aim', null);
    ring.point.mockClear();
    hand().onPointerMove(at(100, 100, { pointerType: 'touch' }));
    hand().onPointerLeave(at(100, 100, { pointerType: 'touch' }));
    expect(ring.point).not.toHaveBeenCalled();
  });

  it('finds nothing in a picture that is not drawn', () => {
    const { press, at, onStay, picture } = staged();
    picture.choice.current = null as unknown as typeof picture.choice.current;
    press(at(100, 100));
    expect(onStay).not.toHaveBeenCalled();
  });

  describe('since when the picture has been one to press', () => {
    it('is from when the question was asked, and a press too soon after is not taken', () => {
      const { press, at, onStay, tooSoon } = staged();
      clockNow = 1_250;
      tooSoon.mockReturnValueOnce(true);
      press(at(100, 100));
      // The guard is given the press and the moment the picture came to stand: 1,000.
      expect(tooSoon).toHaveBeenLastCalledWith(expect.objectContaining({ clientX: 110 }), 1_000);
      expect(onStay).not.toHaveBeenCalled();
      press(at(100, 100));
      expect(onStay).toHaveBeenCalledWith(0);
    });

    it('is anew at each question', () => {
      const { press, at, tooSoon, rerender } = staged(1);
      clockNow = 5_000;
      rerender({ asked: 2 });
      press(at(100, 100));
      expect(tooSoon).toHaveBeenLastCalledWith(expect.anything(), 5_000);
    });

    it('is anew when the page moves under the pointer, and when the section says so', () => {
      const { press, at, tooSoon, result } = staged();
      clockNow = 2_000;
      act(() => void window.dispatchEvent(new Event('scroll')));
      press(at(100, 100));
      expect(tooSoon).toHaveBeenLastCalledWith(expect.anything(), 2_000);
      clockNow = 3_000;
      result.current.renew();
      press(at(100, 100));
      expect(tooSoon).toHaveBeenLastCalledWith(expect.anything(), 3_000);
    });

    it('does not follow the page’s scroll once the question is answered', () => {
      const { press, at, tooSoon, rerender } = staged(1);
      rerender({ asked: null });
      clockNow = 9_000;
      act(() => void window.dispatchEvent(new Event('scroll')));
      rerender({ asked: 2 });
      clockNow = 9_500;
      act(() => void window.dispatchEvent(new Event('scroll')));
      press(at(100, 100));
      // Stamped by the second question's own scroll, not left over from in between.
      expect(tooSoon).toHaveBeenLastCalledWith(expect.anything(), 9_500);
    });
  });
});
