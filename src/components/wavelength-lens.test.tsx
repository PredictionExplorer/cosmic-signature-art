import { StrictMode } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { frameForNm, frameTime } from '@/lib/art/spectral-sweep';
import type { ArtFilm } from '@/lib/art/types';
import { WavelengthLens } from './wavelength-lens';

const light = getCuratedArtwork(31)!.media.find((media) => media.id === 'light')!;
const span = { start: 0, end: 63, dominantNm: 632 };
const sweep: ArtFilm = {
  id: 'sweep',
  label: 'Spectral sweep',
  src: '/sweep-031.mp4',
  durationSeconds: 10,
  mimeType: 'video/mp4',
  variantKey: '31:light:sweep',
  delivery: 'original-web',
  span,
};

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function lens(
  nm: number,
  callbacks: { state?: (state: 'loading' | 'held') => void; failure?: () => void } = {},
) {
  return (
    <WavelengthLens
      media={light}
      film={sweep}
      span={span}
      nm={nm}
      label={`Held at ${nm} nm`}
      rule={<span data-testid="rule" />}
      onState={callbacks.state ?? (() => {})}
      onFailure={callbacks.failure ?? (() => {})}
    />
  );
}
/** The film has its metadata, as a browser says once the head of the file has arrived. */
function metadata(video: HTMLVideoElement) {
  Object.defineProperty(video, 'readyState', { configurable: true, get: () => 1 });
  fireEvent(video, new Event('loadedmetadata'));
}

describe('the Wavelength lens', () => {
  it('fetches the sweep only once it is on, and never plays it', () => {
    const view = render(lens(540));
    const video = view.container.querySelector('video')!;
    expect(video).toHaveAttribute('src', '/sweep-031.mp4');
    expect(video).toHaveAttribute('preload', 'auto');
    expect(video).not.toHaveAttribute('autoplay');
    expect(video).not.toHaveAttribute('loop');
    expect(video).not.toHaveAttribute('controls');
    expect(video.muted).toBe(true);
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalled();
    // The still stands where the frame will be until the first one is decoded.
    const plate = view.container.querySelector('[data-room-media]')!;
    expect(plate).toHaveAttribute('data-wavelength', 'loading');
    expect(plate.querySelector('img')).toHaveAttribute('src', light.still);
    expect(video).toHaveAttribute('aria-label', 'Held at 540 nm');
    expect(view.getByTestId('rule')).toBeInTheDocument();
    view.unmount();
    // Leaving releases the film and its decoder.
    expect(video).not.toHaveAttribute('src');
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it('holds the frame of the chosen wavelength, one seek at a time, the latest wish waiting', () => {
    const state = vi.fn();
    const view = render(lens(540, { state }));
    // The lens says it is loading from the moment it attaches the film.
    expect(state).toHaveBeenLastCalledWith('loading');
    const video = view.container.querySelector('video')!;
    // Nothing is asked of a film without its metadata.
    expect(video.currentTime).toBe(0);
    metadata(video);
    expect(video.currentTime).toBe(frameTime(frameForNm(540, span)));
    // A drag asks for two more frames while the first is still decoding: neither is sought yet.
    view.rerender(lens(600, { state }));
    view.rerender(lens(620, { state }));
    expect(video.currentTime).toBe(frameTime(frameForNm(540, span)));
    expect(state).not.toHaveBeenCalledWith('held');
    fireEvent(video, new Event('seeked'));
    // The decoded frame is on screen, and the latest wish, not the one between, is sought next.
    expect(video).toHaveAttribute('data-frame', String(frameForNm(540, span)));
    expect(view.container.querySelector('[data-room-media]')).toHaveAttribute(
      'data-wavelength',
      'held',
    );
    expect(state).toHaveBeenLastCalledWith('held');
    expect(video.currentTime).toBe(frameTime(frameForNm(620, span)));
    fireEvent(video, new Event('seeked'));
    expect(video).toHaveAttribute('data-frame', String(frameForNm(620, span)));
    // A wavelength on the frame already shown asks for nothing.
    video.currentTime = 9;
    view.rerender(lens(620, { state }));
    expect(video.currentTime).toBe(9);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it('seeks at once when the film’s metadata is already cached, through a Strict Mode replay', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);
    const view = render(<StrictMode>{lens(450)}</StrictMode>);
    const video = view.container.querySelector('video')!;
    // The replayed effect reattached the source its cleanup released, and asked again.
    expect(video).toHaveAttribute('src', '/sweep-031.mp4');
    expect(video.currentTime).toBe(frameTime(frameForNm(450, span)));
    fireEvent(video, new Event('seeked'));
    expect(video).toHaveAttribute('data-frame', String(frameForNm(450, span)));
  });

  it('reports a film that cannot be read, so the room can say so and keep the still', () => {
    const failure = vi.fn();
    const view = render(lens(540, { failure }));
    fireEvent(view.container.querySelector('video')!, new Event('error'));
    expect(failure).toHaveBeenCalledOnce();
  });
});
