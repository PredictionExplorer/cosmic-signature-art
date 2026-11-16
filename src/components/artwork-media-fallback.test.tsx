import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCuratedArtwork } from '@/lib/art/catalog';
import type { ArtInterpretation } from '@/lib/art/types';
import { ArtworkMedia, PLATE_SIZES, localStillRequest, stillRequest } from './artwork-media';

/*
  The publisher's host out of reach in the browser. A work outside the curated registry holds
  its still's rungs (1,280 and 1,920 px) and nothing wider: the 3,456 px still and the 640 px
  preview are the publisher's files. These tests hold the plate to what it does when a file of
  the publisher's cannot be loaded: it asks for the venue's own rungs of the same still, takes a
  failed preview away, and hears an error that fired before it hydrated.
*/

vi.mock('./motion-provider', () => ({
  useMotion: () => ({ paused: false, theatre: 'playing', reducedMotion: false }),
}));

const PUBLISHER = 'https://a1.cosmicsignature.com/images/new/cosmicsignature/0x17';
const curated = getCuratedArtwork(31)!.media.find((item) => item.id === 'ink')!;
/** A work as the index gives it: the publisher's still and preview, the venue's rungs, no film. */
const indexed: ArtInterpretation = {
  ...curated,
  still: `${PUBLISHER}/ink.png`,
  thumbnail: `${PUBLISHER}/ink-640.jpg`,
  films: [],
};
const [narrow, wide] = indexed.rungs!;
const rungsAlone = `${narrow.src} 1280w, ${wide.src} 1920w`;
const here = (path: string) => new URL(path, location.href).href;

/** The browser reports the candidate it chose and could not load. */
function breakOn(image: HTMLImageElement, candidate: string) {
  Object.defineProperty(image, 'currentSrc', { configurable: true, value: candidate });
  fireEvent.error(image);
}
/** An image that failed before anyone listened: complete, without a pixel, its candidate named. */
function brokenUnheard(image: HTMLImageElement, candidate: string) {
  Object.defineProperty(image, 'complete', { configurable: true, value: true });
  Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 0 });
  Object.defineProperty(image, 'currentSrc', { configurable: true, value: candidate });
}
const parts = (container: HTMLElement) => ({
  box: container.querySelector('.art-media')!,
  preview: container.querySelector<HTMLImageElement>('img.art-preview'),
  still: container.querySelector<HTMLImageElement>('img.art-still'),
});

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
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the venue’s own rungs, asked for when a candidate cannot be loaded', () => {
  it('are the request once the publisher’s still has failed: the rungs alone, the widest as the source', () => {
    expect(localStillRequest(indexed, indexed.still!)).toEqual({
      src: wide.src,
      srcSet: rungsAlone,
      sizes: PLATE_SIZES,
    });
    // The surface's own layout width is kept, so the browser chooses among the rungs as before.
    expect(localStillRequest(indexed, indexed.still!, { sizes: '50vw' })).toMatchObject({
      sizes: '50vw',
    });
    // Nothing of the publisher's is asked for again.
    expect(localStillRequest(indexed, indexed.still!)!.srcSet).not.toContain('cosmicsignature');
    // A constrained connection is offered what it was offered before: the 1280 rung.
    expect(localStillRequest(indexed, indexed.still!, { capped: true })).toEqual({
      src: narrow.src,
      srcSet: `${narrow.src} 1280w`,
      sizes: PLATE_SIZES,
    });
  });

  it('are not asked for twice, nor when there are none, nor when what failed is not known', () => {
    // The browser names a candidate by its whole address.
    expect(localStillRequest(indexed, here(wide.src))).toBeUndefined();
    expect(localStillRequest(indexed, here(narrow.src))).toBeUndefined();
    expect(localStillRequest({ ...indexed, rungs: undefined }, indexed.still!)).toBeUndefined();
    expect(localStillRequest({ ...indexed, rungs: [] }, indexed.still!)).toBeUndefined();
    expect(localStillRequest(indexed, '')).toBeUndefined();
    expect(localStillRequest(undefined, indexed.still!)).toBeUndefined();
  });
});

describe('a plate whose publisher cannot be reached', () => {
  it('asks for the rungs alone when the still’s candidate fails, and settles on what loads', () => {
    const onFailure = vi.fn();
    const onSettled = vi.fn();
    const { container } = render(
      <ArtworkMedia
        media={indexed}
        alt="№ 017 · Ink"
        onFailure={onFailure}
        onSettled={onSettled}
      />,
    );
    const { box, still } = parts(container);
    expect(still).toHaveAttribute('srcset', stillRequest(indexed)!.srcSet);
    breakOn(still!, indexed.still!);
    // The same element, asked again: nothing of the plate is mounted afresh.
    expect(parts(container).still).toBe(still);
    expect(still).toHaveAttribute('src', wide.src);
    expect(still).toHaveAttribute('srcset', rungsAlone);
    expect(still).toHaveAttribute('sizes', PLATE_SIZES);
    // Its box is the work's own, whichever file fills it.
    expect(still).toHaveAttribute('width', '3456');
    expect(still).toHaveAttribute('height', '2234');
    expect(box).toHaveAttribute('data-arrival', 'arriving');
    expect(onFailure).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();
    fireEvent.load(still!);
    expect(still).toHaveClass('is-settled');
    expect(box).toHaveAttribute('data-arrival', 'settled');
    expect(onSettled).toHaveBeenCalledOnce();
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('asks the same of a plate with no preview layer', () => {
    const onFailure = vi.fn();
    const { container } = render(
      <ArtworkMedia
        media={{ ...indexed, thumbnail: undefined }}
        alt="№ 017 · Ink"
        onFailure={onFailure}
      />,
    );
    const still = parts(container).still!;
    breakOn(still, indexed.still!);
    expect(parts(container).still).toBe(still);
    expect(still).toHaveAttribute('srcset', rungsAlone);
    expect(onFailure).not.toHaveBeenCalled();
    // A rung that fails too is the still's failure: the work is named, and the page is told.
    breakOn(still, here(wide.src));
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[role="img"]')).toHaveAccessibleName('№ 017 · Ink');
    expect(onFailure).toHaveBeenCalledOnce();
  });

  it('leaves the preview as the work when a rung fails too', () => {
    const onFailure = vi.fn();
    const { container } = render(
      <ArtworkMedia media={indexed} alt="№ 017 · Ink" onFailure={onFailure} />,
    );
    breakOn(parts(container).still!, indexed.still!);
    breakOn(parts(container).still!, here(wide.src));
    const remaining = container.querySelectorAll('img');
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toHaveAttribute('src', indexed.thumbnail);
    expect(remaining[0]).toHaveAttribute('alt', '№ 017 · Ink');
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('does not ask for the rungs when the candidate that failed was a rung', () => {
    const { container } = render(<ArtworkMedia media={indexed} alt="№ 017 · Ink" />);
    // A phone, or a 1x desk: the browser chose a rung, and the venue's own file could not load.
    breakOn(parts(container).still!, here(narrow.src));
    const remaining = container.querySelectorAll('img');
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toHaveAttribute('src', indexed.thumbnail);
  });

  it('takes a failed preview away and keeps the still it lay under', () => {
    const onFailure = vi.fn();
    const onSettled = vi.fn();
    const { container } = render(
      <ArtworkMedia
        media={indexed}
        alt="№ 017 · Ink"
        onFailure={onFailure}
        onSettled={onSettled}
      />,
    );
    const { box, preview, still } = parts(container);
    fireEvent.error(preview!);
    // No broken image is left in the plate, and the still is the element it was: a still that
    // had loaded is not fetched or decoded again.
    expect(parts(container).preview).toBeNull();
    expect(parts(container).still).toBe(still);
    expect(container.querySelectorAll('img')).toHaveLength(1);
    // The plate is still arriving: its still has not shown yet, and nothing is told otherwise.
    expect(still).not.toHaveClass('is-settled');
    expect(box).toHaveAttribute('data-arrival', 'arriving');
    expect(onSettled).not.toHaveBeenCalled();
    fireEvent.load(still!);
    expect(box).toHaveAttribute('data-arrival', 'settled');
    expect(onSettled).toHaveBeenCalledOnce();
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('says so once when neither layer could be loaded, and names the work', () => {
    const onFailure = vi.fn();
    const { container } = render(
      <ArtworkMedia
        media={{ ...indexed, rungs: undefined }}
        alt="№ 017 · Ink"
        onFailure={onFailure}
      />,
    );
    fireEvent.error(parts(container).preview!);
    expect(onFailure).not.toHaveBeenCalled();
    breakOn(parts(container).still!, indexed.still!);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[role="img"]')).toHaveAccessibleName('№ 017 · Ink');
    expect(onFailure).toHaveBeenCalledOnce();
  });
});

describe('an image that failed before the plate hydrated', () => {
  let container: HTMLElement;
  let root: Root | undefined;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
  });
  afterEach(async () => {
    await act(async () => root?.unmount());
    root = undefined;
    document.body.replaceChildren();
  });

  it('is heard: the preview is taken away and the still asks for the rungs', async () => {
    const errors = vi.spyOn(console, 'error');
    const onFailure = vi.fn();
    const plate = (
      <ArtworkMedia media={indexed} alt="№ 017 · Ink" priority eager onFailure={onFailure} />
    );
    container.innerHTML = renderToString(plate);
    const sent = parts(container);
    // A 1,440 px window at 2x: the browser chose the publisher's 3,456 px still, and the
    // connection was refused before any of the route's script had run.
    brokenUnheard(sent.preview!, indexed.thumbnail!);
    brokenUnheard(sent.still!, indexed.still!);
    await act(async () => {
      root = hydrateRoot(container, plate);
    });
    const { box, preview, still } = parts(container);
    expect(preview).toBeNull();
    expect(still).toBe(sent.still);
    expect(still).toHaveAttribute('src', wide.src);
    expect(still).toHaveAttribute('srcset', rungsAlone);
    expect(box).toHaveAttribute('data-arrival', 'arriving');
    expect(onFailure).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
  });

  it('is not invented: an image still loading, or one that loaded, is left alone', async () => {
    const plate = <ArtworkMedia media={indexed} alt="№ 017 · Ink" priority eager />;
    container.innerHTML = renderToString(plate);
    const sent = parts(container);
    // The preview has loaded; the still is on its way (jsdom's image never completes).
    Object.defineProperty(sent.preview!, 'complete', { value: true });
    Object.defineProperty(sent.preview!, 'naturalWidth', { value: 640 });
    Object.defineProperty(sent.preview!, 'currentSrc', { value: indexed.thumbnail });
    await act(async () => {
      root = hydrateRoot(container, plate);
    });
    const { preview, still } = parts(container);
    expect(preview).toBe(sent.preview);
    expect(still).toBe(sent.still);
    expect(still).toHaveAttribute('srcset', stillRequest(indexed)!.srcSet);
  });

  it('is heard on a browsing card too, which moves on to the published still', async () => {
    const card = <ArtworkMedia media={indexed} alt="№ 017 · Ink" thumbnail still />;
    container.innerHTML = renderToString(card);
    const sent = container.querySelector('img')!;
    expect(sent).toHaveAttribute('src', indexed.thumbnail);
    brokenUnheard(sent, indexed.thumbnail!);
    await act(async () => {
      root = hydrateRoot(container, card);
    });
    expect(container.querySelector('img')).toHaveAttribute('src', indexed.still);
  });
});
