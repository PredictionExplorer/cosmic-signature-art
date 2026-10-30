import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { WhenLens } from './when-lens';

const ink = getCuratedArtwork(31)!.media.find((media) => media.id === 'ink')!;

/** Images that load at once, two pixels by one. */
class Loaded {
  decoding = '';
  naturalWidth = 2;
  naturalHeight = 1;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  decode() {
    return Promise.resolve();
  }
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the When lens', () => {
  it('paints the still from the work’s own rung and map, and says it is painted', async () => {
    vi.stubGlobal('Image', Loaded);
    // A dark sumi mark beside bare paper; the map reads first beside last.
    const still = Uint8ClampedArray.from([20, 20, 20, 255, 239, 233, 221, 255]);
    const map = Uint8ClampedArray.from([0, 0, 0, 255, 255, 255, 255, 255]);
    const reads = [still, map];
    const context = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: reads.shift() })),
      createImageData: vi.fn((width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
      })),
      putImageData: vi.fn(),
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    const failure = vi.fn();
    render(<WhenLens media={ink} paper="#efe9dd" label="When" onFailure={failure} />);
    await act(async () => {});
    const drawn = screen.getByRole('img', { name: 'When' });
    expect(drawn).toHaveAttribute('data-when', 'painted');
    expect(drawn).toHaveAttribute('width', '2');
    // The map is drawn over the still's own size, smoothed.
    expect(context.drawImage).toHaveBeenLastCalledWith(expect.anything(), 0, 0, 2, 1);
    expect(context.imageSmoothingQuality).toBe('high');
    const painted = context.putImageData.mock.calls[0][0].data as Uint8ClampedArray;
    // The mark takes the ramp's first colour; the paper becomes the lens's dark ground.
    expect([...painted.slice(0, 3)]).toEqual([77, 92, 242]);
    expect([...painted.slice(4, 7)]).toEqual([9, 9, 10]);
    expect(failure).not.toHaveBeenCalled();
  });

  it('reports a still it cannot read, and one with no map or rung', async () => {
    vi.stubGlobal('Image', Loaded);
    const failure = vi.fn();
    render(<WhenLens media={ink} paper="#efe9dd" label="When" onFailure={failure} />);
    await act(async () => {});
    // jsdom has no 2D canvas: the lens cannot be painted here, and says so.
    expect(failure).toHaveBeenCalledOnce();
    cleanup();
    const bare = vi.fn();
    render(
      <WhenLens media={{ ...ink, rungs: [] }} paper="#efe9dd" label="When" onFailure={bare} />,
    );
    expect(bare).toHaveBeenCalledOnce();
  });
});
