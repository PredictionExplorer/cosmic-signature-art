import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCuratedArtwork } from '@/lib/art/catalog';
import type { ArtInterpretation } from '@/lib/art/types';
import { ArtworkMedia } from './artwork-media';

const motion = vi.hoisted(() => ({ paused: false }));
vi.mock('./motion-provider', () => ({ useMotion: () => motion }));

class VisibilityObserver implements IntersectionObserver {
  static instances: VisibilityObserver[] = [];
  readonly root = null;
  readonly rootMargin = '0px';
  readonly thresholds = [0];
  private targets = new Set<Element>();

  constructor(private readonly callback: IntersectionObserverCallback) {
    VisibilityObserver.instances.push(this);
  }

  observe(target: Element) {
    this.targets.add(target);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  setVisible(visible: boolean) {
    const entries = [...this.targets].map((target): IntersectionObserverEntry => ({
      target,
      isIntersecting: visible,
      intersectionRatio: visible ? 1 : 0,
      boundingClientRect: target.getBoundingClientRect(),
      intersectionRect: target.getBoundingClientRect(),
      rootBounds: null,
      time: 0,
    }));
    this.callback(entries, this);
  }
}

const ink = (id: number): ArtInterpretation =>
  getCuratedArtwork(id)!.media.find((item) => item.id === 'ink')!;
const light = getCuratedArtwork(31)!.media.find((item) => item.id === 'light')!;

function enterViewport(index = 0) {
  act(() => VisibilityObserver.instances[index].setVisible(true));
}

function player(container: HTMLElement): HTMLVideoElement {
  const video = container.querySelector('video');
  expect(video).not.toBeNull();
  return video!;
}

function imagePath(): string {
  return new URL((screen.getByRole('img') as HTMLImageElement).src).pathname;
}

beforeEach(() => {
  motion.paused = false;
  VisibilityObserver.instances = [];
  vi.stubGlobal('IntersectionObserver', VisibilityObserver);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('artwork media delivery', () => {
  it('shows the authentic still without acquiring a video source before visibility', () => {
    const { container } = render(<ArtworkMedia media={ink(31)} alt="Signature 31 in ink" />);
    expect(screen.getByRole('img', { name: 'Signature 31 in ink' })).toBeInTheDocument();
    expect(imagePath()).toBe('/art/31-ink.webp');
    expect(container.querySelector('video')).toBeNull();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it('loads each visible token’s own film and never substitutes the neighboring work', () => {
    const { container } = render(
      <>
        <ArtworkMedia media={ink(23)} alt="Signature 23 in ink" />
        <ArtworkMedia media={ink(31)} alt="Signature 31 in ink" />
      </>,
    );
    enterViewport(1);
    expect(container.querySelectorAll('video')).toHaveLength(1);
    expect(player(container)).toHaveAttribute('src', '/art/31-ink-preview.mp4');
    enterViewport(0);
    expect(
      [...container.querySelectorAll('video')].map((video) => video.getAttribute('src')),
    ).toEqual(['/art/23-ink-preview.mp4', '/art/31-ink-preview.mp4']);
  });

  it('does not invent a film for a still-only interpretation', () => {
    const { container } = render(<ArtworkMedia media={light} alt="Signature 31 in light" />);
    enterViewport();
    expect(imagePath()).toBe('/art/31-light.webp');
    expect(container.querySelector('video')).toBeNull();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it('pauses a playing film and releases its source when it leaves the viewport', () => {
    const { container } = render(<ArtworkMedia media={ink(31)} alt="Signature 31 in ink" />);
    enterViewport();
    const video = player(container);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    vi.mocked(HTMLMediaElement.prototype.pause).mockClear();
    act(() => VisibilityObserver.instances[0].setVisible(false));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(vi.mocked(HTMLMediaElement.prototype.pause).mock.contexts).toContain(video);
    expect(container.querySelector('video')).toBeNull();
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('acquires no film source while motion is paused, then retains a played frame when paused again', () => {
    motion.paused = true;
    const { container, rerender } = render(
      <ArtworkMedia media={ink(31)} alt="Signature 31 in ink" />,
    );
    enterViewport();
    expect(container.querySelector('video')).toBeNull();
    expect(imagePath()).toBe('/art/31-ink.webp');
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    motion.paused = false;
    rerender(<ArtworkMedia media={ink(31)} alt="Signature 31 in ink" />);
    const video = player(container);
    expect(video).toHaveAttribute('src', '/art/31-ink-preview.mp4');
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    fireEvent.playing(video);
    vi.mocked(HTMLMediaElement.prototype.pause).mockClear();
    motion.paused = true;
    rerender(<ArtworkMedia media={ink(31)} alt="Signature 31 in ink" />);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(player(container)).toBe(video);
    expect(video).toHaveClass('has-frame');
  });

  it('does not acquire a film source for a visible still-only view until film playback is requested', () => {
    const { container, rerender } = render(
      <ArtworkMedia media={ink(31)} alt="Signature 31 in ink" still />,
    );
    enterViewport();
    expect(container.querySelector('video')).toBeNull();
    expect(imagePath()).toBe('/art/31-ink.webp');
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    rerender(<ArtworkMedia media={ink(31)} alt="Signature 31 in ink" still={false} />);
    expect(player(container)).toHaveAttribute('src', '/art/31-ink-preview.mp4');
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it('pauses hidden-tab playback and resumes when the page is visible again', () => {
    render(<ArtworkMedia media={ink(31)} alt="Signature 31 in ink" />);
    enterViewport();
    vi.mocked(HTMLMediaElement.prototype.pause).mockClear();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange'));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    vi.mocked(HTMLMediaElement.prototype.play).mockClear();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    fireEvent(document, new Event('visibilitychange'));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it('leaves the still available when autoplay is rejected', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(
      new DOMException('Autoplay blocked', 'NotAllowedError'),
    );
    const onFailure = vi.fn();
    const { container } = render(
      <ArtworkMedia media={ink(31)} alt="Signature 31 in ink" onFailure={onFailure} />,
    );
    await act(async () => VisibilityObserver.instances[0].setVisible(true));
    expect(screen.getByRole('img', { name: 'Signature 31 in ink' })).toBeInTheDocument();
    expect(imagePath()).toBe('/art/31-ink.webp');
    expect(player(container)).not.toHaveClass('has-frame');
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('returns to the original still when video decoding fails', () => {
    const onFailure = vi.fn();
    const { container } = render(
      <ArtworkMedia media={ink(31)} alt="Signature 31 in ink" onFailure={onFailure} />,
    );
    enterViewport();
    const video = player(container);
    fireEvent.playing(video);
    fireEvent.error(video);
    expect(container.querySelector('video')).toBeNull();
    expect(imagePath()).toBe('/art/31-ink.webp');
    expect(onFailure).toHaveBeenCalledOnce();
  });

  it('preserves an accessible artwork identity when its image cannot load', () => {
    const onFailure = vi.fn();
    render(<ArtworkMedia media={light} alt="Signature 31 in light" onFailure={onFailure} />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('img', { name: 'Signature 31 in light' })).toBeInTheDocument();
    expect(screen.getByRole('img')).not.toHaveAttribute('src');
    expect(onFailure).toHaveBeenCalledOnce();
  });

  it('uses actual duration for preview positioning and reports native playback progress', () => {
    const onProgress = vi.fn();
    const { container, rerender } = render(
      <ArtworkMedia
        media={ink(31)}
        alt="Signature 31 in ink"
        startAt={999}
        onProgress={onProgress}
      />,
    );
    enterViewport();
    const video = player(container);
    Object.defineProperty(video, 'duration', { configurable: true, value: 30.033333 });
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBeCloseTo(29.033333);
    video.currentTime = 12.5;
    fireEvent.timeUpdate(video);
    expect(onProgress).toHaveBeenLastCalledWith(12.5, 30.033333);
    rerender(
      <ArtworkMedia
        media={ink(31)}
        alt="Signature 31 in ink"
        restart={1}
        onProgress={onProgress}
      />,
    );
    expect(video.currentTime).toBe(0);
  });

  it('does not restart a repeating film after global pause cancels the scheduled replay', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(
      <ArtworkMedia media={ink(31)} alt="Signature 31 in ink" repeat />,
    );
    enterViewport();
    fireEvent.playing(player(container));
    fireEvent.ended(player(container));
    motion.paused = true;
    rerender(<ArtworkMedia media={ink(31)} alt="Signature 31 in ink" repeat />);
    vi.mocked(HTMLMediaElement.prototype.play).mockClear();
    act(() => vi.advanceTimersByTime(5_000));
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });
});
