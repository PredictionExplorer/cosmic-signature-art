import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { useScrollEdges } from './scroll-edges';

let resized: ResizeObserverCallback | undefined;
let contentWidth: MockInstance<() => number>;
let observed: Element[] = [];
class Observer {
  constructor(callback: ResizeObserverCallback) {
    resized = callback;
  }
  observe(target: Element) {
    observed.push(target);
  }
  unobserve() {}
  disconnect() {
    observed = [];
  }
}

function Row() {
  const row = useScrollEdges<HTMLDivElement>();
  return (
    <div ref={row} data-testid="row">
      <a href="#ink">Ink</a>
      <a href="#light">Light</a>
    </div>
  );
}

/** The row's geometry, as a browser would lay it out. */
function lay(
  row: HTMLElement,
  { content, view, at }: { content: number; view: number; at: number },
) {
  Object.defineProperty(row, 'scrollWidth', { configurable: true, value: content });
  Object.defineProperty(row, 'clientWidth', { configurable: true, value: view });
  row.scrollLeft = at;
}
const marks = (row: HTMLElement) => ({
  start: row.hasAttribute('data-more-start'),
  end: row.hasAttribute('data-more-end'),
});
function scrollTo(row: HTMLElement, at: number) {
  row.scrollLeft = at;
  fireEvent.scroll(row);
  act(() => vi.advanceTimersToNextFrame());
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
  vi.stubGlobal('ResizeObserver', Observer);
  // Lay every row out before its effect measures it: a row wider than its view.
  contentWidth = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(366);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(302);
});

afterEach(() => {
  cleanup();
  resized = undefined;
  observed = [];
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('a row that scrolls sideways says which of its edges hide more of it', () => {
  it('marks only the far edge at the start, both in the middle, only the near one at the end', () => {
    render(<Row />);
    const row = screen.getByTestId('row');
    expect(marks(row)).toEqual({ start: false, end: true });
    lay(row, { content: 366, view: 302, at: 0 });
    scrollTo(row, 30);
    expect(marks(row)).toEqual({ start: true, end: true });
    scrollTo(row, 64);
    expect(marks(row)).toEqual({ start: true, end: false });
    scrollTo(row, 0);
    expect(marks(row)).toEqual({ start: false, end: true });
  });

  it('marks nothing on a row that fits, nor for a pixel of rounding', () => {
    contentWidth.mockReturnValue(303);
    render(<Row />);
    expect(marks(screen.getByTestId('row'))).toEqual({ start: false, end: false });
  });

  it('measures again when the row or a word in it changes size, at most once a frame', () => {
    render(<Row />);
    const row = screen.getByTestId('row');
    // The row and each of its words are watched: a font arriving changes a word's width.
    expect(observed).toEqual([row, ...row.children]);
    lay(row, { content: 300, view: 302, at: 0 });
    act(() => {
      resized!([], {} as ResizeObserver);
      resized!([], {} as ResizeObserver);
    });
    expect(marks(row)).toEqual({ start: false, end: true });
    act(() => vi.advanceTimersToNextFrame());
    expect(marks(row)).toEqual({ start: false, end: false });
  });

  it('leaves no mark behind when the row goes', () => {
    const { unmount } = render(<Row />);
    const row = screen.getByTestId('row');
    expect(marks(row).end).toBe(true);
    unmount();
    expect(marks(row)).toEqual({ start: false, end: false });
  });

  it('marks nothing where the browser cannot watch the row', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    render(<Row />);
    expect(marks(screen.getByTestId('row'))).toEqual({ start: false, end: false });
  });
});
