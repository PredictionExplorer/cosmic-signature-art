import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withDeadline } from './abort';

describe('a signal with a deadline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('stops when its owner does, for the owner’s reason', () => {
    const owner = new AbortController();
    const { signal } = withDeadline(owner.signal, 15_000);
    expect(signal.aborted).toBe(false);
    const left = new Error('The gallery was left');
    owner.abort(left);
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe(left);
  });

  it('stops when its time is up, as a timeout', () => {
    const { signal } = withDeadline(new AbortController().signal, 15_000);
    vi.advanceTimersByTime(14_999);
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toMatchObject({ name: 'TimeoutError' });
  });

  it('is stopped from the start when its owner already is', () => {
    const owner = new AbortController();
    owner.abort();
    expect(withDeadline(owner.signal, 15_000).signal.aborted).toBe(true);
  });

  it('keeps the first of the two reasons', () => {
    const owner = new AbortController();
    const { signal } = withDeadline(owner.signal, 15_000);
    vi.advanceTimersByTime(15_000);
    owner.abort(new Error('later'));
    expect(signal.reason).toMatchObject({ name: 'TimeoutError' });
  });

  it('lets go of its timer and its owner once the work is done', () => {
    const owner = new AbortController();
    const forgotten = vi.spyOn(owner.signal, 'removeEventListener');
    const { signal, done } = withDeadline(owner.signal, 15_000);
    done();
    expect(vi.getTimerCount()).toBe(0);
    expect(forgotten).toHaveBeenCalledWith('abort', expect.any(Function));
    vi.advanceTimersByTime(60_000);
    owner.abort();
    expect(signal.aborted).toBe(false);
  });

  it('asks nothing newer than the venue’s browsers have: neither AbortSignal.any nor .timeout', () => {
    // Chrome 111, Firefox 111 and Safari 16.4 have no AbortSignal.any (package.json, browserslist).
    vi.stubGlobal(
      'AbortSignal',
      Object.assign(Object.create(AbortSignal), { any: undefined, timeout: undefined }),
    );
    const owner = new AbortController();
    const { signal } = withDeadline(owner.signal, 1_000);
    vi.advanceTimersByTime(1_000);
    expect(signal.aborted).toBe(true);
  });
});
