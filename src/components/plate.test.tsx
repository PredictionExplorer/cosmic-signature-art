import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { getInterpretation } from '@/lib/art/types';
import { Plate } from './plate';

const setPlateTone = vi.hoisted(() => vi.fn());
vi.mock('./room-ground', () => ({ setPlateTone }));

let observers: { callback: IntersectionObserverCallback; target?: Element }[] = [];
beforeEach(() => {
  observers = [];
  setPlateTone.mockClear();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private callback: IntersectionObserverCallback) {
        observers.push({ callback });
      }
      observe(target: Element) {
        observers.at(-1)!.target = target;
      }
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const work = getCuratedArtwork(31)!;
const ink = getInterpretation(work, 'ink')!;
const light = getInterpretation(work, 'light')!;

function intersect(ratio: number) {
  const entry = observers.at(-1)!;
  entry.callback(
    [
      {
        isIntersecting: ratio > 0,
        intersectionRatio: ratio,
        target: entry.target!,
      } as IntersectionObserverEntry,
    ],
    {} as IntersectionObserver,
  );
}

describe('the plate', () => {
  it('hangs the work on its own measured tone with the numeral, the label and the words', () => {
    const { container } = render(
      <Plate
        id={31}
        media={ink}
        current
        centre={<span>Orbit Ribbons · Ink</span>}
        words={<button type="button">Light</button>}
      >
        <div className="art-media" />
      </Plate>,
    );
    const screenNode = container.firstElementChild as HTMLElement;
    expect(screenNode.style.getPropertyValue('--plate-ground')).toBe('#efe9dd');
    expect(screenNode).toHaveAttribute('data-plate-ground', 'paper');
    expect(screenNode).toHaveAttribute('data-settled');
    expect(container.querySelector('.plate')).toHaveAttribute('data-edge', 'true');
    expect(container.querySelector('.hanging-numeral')).toHaveTextContent('031');
    expect(screen.getByText('Orbit Ribbons · Ink')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Light' })).toBeInTheDocument();
  });

  it('lends the running head its tone while it dominates the viewport, and only as the committed layer', () => {
    const { rerender, unmount } = render(
      <Plate id={31} media={ink} current settled={false}>
        <div />
      </Plate>,
    );
    intersect(1);
    expect(setPlateTone).toHaveBeenLastCalledWith('#efe9dd', 'paper');
    intersect(0.2);
    expect(setPlateTone).toHaveBeenLastCalledWith(null);
    rerender(
      <Plate id={31} media={light} current>
        <div />
      </Plate>,
    );
    intersect(1);
    // The Light plate lends the night with its type, so the head never sets paper type on black.
    expect(setPlateTone).toHaveBeenLastCalledWith('#000000', 'night');
    unmount();
    expect(setPlateTone).toHaveBeenLastCalledWith(null);
    setPlateTone.mockClear();
    const twin = observers.length;
    render(
      <Plate id={31} media={light} current={false}>
        <div />
      </Plate>,
    );
    expect(observers.length).toBe(twin);
    expect(setPlateTone).not.toHaveBeenCalled();
  });

  it('paints a Light plate on black even without a measured record, and omits the strip on request', () => {
    const unmeasured = { ...light, stillSha256: undefined };
    const { container } = render(
      <Plate id={999} media={unmeasured} current strip={false}>
        <div />
      </Plate>,
    );
    const screenNode = container.firstElementChild as HTMLElement;
    expect(screenNode.style.getPropertyValue('--plate-ground')).toBe('#000000');
    expect(screenNode).toHaveAttribute('data-plate-ground', 'night');
    expect(container.querySelector('.strip')).toBeNull();
    expect(container.querySelector('.plate')).not.toHaveAttribute('data-edge');
  });
});
