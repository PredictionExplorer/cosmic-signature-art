import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArtworkViewer } from './artwork-viewer';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { withCollectionPreviews } from '@/lib/art/collection-previews';
import { en } from '@/lib/i18n/en';

const motion = vi.hoisted(() => ({
  paused: false,
  reducedMotion: false,
  theatre: 'playing' as const,
  toggle: vi.fn(),
}));
const imageDecode = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'decode');
const networkConnection = Object.getOwnPropertyDescriptor(navigator, 'connection');
vi.mock('./motion-provider', () => ({ useMotion: () => motion }));

beforeEach(() => {
  motion.paused = false;
  motion.reducedMotion = false;
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
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
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
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
  vi.useRealTimers();
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (imageDecode) Object.defineProperty(HTMLImageElement.prototype, 'decode', imageDecode);
  else Reflect.deleteProperty(HTMLImageElement.prototype, 'decode');
  if (networkConnection) Object.defineProperty(navigator, 'connection', networkConnection);
  else Reflect.deleteProperty(navigator, 'connection');
});

function previewWork(id: number) {
  const original = getCuratedArtwork(id)!;
  return { ...original, media: withCollectionPreviews(original, original.media) };
}
const work = previewWork(31);
function player(container: HTMLElement) {
  const element = container.querySelector('video');
  expect(element).not.toBeNull();
  return element!;
}
function filmState(container: HTMLElement) {
  return container.querySelector('[data-film-state]')!;
}
const localFilm = /\/art\/31-ink-preview\.mp4$/;

describe('artwork viewing controls', () => {
  it.each([
    { saveData: true, effectiveType: '4g' },
    { saveData: false, effectiveType: '2g' },
  ])(
    'loads no ambient film on a constrained connection (%j), but honors an explicit Play',
    (connection) => {
      Object.defineProperty(navigator, 'connection', {
        configurable: true,
        value: Object.assign(new EventTarget(), connection),
      });
      const { container } = render(<ArtworkViewer artwork={work} t={en} />);
      expect(container.querySelector('video')).toBeNull();
      expect(screen.getByRole('img', { name: 'Signature 31 · Ink' })).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: en.play }));
      expect(player(container)).toHaveAttribute('src', expect.stringMatching(localFilm));
      expect(screen.queryByRole('dialog')).toBeNull();
    },
  );

  it('pauses a hidden document and preserves the compact preview’s position for returning visitors', () => {
    const { container } = render(<ArtworkViewer artwork={work} t={en} />);
    const preview = player(container);
    expect(preview).toHaveAttribute('src', expect.stringMatching(localFilm));
    fireEvent.playing(preview);
    preview.currentTime = 3;
    fireEvent.timeUpdate(preview);
    vi.mocked(HTMLMediaElement.prototype.pause).mockClear();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange'));
    expect(vi.mocked(HTMLMediaElement.prototype.pause).mock.contexts).toContain(preview);
    expect(preview.currentTime).toBe(3);
    vi.mocked(HTMLMediaElement.prototype.play).mockClear();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    fireEvent(document, new Event('visibilitychange'));
    expect(player(container)).toBe(preview);
    expect(preview.currentTime).toBe(3);
    expect(vi.mocked(HTMLMediaElement.prototype.play).mock.contexts).toContain(preview);
  });

  it('plays the verified local film inline from frame 0 and reserves the complete film for the room', () => {
    const { container } = render(<ArtworkViewer artwork={work} t={en} />);
    const preview = player(container);
    expect(preview).toHaveAttribute('src', expect.stringMatching(localFilm));
    expect(screen.queryByText(en.mediaPreview)).toBeNull();
    Object.defineProperty(preview, 'duration', { configurable: true, value: 30 });
    fireEvent.loadedMetadata(preview);
    expect(preview.currentTime).toBe(0);
    fireEvent.playing(preview);
    const enlarge = screen.getByRole('button', { name: en.enlarge });
    // Like a Safari pointer click, fireEvent does not focus the launcher for us.
    expect(enlarge).not.toHaveFocus();
    fireEvent.click(enlarge);
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('video')).toBeNull();
    expect(dialog.querySelector('img')).toHaveAttribute('alt', 'Signature 31 · Ink');
    fireEvent.click(screen.getByRole('button', { name: en.close }));
    expect(enlarge).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: en.completeFilm }));
    expect(screen.getByRole('dialog').querySelector('video')).toHaveAttribute(
      'src',
      '/art/31-ink-preview.mp4',
    );
  });

  it('never plays an unbounded published original inline; it waits for the room', async () => {
    const original = getCuratedArtwork(31)!;
    const published = {
      ...original,
      media: original.media.map((media) => ({
        ...media,
        films: media.films.map((film) => ({
          ...film,
          src: 'https://a1.cosmicsignature.com/published/ember.mp4',
          delivery: 'original-web' as const,
        })),
      })),
    };
    const { container } = render(<ArtworkViewer artwork={published} t={en} />);
    expect(container.querySelector('video')).toBeNull();
    expect(screen.queryByRole('button', { name: en.play })).toBeNull();
    expect(filmState(container)).toHaveAttribute('data-film-state', 'arriving');
    await act(async () => {
      fireEvent.load(screen.getByRole('img', { name: 'Signature 31 · Ink' }));
    });
    expect(filmState(container)).toHaveAttribute('data-film-state', 'still');
    expect(container.querySelector('video')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: en.completeFilm }));
    expect(screen.getByRole('dialog').querySelector('video')).toHaveAttribute(
      'src',
      'https://a1.cosmicsignature.com/published/ember.mp4',
    );
  });

  it('opens the expression selected in the collection without first showing Ink', () => {
    const { container } = render(<ArtworkViewer artwork={work} t={en} initialExpression="light" />);
    expect(container.querySelector('.art-media')).toHaveAttribute('data-material', 'light');
    expect(screen.getByRole('button', { name: /^Light$/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('img', { name: 'Signature 31 · Light' })).toHaveAttribute(
      'src',
      expect.stringMatching(/\/art\/31-light.webp$/),
    );
    expect(container.querySelector('video')).toBeNull();
  });

  it('falls back to an available interpretation when a requested expression is unknown', () => {
    const { container, rerender } = render(
      <ArtworkViewer artwork={work} t={en} initialExpression="unpublished-mode" />,
    );
    expect(container.querySelector('.art-media')).toHaveAttribute('data-material', 'ink');
    rerender(
      <ArtworkViewer
        artwork={{ ...work, media: work.media.filter((media) => media.id === 'light') }}
        t={en}
        initialExpression="another-unknown-mode"
      />,
    );
    expect(container.querySelector('.art-media')).toHaveAttribute('data-material', 'light');
    expect(screen.getByRole('img', { name: 'Signature 31 · Light' })).toBeVisible();
  });

  it('resets viewer state when the same token is revisited with another expression', () => {
    const { container, rerender } = render(
      <ArtworkViewer artwork={work} t={en} initialExpression="ink" />,
    );
    const video = player(container);
    Object.defineProperty(video, 'duration', { configurable: true, value: 8 });
    video.currentTime = 5;
    fireEvent.timeUpdate(video);
    fireEvent.error(video);
    expect(screen.getByRole('status')).toHaveTextContent(en.mediaUnavailable);
    rerender(<ArtworkViewer artwork={work} t={en} initialExpression="light" />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(container.querySelector('.art-media')).toHaveAttribute('data-material', 'light');
    rerender(<ArtworkViewer artwork={work} t={en} initialExpression="ink" />);
    expect(container.querySelector('.art-media')).toHaveAttribute('data-material', 'ink');
    expect(screen.getByText('00:00 / 00:00')).toBeVisible();
    expect(player(container)).not.toBe(video);
  });

  it('shows Play when a film ends and one click restarts the same film', () => {
    const { container } = render(<ArtworkViewer artwork={work} t={en} />);
    const video = player(container);
    fireEvent.playing(video);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeVisible();
    video.currentTime = 8;
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

  it('forgets the prior artwork’s selected material, failure and comparison when identity changes', async () => {
    const { container, rerender } = render(<ArtworkViewer artwork={work} t={en} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Light$/ }));
    });
    // The full still fails, then the publisher's preview fails: only then is the work unavailable.
    fireEvent.error(screen.getByRole('img', { name: 'Signature 31 · Light' }));
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.error(screen.getByRole('img', { name: 'Signature 31 · Light' }));
    expect(screen.getByRole('status')).toHaveTextContent(en.mediaUnavailable);
    rerender(<ArtworkViewer artwork={previewWork(23)} t={en} />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(container.querySelector('.art-media')).toHaveAttribute('data-material', 'ink');
    expect(screen.getByRole('img', { name: 'Signature 23 · Ink' })).toHaveAttribute(
      'src',
      expect.stringMatching(/\/art\/23-ink.webp$/),
    );
    expect(player(container)).toHaveAttribute('src', '/art/23-ink-preview.mp4');
  });

  it('resets the clock when a new interpretation is selected', async () => {
    const { container } = render(<ArtworkViewer artwork={work} t={en} />);
    const video = player(container);
    Object.defineProperty(video, 'duration', { configurable: true, value: 8 });
    video.currentTime = 5;
    fireEvent.timeUpdate(video);
    expect(screen.getByText('00:05 / 00:08')).toBeVisible();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Light$/ }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Ink$/ }));
    });
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
      expect(player(container)).toHaveAttribute('src', expect.stringMatching(localFilm));
      fireEvent.playing(player(container));
      expect(screen.getByRole('button', { name: 'Pause' })).toBeVisible();
    },
  );

  it('narrates the arrival truthfully and offers Again only after the film has rested', async () => {
    vi.useFakeTimers();
    const { container } = render(<ArtworkViewer artwork={work} t={en} />);
    expect(filmState(container)).toHaveAttribute('data-film-state', 'arriving');
    expect(filmState(container)).toHaveTextContent(en.arriving);
    const video = player(container);
    act(() => vi.advanceTimersByTime(5_000));
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.load(screen.getByRole('img', { name: 'Signature 31 · Ink' }));
    });
    expect(filmState(container)).toHaveAttribute('data-film-state', 'still');
    act(() => vi.advanceTimersByTime(1_200));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
    fireEvent.playing(video);
    expect(filmState(container)).toHaveAttribute('data-film-state', 'film');
    Object.defineProperty(video, 'duration', { configurable: true, value: 30 });
    video.currentTime = 30;
    fireEvent.ended(video);
    expect(filmState(container)).toHaveAttribute('data-film-state', 'still');
    expect(screen.getByText('00:30 / 00:30')).toBeVisible();
    expect(screen.getByRole('button', { name: en.play })).toBeVisible();
    expect(screen.queryByRole('button', { name: en.again })).toBeNull();
    act(() => vi.advanceTimersByTime(8_000));
    expect(screen.getByRole('button', { name: en.again })).toBeVisible();
    vi.mocked(HTMLMediaElement.prototype.play).mockClear();
    fireEvent.click(screen.getByRole('button', { name: en.again }));
    expect(video.currentTime).toBe(0);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: en.again })).toBeNull();
  });

  it('Sit fades the chrome until the visitor moves, and the film plays on', () => {
    vi.useFakeTimers();
    const { container } = render(<ArtworkViewer artwork={work} t={en} />);
    const section = container.querySelector('.viewing-room')!;
    fireEvent.click(screen.getByRole('button', { name: en.sit }));
    expect(section).toHaveAttribute('data-sit');
    expect(screen.getByRole('button', { name: en.sit })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.pointerMove(section);
    expect(section).toHaveAttribute('data-sit');
    act(() => vi.advanceTimersByTime(600));
    fireEvent.pointerMove(section);
    expect(section).not.toHaveAttribute('data-sit');
    fireEvent.click(screen.getByRole('button', { name: en.sit }));
    act(() => vi.advanceTimersByTime(600));
    fireEvent.keyDown(section, { key: 'Tab' });
    expect(section).not.toHaveAttribute('data-sit');
  });

  it('adopts the live record’s media only when they differ from the registry’s', async () => {
    const live = Promise.resolve({
      ...work,
      media: work.media.map((media) =>
        media.id === 'light' ? { ...media, still: '/art/31-light-renewed.webp' } : media,
      ),
    });
    render(<ArtworkViewer artwork={work} t={en} live={live} />);
    await act(async () => {
      await live;
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Light$/ }));
    });
    expect(screen.getByRole('img', { name: 'Signature 31 · Light' })).toHaveAttribute(
      'src',
      expect.stringMatching(/\/art\/31-light-renewed\.webp$/),
    );
  });
});
