import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PLACE_KEY } from '@/lib/storage-keys';
import { keepPlace, ReadingPlace } from './reading-place';

let pathname = '/ja/art/31';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

/** A page of marks at the given heights, laid out from `top` in viewport terms. */
function page(heights: number[], top: number, ids: Record<number, string> = {}) {
  document.body.innerHTML = `<main>${heights
    .map((_, index) => `<p${ids[index] ? ` id="${ids[index]}"` : ''}>mark ${index}</p>`)
    .join('')}</main>`;
  let y = top;
  for (const [index, mark] of [...document.querySelectorAll('p')].entries()) {
    const at = y;
    mark.getBoundingClientRect = () => ({ top: at, height: heights[index] }) as DOMRect;
    mark.getClientRects = () => [{}] as unknown as DOMRectList;
    y += heights[index];
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  pathname = '/ja/art/31';
  window.history.replaceState(null, '', '/ja/art/31');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('keeping the place', () => {
  it('keeps the mark at the reading line for the page in the other language', () => {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 1_000 });
    // Marks of 100 px from 300 px above the viewport: the line at 64 falls in the fourth, a
    // little over half way down it.
    page([100, 100, 100, 100, 100], -300, { 3: 'proof' });
    keepPlace('/ko/art/31?expression=ink');
    expect(JSON.parse(sessionStorage.getItem(PLACE_KEY)!)).toEqual({
      to: '/ko/art/31',
      id: 'proof',
      index: 3,
      count: 5,
      share: 0.64,
    });
  });

  it('passes over a mark held in a margin that stays in sight: it marks no place in the text', () => {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 4_000 });
    // A chapter: its number and word in a margin that stays under the head, then its paragraphs.
    page([40, 100, 100, 100, 100], -300, { 4: 'steps-4' });
    const [index, ...text] = [...document.querySelectorAll('p')];
    const margin = document.createElement('div');
    margin.style.position = 'sticky';
    index.replaceWith(margin);
    margin.append(index);
    // Stuck, the index stands at the reading line whatever the paragraphs do.
    index.getBoundingClientRect = () => ({ top: 60, height: 40 }) as DOMRect;
    text.forEach((mark, at) => {
      mark.getBoundingClientRect = () => ({ top: -300 + at * 100, height: 100 }) as DOMRect;
    });
    keepPlace('/uk');
    // The place kept is the fourth paragraph, which the line crosses, not the chapter's head.
    expect(JSON.parse(sessionStorage.getItem(PLACE_KEY)!)).toEqual({
      to: '/uk',
      id: 'steps-4',
      index: 3,
      count: 4,
      share: 0.64,
    });
  });

  it('keeps nothing at the top of a page, and forgets an older place', () => {
    sessionStorage.setItem(PLACE_KEY, '{"to":"/ko/art/31"}');
    page([100, 100], 0);
    keepPlace('/ko/art/31');
    expect(sessionStorage.getItem(PLACE_KEY)).toBeNull();
  });
});

describe('putting the place back', () => {
  const kept = (place: object) =>
    sessionStorage.setItem(
      PLACE_KEY,
      JSON.stringify({ to: '/ja/art/31', index: 2, count: 4, share: 0.5, ...place }),
    );

  it('scrolls the same mark back to the reading line, as the page settles, and lets the place go', async () => {
    kept({});
    // The same page in Japanese: marks of other heights; the third is now 700 px down the viewport.
    page([300, 400, 120, 80], 0);
    render(<ReadingPlace />);
    expect(sessionStorage.getItem(PLACE_KEY)).toBeNull();
    await act(async () => vi.advanceTimersByTime(200));
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 700 + 60 - 64, behavior: 'instant' });
    const calls = vi.mocked(window.scrollTo).mock.calls.length;
    await act(async () => vi.advanceTimersByTime(3_000));
    // It put the mark back again as the page settled, then let go.
    expect(vi.mocked(window.scrollTo).mock.calls.length).toBeGreaterThan(calls);
  });

  it('finds the mark by its id first', async () => {
    kept({ id: 'proof', index: 0 });
    page([300, 400, 120, 80], 0, { 3: 'proof' });
    render(<ReadingPlace />);
    await act(async () => vi.advanceTimersByTime(200));
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 820 + 40 - 64, behavior: 'instant' });
  });

  it('waits for what streams in last before it trusts a mark’s place among the marks', async () => {
    kept({ count: 6 });
    page([300, 400, 120, 80], 0);
    render(<ReadingPlace />);
    await act(async () => vi.advanceTimersByTime(1_500));
    expect(window.scrollTo).not.toHaveBeenCalled();
    // The last time, it puts back the nearest it can.
    await act(async () => vi.advanceTimersByTime(1_000));
    expect(window.scrollTo).toHaveBeenCalledTimes(1);
  });

  it('lets go the moment the reader moves', async () => {
    kept({});
    page([300, 400, 120, 80], 0);
    render(<ReadingPlace />);
    await act(async () => vi.advanceTimersByTime(200));
    const calls = vi.mocked(window.scrollTo).mock.calls.length;
    window.dispatchEvent(new Event('wheel'));
    await act(async () => vi.advanceTimersByTime(3_000));
    expect(window.scrollTo).toHaveBeenCalledTimes(calls);
  });

  it('leaves a place kept for another page to that page', async () => {
    sessionStorage.setItem(
      PLACE_KEY,
      JSON.stringify({ to: '/ja/statement', index: 0, count: 1, share: 0 }),
    );
    page([100], 0);
    render(<ReadingPlace />);
    await act(async () => vi.advanceTimersByTime(3_000));
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(PLACE_KEY)).not.toBeNull();
  });
});
