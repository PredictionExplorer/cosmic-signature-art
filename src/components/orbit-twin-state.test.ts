import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { workOrbit } from '@/lib/art/orbit-records';
import type { PlateFrame } from '@/lib/physics/framing';
import type { Rederivation } from '@/lib/physics/orbit';
import type { TwinRun } from '@/lib/physics/twin';
import type { TwinReply, TwinRequest } from '@/lib/physics/twin.worker';
import { useTwin } from './orbit-twin-state';

const orbit = workOrbit(31)!;
const steps = orbit.generation.steps;
const frame = { width: 3456, height: 2234 } as PlateFrame;
const result = {
  masses: [100, 200, 300],
  windowStart: { positions: new Float64Array(9), velocities: new Float64Array(9) },
} as unknown as Rederivation;
const found = { parted: steps + 5_000, until: steps + 6_000 } as TwinRun;

let workers: FakeWorker[] = [];
class FakeWorker {
  onmessage: ((event: MessageEvent<TwinReply>) => void) | null = null;
  onerror: (() => void) | null = null;
  posted: TwinRequest[] = [];
  terminated = false;
  constructor() {
    workers.push(this);
  }
  postMessage(request: TwinRequest) {
    this.posted.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  reply(message: TwinReply) {
    act(() => this.onmessage?.({ data: message } as MessageEvent<TwinReply>));
  }
}

/** The line beneath the picture, as the section has it: not a control, and it can take the focus. */
let telling: { current: HTMLParagraphElement };
beforeEach(() => {
  workers = [];
  vi.stubGlobal('Worker', FakeWorker);
  const line = document.createElement('p');
  line.tabIndex = -1;
  document.body.append(line);
  telling = { current: line };
});
afterEach(() => {
  telling.current.remove();
  vi.unstubAllGlobals();
});

const staged = (with_: Partial<Parameters<typeof useTwin>[0]> = {}) =>
  renderHook(() => useTwin({ orbit, steps, result, frame, telling, ...with_ }));

describe('the twin, as the visitor moves through it', () => {
  it('is off the stage until asked for, and follows nothing', () => {
    const { result: twin } = staged();
    expect(twin.current).toMatchObject({ twin: null, following: false, rested: false });
    expect(workers).toEqual([]);
  });

  it('follows the twin off the main thread, from the window’s first state', () => {
    const { result: twin } = staged();
    act(() => twin.current.go());
    expect(twin.current).toMatchObject({ twin: { phase: 'following' }, following: true });
    // The pair starts where the window ends.
    expect(twin.current.taken).toBe(steps);
    expect(workers).toHaveLength(1);
    expect(workers[0].posted).toEqual([
      {
        start: {
          masses: result.masses,
          dt: orbit.generation.dt,
          steps,
          positions: result.windowStart.positions,
          velocities: result.windowStart.velocities,
        },
        frame,
        horizon: orbit.fate.horizonSteps,
      },
    ]);
    workers[0].reply({ type: 'done', run: found });
    expect(twin.current.twin).toEqual({ phase: 'ready', run: found, repeat: 0 });
    expect(workers[0].terminated).toBe(true);
  });

  it('performs what was found afresh, again or on a return, without following it anew', () => {
    const { result: twin } = staged();
    act(() => twin.current.go());
    workers[0].reply({ type: 'done', run: found });
    act(() => {
      twin.current.forDrawing.said(steps + 5_000);
      twin.current.forDrawing.rested();
    });
    expect(twin.current).toMatchObject({ taken: steps + 5_000, rested: true });
    // Again: the same twin, a new performance, from the window's end.
    act(() => twin.current.go());
    expect(twin.current).toMatchObject({
      twin: { phase: 'ready', run: found, repeat: 1 },
      taken: steps,
      rested: false,
    });
    // Left and come back to: a performance of its own.
    act(() => twin.current.leave());
    expect(twin.current).toMatchObject({ twin: null, rested: false });
    act(() => twin.current.go());
    expect(twin.current.twin).toEqual({ phase: 'ready', run: found, repeat: 0 });
    expect(workers).toHaveLength(1);
  });

  it('hands the focus to the line when the word that asked for it again has gone', () => {
    const { result: twin } = staged();
    const elsewhere = document.createElement('button');
    document.body.append(elsewhere);
    elsewhere.focus();
    act(() => twin.current.go());
    workers[0].reply({ type: 'done', run: found });
    // Asked for by a word that stays: the focus is left where it stands.
    expect(document.activeElement).toBe(elsewhere);
    act(() => twin.current.forDrawing.rested());
    // Again, with the focus on it, goes as it is pressed: the line is given the focus once the
    // pair is performed again, and without moving the page to it.
    const focused = vi.spyOn(telling.current, 'focus');
    act(() => twin.current.go(true));
    expect(twin.current.twin).toMatchObject({ phase: 'ready', repeat: 1 });
    expect(document.activeElement).toBe(telling.current);
    expect(focused).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    // Given once: a later performance asked for by a word that stays moves no focus.
    elsewhere.focus();
    act(() => twin.current.go());
    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });

  it('hands no focus on to a twin the visitor left before it was found', () => {
    const { result: twin } = staged();
    // Asked for with the focus to hand on while it is still being followed…
    act(() => twin.current.go(true));
    expect(twin.current.following).toBe(true);
    expect(document.activeElement).not.toBe(telling.current);
    // …and left: come back to and found, it takes no focus.
    act(() => twin.current.leave());
    act(() => twin.current.go());
    workers[1].reply({ type: 'done', run: found });
    expect(twin.current.twin).toMatchObject({ phase: 'ready' });
    expect(document.activeElement).not.toBe(telling.current);
  });

  it('forgets the pair it carried when the twin takes the stage or leaves it', () => {
    const { result: twin } = staged();
    const { live } = twin.current.forDrawing;
    live.current = { key: '0:plate' } as NonNullable<typeof live.current>;
    act(() => twin.current.go());
    expect(live.current).toBeNull();
    live.current = { key: '0:plate' } as NonNullable<typeof live.current>;
    act(() => twin.current.leave());
    expect(live.current).toBeNull();
  });

  it('says so when the twin cannot be followed', () => {
    const { result: twin } = staged();
    act(() => twin.current.go());
    workers[0].reply({ type: 'failed' } as TwinReply);
    expect(twin.current.twin).toEqual({ phase: 'failed' });
    // A worker that breaks is one that failed.
    act(() => twin.current.leave());
    act(() => twin.current.go());
    act(() => workers[1].onerror?.());
    expect(twin.current.twin).toEqual({ phase: 'failed' });
    expect(workers[1].terminated).toBe(true);
  });

  it('says so when this browser gives it no worker at all', async () => {
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new Error('no workers here');
        }
      },
    );
    const { result: twin } = staged();
    await act(async () => twin.current.go());
    expect(twin.current.twin).toEqual({ phase: 'failed' });
  });

  it('waits for the derived window before it follows, and follows nothing in the plane', () => {
    const waiting = renderHook(
      ({ derived }: { derived: Rederivation | null }) =>
        useTwin({ orbit, steps, result: derived, frame, telling }),
      { initialProps: { derived: null as Rederivation | null } },
    );
    act(() => waiting.result.current.go());
    expect(waiting.result.current.following).toBe(true);
    expect(workers).toEqual([]);
    // The window derived, the following begins, from its first state.
    waiting.rerender({ derived: result });
    expect(workers).toHaveLength(1);
    expect(workers[0].posted[0].start.positions).toBe(result.windowStart.positions);
    const plane = staged({ frame: undefined });
    act(() => plane.result.current.go());
    expect(workers).toHaveLength(1);
  });

  it('stops following a twin the visitor has left', () => {
    const { result: twin, unmount } = staged();
    act(() => twin.current.go());
    act(() => twin.current.leave());
    expect(workers[0].terminated).toBe(true);
    act(() => twin.current.go());
    unmount();
    expect(workers[1].terminated).toBe(true);
  });
});
