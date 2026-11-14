import { act, fireEvent } from '@testing-library/react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { settleScript } from '@/lib/settle';
import { ArtworkMedia } from './artwork-media';

/*
  The document's script settles a still that has loaded before the plate has hydrated
  (src/lib/settle.ts). These tests hold the plate to its side of that: React adopts the still as
  the script left it, never takes the class away, and goes on settling the plate itself.
*/

vi.mock('./motion-provider', () => ({
  useMotion: () => ({ paused: false, theatre: 'playing', reducedMotion: false }),
}));

const ink = getCuratedArtwork(31)!.media.find((item) => item.id === 'ink')!;
const plate = (alt = '№ 031 · Ink') => <ArtworkMedia media={ink} alt={alt} priority eager />;
/** The same plate with another film: what a phone's plate becomes once it knows its screen. */
const withExcerpt = {
  ...ink,
  films: [{ ...ink.films[0], id: 'excerpt', src: '/art/clips/31-excerpt.mp4' }],
};
const still = () => container.querySelector<HTMLImageElement>('img.art-still')!;
const arrival = () => container.querySelector('.art-media')!.getAttribute('data-arrival');

let container: HTMLElement;
let root: Root | undefined;
let listeners: [string, EventListenerOrEventListenerObject, boolean | AddEventListenerOptions][];

/** The page before any of the route's script has run: the server's markup and the inline script. */
function served() {
  container.innerHTML = renderToString(plate());
  new Function(settleScript)();
  return container.querySelector<HTMLImageElement>('img.art-still')!;
}
/** Every write to the still's class from here on, the same word written again included. */
function classWrites(still: HTMLImageElement) {
  let writes = 0;
  const observer = new MutationObserver((records) => {
    writes += records.length;
  });
  observer.observe(still, { attributes: true, attributeFilter: ['class'] });
  return () => writes + observer.takeRecords().length;
}

beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
  listeners = [];
  const add = document.addEventListener.bind(document);
  vi.spyOn(document, 'addEventListener').mockImplementation(
    (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      listeners.push([type, listener, options ?? false]);
      add(type, listener, options);
    },
  );
  container = document.createElement('div');
  document.body.append(container);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  for (const [type, listener, options] of listeners)
    document.removeEventListener(type, listener, options);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('a still settled before the plate hydrates', () => {
  it('is sent unsettled, and is shown by the document’s script alone', () => {
    const still = served();
    expect(still.className).toBe('art-still');
    still.dispatchEvent(new Event('load'));
    expect(still.className).toBe('art-still is-settled');
    // No React has run: the plate still reads as arriving, and nothing waits on that to paint.
    expect(container.querySelector('.art-media')).toHaveAttribute('data-arrival', 'arriving');
  });

  it('keeps its class through hydration and every render after, and React writes nothing', async () => {
    const errors = vi.spyOn(console, 'error');
    const still = served();
    still.dispatchEvent(new Event('load'));
    const writes = classWrites(still);

    await act(async () => {
      root = hydrateRoot(container, plate());
    });
    // Hydrated in place: the same element, as the script left it, and no mismatch reported.
    expect(container.querySelector('img.art-still')).toBe(still);
    expect(still.className).toBe('art-still is-settled');
    expect(errors).not.toHaveBeenCalled();
    // jsdom's image never completes, so the plate's own state is still unsettled here: the
    // renders below run with that state unchanged.
    expect(container.querySelector('.art-media')).toHaveAttribute('data-arrival', 'arriving');

    await act(async () => root!.render(plate()));
    // Another prop of the same image changes; its class is not React's to touch.
    await act(async () => root!.render(plate('№ 031 · Ink, the still')));
    expect(still).toHaveAttribute('alt', '№ 031 · Ink, the still');
    expect(still.className).toBe('art-still is-settled');
    expect(writes()).toBe(0);
    expect(errors).not.toHaveBeenCalled();
  });

  it('is settled again by the plate itself, which adds the same word and reports the arrival', async () => {
    const onSettled = vi.fn();
    const hydrating = (
      <ArtworkMedia media={ink} alt="№ 031 · Ink" priority eager onSettled={onSettled} />
    );
    container.innerHTML = renderToString(hydrating);
    new Function(settleScript)();
    const still = container.querySelector<HTMLImageElement>('img.art-still')!;
    still.dispatchEvent(new Event('load'));
    await act(async () => {
      root = hydrateRoot(container, hydrating);
    });
    expect(onSettled).not.toHaveBeenCalled();
    // The still's candidates change, or the browser reports it again: the plate's own handler.
    fireEvent.load(still);
    expect(container.querySelector('.art-media')).toHaveAttribute('data-arrival', 'settled');
    expect(still.className).toBe('art-still is-settled');
    expect(onSettled).toHaveBeenCalledOnce();
  });

  it('adopts a still that completed before hydration, as it always has', async () => {
    const still = served();
    Object.defineProperty(still, 'complete', { value: true });
    Object.defineProperty(still, 'naturalWidth', { value: 1386 });
    still.dispatchEvent(new Event('load'));
    await act(async () => {
      root = hydrateRoot(container, plate());
    });
    expect(container.querySelector('.art-media')).toHaveAttribute('data-arrival', 'settled');
    expect(still.className).toBe('art-still is-settled');
  });

  describe('and the plate then changes its film, which mounts its media again', () => {
    it('shows the still that takes its place at once, without waiting for it to load again', async () => {
      const first = served();
      first.dispatchEvent(new Event('load'));
      await act(async () => {
        root = hydrateRoot(container, plate());
      });
      // The plate itself has not settled: only the element says the visitor sees the still.
      expect(arrival()).toBe('arriving');

      await act(async () => root!.render(<ArtworkMedia media={withExcerpt} alt="№ 031 · Ink" />));
      const second = still();
      expect(second).not.toBe(first);
      expect(first.isConnected).toBe(false);
      // No `load` has fired on the new element, and none is waited for.
      expect(second.className).toBe('art-still is-settled');
      expect(arrival()).toBe('settled');
    });

    it('decodes that still in step with its first paint, then as every still is decoded', async () => {
      const frames: FrameRequestCallback[] = [];
      vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => frames.push(frame));
      vi.stubGlobal('cancelAnimationFrame', () => {});
      const nextFrame = () => act(async () => frames.splice(0).forEach((frame) => frame(0)));
      const first = served();
      expect(first).toHaveAttribute('decoding', 'async');
      first.dispatchEvent(new Event('load'));
      await act(async () => {
        root = hydrateRoot(container, plate());
      });
      expect(first).toHaveAttribute('decoding', 'async');
      await act(async () => root!.render(<ArtworkMedia media={withExcerpt} alt="№ 031 · Ink" />));
      expect(still()).toHaveAttribute('decoding', 'sync');
      await nextFrame();
      expect(still()).toHaveAttribute('decoding', 'sync');
      await nextFrame();
      expect(still()).toHaveAttribute('decoding', 'async');
      expect(still().className).toBe('art-still is-settled');
    });

    it('does the same when the plate had settled the still itself', async () => {
      const onSettled = vi.fn();
      const first = served();
      await act(async () => {
        root = hydrateRoot(container, plate());
      });
      expect(first.className).toBe('art-still');
      fireEvent.load(first);
      expect(arrival()).toBe('settled');
      await act(async () =>
        root!.render(<ArtworkMedia media={withExcerpt} alt="№ 031 · Ink" onSettled={onSettled} />),
      );
      expect(still()).not.toBe(first);
      expect(still().className).toBe('art-still is-settled');
      // The new session reports its arrival, so its film's hold begins.
      expect(onSettled).toHaveBeenCalledOnce();
    });

    it('lets a still nobody has seen arrive as any still does', async () => {
      served();
      await act(async () => {
        root = hydrateRoot(container, plate());
      });
      await act(async () => root!.render(<ArtworkMedia media={withExcerpt} alt="№ 031 · Ink" />));
      const second = still();
      expect(second.className).toBe('art-still');
      expect(arrival()).toBe('arriving');
      fireEvent.load(second);
      expect(second.className).toBe('art-still is-settled');
    });

    it('never carries one still’s arrival over to another', async () => {
      const first = served();
      first.dispatchEvent(new Event('load'));
      await act(async () => {
        root = hydrateRoot(container, plate());
      });
      const light = getCuratedArtwork(31)!.media.find((item) => item.id === 'light')!;
      await act(async () => root!.render(<ArtworkMedia media={light} alt="№ 031 · Light" />));
      expect(still()).not.toBe(first);
      expect(still().className).toBe('art-still');
      expect(arrival()).toBe('arriving');
      // And back: the Ink still was let go unsettled by the Light session, so it arrives afresh.
      await act(async () => root!.render(plate()));
      expect(still().className).toBe('art-still');
    });
  });
});
