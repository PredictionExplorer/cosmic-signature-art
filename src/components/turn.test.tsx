import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BREATH_MS,
  EXPRESSION_KEY,
  SeamController,
  Turn,
  TurnLayer,
  forgetExpression,
  rememberExpression,
  seamFor,
  setThemeColor,
  useRememberedExpression,
} from './turn';

const root = () => document.documentElement;

beforeEach(() => {
  vi.useFakeTimers();
  forgetExpression();
  root().removeAttribute('data-turning');
  root().style.removeProperty('--seam');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the seam', () => {
  it('shows Ink at 100 % and Light at 0 %', () => {
    expect(seamFor('ink')).toBe(100);
    expect(seamFor('light')).toBe(0);
    expect(seamFor('future')).toBe(100);
  });

  it('breathes, then travels from paper to night and reports the halfway point', async () => {
    const seam = new SeamController();
    const halfway = vi.fn();
    const travel = seam.animateTo(0, { halfway });
    expect(root().hasAttribute('data-turning')).toBe(false);
    await act(async () => vi.advanceTimersByTime(BREATH_MS));
    expect(root().getAttribute('data-turning')).toBe('time');
    expect(root().style.getPropertyValue('--seam')).toBe('0%');
    await act(async () => vi.advanceTimersByTime(450));
    expect(halfway).toHaveBeenCalledOnce();
    await act(async () => vi.advanceTimersByTime(500));
    await expect(travel).resolves.toBe(true);
    expect(root().getAttribute('data-turn-to')).toBe('night');
    seam.end();
    // The seam outlasts the commit by one chrome beat, so the head's overlay covers its fade.
    expect(root().getAttribute('data-turning')).toBe('time');
    await act(async () => vi.advanceTimersByTime(300));
    expect(root().hasAttribute('data-turning')).toBe(false);
    expect(root().hasAttribute('data-turn-to')).toBe(false);
    expect(root().style.getPropertyValue('--seam')).toBe('');
  });

  it('a second request for the target already in flight inherits what is left of the travel', async () => {
    const seam = new SeamController();
    const first = seam.animateTo(0, { breath: false });
    await act(async () => vi.advanceTimersByTime(400));
    // A tap after a held key: the seam completes in its own time instead of snapping.
    const second = seam.animateTo(0, { breath: false });
    await expect(first).resolves.toBe(false);
    let settled = false;
    void second.then(() => {
      settled = true;
    });
    await act(async () => vi.advanceTimersByTime(100));
    expect(settled).toBe(false);
    await act(async () => vi.advanceTimersByTime(500));
    await expect(second).resolves.toBe(true);
  });

  it('a newer travel supersedes an older one, which then resolves false without committing', async () => {
    const seam = new SeamController();
    const first = seam.animateTo(0, { breath: false });
    const second = seam.animateTo(100, { breath: false });
    await act(async () => vi.advanceTimersByTime(1000));
    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(true);
    expect(root().style.getPropertyValue('--seam')).toBe('100%');
  });

  it('a finger paints every frame itself and the return has no breath', async () => {
    const seam = new SeamController();
    seam.begin('drag', 100);
    expect(root().getAttribute('data-turning')).toBe('drag');
    expect(root().style.getPropertyValue('--seam')).toBe('100%');
    seam.set(37.5);
    expect(seam.seam).toBe(37.5);
    seam.set(140);
    expect(seam.seam).toBe(100);
    const back = seam.animateTo(100, { breath: false });
    expect(root().getAttribute('data-turning')).toBe('time');
    await act(async () => vi.advanceTimersByTime(40));
    // From 100 to 100 there is nothing to travel; the promise still waits one frame.
    await expect(back).resolves.toBe(true);
  });

  it('knows where the seam is on any frame of a travel, and takes the crossing’s longer clock', async () => {
    root().setAttribute('data-crossing', 'arrival');
    try {
      const seam = new SeamController();
      expect(seam.current()).toBeNull();
      const travel = seam.animateTo(0, { breath: false });
      const started = performance.now();
      // The curve is symmetric, so halfway through its time the seam is halfway across.
      expect(seam.current(started)).toBe(100);
      expect(seam.current(started + 1000)).toBeCloseTo(50, 6);
      expect(seam.current(started + 60_000)).toBe(0);
      let settled = false;
      void travel.then(() => {
        settled = true;
      });
      // The crossing in the order the work was made runs two seconds, not the seam's 900 ms.
      await act(async () => vi.advanceTimersByTime(1500));
      expect(settled).toBe(false);
      await act(async () => vi.advanceTimersByTime(600));
      await expect(travel).resolves.toBe(true);
      // A finger's position is the seam itself.
      seam.set(30);
      expect(seam.current()).toBe(30);
      seam.end();
    } finally {
      root().removeAttribute('data-crossing');
    }
  });

  it('springs a crossing back in its share of the order’s time', async () => {
    root().setAttribute('data-crossing', 'arrival');
    try {
      const seam = new SeamController();
      seam.begin('drag', 100);
      seam.set(80);
      // A fifth of the plate returns in a fifth of the two seconds.
      const back = seam.animateTo(100, { breath: false });
      expect(root().style.getPropertyValue('--t-crossing')).toBe('400ms');
      let settled = false;
      void back.then(() => {
        settled = true;
      });
      await act(async () => vi.advanceTimersByTime(300));
      expect(settled).toBe(false);
      await act(async () => vi.advanceTimersByTime(200));
      await expect(back).resolves.toBe(true);
      seam.end();
      await act(async () => vi.advanceTimersByTime(300));
      expect(root().style.getPropertyValue('--t-crossing')).toBe('');
    } finally {
      root().removeAttribute('data-crossing');
    }
  });

  it('end() cancels a travel in flight', async () => {
    const seam = new SeamController();
    const travel = seam.animateTo(0, { breath: false });
    seam.end();
    await act(async () => vi.advanceTimersByTime(1000));
    await expect(travel).resolves.toBe(false);
    expect(seam.mode).toBeNull();
    expect(seam.seam).toBeNull();
  });

  it('flips only the status bar at the halfway point', () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
    setThemeColor('night');
    expect(meta.content).toBe('#000000');
    setThemeColor('paper');
    expect(meta.content).toBe('#f1ebdf');
    meta.remove();
  });
});

describe('the remembered expression', () => {
  it('remembers only a real choice between the two expressions for the session', () => {
    const { result } = renderHook(() => useRememberedExpression());
    expect(result.current).toBeNull();
    act(() => rememberExpression('light'));
    expect(result.current).toBe('light');
    expect(sessionStorage.getItem(EXPRESSION_KEY)).toBe('light');
    act(() => rememberExpression('ink'));
    expect(result.current).toBe('ink');
    act(() => rememberExpression('spectral'));
    expect(result.current).toBeNull();
    expect(sessionStorage.getItem(EXPRESSION_KEY)).toBeNull();
  });

  it('reads a choice left by an earlier page of the same visit', () => {
    sessionStorage.setItem(EXPRESSION_KEY, 'light');
    forgetExpressionCache();
    const { result } = renderHook(() => useRememberedExpression());
    expect(result.current).toBe('light');
  });
});

/** The store caches its first read; a test that seeds storage directly must drop the cache only. */
function forgetExpressionCache() {
  const kept = sessionStorage.getItem(EXPRESSION_KEY);
  forgetExpression();
  if (kept) sessionStorage.setItem(EXPRESSION_KEY, kept);
}

/** A spring-back travels (--t-turn), resolves, then drops the seam a chrome beat later. */
async function springBack() {
  await act(async () => vi.advanceTimersByTime(1000));
  await act(async () => {});
  await act(async () => vi.advanceTimersByTime(300));
}

describe('drag-to-Turn', () => {
  function layout() {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 1000,
      bottom: 600,
      width: 1000,
      height: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    Object.defineProperty(Element.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
  }
  const touch = (clientX: number, clientY = 300) => ({
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    clientX,
    clientY,
  });

  it('carries the seam with the finger and completes past 40 % of the plate', () => {
    layout();
    const seam = new SeamController();
    const onCommit = vi.fn();
    render(
      <Turn expression="ink" seam={seam} canTurn onCommit={onCommit}>
        <TurnLayer expression="ink" current>
          <p>paper</p>
        </TurnLayer>
        <TurnLayer expression="light" current={false}>
          <p>night</p>
        </TurnLayer>
      </Turn>,
    );
    const turn = screen.getByText('paper').closest('[data-expression]')!;
    fireEvent.pointerDown(turn, touch(900));
    fireEvent.pointerMove(turn, touch(895));
    expect(seam.mode).toBeNull();
    fireEvent.pointerMove(turn, touch(700));
    expect(seam.mode).toBe('drag');
    expect(root().getAttribute('data-turn-to')).toBe('night');
    // The seam moves by the finger's travel from where it rested, never to the finger itself.
    expect(seam.seam).toBe(80);
    expect(turn).toHaveAttribute('data-dragging');
    fireEvent.pointerMove(turn, touch(500));
    expect(seam.seam).toBe(60);
    fireEvent.pointerUp(turn, touch(500));
    expect(onCommit).toHaveBeenCalledWith('light');
    // The click a browser synthesises right after the drag is not a choice.
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    turn.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(screen.getByText('night').closest('[data-layer]')).toHaveAttribute('inert');
    expect(screen.getByText('paper').closest('[data-layer]')).not.toHaveAttribute('inert');
  });

  it('springs back below the threshold and ignores a drag toward the current expression', async () => {
    layout();
    const seam = new SeamController();
    const onCommit = vi.fn();
    render(
      <Turn expression="ink" seam={seam} canTurn onCommit={onCommit}>
        <TurnLayer expression="ink" current>
          <p>paper</p>
        </TurnLayer>
      </Turn>,
    );
    const turn = screen.getByText('paper').closest('[data-expression]')!;
    fireEvent.pointerDown(turn, touch(900));
    fireEvent.pointerMove(turn, touch(800));
    fireEvent.pointerUp(turn, touch(800));
    expect(onCommit).not.toHaveBeenCalled();
    expect(seam.mode).toBe('time');
    await springBack();
    expect(seam.mode).toBeNull();
    // A touch that starts in the left third moves the seam by its travel: a nudge never commits.
    fireEvent.pointerDown(turn, touch(300));
    fireEvent.pointerMove(turn, touch(100));
    expect(seam.seam).toBe(80);
    fireEvent.pointerUp(turn, touch(100));
    expect(onCommit).not.toHaveBeenCalled();
    await springBack();
    expect(seam.mode).toBeNull();
    // Rightward from Ink reveals nothing: the scroll keeps the gesture.
    fireEvent.pointerDown(turn, touch(200));
    fireEvent.pointerMove(turn, touch(400));
    expect(seam.mode).toBeNull();
    fireEvent.pointerUp(turn, touch(400));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('an interrupted touch springs back and never commits', async () => {
    layout();
    const seam = new SeamController();
    const onCommit = vi.fn();
    render(
      <Turn expression="ink" seam={seam} canTurn onCommit={onCommit}>
        <TurnLayer expression="ink" current>
          <p>paper</p>
        </TurnLayer>
      </Turn>,
    );
    const turn = screen.getByText('paper').closest('[data-expression]')!;
    fireEvent.pointerDown(turn, touch(900));
    fireEvent.pointerMove(turn, touch(300));
    expect(seam.seam).toBe(40);
    // The browser took the touch for a scroll: Chromium reports the cancel at x = 0.
    fireEvent.pointerCancel(turn, touch(0));
    expect(onCommit).not.toHaveBeenCalled();
    expect(turn).not.toHaveAttribute('data-dragging');
    expect(seam.mode).toBe('time');
    await springBack();
    expect(seam.mode).toBeNull();
    expect(seam.seam).toBeNull();
  });

  it('answers only a primary touch while the Turn is allowed', () => {
    layout();
    const seam = new SeamController();
    const onCommit = vi.fn();
    const { rerender } = render(
      <Turn expression="ink" seam={seam} canTurn={false} onCommit={onCommit}>
        <p>paper</p>
      </Turn>,
    );
    const turn = screen.getByText('paper').parentElement!;
    fireEvent.pointerDown(turn, touch(900));
    fireEvent.pointerMove(turn, touch(500));
    expect(seam.mode).toBeNull();
    rerender(
      <Turn expression="ink" seam={seam} canTurn onCommit={onCommit}>
        <p>paper</p>
      </Turn>,
    );
    fireEvent.pointerDown(turn, { ...touch(900), pointerType: 'mouse' });
    fireEvent.pointerMove(turn, { ...touch(500), pointerType: 'mouse' });
    expect(seam.mode).toBeNull();
  });
});
