import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { filmShare, type FilmScore } from '@/lib/physics/film-score';
import { FilmScoreBand } from './film-score-band';

const score: FilmScore = {
  steps: 1_000_000,
  stride: 500,
  count: 2_000,
  separations: new Float32Array(6_000).map((_, i) => 1 + (i % 7)),
  closestApproach: { distance: 1, pair: [0, 2], step: 255_842 },
  syzygies: [400_000],
  crossings: [100_000, 700_000],
};
const hues = [10, 20, 30] as const;

let resizes: { callback: ResizeObserverCallback; disconnected: boolean }[] = [];
let drawn: { canvas: HTMLCanvasElement; op: string; args: unknown[] }[] = [];
let box = { width: 720, height: 11 };

beforeEach(() => {
  resizes = [];
  drawn = [];
  box = { width: 720, height: 11 };
  vi.stubGlobal('devicePixelRatio', 2);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      entry = { callback: (() => {}) as ResizeObserverCallback, disconnected: false };
      constructor(callback: ResizeObserverCallback) {
        this.entry.callback = callback;
        resizes.push(this.entry);
      }
      observe() {}
      disconnect() {
        this.entry.disconnected = true;
      }
    },
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () =>
      ({ ...box, x: 0, y: 0, top: 0, left: 0, right: box.width, bottom: box.height }) as DOMRect,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    return new Proxy({} as Record<string, unknown>, {
      get: (target, key: string) =>
        key in target
          ? target[key]
          : (...args: unknown[]) => drawn.push({ canvas: this, op: key, args }),
      set: (target, key: string, value) => {
        target[key] = value;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const observe = () => resizes.at(-1)!.callback([], {} as ResizeObserver);

describe('the score in the Light film’s transport', () => {
  it('stands for the eye alone where the time line was, lit as far as the film has drawn', () => {
    const { container, rerender } = render(
      <FilmScoreBand score={score} hues={hues} progress={0.25} />,
    );
    const band = container.querySelector('[data-film-score]')!;
    expect(band).toHaveAttribute('aria-hidden', 'true');
    const [whole, lit] = band.querySelectorAll('canvas');
    expect(lit).toHaveAttribute('data-film-score-progress', '25');
    expect(lit.style.clipPath).toBe('inset(0 75% 0 0)');
    rerender(<FilmScoreBand score={score} hues={hues} progress={1.2} />);
    expect(lit).toHaveAttribute('data-film-score-progress', '100');
    rerender(<FilmScoreBand score={score} hues={hues} progress={-1} />);
    expect(lit.style.clipPath).toBe('inset(0 100% 0 0)');
    expect(whole).not.toHaveAttribute('style');
  });

  it('draws the score at the display’s ratio once observed, on the film’s clock, and again at a new width', () => {
    const { container, unmount } = render(
      <FilmScoreBand score={score} hues={hues} progress={0.5} />,
    );
    const [whole, lit] = container.querySelectorAll('canvas');
    expect(drawn).toHaveLength(0);
    observe();
    expect([whole.width, whole.height, lit.width, lit.height]).toEqual([1440, 22, 1440, 22]);
    const onWhole = drawn.filter((call) => call.canvas === whole);
    // The base first: the time line the score replaces.
    expect(onWhole[0]).toMatchObject({ op: 'fillRect', args: [0, 20, 1440, 2] });
    // The closest approach rises to the lane's top, where the film draws it.
    const closest = onWhole.filter((call) => call.op === 'fillRect').at(-1)!;
    expect(closest.args).toEqual([
      Math.round(filmShare(score, score.closestApproach.step) * 1440),
      2,
      2,
      20,
    ]);
    // The lit layer is the same drawing, copied.
    expect(drawn.filter((call) => call.canvas === lit)).toEqual([
      { canvas: lit, op: 'drawImage', args: [whole, 0, 0] },
    ]);
    box = { width: 390, height: 11 };
    observe();
    expect(whole.width).toBe(780);
    unmount();
    expect(resizes.at(-1)!.disconnected).toBe(true);
  });

  it('draws again on a display of another density, though its size stays', () => {
    const queries: { media: string; listener?: () => void; removed: boolean }[] = [];
    vi.stubGlobal('matchMedia', (media: string) => {
      const query: { media: string; listener?: () => void; removed: boolean } = {
        media,
        removed: false,
      };
      queries.push(query);
      return {
        media,
        addEventListener: (_: string, listener: () => void) => (query.listener = listener),
        removeEventListener: () => (query.removed = true),
      };
    });
    const { container, unmount } = render(<FilmScoreBand score={score} hues={hues} progress={0} />);
    observe();
    const whole = container.querySelector('canvas')!;
    expect(whole.width).toBe(1440);
    expect(queries[0].media).toBe('(resolution: 2dppx)');
    // Dragged to a display of half the density: the same box, half the pixels.
    vi.stubGlobal('devicePixelRatio', 1);
    queries[0].listener!();
    expect(whole.width).toBe(720);
    expect(queries[0].removed).toBe(true);
    expect(queries[1].media).toBe('(resolution: 1dppx)');
    unmount();
    expect(queries[1].removed).toBe(true);
  });

  it('draws at once where nothing observes a box', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const { container } = render(<FilmScoreBand score={score} hues={hues} progress={0} />);
    expect(container.querySelector('canvas')!.width).toBe(1440);
    expect(drawn.length).toBeGreaterThan(0);
  });
});
