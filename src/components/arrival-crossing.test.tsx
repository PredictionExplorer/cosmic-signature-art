import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { rgb, useArrivalCrossing } from './arrival-crossing';
import { SeamController } from './turn';

const work = getCuratedArtwork(31)!;
const ink = work.media.find((media) => media.id === 'ink')!;
const light = work.media.find((media) => media.id === 'light')!;
const root = () => document.documentElement;

/** A viewer's use of the crossing: its canvas, and a Turn that asks for it first. */
function Viewer({ enabled }: { enabled: boolean }) {
  const [seam] = useState(() => new SeamController());
  const { canvas, whenReady } = useArrivalCrossing({
    seam,
    ink,
    light,
    expression: 'ink',
    enabled,
    wingSeam: () => null,
  });
  return (
    <div>
      <canvas ref={canvas} />
      <button
        type="button"
        onClick={(event) => {
          const button = event.currentTarget;
          void whenReady(400).then(() => button.setAttribute('data-answered', ''));
        }}
      >
        Light
      </button>
    </div>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  root().removeAttribute('data-crossing');
});

describe('the crossing in the order the work was made', () => {
  it('reads the room’s computed colours as channels', () => {
    expect(rgb('rgb(239, 233, 221)')).toEqual([239 / 255, 233 / 255, 221 / 255]);
    expect(rgb('rgba(0, 0, 0, 0.5)')).toEqual([0, 0, 0]);
    expect(rgb('color(display-p3 1 1 1)')).toEqual([0, 0, 0]);
  });

  it('binds both of the curated work’s maps, so the crossing is offered there', () => {
    expect(ink.arrival?.src).toMatch(/^\/art\/arrival\/31-ink-[a-f0-9]{16}\.webp$/);
    expect(light.arrival?.src).toMatch(/^\/art\/arrival\/31-light-[a-f0-9]{16}\.webp$/);
  });

  it('keeps the straight seam where this browser has no WebGL, and never holds a Turn', async () => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    render(<Viewer enabled />);
    // Prepared at idle; without requestIdleCallback, a moment after the plate settles.
    await act(async () => vi.advanceTimersByTime(500));
    expect(context).toHaveBeenCalledWith('webgl', expect.anything());
    expect(root().hasAttribute('data-crossing')).toBe(false);
    const turn = screen.getByRole('button', { name: 'Light' });
    fireEvent.click(turn);
    await act(async () => vi.advanceTimersByTime(0));
    expect(turn).toHaveAttribute('data-answered');
    expect(root().hasAttribute('data-crossing')).toBe(false);
  });

  it('prepares nothing where the Turn is instant', async () => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    render(<Viewer enabled={false} />);
    await act(async () => vi.advanceTimersByTime(2000));
    expect(context).not.toHaveBeenCalled();
    expect(root().hasAttribute('data-crossing')).toBe(false);
    // A Turn asks, and is answered at once.
    const turn = screen.getByRole('button', { name: 'Light' });
    fireEvent.click(turn);
    await act(async () => vi.advanceTimersByTime(0));
    expect(turn).toHaveAttribute('data-answered');
  });
});
