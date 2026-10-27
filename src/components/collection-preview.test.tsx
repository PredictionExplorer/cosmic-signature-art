import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { CollectionPreview, excerptRange, getCollectionPreviewFilm } from './collection-preview';

// The curated archive carries its verified excerpt; this fixture is the same Ink without one.
const archivedInk = {
  ...getCuratedArtwork(31)!.media.find((media) => media.id === 'ink')!,
  previewFilm: undefined,
};
const ink = {
  ...archivedInk,
  previewFilm: { ...archivedInk.films[0], src: '/art/previews/31-ink.mp4', durationSeconds: 8 },
};
const light = getCuratedArtwork(31)!.media.find((media) => media.id === 'light')!;

function imagePath() {
  return new URL((screen.getByRole('img') as HTMLImageElement).src).pathname;
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('collection film presentation', () => {
  it('shows the still without a video element for inactive Ink and every Light work', () => {
    const { container, rerender } = render(
      <CollectionPreview media={ink} alt="Signature 31" active={false} onFailure={vi.fn()} />,
    );
    expect(container.querySelector('video')).toBeNull();
    expect(imagePath()).toBe('/art/31-ink-640.webp');
    rerender(
      <CollectionPreview
        media={{ ...light, films: ink.films, previewFilm: ink.previewFilm }}
        alt="Signature 31"
        active
        onFailure={vi.fn()}
      />,
    );
    expect(container.querySelector('video')).toBeNull();
  });

  it.each([8, 2, 0.1, Infinity])(
    'plays the entire compact excerpt from its start for duration %s',
    (duration) => {
      const { container } = render(
        <CollectionPreview media={ink} alt="Signature 31" active onFailure={vi.fn()} />,
      );
      const video = container.querySelector('video')!;
      Object.defineProperty(video, 'duration', { configurable: true, value: duration });
      fireEvent.loadedMetadata(video);
      expect(video.currentTime).toBe(0);
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
      expect(video).not.toHaveClass('has-frame');
      fireEvent.playing(video);
      expect(video).toHaveClass('has-frame');
    },
  );

  it('waits for a decoded frame where supported before fading away from the still', () => {
    let callback: VideoFrameRequestCallback | undefined;
    const { container } = render(
      <CollectionPreview media={ink} alt="Signature 31" active onFailure={vi.fn()} />,
    );
    const video = container.querySelector('video')!;
    Object.defineProperty(video, 'requestVideoFrameCallback', {
      configurable: true,
      value: (next: VideoFrameRequestCallback) => {
        callback = next;
        return 10;
      },
    });
    Object.defineProperty(video, 'cancelVideoFrameCallback', {
      configurable: true,
      value: vi.fn(),
    });
    fireEvent.playing(video);
    expect(video).not.toHaveClass('has-frame');
    act(() => callback!(0, {} as VideoFrameCallbackMetadata));
    expect(video).toHaveClass('has-frame');
  });

  it('returns to the same artwork after a film error without retrying on activation', () => {
    const onFailure = vi.fn();
    const { container, rerender } = render(
      <CollectionPreview media={ink} alt="Signature 31" active onFailure={onFailure} />,
    );
    const previous = container.querySelector('video')!;
    fireEvent.playing(previous);
    fireEvent.error(previous);
    expect(previous).not.toHaveAttribute('src');
    expect(container.querySelector('video')).toBeNull();
    expect(onFailure).toHaveBeenCalledOnce();
    rerender(
      <CollectionPreview media={ink} alt="Signature 31" active={false} onFailure={onFailure} />,
    );
    rerender(<CollectionPreview media={ink} alt="Signature 31" active onFailure={onFailure} />);
    expect(container.querySelector('video')).toBeNull();
    expect(imagePath()).toBe('/art/31-ink-640.webp');
  });

  it('ignores a rejected playback promise after ownership has moved away', async () => {
    let reject!: (reason: Error) => void;
    vi.mocked(HTMLMediaElement.prototype.play).mockReturnValue(
      new Promise<void>((_, fail) => {
        reject = fail;
      }),
    );
    const onFailure = vi.fn();
    const { container, rerender } = render(
      <CollectionPreview media={ink} alt="Signature 31" active onFailure={onFailure} />,
    );
    fireEvent.loadedMetadata(container.querySelector('video')!);
    rerender(
      <CollectionPreview media={ink} alt="Signature 31" active={false} onFailure={onFailure} />,
    );
    await act(async () => reject(new Error('Interrupted')));
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('holds the last frame, fades back to the still and releases the lease instead of looping', () => {
    vi.useFakeTimers();
    const onEnded = vi.fn();
    const { container, rerender } = render(
      <CollectionPreview
        media={ink}
        alt="Signature 31"
        active
        onFailure={vi.fn()}
        onEnded={onEnded}
      />,
    );
    const video = container.querySelector('video')!;
    Object.defineProperty(video, 'duration', { configurable: true, value: 8 });
    fireEvent.loadedMetadata(video);
    fireEvent.playing(video);
    expect(video).toHaveClass('has-frame');
    fireEvent.ended(video);
    act(() => vi.advanceTimersByTime(1_199));
    expect(video).toHaveClass('has-frame');
    act(() => vi.advanceTimersByTime(1));
    expect(video).not.toHaveClass('has-frame');
    expect(onEnded).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(700));
    expect(onEnded).toHaveBeenCalledOnce();
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
    rerender(
      <CollectionPreview
        media={ink}
        alt="Signature 31"
        active={false}
        onFailure={vi.fn()}
        onEnded={onEnded}
      />,
    );
    expect(container.querySelector('video')).toBeNull();
    expect(video).not.toHaveAttribute('src');
    act(() => vi.advanceTimersByTime(5_000));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
    expect(imagePath()).toBe('/art/31-ink-640.webp');
  });

  it('still reports the rest when the lease is lost during the hold or the fade', () => {
    vi.useFakeTimers();
    const onEnded = vi.fn();
    const show = (active: boolean) => (
      <CollectionPreview
        media={ink}
        alt="Signature 31"
        active={active}
        onFailure={vi.fn()}
        onEnded={onEnded}
      />
    );
    const { container, rerender } = render(show(true));
    const video = container.querySelector('video')!;
    fireEvent.loadedMetadata(video);
    fireEvent.playing(video);
    fireEvent.ended(video);
    act(() => vi.advanceTimersByTime(600));
    rerender(show(false));
    expect(onEnded).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(5_000));
    expect(onEnded).toHaveBeenCalledOnce();
    // An excerpt interrupted before its end owes no rest.
    rerender(show(true));
    const again = container.querySelector('video')!;
    fireEvent.loadedMetadata(again);
    fireEvent.playing(again);
    rerender(show(false));
    expect(onEnded).toHaveBeenCalledOnce();
  });

  it('describes an excerpt by its true place in the source film', () => {
    expect(excerptRange({ ...ink.previewFilm!, startSeconds: 6, durationSeconds: 8 })).toBe(
      '00:06–00:14',
    );
    expect(excerptRange({ ...ink.previewFilm!, startSeconds: undefined })).toBeUndefined();
    expect(excerptRange(undefined)).toBeUndefined();
  });

  it('falls back from a thumbnail only to its own canonical still and keeps an accessible identity if both fail', () => {
    render(
      <CollectionPreview
        media={{ ...ink, thumbnail: '/art/thumb.webp' }}
        alt="Signature 31"
        active={false}
        onFailure={vi.fn()}
      />,
    );
    expect(imagePath()).toBe('/art/thumb.webp');
    fireEvent.error(screen.getByRole('img'));
    expect(imagePath()).toBe('/art/31-ink.webp');
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('img', { name: 'Signature 31' })).not.toHaveAttribute('src');
  });

  it('never acquires the full-resolution original even when it is the first advertised film', () => {
    const original = {
      ...ink.films[0],
      src: 'https://a1.cosmicsignature.com/full-original.mp4',
      delivery: 'original-web' as const,
    };
    expect(getCollectionPreviewFilm({ ...ink, films: [original, ...ink.films] })).toBe(
      ink.previewFilm,
    );
    const { container } = render(
      <CollectionPreview
        media={{ ...archivedInk, films: [original] }}
        alt="Signature 31"
        active
        onFailure={vi.fn()}
      />,
    );
    expect(container.querySelector('video')).toBeNull();
    expect(getCollectionPreviewFilm(archivedInk)).toBeUndefined();
  });
});
