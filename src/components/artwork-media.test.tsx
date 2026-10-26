import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Activity, StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCuratedArtwork } from '@/lib/art/catalog';
import type { ArtInterpretation } from '@/lib/art/types';
import { ArtworkMedia } from './artwork-media';

const motion = vi.hoisted(() => ({ paused: false, theatre: 'playing' as 'playing' | 'hushed' }));
vi.mock('./motion-provider', () => ({ useMotion: () => motion }));
vi.mock('@/lib/art/plate-records', () => ({
  getPlateGround: (id: number, expression: string, sha?: string) =>
    id === 31 && expression === 'ink' && sha
      ? { stillSha256: sha, tone: '#efe9dd', edge: true }
      : undefined,
}));

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
  motion.theatre = 'playing';
  VisibilityObserver.instances = [];
  vi.stubGlobal('IntersectionObserver', VisibilityObserver);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});

afterEach(async () => {
  cleanup();
  // Genuine DOM removal releases media at the end of the React commit.
  await act(async () => {});
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

  it('pauses offscreen films and resumes the same frame without reloading or resetting the excerpt', () => {
    const { container } = render(<ArtworkMedia media={ink(31)} alt="Signature 31 in ink" />);
    enterViewport();
    const video = player(container);
    fireEvent.playing(video);
    video.currentTime = 17;
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    vi.mocked(HTMLMediaElement.prototype.pause).mockClear();
    act(() => VisibilityObserver.instances[0].setVisible(false));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(vi.mocked(HTMLMediaElement.prototype.pause).mock.contexts).toContain(video);
    expect(player(container)).toBe(video);
    enterViewport();
    expect(player(container)).toBe(video);
    expect(video.currentTime).toBe(17);
    expect(video).toHaveClass('has-frame');
    expect(video).toHaveAttribute('src', '/art/31-ink-preview.mp4');
    expect(HTMLMediaElement.prototype.load).not.toHaveBeenCalled();
  });

  it('releases a removed player’s source and decoder after navigation', async () => {
    const { container, unmount } = render(<ArtworkMedia media={ink(31)} alt="Signature 31" />);
    enterViewport();
    const video = player(container);
    fireEvent.playing(video);
    vi.mocked(HTMLMediaElement.prototype.pause).mockClear();
    unmount();
    expect(vi.mocked(HTMLMediaElement.prototype.pause).mock.contexts).toContain(video);
    await act(async () => {});
    expect(video).not.toHaveAttribute('src');
    expect(vi.mocked(HTMLMediaElement.prototype.load).mock.contexts).toEqual([video]);
  });

  it.each(['artwork', 'film source'] as const)(
    'releases the old decoder when the %s changes without clearing the new player',
    async (change) => {
      const { container, rerender } = render(<ArtworkMedia media={ink(31)} alt="Signature 31" />);
      enterViewport();
      const previous = player(container);
      fireEvent.playing(previous);
      const updated =
        change === 'artwork'
          ? ink(23)
          : {
              ...ink(31),
              films: [{ ...ink(31).films[0], src: '/art/31-ink-updated-preview.mp4' }],
            };
      rerender(<ArtworkMedia media={updated} alt="Updated artwork" />);
      enterViewport(1);
      const current = player(container);
      await act(async () => {});
      expect(previous).not.toBe(current);
      expect(previous).not.toHaveAttribute('src');
      expect(current).toHaveAttribute('src', updated.films[0].src);
      expect(vi.mocked(HTMLMediaElement.prototype.load).mock.contexts).toEqual([previous]);
    },
  );

  it('preserves the mounted source and position across global pause and still-view changes', async () => {
    const { container, rerender } = render(<ArtworkMedia media={ink(31)} alt="Signature 31" />);
    enterViewport();
    const video = player(container);
    fireEvent.playing(video);
    video.currentTime = 12;
    motion.paused = true;
    rerender(<ArtworkMedia media={ink(31)} alt="Signature 31" still />);
    await act(async () => {});
    motion.paused = false;
    rerender(<ArtworkMedia media={ink(31)} alt="Signature 31" />);
    await act(async () => {});
    expect(player(container)).toBe(video);
    expect(video.currentTime).toBe(12);
    expect(video).toHaveAttribute('src', '/art/31-ink-preview.mp4');
    expect(HTMLMediaElement.prototype.load).not.toHaveBeenCalled();
  });

  it('does not release a video reattached during Strict Mode ref replay', async () => {
    const { container } = render(
      <StrictMode>
        <ArtworkMedia media={ink(31)} alt="Signature 31" />
      </StrictMode>,
    );
    act(() => VisibilityObserver.instances.at(-1)!.setVisible(true));
    const video = player(container);
    fireEvent.playing(video);
    await act(async () => {});
    expect(video).toHaveAttribute('src', '/art/31-ink-preview.mp4');
    expect(HTMLMediaElement.prototype.load).not.toHaveBeenCalled();
  });

  it('preserves a connected player when React temporarily hides its Activity', async () => {
    const view = (hidden: boolean) => (
      <Activity mode={hidden ? 'hidden' : 'visible'}>
        <ArtworkMedia media={ink(31)} alt="Signature 31" />
      </Activity>
    );
    const { container, rerender } = render(view(false));
    enterViewport();
    const video = player(container);
    fireEvent.playing(video);
    video.currentTime = 12;
    rerender(view(true));
    await act(async () => {});
    expect(video.isConnected).toBe(true);
    expect(video).toHaveAttribute('src', '/art/31-ink-preview.mp4');
    rerender(view(false));
    await act(async () => {});
    expect(player(container)).toBe(video);
    expect(video.currentTime).toBe(12);
    expect(HTMLMediaElement.prototype.load).not.toHaveBeenCalled();
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
    render(
      <ArtworkMedia
        media={{ ...light, thumbnail: undefined }}
        alt="Signature 31 in light"
        onFailure={onFailure}
      />,
    );
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('img', { name: 'Signature 31 in light' })).toBeInTheDocument();
    expect(screen.getByRole('img')).not.toHaveAttribute('src');
    expect(onFailure).toHaveBeenCalledOnce();
  });

  it('keeps the publisher’s preview as the work when the full still cannot load', () => {
    vi.useFakeTimers();
    const onFailure = vi.fn();
    const onSettled = vi.fn();
    const { container } = render(
      <ArtworkMedia
        media={ink(31)}
        alt="Signature 31 in ink"
        hold
        onSettled={onSettled}
        onFailure={onFailure}
      />,
    );
    enterViewport();
    expect(container.querySelector('.art-media')).toHaveAttribute('data-arrival', 'arriving');
    fireEvent.error(screen.getByRole('img', { name: 'Signature 31 in ink' }));
    const remaining = screen.getByRole('img', { name: 'Signature 31 in ink' });
    expect(new URL((remaining as HTMLImageElement).src).pathname).toBe('/art/31-ink-640.webp');
    expect(container.querySelectorAll('img')).toHaveLength(1);
    // The preview is the plate's one image now: it settles, and the held film may start.
    expect(container.querySelector('.art-media')).toHaveAttribute('data-arrival', 'single');
    expect(onSettled).toHaveBeenCalledOnce();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1_200));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
    expect(onFailure).not.toHaveBeenCalled();
    fireEvent.error(remaining);
    expect(screen.getByRole('img', { name: 'Signature 31 in ink' })).not.toHaveAttribute('src');
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

  it('holds the final frame when a film ends and never rewinds on its own', () => {
    vi.useFakeTimers();
    const onEnded = vi.fn();
    const onProgress = vi.fn();
    const { container } = render(
      <ArtworkMedia
        media={ink(31)}
        alt="Signature 31 in ink"
        onEnded={onEnded}
        onProgress={onProgress}
      />,
    );
    enterViewport();
    const video = player(container);
    Object.defineProperty(video, 'duration', { configurable: true, value: 30 });
    fireEvent.playing(video);
    video.currentTime = 30;
    fireEvent.ended(video);
    expect(onEnded).toHaveBeenCalledOnce();
    expect(onProgress).toHaveBeenLastCalledWith(30, 30);
    expect(video).toHaveClass('has-frame');
    vi.mocked(HTMLMediaElement.prototype.play).mockClear();
    act(() => vi.advanceTimersByTime(60_000));
    expect(video.currentTime).toBe(30);
    expect(player(container)).toBe(video);
    act(() => VisibilityObserver.instances[0].setVisible(false));
    enterViewport();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it('replays forward from the first frame only on an explicit request', () => {
    const { container, rerender } = render(
      <ArtworkMedia media={ink(31)} alt="Signature 31 in ink" />,
    );
    enterViewport();
    const video = player(container);
    fireEvent.playing(video);
    video.currentTime = 30;
    fireEvent.ended(video);
    vi.mocked(HTMLMediaElement.prototype.play).mockClear();
    rerender(<ArtworkMedia media={ink(31)} alt="Signature 31 in ink" playRequest={1} />);
    expect(video.currentTime).toBe(0);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
  });

  it('retries a blocked play request and replays a finished film only on explicit request', async () => {
    const onPlaybackChange = vi.fn();
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(
      new DOMException('Autoplay blocked', 'NotAllowedError'),
    );
    const { container, rerender } = render(
      <ArtworkMedia media={ink(31)} alt="Signature 31" onPlaybackChange={onPlaybackChange} />,
    );
    await act(async () => VisibilityObserver.instances[0].setVisible(true));
    expect(onPlaybackChange).toHaveBeenLastCalledWith(false);
    rerender(
      <ArtworkMedia
        media={ink(31)}
        alt="Signature 31"
        playRequest={1}
        onPlaybackChange={onPlaybackChange}
      />,
    );
    const video = player(container);
    fireEvent.playing(video);
    expect(onPlaybackChange).toHaveBeenLastCalledWith(true);
    video.currentTime = 30;
    fireEvent.ended(video);
    expect(onPlaybackChange).toHaveBeenLastCalledWith(false);
    vi.mocked(HTMLMediaElement.prototype.play).mockClear();
    act(() => VisibilityObserver.instances[0].setVisible(false));
    enterViewport();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    rerender(
      <ArtworkMedia
        media={ink(31)}
        alt="Signature 31"
        playRequest={2}
        onPlaybackChange={onPlaybackChange}
      />,
    );
    expect(video.currentTime).toBe(0);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
  });

  it('resets image and video failures when the artwork source changes', () => {
    const { container, rerender } = render(<ArtworkMedia media={ink(31)} alt="Signature 31" />);
    enterViewport();
    fireEvent.error(player(container));
    fireEvent.error(screen.getByRole('img'));
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('img')).not.toHaveAttribute('src');
    rerender(<ArtworkMedia media={ink(23)} alt="Signature 23" />);
    enterViewport(1);
    expect(imagePath()).toBe('/art/23-ink.webp');
    expect(player(container)).toHaveAttribute('src', '/art/23-ink-preview.mp4');
    expect(player(container)).not.toHaveClass('has-frame');
  });

  it('does not interrupt playback when a parent updates its progress callback', () => {
    const { container, rerender } = render(
      <ArtworkMedia media={ink(31)} alt="Signature 31" onProgress={() => {}} />,
    );
    enterViewport();
    fireEvent.playing(player(container));
    vi.mocked(HTMLMediaElement.prototype.play).mockClear();
    vi.mocked(HTMLMediaElement.prototype.pause).mockClear();
    rerender(<ArtworkMedia media={ink(31)} alt="Signature 31" onProgress={() => {}} />);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();
  });

  it('uses an advertised thumbnail for collection cards and falls back only to the same canonical still', () => {
    const media = { ...ink(31), thumbnail: '/art/31-ink-thumb.webp' };
    const onFailure = vi.fn();
    render(<ArtworkMedia media={media} alt="Signature 31" still thumbnail onFailure={onFailure} />);
    expect(imagePath()).toBe('/art/31-ink-thumb.webp');
    fireEvent.error(screen.getByRole('img'));
    expect(imagePath()).toBe('/art/31-ink.webp');
    expect(onFailure).not.toHaveBeenCalled();
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('img')).not.toHaveAttribute('src');
    expect(onFailure).toHaveBeenCalledOnce();
  });

  it.each(['playRequest', 'restart'] as const)(
    'only an explicit %s retries a failed film and hides it until a new decoded frame',
    (request) => {
      const { container, rerender } = render(<ArtworkMedia media={ink(31)} alt="Signature 31" />);
      enterViewport();
      const failedPlayer = player(container);
      fireEvent.playing(failedPlayer);
      fireEvent.error(failedPlayer);
      expect(container.querySelector('video')).toBeNull();
      act(() => VisibilityObserver.instances[0].setVisible(false));
      enterViewport();
      expect(container.querySelector('video')).toBeNull();
      rerender(<ArtworkMedia media={ink(31)} alt="Signature 31" {...{ [request]: 1 }} />);
      const retriedPlayer = player(container);
      expect(retriedPlayer).not.toBe(failedPlayer);
      expect(retriedPlayer).not.toHaveClass('has-frame');
      expect(retriedPlayer).toHaveAttribute('src', '/art/31-ink-preview.mp4');
      fireEvent.playing(retriedPlayer);
      expect(retriedPlayer).toHaveClass('has-frame');
    },
  );

  it('paints the publisher’s preview at once and settles the still over it after decoding', () => {
    const onSettled = vi.fn();
    const { container } = render(
      <ArtworkMedia media={ink(31)} alt="Signature 31 in ink" priority onSettled={onSettled} />,
    );
    const box = container.querySelector('.art-media')!;
    expect(box).toHaveAttribute('data-arrival', 'arriving');
    const preview = container.querySelector('img.art-preview') as HTMLImageElement;
    expect(new URL(preview.src).pathname).toBe('/art/31-ink-640.webp');
    expect(preview).toHaveAttribute('aria-hidden', 'true');
    expect(preview).toHaveAttribute('fetchpriority', 'high');
    const still = screen.getByRole('img', { name: 'Signature 31 in ink' });
    expect(still).toHaveClass('art-still');
    expect(still).not.toHaveClass('is-settled');
    expect(onSettled).not.toHaveBeenCalled();
    fireEvent.load(still);
    expect(still).toHaveClass('is-settled');
    expect(box).toHaveAttribute('data-arrival', 'settled');
    expect(onSettled).toHaveBeenCalledOnce();
  });

  it('waits for the still to decode when the browser offers decode()', async () => {
    let decoded!: () => void;
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            decoded = resolve;
          }),
      ),
    });
    try {
      render(<ArtworkMedia media={ink(31)} alt="Signature 31 in ink" />);
      const still = screen.getByRole('img');
      fireEvent.load(still);
      expect(still).not.toHaveClass('is-settled');
      await act(async () => decoded());
      expect(still).toHaveClass('is-settled');
    } finally {
      Reflect.deleteProperty(HTMLImageElement.prototype, 'decode');
    }
  });

  it('inlines a server-provided preview and uses a lone still when no preview exists', () => {
    const { container, rerender } = render(
      <ArtworkMedia media={ink(31)} alt="Signature 31" previewSrc="data:image/webp;base64,AAAA" />,
    );
    expect(container.querySelector('img.art-preview')).toHaveAttribute(
      'src',
      'data:image/webp;base64,AAAA',
    );
    rerender(<ArtworkMedia media={{ ...ink(31), thumbnail: undefined }} alt="Signature 31" />);
    expect(container.querySelector('img.art-preview')).toBeNull();
    expect(screen.getByRole('img')).toHaveClass('is-settled');
    expect(container.querySelector('.art-media')).toHaveAttribute('data-arrival', 'single');
  });

  it('holds the settled still before the first automatic playback, never before an explicit one', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(
      <ArtworkMedia media={ink(31)} alt="Signature 31" hold />,
    );
    enterViewport();
    expect(player(container)).toHaveAttribute('src', '/art/31-ink-preview.mp4');
    act(() => vi.advanceTimersByTime(5_000));
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    fireEvent.load(screen.getByRole('img'));
    act(() => vi.advanceTimersByTime(1_199));
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
    vi.mocked(HTMLMediaElement.prototype.play).mockClear();
    rerender(<ArtworkMedia media={ink(23)} alt="Signature 23" hold />);
    enterViewport(1);
    rerender(<ArtworkMedia media={ink(23)} alt="Signature 23" hold playRequest={1} />);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
  });

  it('switching the ambient film off keeps the session and never re-arrives the plate', async () => {
    const show = (ambient: boolean) => (
      <ArtworkMedia media={ink(31)} alt="Signature 31" ambient={ambient} />
    );
    const { container, rerender } = render(show(true));
    enterViewport();
    const still = screen.getByRole('img', { name: 'Signature 31' });
    await act(async () => {
      fireEvent.load(still);
    });
    expect(container.querySelector('.art-media')).toHaveAttribute('data-arrival', 'settled');
    const video = player(container);
    fireEvent.playing(video);
    expect(video).toHaveClass('has-frame');
    rerender(show(false));
    // The removed player releases its frame at the end of the commit.
    await act(async () => {});
    expect(container.querySelector('video')).toBeNull();
    expect(screen.getByRole('img', { name: 'Signature 31' })).toBe(still);
    expect(container.querySelector('.art-media')).toHaveAttribute('data-arrival', 'settled');
    rerender(show(true));
    // The player returns without a stale frame over the still.
    expect(player(container)).not.toHaveClass('has-frame');
    expect(screen.getByRole('img', { name: 'Signature 31' })).toBe(still);
  });

  it('a finished film stays at rest when its ambient switch flips off and on', async () => {
    const show = (ambient: boolean) => (
      <ArtworkMedia media={ink(31)} alt="Signature 31" ambient={ambient} />
    );
    const { container, rerender } = render(show(true));
    enterViewport();
    fireEvent.load(screen.getByRole('img'));
    const video = player(container);
    fireEvent.playing(video);
    fireEvent.ended(video);
    vi.mocked(HTMLMediaElement.prototype.play).mockClear();
    rerender(show(false));
    await act(async () => {});
    rerender(show(true));
    expect(player(container)).not.toHaveClass('has-frame');
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it('behaves as a still while the theatre is hushed', () => {
    motion.theatre = 'hushed';
    const { container, rerender } = render(<ArtworkMedia media={ink(31)} alt="Signature 31" />);
    enterViewport();
    expect(container.querySelector('video')).toBeNull();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    motion.theatre = 'playing';
    rerender(<ArtworkMedia media={ink(31)} alt="Signature 31" />);
    expect(player(container)).toHaveAttribute('src', '/art/31-ink-preview.mp4');
    fireEvent.playing(player(container));
    vi.mocked(HTMLMediaElement.prototype.pause).mockClear();
    motion.theatre = 'hushed';
    rerender(<ArtworkMedia media={ink(31)} alt="Signature 31" />);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(player(container)).toHaveClass('has-frame');
  });

  it('letterboxes the plate in the work’s own measured ground', () => {
    const { container, rerender } = render(
      <ArtworkMedia media={ink(31)} alt="Signature 31" artworkId={31} />,
    );
    const box = container.querySelector('.art-media') as HTMLElement;
    expect(box.getAttribute('style')).toContain('--plate-ground: #efe9dd');
    expect(box).toHaveAttribute('data-edge', 'true');
    rerender(<ArtworkMedia media={ink(23)} alt="Signature 23" artworkId={23} />);
    expect(container.querySelector('.art-media')).not.toHaveAttribute('style');
  });
});
