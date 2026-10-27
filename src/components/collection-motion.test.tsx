import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { useCollectionMotion } from './collection-motion';
import { CollectionPreview } from './collection-preview';

const motion = vi.hoisted(() => ({ paused: false, theatre: 'playing' as 'playing' | 'hushed' }));
vi.mock('./motion-provider', () => ({ useMotion: () => motion }));

class PreviewObserver implements IntersectionObserver {
  static instances: PreviewObserver[] = [];
  readonly root = null;
  readonly rootMargin = '0px';
  readonly thresholds = [0, 0.25, 0.5, 0.75, 1];
  targets = new Set<Element>();
  constructor(private callback: IntersectionObserverCallback) {
    PreviewObserver.instances.push(this);
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
  report(ids: number[], visible = true) {
    this.callback(
      [...this.targets]
        .filter((target) => ids.includes(Number((target as HTMLElement).dataset.previewId)))
        .map((target) => ({
          target,
          isIntersecting: visible,
          intersectionRatio: visible ? 1 : 0,
          boundingClientRect: target.getBoundingClientRect(),
          intersectionRect: target.getBoundingClientRect(),
          rootBounds: null,
          time: 0,
        })),
      this,
    );
  }
}

class Network extends EventTarget {
  saveData = false;
  effectiveType = '4g';
}
let network: Network;
const ids = [23, 31, 35];
const previewMedia = new Map(
  ids.map((id) => {
    const media = getCuratedArtwork(id)!.media.find((item) => item.id === 'ink')!;
    return [
      id,
      {
        ...media,
        previewFilm: { ...media.films[0], src: `/art/previews/${id}-ink.mp4`, durationSeconds: 8 },
      },
    ];
  }),
);

function Grid({ enabled = true }: { enabled?: boolean }) {
  const { gridRef, activeId, intent, clearIntent, fail, rest } = useCollectionMotion({
    enabled,
    ids,
  });
  return (
    <div ref={gridRef}>
      {ids.map((id) => (
        <a
          key={id}
          href={`/art/${id}`}
          data-preview-id={id}
          data-active={activeId === id}
          onPointerEnter={(event) => intent(id, 'pointer', event.pointerType)}
          onPointerLeave={() => clearIntent(id, 'pointer')}
          onFocus={() => intent(id, 'focus')}
          onBlur={() => clearIntent(id, 'focus')}
        >
          <CollectionPreview
            media={previewMedia.get(id)}
            alt={`Signature ${id}`}
            active={activeId === id}
            onFailure={(reason) => fail(id, reason)}
            onEnded={() => rest(id)}
          />
        </a>
      ))}
    </div>
  );
}

function position(id: number, top = 120, left = 0) {
  vi.spyOn(
    screen.getByRole('link', { name: `Signature ${id}` }),
    'getBoundingClientRect',
  ).mockReturnValue({
    x: left,
    y: top,
    top,
    left,
    right: left + 280,
    bottom: top + 260,
    width: 280,
    height: 260,
    toJSON: () => ({}),
  });
}
function settle(ids = [23, 31, 35], milliseconds = 240) {
  act(() => {
    PreviewObserver.instances.at(-1)!.report(ids);
    vi.advanceTimersByTime(milliseconds);
  });
}
function active(container: HTMLElement) {
  return container.querySelector<HTMLAnchorElement>('[data-active="true"]');
}

beforeEach(() => {
  vi.useFakeTimers();
  motion.paused = false;
  motion.theatre = 'playing';
  PreviewObserver.instances = [];
  network = new Network();
  vi.stubGlobal('IntersectionObserver', PreviewObserver);
  Object.defineProperty(navigator, 'connection', { configurable: true, value: network });
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (navigator as Navigator & { connection?: Network }).connection;
  vi.useRealTimers();
});

describe('bounded collection motion', () => {
  it('keeps every artwork still until viewport movement settles, then acquires exactly one film', () => {
    const { container } = render(<Grid />);
    ids.forEach((id) => position(id));
    expect(PreviewObserver.instances).toHaveLength(1);
    expect(PreviewObserver.instances[0].targets.size).toBe(3);
    settle(ids, 239);
    expect(container.querySelector('video')).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(container.querySelectorAll('video')).toHaveLength(1);
    expect(active(container)).toHaveAttribute('data-preview-id', '23');
    expect(container.querySelector('video')).toHaveAttribute('src', '/art/previews/23-ink.mp4');
  });

  it('waits until scrolling stops and retains its current film through small viewport changes', () => {
    const { container } = render(<Grid />);
    ids.forEach((id) => position(id));
    settle();
    position(31, 200);
    fireEvent.scroll(window);
    act(() => vi.advanceTimersByTime(200));
    fireEvent.scroll(window);
    act(() => vi.advanceTimersByTime(200));
    expect(active(container)).toHaveAttribute('data-preview-id', '23');
    act(() => vi.advanceTimersByTime(40));
    expect(active(container)).toHaveAttribute('data-preview-id', '23');
  });

  it('gives focus priority over hover, transferring the playback source rather than retaining hidden players', () => {
    const { container } = render(<Grid />);
    ids.forEach((id) => position(id));
    settle();
    const previous = container.querySelector('video')!;
    fireEvent.focus(screen.getByRole('link', { name: 'Signature 31' }));
    act(() => vi.advanceTimersByTime(140));
    expect(previous).not.toHaveAttribute('src');
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    fireEvent.pointerEnter(screen.getByRole('link', { name: 'Signature 35' }), {
      pointerType: 'mouse',
    });
    act(() => vi.advanceTimersByTime(140));
    expect(active(container)).toHaveAttribute('data-preview-id', '31');
    expect(container.querySelectorAll('video')).toHaveLength(1);
    fireEvent.blur(screen.getByRole('link', { name: 'Signature 31' }));
    act(() => vi.advanceTimersByTime(240));
    expect(active(container)).toHaveAttribute('data-preview-id', '35');
  });

  it('releases a film immediately when its card leaves the viewport', () => {
    const { container } = render(<Grid />);
    ids.forEach((id) => position(id));
    settle();
    const video = container.querySelector('video')!;
    act(() => PreviewObserver.instances[0].report([23], false));
    expect(container.querySelector('video')).toBeNull();
    expect(video).not.toHaveAttribute('src');
    act(() => vi.advanceTimersByTime(240));
    expect(active(container)).toHaveAttribute('data-preview-id', '31');
  });

  it('does not acquire a source for an offscreen focused card', () => {
    const { container } = render(<Grid />);
    position(23);
    position(31, 1_200);
    position(35);
    settle([23, 35]);
    fireEvent.focus(screen.getByRole('link', { name: 'Signature 31' }));
    act(() => vi.advanceTimersByTime(140));
    expect(active(container)).toHaveAttribute('data-preview-id', '23');
  });

  it('ignores touch hover and brief pointer sweeps between artworks', () => {
    const { container } = render(<Grid />);
    ids.forEach((id) => position(id));
    settle();
    const target = screen.getByRole('link', { name: 'Signature 31' });
    const touch = new Event('pointerover', { bubbles: true });
    Object.defineProperty(touch, 'pointerType', { value: 'touch' });
    fireEvent(target, touch);
    act(() => vi.advanceTimersByTime(140));
    expect(active(container)).toHaveAttribute('data-preview-id', '23');
    fireEvent.pointerEnter(target, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(100));
    fireEvent.pointerLeave(target);
    act(() => vi.advanceTimersByTime(240));
    expect(active(container)).toHaveAttribute('data-preview-id', '23');
  });

  it('lets another visible artwork move after a media-specific failure', () => {
    const { container } = render(<Grid />);
    ids.forEach((id) => position(id));
    settle();
    fireEvent.error(container.querySelector('video')!);
    expect(container.querySelector('video')).toBeNull();
    act(() => vi.advanceTimersByTime(240));
    expect(active(container)).toHaveAttribute('data-preview-id', '31');
    fireEvent.focus(screen.getByRole('link', { name: 'Signature 23' }));
    act(() => vi.advanceTimersByTime(140));
    expect(active(container)).toHaveAttribute('data-preview-id', '31');
  });

  it('does not load films while the user has paused motion or the view is disabled', () => {
    motion.paused = true;
    const { container, rerender } = render(<Grid />);
    expect(PreviewObserver.instances).toHaveLength(0);
    expect(container.querySelector('video')).toBeNull();
    motion.paused = false;
    rerender(<Grid enabled={false} />);
    expect(PreviewObserver.instances).toHaveLength(0);
    rerender(<Grid />);
    ids.forEach((id) => position(id));
    settle();
    expect(container.querySelector('video')).not.toBeNull();
    motion.paused = true;
    rerender(<Grid />);
    expect(container.querySelector('video')).toBeNull();
  });

  it.each(['saveData', '2g', 'slow-2g', '3g'])(
    'never automatically requests films on %s connections',
    (condition) => {
      if (condition === 'saveData') network.saveData = true;
      else network.effectiveType = condition;
      const { container } = render(<Grid />);
      expect(PreviewObserver.instances).toHaveLength(0);
      expect(container.querySelector('video')).toBeNull();
    },
  );

  it('reacts to data-saving and visibility changes by detaching the active source', () => {
    const { container } = render(<Grid />);
    ids.forEach((id) => position(id));
    settle();
    const first = container.querySelector('video')!;
    network.saveData = true;
    act(() => network.dispatchEvent(new Event('change')));
    expect(first).not.toHaveAttribute('src');
    expect(container.querySelector('video')).toBeNull();
    network.saveData = false;
    act(() => network.dispatchEvent(new Event('change')));
    settle();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange'));
    expect(container.querySelector('video')).toBeNull();
  });

  it('does not repeatedly retry a failed or autoplay-blocked artwork while browsing', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(
      new DOMException('Blocked', 'NotAllowedError'),
    );
    const { container } = render(<Grid />);
    ids.forEach((id) => position(id));
    settle([23]);
    await act(async () => fireEvent.loadedMetadata(container.querySelector('video')!));
    expect(container.querySelector('video')).toBeNull();
    fireEvent.focus(screen.getByRole('link', { name: 'Signature 23' }));
    settle([23]);
    expect(container.querySelector('video')).toBeNull();
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
    expect(
      new URL((screen.getByRole('img', { name: 'Signature 23' }) as HTMLImageElement).src).pathname,
    ).toBe('/art/23-ink-640.webp');
    settle();
    expect(container.querySelector('video')).toBeNull();
    fireEvent.focus(screen.getByRole('link', { name: 'Signature 31' }));
    act(() => vi.advanceTimersByTime(1_000));
    expect(container.querySelector('video')).toBeNull();
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
  });

  it('keeps a usable still gallery when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { container } = render(<Grid />);
    expect(screen.getAllByRole('img')).toHaveLength(3);
    expect(container.querySelector('video')).toBeNull();
  });

  it('retries a browser autoplay denial only after the visitor explicitly pauses and resumes motion', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(
      new DOMException('Blocked', 'NotAllowedError'),
    );
    const { container, rerender } = render(<Grid />);
    ids.forEach((id) => position(id));
    settle();
    await act(async () => fireEvent.loadedMetadata(container.querySelector('video')!));
    expect(container.querySelector('video')).toBeNull();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange'));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    fireEvent(document, new Event('visibilitychange'));
    settle();
    expect(container.querySelector('video')).toBeNull();
    motion.paused = true;
    rerender(<Grid />);
    motion.paused = false;
    rerender(<Grid />);
    settle();
    expect(active(container)).toHaveAttribute('data-preview-id', '23');
    await act(async () => fireEvent.loadedMetadata(container.querySelector('video')!));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  });

  it('a finished excerpt rests on its still and hands the lease to the next visible work', () => {
    const { container } = render(<Grid />);
    ids.forEach((id) => position(id));
    settle();
    const first = container.querySelector('video')!;
    fireEvent.loadedMetadata(first);
    fireEvent.playing(first);
    fireEvent.ended(first);
    act(() => vi.advanceTimersByTime(1_900));
    expect(first).not.toHaveAttribute('src');
    act(() => vi.advanceTimersByTime(240));
    expect(active(container)).toHaveAttribute('data-preview-id', '31');
    // Automatic selection leaves the rested work still; explicit focus replays it.
    fireEvent.focus(screen.getByRole('link', { name: 'Signature 23' }));
    act(() => vi.advanceTimersByTime(140));
    expect(active(container)).toHaveAttribute('data-preview-id', '23');
    expect(container.querySelector('video')).toHaveAttribute('src', '/art/previews/23-ink.mp4');
  });

  it.each(['focus', 'hover'] as const)(
    'a card that keeps %s plays its excerpt once; only fresh interest replays it',
    (kind) => {
      const { container } = render(<Grid />);
      ids.forEach((id) => position(id));
      settle();
      const card = screen.getByRole('link', { name: 'Signature 31' });
      const show = () =>
        kind === 'focus'
          ? fireEvent.focus(card)
          : fireEvent.pointerEnter(card, { pointerType: 'mouse' });
      const hide = () => (kind === 'focus' ? fireEvent.blur(card) : fireEvent.pointerLeave(card));
      show();
      act(() => vi.advanceTimersByTime(140));
      expect(active(container)).toHaveAttribute('data-preview-id', '31');
      const film = card.querySelector('video')!;
      fireEvent.loadedMetadata(film);
      fireEvent.playing(film);
      fireEvent.ended(film);
      act(() => vi.advanceTimersByTime(1_900));
      expect(film).not.toHaveAttribute('src');
      // The interest that woke the card is spent: the settled selector moves on.
      act(() => vi.advanceTimersByTime(240));
      expect(active(container)).toHaveAttribute('data-preview-id', '23');
      expect(card.querySelector('video')).toBeNull();
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
      fireEvent.scroll(window);
      act(() => vi.advanceTimersByTime(240));
      expect(card.querySelector('video')).toBeNull();
      // Fresh explicit interest replays it.
      hide();
      show();
      act(() => vi.advanceTimersByTime(140));
      expect(active(container)).toHaveAttribute('data-preview-id', '31');
      expect(card.querySelector('video')).toHaveAttribute('src', '/art/previews/31-ink.mp4');
    },
  );

  it('a lease lost during the hold or the fade still rests the finished excerpt', () => {
    const { container } = render(<Grid />);
    ids.forEach((id) => position(id));
    settle();
    expect(active(container)).toHaveAttribute('data-preview-id', '23');
    const first = container.querySelector('video')!;
    fireEvent.loadedMetadata(first);
    fireEvent.playing(first);
    fireEvent.ended(first);
    act(() => vi.advanceTimersByTime(600));
    // The card scrolls out while its last frame is still held; the rest is recorded anyway.
    act(() => {
      PreviewObserver.instances.at(-1)!.report([23], false);
      vi.advanceTimersByTime(240);
    });
    expect(first).not.toHaveAttribute('src');
    act(() => {
      PreviewObserver.instances.at(-1)!.report([31, 35], false);
      vi.advanceTimersByTime(240);
    });
    expect(active(container)).toBeNull();
    // Everything returns to view: the first card would win again, but it has rested.
    settle();
    expect(active(container)).toHaveAttribute('data-preview-id', '31');
    // Explicit focus still replays the rested work.
    fireEvent.focus(screen.getByRole('link', { name: 'Signature 23' }));
    act(() => vi.advanceTimersByTime(140));
    expect(active(container)).toHaveAttribute('data-preview-id', '23');
  });

  it('a hushed theatre stops every ambient film until it is playing again', () => {
    const { container, rerender } = render(<Grid />);
    ids.forEach((id) => position(id));
    settle();
    expect(container.querySelector('video')).not.toBeNull();
    motion.theatre = 'hushed';
    rerender(<Grid />);
    expect(container.querySelector('video')).toBeNull();
    motion.theatre = 'playing';
    rerender(<Grid />);
    ids.forEach((id) => position(id));
    settle();
    expect(container.querySelector('video')).not.toBeNull();
  });
});
