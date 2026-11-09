import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { REWIND_LEAD_S, REWIND_MS } from '@/lib/crossing/rewind';
import type { ArtInterpretation } from '@/lib/art/types';
import { ArtworkMedia, HOLD_MS, REWIND_WAIT_MS } from './artwork-media';
import type { RunBack } from './plate-rewind';

/*
  The plate's run back (plate-rewind.ts), as the plate drives it. The canvas itself needs a 2D
  context jsdom does not have, so the run is stood in for: each one waits until the test lets it
  finish, and ends early if the plate stops it.
*/
const motion = vi.hoisted(() => ({
  paused: false,
  reducedMotion: false,
  theatre: 'playing' as 'playing' | 'hushed',
}));
vi.mock('./motion-provider', () => ({ useMotion: () => motion }));
vi.mock('@/lib/art/plate-records', () => ({ getPlateGround: () => undefined }));
type Run = { film: HTMLVideoElement; options: RunBack; finish: (done: boolean) => void };
const rewinds = vi.hoisted(() => ({ runs: [] as Run[], clear: vi.fn() }));
vi.mock('./plate-rewind', () => ({
  prepareRewind: async () => ({
    run: (film: HTMLVideoElement, options: RunBack) =>
      new Promise<boolean>((resolve) => {
        rewinds.runs.push({ film, options, finish: resolve });
        options.signal.addEventListener('abort', () => resolve(false));
      }),
    clear: rewinds.clear,
  }),
}));

const observers: IntersectionObserverCallback[] = [];
class Observer {
  constructor(callback: IntersectionObserverCallback) {
    observers.push(callback);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
function setVisible(visible: boolean) {
  act(() =>
    observers.forEach((callback) =>
      callback([{ isIntersecting: visible } as IntersectionObserverEntry], {} as never),
    ),
  );
}

const ink = getCuratedArtwork(31)!.media.find((item) => item.id === 'ink')!;
/** Where № 031's film starts from the beginning: the lead before its first mark. */
const fromTheStart = ink.firstMarkSeconds! - REWIND_LEAD_S;

/** The plate, in view, its still settled and its order read: ready for the hold to end. */
async function plate(media: ArtInterpretation = ink, props: { startAt?: number } = {}) {
  const view = render(<ArtworkMedia media={media} alt="№ 031 · Ink" hold {...props} />);
  setVisible(true);
  fireEvent.load(view.container.querySelector('img.art-still')!);
  // The canvas mounts with the film, and its map is read while the still holds.
  await act(async () => {});
  const box = view.container.querySelector('.art-media')!;
  const video = view.container.querySelector('video')!;
  Object.defineProperty(video, 'duration', { configurable: true, value: 30.033 });
  fireEvent.loadedMetadata(video);
  return { ...view, box, video };
}

/** The film holds its first frame and data beyond it, as a browser that has buffered reports. */
function buffer(video: HTMLVideoElement) {
  Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
  Object.defineProperty(video, 'seeking', { configurable: true, value: false });
  fireEvent.canPlay(video);
}

const play = () => vi.mocked(HTMLMediaElement.prototype.play);

beforeEach(() => {
  vi.useFakeTimers();
  motion.paused = false;
  motion.reducedMotion = false;
  motion.theatre = 'playing';
  observers.length = 0;
  rewinds.runs = [];
  rewinds.clear.mockClear();
  vi.stubGlobal('IntersectionObserver', Observer);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});

afterEach(async () => {
  cleanup();
  await act(async () => {});
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the run back', () => {
  it('runs the still back to the film’s first frame once the film holds it, then plays on from there', async () => {
    const { box, video, container } = await plate();
    // A film the still will run back to is fetched while the still holds, from its first mark.
    expect(container.querySelector('canvas.art-rewind')).toHaveAttribute('aria-hidden', 'true');
    expect(video).toHaveAttribute('preload', 'auto');
    expect(video.currentTime).toBeCloseTo(fromTheStart, 6);
    await act(async () => vi.advanceTimersByTime(HOLD_MS));
    // The hold is over, but the film has nothing to show yet: the still waits for it.
    expect(box).toHaveAttribute('data-rewind', 'waiting');
    expect(rewinds.runs).toHaveLength(0);
    await act(async () => buffer(video));
    expect(box).toHaveAttribute('data-rewind', 'running');
    expect(rewinds.runs).toHaveLength(1);
    const [{ film, options }] = rewinds.runs;
    expect(film).toBe(video);
    expect(options.duration).toBe(REWIND_MS);
    expect(options.still).toBe(container.querySelector('img.art-still'));
    expect(play()).not.toHaveBeenCalled();
    // The work has run back to the bare sheet: the film plays on from the frame the canvas shows.
    await act(async () => rewinds.runs[0].finish(true));
    expect(box).toHaveAttribute('data-rewind', 'cued');
    expect(play()).toHaveBeenCalledOnce();
    fireEvent.playing(video);
    expect(video).toHaveClass('has-frame');
    // Once the film shows its own frame over the canvas's copy, the copy is let go.
    await act(async () => vi.advanceTimersByTime(50));
    expect(rewinds.clear).toHaveBeenCalled();
    expect(box).not.toHaveAttribute('data-rewind');
  });

  it('keeps the still when the plate is stopped mid-run, and runs back afresh when it may play again', async () => {
    const { box, video, container } = await plate();
    buffer(video);
    await act(async () => vi.advanceTimersByTime(HOLD_MS));
    expect(rewinds.runs).toHaveLength(1);
    setVisible(false);
    await act(async () => vi.advanceTimersByTime(50));
    expect(rewinds.clear).toHaveBeenCalled();
    expect(box).not.toHaveAttribute('data-rewind');
    expect(play()).not.toHaveBeenCalled();
    // Back in view, a new player is fetched; the order read for the plate is still in hand.
    setVisible(true);
    const again = container.querySelector('video')!;
    Object.defineProperty(again, 'duration', { configurable: true, value: 30.033 });
    fireEvent.loadedMetadata(again);
    expect(again.currentTime).toBeCloseTo(fromTheStart, 6);
    await act(async () => buffer(again));
    expect(rewinds.runs).toHaveLength(2);
    expect(box).toHaveAttribute('data-rewind', 'running');
    await act(async () => rewinds.runs[1].finish(true));
    expect(play()).toHaveBeenCalledOnce();
  });

  it('gives the plate back to its still when the browser will not play the film it ran back to', async () => {
    play().mockRejectedValueOnce(new DOMException('Autoplay blocked', 'NotAllowedError'));
    const onPlaybackChange = vi.fn();
    const view = render(
      <ArtworkMedia media={ink} alt="№ 031 · Ink" hold onPlaybackChange={onPlaybackChange} />,
    );
    setVisible(true);
    fireEvent.load(view.container.querySelector('img.art-still')!);
    await act(async () => {});
    const video = view.container.querySelector('video')!;
    Object.defineProperty(video, 'duration', { configurable: true, value: 30.033 });
    fireEvent.loadedMetadata(video);
    buffer(video);
    await act(async () => vi.advanceTimersByTime(HOLD_MS));
    rewinds.clear.mockClear();
    await act(async () => rewinds.runs[0].finish(true));
    // The canvas held the bare sheet; refused, the still is shown again and Play is offered.
    expect(rewinds.clear).toHaveBeenCalled();
    expect(view.container.querySelector('.art-media')).not.toHaveAttribute('data-rewind');
    expect(onPlaybackChange).toHaveBeenLastCalledWith(false);
  });

  it('crosses to the film as before when it cannot hold its first frame in time', async () => {
    const { box } = await plate();
    await act(async () => vi.advanceTimersByTime(HOLD_MS + REWIND_WAIT_MS - 1));
    expect(play()).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1));
    expect(play()).toHaveBeenCalledOnce();
    expect(rewinds.runs).toHaveLength(0);
    expect(box).not.toHaveAttribute('data-rewind');
  });

  it('plays from just before the first mark without running back when motion is reduced', async () => {
    motion.reducedMotion = true;
    const { box, video } = await plate();
    expect(video.currentTime).toBeCloseTo(fromTheStart, 6);
    await act(async () => vi.advanceTimersByTime(HOLD_MS));
    expect(play()).toHaveBeenCalledOnce();
    expect(rewinds.runs).toHaveLength(0);
    expect(box).not.toHaveAttribute('data-rewind');
  });

  it('never runs an ending back, nor a film resumed past its first mark', async () => {
    const ending = await plate({ ...ink, films: [ink.settlingFilm!] });
    expect(ending.container.querySelector('canvas.art-rewind')).toBeNull();
    expect(ending.video).toHaveAttribute('preload', 'metadata');
    await act(async () => vi.advanceTimersByTime(HOLD_MS));
    expect(play()).toHaveBeenCalledOnce();
    ending.unmount();
    play().mockClear();
    const resumed = await plate(ink, { startAt: 12 });
    expect(resumed.video.currentTime).toBe(12);
    expect(resumed.video).toHaveAttribute('preload', 'metadata');
    await act(async () => vi.advanceTimersByTime(HOLD_MS));
    expect(play()).toHaveBeenCalledOnce();
    expect(rewinds.runs).toHaveLength(0);
  });

  it('runs back again for a replay, over the still rather than the film’s held last frame', async () => {
    const { box, video, rerender } = await plate();
    buffer(video);
    await act(async () => vi.advanceTimersByTime(HOLD_MS));
    await act(async () => rewinds.runs[0].finish(true));
    fireEvent.playing(video);
    await act(async () => vi.advanceTimersByTime(50));
    video.currentTime = 30.033;
    fireEvent.ended(video);
    expect(video).toHaveClass('has-frame');
    play().mockClear();
    rerender(<ArtworkMedia media={ink} alt="№ 031 · Ink" hold restart={1} />);
    // The held last frame (the still) snaps away, the film is cued at its first mark again.
    expect(video).not.toHaveClass('has-frame');
    expect(video.currentTime).toBeCloseTo(fromTheStart, 6);
    expect(box).toHaveAttribute('data-rewind', 'waiting');
    await act(async () => fireEvent.seeked(video));
    expect(rewinds.runs).toHaveLength(2);
    await act(async () => rewinds.runs[1].finish(true));
    expect(play()).toHaveBeenCalledOnce();
  });
});

describe('the opening clip and the complete film', () => {
  it('never lets the complete film take over a clip that is held paused', async () => {
    const opening = ink.openingFilm!;
    const complete = ink.films[0];
    const { video: clip, container } = await plate({ ...ink, films: [opening, complete] });
    Object.defineProperty(clip, 'paused', { configurable: true, value: false });
    fireEvent.playing(clip);
    clip.currentTime = 3.5;
    fireEvent.timeUpdate(clip);
    const relay = container.querySelector<HTMLVideoElement>('video[data-relay]')!;
    expect(relay).not.toBeNull();
    // The visitor pauses; meanwhile the complete film arrives whole.
    Object.defineProperty(clip, 'paused', { configurable: true, value: true });
    Object.defineProperty(relay, 'duration', { configurable: true, value: 30 });
    Object.defineProperty(relay, 'readyState', { configurable: true, value: 4 });
    Object.defineProperty(relay, 'buffered', {
      configurable: true,
      value: { length: 1, start: () => 0, end: () => 30 },
    });
    play().mockClear();
    fireEvent.canPlayThrough(relay);
    expect(play()).not.toHaveBeenCalled();
    expect(relay.currentTime).toBe(0);
    // Playing again, the clip hands over at its own time.
    Object.defineProperty(clip, 'paused', { configurable: true, value: false });
    fireEvent.canPlayThrough(relay);
    expect(relay.currentTime).toBeCloseTo(3.5 + 2 / 60, 3);
    expect(play()).toHaveBeenCalledOnce();
  });
});
