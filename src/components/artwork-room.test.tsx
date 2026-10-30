import { Activity, StrictMode, useRef, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCuratedArtwork } from '@/lib/art/catalog';
import type { Artwork } from '@/lib/art/types';
import { en } from '@/lib/i18n/en';
import { fill } from '@/lib/i18n/format';
import { ArtworkRoom } from './artwork-room';

// The room reads the venue's motion state; the tests begin where the context default does.
const motion = { paused: true, reducedMotion: true, theatre: 'playing' as const, toggle: () => {} };
vi.mock('./motion-provider', () => ({ useMotion: () => motion }));

const preserved = getCuratedArtwork(31)!;
const windows = [
  { x: 960, y: 320, width: 1152, height: 736, share: 0.427 },
  { x: 1376, y: 960, width: 1152, height: 736, share: 0.237 },
];
const artwork: Artwork = {
  ...preserved,
  media: preserved.media.map((media) =>
    media.id === 'ink'
      ? {
          ...media,
          detail: windows,
          films: [
            {
              ...media.films[0],
              id: 'normal',
              src: '/complete-ink.mp4',
              variantKey: '31:ink:normal',
            },
            {
              ...media.films[0],
              id: 'medium',
              src: '/long-ink.mp4',
              durationSeconds: 115.8,
              variantKey: '31:ink:medium',
            },
            {
              ...media.films[0],
              id: 'slow',
              src: '/slow-ink.mp4',
              durationSeconds: 289.5,
              variantKey: '31:ink:slow',
            },
          ],
        }
      : media,
  ),
};
const longStudy = new RegExp(`^${en.longStudy}`);
const extendedStudy = new RegExp(`^${en.extendedStudy}`);

let fullscreenElement: Element | null;
let visibility: DocumentVisibilityState;

beforeEach(() => {
  fullscreenElement = null;
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => fullscreenElement,
  });
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => true });
  Object.defineProperty(document, 'exitFullscreen', {
    configurable: true,
    value: vi.fn(async () => {
      fullscreenElement = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    }),
  });
  Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
    configurable: true,
    value: vi.fn(async function (this: HTMLElement) {
      // The native API exposes its receiver as document.fullscreenElement.
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      fullscreenElement = this;
      document.dispatchEvent(new Event('fullscreenchange'));
    }),
  });
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
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  document.documentElement.style.removeProperty('overflow');
  document.body.style.removeProperty('overflow');
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'fullscreenElement');
  Reflect.deleteProperty(document, 'fullscreenEnabled');
  Reflect.deleteProperty(document, 'exitFullscreen');
  Reflect.deleteProperty(HTMLElement.prototype, 'requestFullscreen');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  Reflect.deleteProperty(navigator, 'connection');
});

function Harness({
  initialFilm = false,
  work = artwork,
  returnPointerFocus = false,
  startAt,
  derivedViews,
}: {
  initialFilm?: boolean;
  work?: Artwork;
  returnPointerFocus?: boolean;
  startAt?: number;
  derivedViews?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [expression, setExpression] = useState('ink');
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        onClick={(event) => {
          opener.current = event.currentTarget;
          setOpen(true);
        }}
      >
        Enter room
      </button>
      {open ? (
        <ArtworkRoom
          artwork={work}
          t={en}
          expression={expression}
          onExpressionChange={setExpression}
          initialFilm={initialFilm}
          startAt={startAt}
          returnFocusRef={returnPointerFocus ? opener : undefined}
          derivedViews={derivedViews}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function openRoom(initialFilm = false, props: { startAt?: number } = {}) {
  const view = render(<Harness initialFilm={initialFilm} {...props} />);
  const opener = screen.getByRole('button', { name: 'Enter room' });
  opener.focus();
  fireEvent.click(opener);
  return { ...view, opener, room: screen.getByRole('dialog') };
}

function constrainConnection() {
  Object.defineProperty(navigator, 'connection', {
    configurable: true,
    value: { saveData: true, addEventListener() {}, removeEventListener() {} },
  });
}

describe('immersive artwork room', () => {
  it('restores the chosen complete-film source after Strict Mode effect replay', () => {
    const view = render(
      <StrictMode>
        <Harness initialFilm returnPointerFocus />
      </StrictMode>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enter room' }));
    const video = view.container.querySelector('video')!;
    expect(view.container.querySelectorAll('video')).toHaveLength(1);
    expect(video).toHaveAttribute('src', '/complete-ink.mp4');
    expect(vi.mocked(HTMLMediaElement.prototype.load).mock.contexts).toContain(video);
    expect(vi.mocked(HTMLMediaElement.prototype.play).mock.contexts).toContain(video);
    view.unmount();
    expect(video).not.toHaveAttribute('src');
  });

  it('releases a hidden Activity film and restores its exact source and playhead on return', () => {
    const view = render(
      <Activity mode="visible">
        <Harness initialFilm returnPointerFocus />
      </Activity>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enter room' }));
    const video = view.container.querySelector('video')!;
    video.currentTime = 17;
    view.rerender(
      <Activity mode="hidden">
        <Harness initialFilm returnPointerFocus />
      </Activity>,
    );
    expect(video).not.toHaveAttribute('src');
    expect(vi.mocked(HTMLMediaElement.prototype.pause).mock.contexts).toContain(video);
    // Cached metadata can become available immediately when the source is reattached.
    video.currentTime = 0;
    Object.defineProperty(video, 'duration', { value: 30 });
    vi.mocked(HTMLMediaElement.prototype.load).mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      if (this.hasAttribute('src')) this.dispatchEvent(new Event('loadedmetadata'));
    });
    view.rerender(
      <Activity mode="visible">
        <Harness initialFilm returnPointerFocus />
      </Activity>,
    );
    expect(view.container.querySelector('video')).toBe(video);
    expect(view.container.querySelectorAll('video')).toHaveLength(1);
    expect(video).toHaveAttribute('src', '/complete-ink.mp4');
    expect(video.currentTime).toBe(17);
    view.unmount();
    expect(video).not.toHaveAttribute('src');
  });

  it('never creates an unrequested film during Strict Mode or Activity replay', () => {
    const view = render(
      <StrictMode>
        <Activity mode="visible">
          <Harness returnPointerFocus />
        </Activity>
      </StrictMode>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enter room' }));
    view.rerender(
      <StrictMode>
        <Activity mode="hidden">
          <Harness returnPointerFocus />
        </Activity>
      </StrictMode>,
    );
    view.rerender(
      <StrictMode>
        <Activity mode="visible">
          <Harness returnPointerFocus />
        </Activity>
      </StrictMode>,
    );
    expect(view.container.querySelector('video')).toBeNull();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(HTMLMediaElement.prototype.load).not.toHaveBeenCalled();
  });

  it('returns focus to a pointer launcher that was never focused by the browser', () => {
    render(<Harness returnPointerFocus />);
    const opener = screen.getByRole('button', { name: 'Enter room' });
    expect(opener).not.toHaveFocus();
    fireEvent.click(opener);
    expect(screen.getByRole('button', { name: en.close })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: en.close }));
    expect(opener).toHaveFocus();
  });

  it('does not restore focus to an explicit launcher removed during navigation', () => {
    const launcher = document.createElement('button');
    document.body.append(launcher);
    const focus = vi.spyOn(launcher, 'focus');
    const { unmount } = render(
      <ArtworkRoom
        artwork={artwork}
        t={en}
        expression="ink"
        onExpressionChange={vi.fn()}
        onClose={vi.fn()}
        returnFocusRef={{ current: launcher }}
      />,
    );
    launcher.remove();
    unmount();
    expect(focus).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe('');
  });

  it('opens a named native modal, locks scrolling and returns focus with exact style restoration', () => {
    document.body.style.setProperty('overflow', 'scroll', 'important');
    // jsdom's current CSSOM omits priority on shorthand properties.
    const originalPriority = document.body.style.getPropertyPriority('overflow');
    document.documentElement.style.setProperty('overflow', 'clip');
    const { room, opener } = openRoom();
    expect(room).toHaveAccessibleName(`№ 031 · ${en.viewingRoom}`);
    expect(screen.getByRole('button', { name: en.close })).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');
    fireEvent.click(screen.getByRole('button', { name: en.close }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe('scroll');
    expect(document.body.style.getPropertyPriority('overflow')).toBe(originalPriority);
    expect(document.documentElement.style.overflow).toBe('clip');
  });

  it('fills the room with the sheet’s own tone for Ink and black for Light', () => {
    const { room } = openRoom();
    const frame = room.firstElementChild as HTMLElement;
    expect(frame.style.getPropertyValue('--room-surface')).toBe('#efe9dd');
    fireEvent.click(within(room).getByRole('button', { name: en.light }));
    expect(frame.style.getPropertyValue('--room-surface')).toBe('#000000');
    expect(room).toHaveAttribute('data-material', 'light');
  });

  it('loads no complete film for an enlarged still, including after changing expression', () => {
    const { room } = openRoom();
    expect(room.querySelector('video')).toBeNull();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    fireEvent.click(within(room).getByRole('button', { name: en.light }));
    expect(room).toHaveAttribute('data-material', 'light');
    expect(room.querySelector('video')).toBeNull();
    expect(within(room).getByRole('img')).toHaveAttribute(
      'src',
      expect.stringMatching(/\/art\/31-light\.webp$/),
    );
  });

  it('lets a phone rest on the ladder’s rungs: the still carries a srcset of them', () => {
    const { room } = openRoom();
    const still = within(room).getByRole('img');
    const ink = artwork.media.find((media) => media.id === 'ink')!;
    expect(ink.rungs?.length).toBeGreaterThan(0);
    expect(still.getAttribute('srcset')).toContain(`${ink.rungs![0].src} ${ink.rungs![0].width}w`);
    expect(still.getAttribute('srcset')).toContain(`${ink.still} 3456w`);
  });

  it('keeps the strip up under reduced motion or Pause, and rests it only when motion is allowed', () => {
    vi.useFakeTimers();
    try {
      // The venue's default here is reduced motion: the chrome never leaves.
      const { room, unmount } = openRoom();
      const frame = room.querySelector('[data-material]') as HTMLElement;
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(frame).not.toHaveAttribute('data-idle');
      unmount();
      motion.reducedMotion = false;
      motion.paused = false;
      const second = openRoom();
      const moving = second.room.querySelector('[data-material]') as HTMLElement;
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(moving).toHaveAttribute('data-idle', '');
      fireEvent.pointerMove(moving);
      expect(moving).not.toHaveAttribute('data-idle');
    } finally {
      motion.reducedMotion = true;
      motion.paused = true;
      vi.useRealTimers();
    }
  });

  it('preserves independent scroll-axis declarations without restoring unrelated stale styles', () => {
    document.body.style.setProperty('overflow-y', 'scroll');
    const { room } = openRoom();
    document.body.style.setProperty('color', 'red');
    fireEvent.click(within(room).getByRole('button', { name: en.close }));
    expect(document.body.style.overflowY).toBe('scroll');
    expect(document.body.style.color).toBe('red');
    document.body.style.removeProperty('overflow-y');
    document.body.style.removeProperty('color');
  });

  it('offers an explicit retry for an unavailable still and resets failure for another expression', () => {
    const { room } = openRoom();
    const failed = within(room).getByRole('img');
    fireEvent.error(failed);
    expect(within(room).queryByRole('img')).toBeNull();
    expect(within(room).getByRole('status')).toHaveTextContent(en.mediaUnavailable);
    fireEvent.click(within(room).getByRole('button', { name: en.retry }));
    expect(within(room).getByRole('img')).not.toBe(failed);
    fireEvent.error(within(room).getByRole('img'));
    fireEvent.click(within(room).getByRole('button', { name: en.light }));
    expect(within(room).getByRole('img')).toHaveAttribute(
      'src',
      expect.stringMatching(/31-light\.webp$/),
    );
    expect(within(room).queryByText(en.mediaUnavailable)).toBeNull();
  });

  it('only starts a complete film after Film is chosen, and says so on the strip', () => {
    const { room } = openRoom();
    fireEvent.click(within(room).getByRole('button', { name: en.film }));
    expect(room.querySelector('video')).toHaveAttribute('src', '/complete-ink.mp4');
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
    expect(within(room).getByRole('status')).toHaveTextContent(en.loadingFilm);
    fireEvent.canPlay(room.querySelector('video')!);
    expect(within(room).queryByText(en.loadingFilm)).toBeNull();
  });

  it('plays a complete film on the room’s own transport, never the native controls', () => {
    const { room } = openRoom(true);
    const video = room.querySelector('video')!;
    expect(video).toHaveAttribute('src', '/complete-ink.mp4');
    expect(video).not.toHaveAttribute('controls');
    expect(video).toHaveAttribute('playsinline');
    expect(video).toHaveAttribute('preload', 'metadata');
    expect(video.src).not.toContain('preview');
    const transport = within(room).getByRole('slider', { name: en.filmPosition });
    Object.defineProperty(video, 'duration', { configurable: true, value: 30 });
    video.currentTime = 12;
    fireEvent.timeUpdate(video);
    expect(transport).toHaveAttribute('aria-valuetext', '00:12 of 00:30');
    expect(transport).toHaveValue('12');
    fireEvent.change(transport, { target: { value: '20' } });
    expect(video.currentTime).toBe(20);
  });

  it('lists every published film as a word with its length and releases the previous decoder on change', () => {
    const { room } = openRoom(true);
    const normal = room.querySelector('video')!;
    const sources = within(room).getByRole('group', { name: en.sources });
    expect(
      within(sources)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([en.still, en.film, `${en.longStudy} · 116 s`, `${en.extendedStudy} · 290 s`]);
    fireEvent.click(within(sources).getByRole('button', { name: extendedStudy }));
    expect(room.querySelector('video')).toHaveAttribute('src', '/slow-ink.mp4');
    expect(normal).not.toHaveAttribute('src');
    expect(vi.mocked(HTMLMediaElement.prototype.pause).mock.contexts).toContain(normal);
    expect(vi.mocked(HTMLMediaElement.prototype.load).mock.contexts).toContain(normal);
    expect(within(sources).getByRole('button', { name: extendedStudy })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('remembers a film position through still viewing, without keeping a video mounted', () => {
    const { room } = openRoom(true);
    const original = room.querySelector('video')!;
    original.currentTime = 17.5;
    fireEvent.click(within(room).getByRole('button', { name: en.still }));
    expect(room.querySelector('video')).toBeNull();
    expect(original).not.toHaveAttribute('src');
    fireEvent.click(within(room).getByRole('button', { name: en.film }));
    const resumed = room.querySelector('video')!;
    Object.defineProperty(resumed, 'duration', { value: 100 });
    fireEvent.loadedMetadata(resumed);
    expect(resumed.currentTime).toBe(17.5);
  });

  it('continues the plate’s time into the room, once, and only for the same film', () => {
    const { room } = openRoom(true, { startAt: 12.5 });
    const video = room.querySelector('video')!;
    Object.defineProperty(video, 'duration', { value: 30 });
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(12.5);
    const sources = within(room).getByRole('group', { name: en.sources });
    fireEvent.click(within(sources).getByRole('button', { name: longStudy }));
    const study = room.querySelector('video')!;
    Object.defineProperty(study, 'duration', { value: 115.8 });
    fireEvent.loadedMetadata(study);
    expect(study.currentTime).toBe(0);
  });

  it('keeps playheads separate between normal and longer films', () => {
    const { room } = openRoom(true);
    room.querySelector('video')!.currentTime = 17;
    const sources = within(room).getByRole('group', { name: en.sources });
    fireEvent.click(within(sources).getByRole('button', { name: longStudy }));
    const longer = room.querySelector('video')!;
    Object.defineProperty(longer, 'duration', { value: 300 });
    fireEvent.loadedMetadata(longer);
    expect(longer.currentTime).toBe(0);
    longer.currentTime = 143;
    fireEvent.click(within(sources).getByRole('button', { name: en.film }));
    const restored = room.querySelector('video')!;
    Object.defineProperty(restored, 'duration', { value: 30 });
    fireEvent.loadedMetadata(restored);
    expect(restored.currentTime).toBe(17);
  });

  it('restores the saved playhead when cached metadata precedes the playback effect', () => {
    const { room } = openRoom(true);
    room.querySelector('video')!.currentTime = 17;
    fireEvent.click(within(room).getByRole('button', { name: en.still }));
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(1);
    vi.spyOn(HTMLMediaElement.prototype, 'duration', 'get').mockReturnValue(100);
    fireEvent.click(within(room).getByRole('button', { name: en.film }));
    expect(room.querySelector('video')!.currentTime).toBe(17);
  });

  it('starts a completed film from the beginning when it is selected again', () => {
    const { room } = openRoom(true);
    const original = room.querySelector('video')!;
    original.currentTime = 30;
    Object.defineProperty(original, 'ended', { value: true });
    fireEvent.click(within(room).getByRole('button', { name: en.still }));
    fireEvent.click(within(room).getByRole('button', { name: en.film }));
    const restarted = room.querySelector('video')!;
    Object.defineProperty(restarted, 'duration', { value: 30 });
    fireEvent.loadedMetadata(restarted);
    expect(restarted.currentTime).toBe(0);
  });

  it('uses the published still when a film fails and retries only by explicit action', () => {
    const { room } = openRoom(true);
    const failed = room.querySelector('video')!;
    fireEvent.error(failed);
    expect(room.querySelector('video')).toBeNull();
    expect(failed).not.toHaveAttribute('src');
    expect(within(room).getByRole('img')).toHaveAttribute(
      'src',
      expect.stringMatching(/\/art\/31-ink\.webp$/),
    );
    expect(within(room).getByRole('status')).toHaveTextContent(en.mediaUnavailable);
    fireEvent.click(within(room).getByRole('button', { name: en.retry }));
    expect(room.querySelector('video')).not.toBe(failed);
    expect(room.querySelector('video')).toHaveAttribute('src', '/complete-ink.mp4');
    expect(within(room).queryByText(en.mediaUnavailable)).toBeNull();
  });

  it('pauses hidden playback and resumes only when it had been playing', () => {
    const { room } = openRoom(true);
    const video = room.querySelector('video')!;
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    visibility = 'hidden';
    fireEvent(document, new Event('visibilitychange'));
    expect(vi.mocked(HTMLMediaElement.prototype.pause).mock.contexts).toContain(video);
    vi.mocked(HTMLMediaElement.prototype.play).mockClear();
    visibility = 'visible';
    fireEvent(document, new Event('visibilitychange'));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
    Object.defineProperty(video, 'paused', { configurable: true, value: true });
    visibility = 'hidden';
    fireEvent(document, new Event('visibilitychange'));
    vi.mocked(HTMLMediaElement.prototype.play).mockClear();
    visibility = 'visible';
    fireEvent(document, new Event('visibilitychange'));
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it('defers playback when the room initially opens in a hidden document', () => {
    visibility = 'hidden';
    const { room } = openRoom(true);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    visibility = 'visible';
    fireEvent(document, new Event('visibilitychange'));
    expect(vi.mocked(HTMLMediaElement.prototype.play).mock.contexts).toContain(
      room.querySelector('video'),
    );
  });

  it('keeps the transport available when the browser declines playback', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(
      new DOMException('Denied', 'NotAllowedError'),
    );
    const { room } = openRoom(true);
    await act(async () => {});
    expect(room.querySelector('video')).not.toHaveAttribute('controls');
    expect(within(room).getByRole('slider', { name: en.filmPosition })).toBeInTheDocument();
    expect(screen.queryByText(en.mediaUnavailable)).toBeNull();
  });

  it('answers Space, the arrows, F, I and L, and is silent in a field', () => {
    const { room } = openRoom(true);
    const video = room.querySelector('video')!;
    Object.defineProperty(video, 'duration', { configurable: true, value: 30 });
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    video.currentTime = 10;
    fireEvent.keyDown(room, { key: 'ArrowRight' });
    expect(video.currentTime).toBe(11);
    fireEvent.keyDown(room, { key: 'ArrowRight', shiftKey: true });
    expect(video.currentTime).toBe(21);
    fireEvent.keyDown(room, { key: 'ArrowLeft' });
    expect(video.currentTime).toBe(20);
    vi.mocked(HTMLMediaElement.prototype.pause).mockClear();
    fireEvent.keyDown(room, { key: ' ' });
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledOnce();
    Object.defineProperty(video, 'paused', { configurable: true, value: true });
    vi.mocked(HTMLMediaElement.prototype.play).mockClear();
    fireEvent.keyDown(room, { key: ' ' });
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
    // A key inside the transport belongs to the transport.
    const transport = within(room).getByRole('slider', { name: en.filmPosition });
    fireEvent.keyDown(transport, { key: 'ArrowRight' });
    expect(video.currentTime).toBe(20);
    fireEvent.keyDown(room, { key: 'l' });
    expect(room).toHaveAttribute('data-material', 'light');
    fireEvent.keyDown(room, { key: 'i' });
    expect(room).toHaveAttribute('data-material', 'ink');
    fireEvent.click(within(room).getByRole('button', { name: en.still }));
    expect(room.querySelector('video')).toBeNull();
    fireEvent.keyDown(room, { key: 'f' });
    expect(room.querySelector('video')).toHaveAttribute('src', '/complete-ink.mp4');
  });

  it('names the Slow room while a long study plays, with its elapsed clock in minutes and seconds', () => {
    const { room } = openRoom(true);
    const frame = room.firstElementChild as HTMLElement;
    expect(frame).not.toHaveAttribute('data-slow');
    const sources = within(room).getByRole('group', { name: en.sources });
    fireEvent.click(within(sources).getByRole('button', { name: longStudy }));
    expect(frame).toHaveAttribute('data-slow');
    const study = room.querySelector('video')!;
    Object.defineProperty(study, 'duration', { configurable: true, value: 115.8 });
    fireEvent.canPlay(study);
    study.currentTime = 75;
    fireEvent.timeUpdate(study);
    expect(within(room).getByRole('status')).toHaveTextContent(
      `${en.slowRoom} · 01:15 ${en.elapsed.replace('{time} ', '')}`,
    );
    expect(within(room).getByRole('slider', { name: en.filmPosition })).toHaveAttribute(
      'aria-valuetext',
      '01:15 of 01:55',
    );
    fireEvent.click(within(sources).getByRole('button', { name: en.film }));
    expect(frame).not.toHaveAttribute('data-slow');
  });

  it('holds a long study for an explicit word on a constrained connection; the still stands in', () => {
    constrainConnection();
    const { room } = openRoom();
    const sources = within(room).getByRole('group', { name: en.sources });
    fireEvent.click(within(sources).getByRole('button', { name: longStudy }));
    expect(room.querySelector('video')).toBeNull();
    expect(within(room).getByRole('img')).toHaveAttribute(
      'src',
      expect.stringMatching(/\/art\/31-ink\.webp$/),
    );
    expect(within(room).getByRole('status')).toHaveTextContent(en.studyWaits);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    fireEvent.click(within(room).getByRole('button', { name: /^Play it anyway/ }));
    expect(room.querySelector('video')).toHaveAttribute('src', '/long-ink.mp4');
    // The normal film is never held: it is the work's own thirty seconds.
    fireEvent.click(within(sources).getByRole('button', { name: en.film }));
    expect(room.querySelector('video')).toHaveAttribute('src', '/complete-ink.mp4');
  });

  it('opens the loupe on the first detail window and returns to the whole plate', () => {
    const { room } = openRoom();
    const frame = room.firstElementChild as HTMLElement;
    fireEvent.click(within(room).getByRole('button', { name: en.detail }));
    expect(frame).toHaveAttribute('data-loupe');
    const loupe = within(room).getByRole('group', { name: `№ 031 · Ink · ${en.detail}` });
    expect(loupe).toHaveAttribute('data-loupe');
    expect(loupe.querySelector('img')).toHaveAttribute('width', '3456');
    expect(room.querySelector('video')).toBeNull();
    const views = within(room).getByRole('group', { name: en.detail });
    expect(within(views).getByRole('button', { name: en.wholePlate })).toBeInTheDocument();
    const second = within(views).getByRole('button', { name: 'Detail 2' });
    expect(within(views).getByRole('button', { name: 'Detail 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(second);
    expect(second).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(views).getByRole('button', { name: en.wholePlate }));
    expect(frame).not.toHaveAttribute('data-loupe');
    expect(within(room).getByRole('img')).toHaveAttribute(
      'src',
      expect.stringMatching(/\/art\/31-ink\.webp$/),
    );
    // Z toggles the loupe; W is always the whole plate.
    fireEvent.keyDown(room, { key: 'z' });
    expect(frame).toHaveAttribute('data-loupe');
    fireEvent.keyDown(room, { key: 'w' });
    expect(frame).not.toHaveAttribute('data-loupe');
    fireEvent.keyDown(room, { key: 'Z' });
    expect(frame).toHaveAttribute('data-loupe');
    fireEvent.keyDown(room, { key: 'Z' });
    expect(frame).not.toHaveAttribute('data-loupe');
  });

  it('leaves the loupe for a film on F and offers no loupe without a still', () => {
    const { room } = openRoom();
    fireEvent.click(within(room).getByRole('button', { name: en.detail }));
    // The strip's centre belongs to the loupe while it is open; the key still reaches the film.
    expect(within(room).queryByRole('button', { name: en.film })).toBeNull();
    fireEvent.keyDown(room, { key: 'f' });
    expect(room.firstElementChild).not.toHaveAttribute('data-loupe');
    expect(room.querySelector('video')).toHaveAttribute('src', '/complete-ink.mp4');
    fireEvent.click(within(room).getByRole('button', { name: en.still }));
    fireEvent.error(within(room).getByRole('img'));
    expect(within(room).getByRole('button', { name: en.detail })).toBeDisabled();
  });

  it('offers the When lens in the still’s place, labelled analysis, and steps it aside', () => {
    const { room } = openRoom();
    const lens = within(room).getByRole('button', { name: en.whenLens });
    expect(lens).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(lens);
    expect(lens).toHaveAttribute('aria-pressed', 'true');
    const drawn = within(room).getByRole('img', {
      name: fill(en.whenAlt, { plate: '№ 031 · Ink', caption: en.whenInk }),
    });
    expect(drawn.tagName).toBe('CANVAS');
    expect(drawn).toHaveAttribute('data-room-media');
    expect(within(room).getByRole('status')).toHaveTextContent(
      `${en.whenInk} · ${en.analysisNotWork}`,
    );
    // Light keeps the lens and reads its own order.
    fireEvent.keyDown(room, { key: 'l' });
    expect(within(room).getByRole('status')).toHaveTextContent(en.whenLight);
    fireEvent.keyDown(room, { key: 'i' });
    // The loupe and the film each take the lens's place; T and the word bring it back.
    fireEvent.keyDown(room, { key: 'z' });
    expect(lens).toHaveAttribute('aria-pressed', 'false');
    expect(room.querySelector('canvas')).toBeNull();
    fireEvent.keyDown(room, { key: 't' });
    expect(lens).toHaveAttribute('aria-pressed', 'true');
    expect(room.firstElementChild).not.toHaveAttribute('data-loupe');
    fireEvent.keyDown(room, { key: 'f' });
    expect(lens).toHaveAttribute('aria-pressed', 'false');
    expect(room.querySelector('video')).toHaveAttribute('src', '/complete-ink.mp4');
    fireEvent.click(lens);
    expect(room.querySelector('video')).toBeNull();
    fireEvent.click(within(room).getByRole('button', { name: en.still }));
    expect(lens).toHaveAttribute('aria-pressed', 'false');
    fireEvent.keyDown(room, { key: '?' });
    expect(within(room).getByLabelText(en.roomKeys)).toHaveTextContent(en.keyWhen);
  });

  it('rests the When word and says so when the lens cannot be painted', async () => {
    // Every image this page asks for fails, as on a connection that drops the map.
    class Unreadable {
      decoding = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal('Image', Unreadable);
    try {
      const { room } = openRoom();
      const lens = within(room).getByRole('button', { name: en.whenLens });
      fireEvent.click(lens);
      await act(async () => {});
      expect(lens).toBeDisabled();
      expect(lens).toHaveAttribute('aria-pressed', 'false');
      expect(within(room).getByRole('status')).toHaveTextContent(en.whenUnavailable);
      expect(room.querySelector('canvas')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('never offers the When lens on a sale surface, by word or by key', () => {
    render(<Harness derivedViews={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enter room' }));
    const room = screen.getByRole('dialog');
    expect(within(room).queryByRole('button', { name: en.whenLens })).toBeNull();
    fireEvent.keyDown(room, { key: 't' });
    expect(room.querySelector('canvas')).toBeNull();
    fireEvent.keyDown(room, { key: '?' });
    expect(within(room).getByLabelText(en.roomKeys)).not.toHaveTextContent(en.keyWhen);
  });

  it('offers no When lens where no arrival map is bound', () => {
    const work = {
      ...artwork,
      media: artwork.media.map((media) => ({ ...media, arrival: undefined })),
    };
    render(<Harness work={work} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enter room' }));
    const room = screen.getByRole('dialog');
    expect(within(room).queryByRole('button', { name: en.whenLens })).toBeNull();
    fireEvent.keyDown(room, { key: 't' });
    expect(room.querySelector('canvas')).toBeNull();
  });

  it('shows the room’s keys on ? and lets Escape close the hint before the room', () => {
    const { room } = openRoom();
    fireEvent.keyDown(room, { key: '?' });
    const hint = within(room).getByLabelText(en.roomKeys);
    expect(hint).toHaveTextContent(en.keyScrub);
    expect(hint).toHaveTextContent(en.keyDetail);
    const cancel = new Event('cancel', { cancelable: true });
    fireEvent(room, cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(within(room).queryByLabelText(en.roomKeys)).toBeNull();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent(room, new Event('cancel', { cancelable: true }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('handles Escape through native cancellation and prevents double-close', () => {
    const { room, opener } = openRoom();
    const event = new Event('cancel', { cancelable: true });
    fireEvent(room, event);
    expect(event.defaultPrevented).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('never closes on artwork clicks or a drag originating inside the artwork', () => {
    const { room } = openRoom();
    const image = within(room).getByRole('img');
    fireEvent.pointerDown(image);
    fireEvent.click(image);
    expect(room).toBeInTheDocument();
    fireEvent.pointerDown(image);
    fireEvent.click(room);
    expect(room).toBeInTheDocument();
    fireEvent.pointerDown(room);
    fireEvent.click(room);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('requests native fullscreen only on demand and only for the room content', async () => {
    const { room } = openRoom();
    expect(HTMLElement.prototype.requestFullscreen).not.toHaveBeenCalled();
    await act(async () =>
      fireEvent.click(within(room).getByRole('button', { name: en.fullScreen })),
    );
    expect(fullscreenElement?.tagName).toBe('DIV');
    expect(room).toContainElement(fullscreenElement as HTMLElement);
    expect(within(room).getByRole('button', { name: en.exitFullScreen })).toBeVisible();
    await act(async () =>
      fireEvent.click(within(room).getByRole('button', { name: en.exitFullScreen })),
    );
    expect(document.exitFullscreen).toHaveBeenCalledOnce();
    expect(within(room).getByRole('button', { name: en.fullScreen })).toBeVisible();
  });

  it('offers no fullscreen control where the browser cannot grant it', () => {
    Reflect.deleteProperty(HTMLElement.prototype, 'requestFullscreen');
    const { room } = openRoom();
    expect(within(room).queryByRole('button', { name: en.fullScreen })).toBeNull();
    fireEvent.click(within(room).getByRole('button', { name: en.light }));
    expect(within(room).getByRole('img')).toHaveAttribute(
      'src',
      expect.stringMatching(/\/art\/31-light\.webp$/),
    );
  });

  it('hides the fullscreen control when the document forbids it, as iPhone Safari does', () => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => false });
    const { room } = openRoom();
    expect(within(room).queryByRole('button', { name: en.fullScreen })).toBeNull();
    expect(within(room).getByRole('button', { name: en.close })).toBeVisible();
    fireEvent.click(within(room).getByRole('button', { name: en.light }));
    expect(within(room).getByRole('img')).toHaveAttribute(
      'src',
      expect.stringMatching(/\/art\/31-light\.webp$/),
    );
  });

  it('keeps the room usable when fullscreen permission is denied', async () => {
    vi.mocked(HTMLElement.prototype.requestFullscreen).mockRejectedValue(
      new DOMException('Denied', 'NotAllowedError'),
    );
    const { room } = openRoom();
    await act(async () =>
      fireEvent.click(within(room).getByRole('button', { name: en.fullScreen })),
    );
    expect(within(room).getByRole('status')).toHaveTextContent(en.fullScreenUnavailable);
    expect(within(room).getByRole('button', { name: en.fullScreen })).toBeEnabled();
    expect(room).toBeVisible();
  });

  it('does not issue competing fullscreen requests while one is pending', async () => {
    let finish: (() => void) | undefined;
    vi.mocked(HTMLElement.prototype.requestFullscreen).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { room } = openRoom();
    const button = within(room).getByRole('button', { name: en.fullScreen });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(HTMLElement.prototype.requestFullscreen).toHaveBeenCalledOnce();
    await act(async () => finish?.());
    expect(button).toBeEnabled();
  });

  it('exits owned fullscreen and releases media when navigating away', async () => {
    const { room, unmount } = openRoom(true);
    const video = room.querySelector('video')!;
    await act(async () =>
      fireEvent.click(within(room).getByRole('button', { name: en.fullScreen })),
    );
    unmount();
    expect(document.exitFullscreen).toHaveBeenCalledOnce();
    expect(video).not.toHaveAttribute('src');
    expect(vi.mocked(HTMLMediaElement.prototype.pause).mock.contexts).toContain(video);
    expect(vi.mocked(HTMLMediaElement.prototype.load).mock.contexts).toContain(video);
    expect(document.body.style.overflow).toBe('');
  });

  it('does not exit a fullscreen element it does not own', () => {
    const { unmount } = openRoom();
    fullscreenElement = document.createElement('div');
    unmount();
    expect(document.exitFullscreen).not.toHaveBeenCalled();
  });

  it('releases a fullscreen request that resolves after the room is closed', async () => {
    let finish: (() => void) | undefined;
    vi.mocked(HTMLElement.prototype.requestFullscreen).mockImplementation(function (
      this: HTMLElement,
    ) {
      return new Promise<void>((resolve) => {
        finish = () => {
          // Model the native request resolving after its caller is detached.
          // eslint-disable-next-line @typescript-eslint/no-this-alias
          fullscreenElement = this;
          resolve();
        };
      });
    });
    const { room } = openRoom();
    fireEvent.click(within(room).getByRole('button', { name: en.fullScreen }));
    fireEvent.click(within(room).getByRole('button', { name: en.close }));
    await act(async () => finish?.());
    expect(document.exitFullscreen).toHaveBeenCalledOnce();
    expect(fullscreenElement).toBeNull();
  });

  it('reports pending or failed expression preparation while preserving the displayed artwork', () => {
    const onSelect = vi.fn();
    const props = {
      artwork,
      t: en,
      expression: 'ink',
      onExpressionChange: onSelect,
      onClose: vi.fn(),
    };
    const { rerender } = render(<ArtworkRoom {...props} pendingExpression="light" />);
    const room = screen.getByRole('dialog');
    expect(within(room).getByRole('status')).toHaveTextContent(en.preparingExpression);
    expect(within(room).getByRole('button', { name: en.light })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(within(room).getByRole('img')).toHaveAttribute(
      'src',
      expect.stringMatching(/\/art\/31-ink\.webp$/),
    );
    fireEvent.click(within(room).getByRole('button', { name: en.ink }));
    expect(onSelect).toHaveBeenCalledWith('ink');
    rerender(<ArtworkRoom {...props} expressionFailed />);
    expect(within(room).getByRole('status')).toHaveTextContent(en.expressionFailed);
  });
});
