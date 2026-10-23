import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArtworkViewer } from './artwork-viewer';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { en } from '@/lib/i18n/en';

const motion = vi.hoisted(() => ({ paused: false, toggle: vi.fn() }));
vi.mock('./motion-provider', () => ({ useMotion: () => motion }));

beforeEach(() => {
  motion.paused = false;
  motion.toggle.mockClear();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        this.callback(
          [{ isIntersecting: true, target } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }
      disconnect() {}
    },
  );
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false;
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
});

const work = getCuratedArtwork(31)!;
function player(container: HTMLElement) {
  const element = container.querySelector('video');
  expect(element).not.toBeNull();
  return element!;
}

describe('artwork viewing controls', () => {
  it('shows Play when a film ends and one click restarts the same film', () => {
    const { container } = render(<ArtworkViewer artwork={work} t={en} />);
    const video = player(container);
    fireEvent.playing(video);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeVisible();
    video.currentTime = 30;
    fireEvent.ended(video);
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    vi.mocked(HTMLMediaElement.prototype.play).mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(video.currentTime).toBe(0);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
    expect(motion.toggle).not.toHaveBeenCalled();
  });

  it('lets the visitor retry refused autoplay without first toggling global pause', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(
      new DOMException('Blocked', 'NotAllowedError'),
    );
    await act(async () => render(<ArtworkViewer artwork={work} t={en} />));
    expect(screen.getByRole('button', { name: 'Play' })).toBeVisible();
    vi.mocked(HTMLMediaElement.prototype.play).mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
    expect(motion.toggle).not.toHaveBeenCalled();
  });

  it('forgets the prior artwork’s selected material, failure and comparison when identity changes', () => {
    const { container, rerender } = render(<ArtworkViewer artwork={work} t={en} />);
    fireEvent.click(screen.getByRole('button', { name: /^02\s*Light/ }));
    fireEvent.error(screen.getByRole('img', { name: 'Signature 31 · Light' }));
    expect(screen.getByRole('status')).toHaveTextContent(en.mediaUnavailable);
    rerender(<ArtworkViewer artwork={getCuratedArtwork(23)!} t={en} />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(container.querySelector('.art-media')).toHaveAttribute('data-material', 'ink');
    expect(screen.getByRole('img', { name: 'Signature 23 · Ink' })).toHaveAttribute(
      'src',
      expect.stringMatching(/\/art\/23-ink.webp$/),
    );
    expect(player(container)).toHaveAttribute('src', '/art/23-ink-preview.mp4');
  });

  it('resets the clock when a new interpretation is selected', () => {
    const { container } = render(<ArtworkViewer artwork={work} t={en} />);
    const video = player(container);
    Object.defineProperty(video, 'duration', { configurable: true, value: 30 });
    video.currentTime = 19;
    fireEvent.timeUpdate(video);
    expect(screen.getByText('00:19 / 00:30')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /^02\s*Light/ }));
    fireEvent.click(screen.getByRole('button', { name: /^01\s*Ink/ }));
    expect(screen.getByText('00:00 / 00:00')).toBeVisible();
  });

  it('pauses the enlarged film while hidden and resumes only if it was previously playing', () => {
    const { container } = render(<ArtworkViewer artwork={work} t={en} />);
    fireEvent.click(screen.getByRole('button', { name: en.completeFilm }));
    const video = container.querySelector('dialog video')! as HTMLVideoElement;
    expect(video).toHaveAttribute('src', '/art/31-ink-preview.mp4');
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    vi.mocked(HTMLMediaElement.prototype.pause).mockClear();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange'));
    expect(vi.mocked(HTMLMediaElement.prototype.pause).mock.contexts).toContain(video);
    vi.mocked(HTMLMediaElement.prototype.play).mockClear();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    fireEvent(document, new Event('visibilitychange'));
    expect(vi.mocked(HTMLMediaElement.prototype.play).mock.contexts).toContain(video);
    Object.defineProperty(video, 'paused', { configurable: true, value: true });
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange'));
    vi.mocked(HTMLMediaElement.prototype.play).mockClear();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    fireEvent(document, new Event('visibilitychange'));
    expect(vi.mocked(HTMLMediaElement.prototype.play).mock.contexts).not.toContain(video);
  });

  it('reports enlarged-film decoding errors inside the open dialog', () => {
    const { container } = render(<ArtworkViewer artwork={work} t={en} />);
    fireEvent.click(screen.getByRole('button', { name: en.completeFilm }));
    fireEvent.error(container.querySelector('dialog video')!);
    expect(screen.getByRole('status')).toHaveTextContent(en.mediaUnavailable);
    expect(screen.getByRole('dialog')).toContainElement(screen.getByRole('status'));
  });

  it.each(['Play', 'Restart'])(
    'an explicit %s retries a failed film and clears the stale failure notice',
    (control) => {
      const { container } = render(<ArtworkViewer artwork={work} t={en} />);
      fireEvent.error(player(container));
      expect(screen.getByRole('status')).toHaveTextContent(en.mediaUnavailable);
      expect(container.querySelector('.art-media video')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: control }));
      expect(screen.queryByRole('status')).toBeNull();
      expect(player(container)).toHaveAttribute('src', '/art/31-ink-preview.mp4');
      fireEvent.playing(player(container));
      expect(screen.getByRole('button', { name: 'Pause' })).toBeVisible();
    },
  );
});
