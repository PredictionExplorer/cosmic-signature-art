import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArtworkViewer } from './artwork-viewer';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { withCollectionPreviews } from '@/lib/art/collection-previews';
import type { Artwork } from '@/lib/art/types';
import { en } from '@/lib/i18n/en';
import { BREATH_MS, EXPRESSION_KEY, forgetExpression } from './turn';
import { closeSheet, openSheet } from './sheets-store';

const motion = vi.hoisted(() => ({
  paused: false,
  reducedMotion: false,
  theatre: 'playing' as 'playing' | 'hushed',
  toggle: vi.fn(),
}));
const push = vi.hoisted(() => vi.fn());
const overrideRoom = vi.hoisted(() => vi.fn());
const setPlateTone = vi.hoisted(() => vi.fn());
const imageDecode = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'decode');
vi.mock('./motion-provider', () => ({ useMotion: () => motion }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('./room-ground', () => ({ overrideRoom, setPlateTone }));

const root = () => document.documentElement;
/** The seam's travel under fake timers: the breath, then --t-turn (900 ms in jsdom's fallback). */
async function travel() {
  await act(async () => {});
  await act(async () => {
    vi.advanceTimersByTime(BREATH_MS);
  });
  await act(async () => {
    vi.advanceTimersByTime(950);
  });
  await act(async () => {});
}

beforeEach(() => {
  vi.useFakeTimers();
  motion.paused = false;
  motion.reducedMotion = false;
  motion.theatre = 'playing';
  motion.toggle.mockClear();
  push.mockClear();
  overrideRoom.mockClear();
  setPlateTone.mockClear();
  sessionStorage.clear();
  forgetExpression();
  act(() => closeSheet());
  root().removeAttribute('data-turning');
  root().removeAttribute('data-sit');
  root().style.removeProperty('--seam');
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        this.callback(
          [{ isIntersecting: true, intersectionRatio: 1, target } as IntersectionObserverEntry],
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
});

function previewWork(id: number) {
  const original = getCuratedArtwork(id)!;
  return { ...original, media: withCollectionPreviews(original, original.media) };
}
const work = previewWork(31);
const traits = { structure: 'Orbit Ribbons', underlay: 'Harmonic Weave' };

function renderViewer(props: Partial<Parameters<typeof ArtworkViewer>[0]> = {}) {
  return render(<ArtworkViewer artwork={work} t={en} locale="en" traits={traits} {...props} />);
}
const stage = () => document.querySelector('[data-artwork-stage="page"]')!;
const layer = (id: string) => document.querySelector(`[data-layer="${id}"]`)!;
const currentStill = () =>
  document.querySelector<HTMLImageElement>('[data-layer-state="current"] img.art-still')!;
const word = (name: string | RegExp) =>
  within(document.querySelector<HTMLElement>('[data-layer-state="current"]')!).getByRole('button', {
    name,
  });
/** The committed layer's player: the film is only ever mounted there. */
const player = () => document.querySelector('[data-layer-state="current"] video');
/** The stills decode: ArtworkMedia settles each layer after image.decode() resolves. */
async function settle() {
  await act(async () => {
    for (const image of document.querySelectorAll<HTMLImageElement>('img.art-still'))
      fireEvent.load(image);
  });
}

describe('the plate and its strip', () => {
  it('mounts both grounds, keeps the twin inert, and labels the work by its number', async () => {
    renderViewer();
    expect(stage()).toHaveAttribute('data-expression', 'ink');
    expect(layer('ink')).toHaveAttribute('data-layer-state', 'current');
    expect(layer('ink')).toHaveAttribute('data-ground', 'paper');
    expect(layer('light')).toHaveAttribute('data-layer-state', 'twin');
    expect(layer('light')).toHaveAttribute('inert');
    expect(layer('light')).toHaveAttribute('aria-hidden', 'true');
    expect(currentStill()).toHaveAttribute('alt', '№ 031 · Ink');
    expect(within(layer('light') as HTMLElement).getByAltText('№ 031 · Light')).toBeInTheDocument();
    expect(document.querySelectorAll('.hanging-numeral')[0]).toHaveTextContent('031');
    expect(
      within(layer('ink') as HTMLElement).getByText('Orbit Ribbons · Harmonic Weave · Ink'),
    ).toBeVisible();
    for (const name of [en.light, en.film, en.sit, en.enlarge]) expect(word(name)).toBeVisible();
    expect(word(en.light)).toHaveAttribute('title', en.showLight);
    expect(
      document.querySelector('[data-layer-state="current"] [data-film-state]'),
    ).toHaveAttribute('data-film-state', 'arriving');
    await settle();
    expect(
      document.querySelector('[data-layer-state="current"] [data-film-state]'),
    ).toHaveAttribute('data-film-state', 'still');
    expect(document.querySelector('.viewer-plate')).toBe(layer('ink').firstElementChild);
    expect(document.querySelectorAll('.viewer-plate')).toHaveLength(1);
  });

  it('opens a work without an Ink expression in Light, says so, and offers no Turn', () => {
    renderViewer({ artwork: getCuratedArtwork(2)!, traits: undefined });
    expect(stage()).toHaveAttribute('data-expression', 'light');
    expect(layer('light')).toHaveAttribute('data-layer-state', 'current');
    expect(screen.getByText(`${en.light} · ${en.noInkPublished}`)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en.ink })).toBeNull();
    expect(document.querySelector('[data-night-wing]')).toBeNull();
  });
});

describe('the Turn', () => {
  it('travels the seam from the right for Light, commits, and remembers the choice', async () => {
    renderViewer();
    const light = word(en.light);
    fireEvent.click(light);
    await act(async () => {});
    expect(light).toHaveAttribute('aria-busy', 'true');
    await act(async () => {
      vi.advanceTimersByTime(BREATH_MS);
    });
    expect(root().getAttribute('data-turning')).toBe('time');
    expect(root().style.getPropertyValue('--seam')).toBe('0%');
    expect(stage()).toHaveAttribute('data-expression', 'ink');
    const seams = vi.fn();
    window.addEventListener('cosmic:seam', seams);
    await act(async () => {
      vi.advanceTimersByTime(950);
    });
    await act(async () => {});
    expect(stage()).toHaveAttribute('data-expression', 'light');
    expect(layer('light')).toHaveAttribute('data-layer-state', 'current');
    expect(layer('ink')).toHaveAttribute('inert');
    expect(root().hasAttribute('data-turning')).toBe(false);
    expect(root().style.getPropertyValue('--seam')).toBe('');
    expect(sessionStorage.getItem(EXPRESSION_KEY)).toBe('light');
    expect(seams).toHaveBeenCalled();
    // Ink returns from the left: the seam travels back to 100 %.
    fireEvent.click(word(en.ink));
    await act(async () => {});
    await act(async () => {
      vi.advanceTimersByTime(BREATH_MS);
    });
    expect(root().style.getPropertyValue('--seam')).toBe('100%');
    await act(async () => {
      vi.advanceTimersByTime(950);
    });
    await act(async () => {});
    expect(stage()).toHaveAttribute('data-expression', 'ink');
    expect(sessionStorage.getItem(EXPRESSION_KEY)).toBe('ink');
  });

  it('crosses in one frame while paused, reduced or hushed', async () => {
    for (const quiet of ['paused', 'reducedMotion', 'theatre'] as const) {
      motion.paused = quiet === 'paused';
      motion.reducedMotion = quiet === 'reducedMotion';
      motion.theatre = quiet === 'theatre' ? 'hushed' : 'playing';
      const view = renderViewer();
      fireEvent.click(word(en.light));
      await act(async () => {});
      expect(root().hasAttribute('data-turning')).toBe(false);
      expect(stage()).toHaveAttribute('data-expression', 'light');
      view.unmount();
    }
  });

  it('peeks while L is held and returns on release; a tap commits', async () => {
    renderViewer();
    fireEvent.keyDown(window, { key: 'L' });
    await act(async () => {
      vi.advanceTimersByTime(BREATH_MS);
    });
    expect(root().getAttribute('data-turning')).toBe('time');
    expect(root().style.getPropertyValue('--seam')).toBe('0%');
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(stage()).toHaveAttribute('data-expression', 'ink');
    fireEvent.keyUp(window, { key: 'L' });
    expect(root().style.getPropertyValue('--seam')).toBe('100%');
    await act(async () => {
      vi.advanceTimersByTime(950);
    });
    await act(async () => {});
    expect(root().hasAttribute('data-turning')).toBe(false);
    expect(stage()).toHaveAttribute('data-expression', 'ink');
    // A tap: down and up inside the tap window completes the Turn.
    fireEvent.keyDown(window, { key: 'l' });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.keyUp(window, { key: 'l' });
    await travel();
    expect(stage()).toHaveAttribute('data-expression', 'light');
  });

  it('follows the session’s remembered expression when the URL names none, and never for a work with one expression', async () => {
    sessionStorage.setItem(EXPRESSION_KEY, 'light');
    forgetExpression();
    sessionStorage.setItem(EXPRESSION_KEY, 'light');
    renderViewer();
    await act(async () => {});
    expect(stage()).toHaveAttribute('data-expression', 'light');
    expect(root().hasAttribute('data-turning')).toBe(false);
    cleanup();
    renderViewer({ initialExpression: 'ink' });
    await act(async () => {});
    expect(stage()).toHaveAttribute('data-expression', 'ink');
    cleanup();
    renderViewer({ artwork: getCuratedArtwork(2)!, traits: undefined });
    await act(async () => {});
    expect(sessionStorage.getItem(EXPRESSION_KEY)).toBe('light');
  });
});

describe('the film, the rest and Sit', () => {
  it('holds the settled still, plays the verified film, freezes the time line at the end and offers Again after the rest', async () => {
    const { container } = renderViewer();
    await settle();
    // The still is held as an object for --t-hold before the film may begin.
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    const video = player()!;
    expect(video).toHaveAttribute('src', expect.stringMatching(/\/art\/31-ink-preview\.mp4$/));
    Object.defineProperty(video, 'duration', { configurable: true, value: 30 });
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 12, writable: true });
    fireEvent.playing(video);
    fireEvent.timeUpdate(video);
    expect(word(en.still)).toBeInTheDocument();
    expect(container.querySelector('[data-film-state]')).toHaveAttribute('data-film-state', 'film');
    expect(document.querySelector('.time-line i')).toHaveStyle({ width: '40%' });
    fireEvent.ended(video);
    expect(container.querySelector('[data-film-state]')).toHaveAttribute(
      'data-film-state',
      'still',
    );
    expect(document.querySelector('.time-line i')).toHaveStyle({ width: '100%' });
    expect(screen.queryByRole('button', { name: en.again })).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(8000);
    });
    expect(document.querySelector('.time-line')).toBeNull();
    const again = word(en.again);
    fireEvent.click(again);
    expect(screen.queryByRole('button', { name: en.again })).toBeNull();
    expect(word(en.film)).toBeInTheDocument();
  });

  it('Sit fades the strip and the head until the visitor moves, swallowing the waking click', async () => {
    const { container } = renderViewer();
    const section = container.querySelector('section')!;
    fireEvent.click(word(en.sit));
    expect(section).toHaveAttribute('data-sit');
    expect(root()).toHaveAttribute('data-sit');
    fireEvent.pointerMove(section);
    expect(section).toHaveAttribute('data-sit');
    await act(async () => {
      vi.advanceTimersByTime(700);
    });
    const study = word(en.enlarge);
    fireEvent.pointerDown(study);
    expect(section).not.toHaveAttribute('data-sit');
    expect(root()).not.toHaveAttribute('data-sit');
    fireEvent.click(study);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('the room and the keys', () => {
  it('Study opens the room on the still, silences the plate keys, and returns focus', () => {
    renderViewer();
    const study = word(en.enlarge);
    study.focus();
    fireEvent.click(study);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName(`№ 031 · ${en.viewingRoom}`);
    expect(dialog.querySelector('video')).toBeNull();
    fireEvent.keyDown(window, { key: 'L' });
    expect(root().hasAttribute('data-turning')).toBe(false);
    fireEvent.click(within(dialog).getByRole('button', { name: en.close }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(study).toHaveFocus();
  });

  it('answers Space, the arrows and F, and is silent in a field or under a sheet', async () => {
    renderViewer({
      neighbours: { previous: { id: 30 }, next: { id: 32 } },
    });
    await settle();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(push).toHaveBeenLastCalledWith('/art/32');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(push).toHaveBeenLastCalledWith('/art/30');
    const field = document.createElement('input');
    document.body.append(field);
    fireEvent.keyDown(field, { key: 'ArrowRight' });
    expect(push).toHaveBeenCalledTimes(2);
    field.remove();
    act(() => openSheet('index'));
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(push).toHaveBeenCalledTimes(2);
    act(() => closeSheet());
    fireEvent.keyDown(window, { key: 'f' });
    expect(screen.getByRole('dialog').querySelector('video')).toHaveAttribute(
      'src',
      expect.stringMatching(/\/art\/31-ink-preview\.mp4$/),
    );
  });

  it('lists the neighbours with the remembered expression in their links', async () => {
    renderViewer({
      neighbours: {
        previous: { id: 30, preview: '/art/previews/30.webp' },
        next: { id: 32 },
        spectral: { id: 44, deltaNm: 18, direction: 'redder' },
        lot: true,
      },
    });
    expect(screen.getByRole('link', { name: `${en.previousWork} · № 030` })).toHaveAttribute(
      'href',
      '/art/30',
    );
    expect(screen.getByRole('link', { name: /Next by wavelength/ })).toHaveTextContent(
      'Next by wavelength · № 044 · 18 nm redder',
    );
    expect(screen.getByRole('link', { name: /Collect/ })).toHaveAttribute('href', '/auctions/31');
    fireEvent.click(word(en.light));
    await travel();
    expect(screen.getByRole('link', { name: `${en.nextWork} · № 032` })).toHaveAttribute(
      'href',
      '/art/32?expression=light',
    );
  });
});

describe('the home', () => {
  it('sets the one line in the strip, remembers a resolved arrival, and opens the night wing’s words', async () => {
    const { container } = renderViewer({ presentation: 'home' });
    expect(within(layer('ink') as HTMLElement).getByText(en.statementLine)).toBeInTheDocument();
    expect(within(layer('ink') as HTMLElement).getByText(en.statementSigned)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en.enlarge })).toBeNull();
    expect(
      within(layer('light') as HTMLElement).getByRole('link', {
        name: `${en.throughSpectrum} →`,
        hidden: true,
      }),
    ).toHaveAttribute('href', '/collection?order=spectrum');
    await settle();
    await act(async () => {
      vi.advanceTimersByTime(1200);
    });
    const video = player()!;
    Object.defineProperty(video, 'duration', { configurable: true, value: 30 });
    fireEvent.playing(video);
    fireEvent.ended(video);
    expect(sessionStorage.getItem('cosmic-art-home-film-v1')).toBe('resolved');
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(word(en.again)).toBeInTheDocument();
    cleanup();
    // The next visit to the home in this session opens on the still with Again.
    const second = renderViewer({ presentation: 'home' });
    expect(within(second.container).getByRole('button', { name: en.again })).toBeInTheDocument();
    expect(container.querySelector('video')).toBeNull();
  });

  it('the Dusk, behind its flag, lowers the wall after the rest and is cancelled by any input', async () => {
    renderViewer({ presentation: 'home', dusk: true });
    await settle();
    await act(async () => {
      vi.advanceTimersByTime(1200);
    });
    const video = player()!;
    Object.defineProperty(video, 'duration', { configurable: true, value: 30 });
    fireEvent.playing(video);
    fireEvent.ended(video);
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    await act(async () => {});
    expect(root().getAttribute('data-turning')).toBe('dusk');
    expect(root().style.getPropertyValue('--seam')).toBe('0%');
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(root().getAttribute('data-turning')).toBe('time');
    expect(root().style.getPropertyValue('--seam')).toBe('100%');
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    await act(async () => {});
    expect(stage()).toHaveAttribute('data-expression', 'ink');
    expect(root().hasAttribute('data-turning')).toBe(false);
  });
});

describe('the live record', () => {
  it('adopts the live record’s media only when they differ from the registry’s', async () => {
    vi.useRealTimers();
    const differing: Artwork = {
      ...work,
      media: work.media.map((item) =>
        item.id === 'ink' ? { ...item, still: '/art/31-ink-live.webp' } : item,
      ),
    };
    let resolve!: (value: Artwork | null) => void;
    const live = new Promise<Artwork | null>((done) => {
      resolve = done;
    });
    // A suspended boundary inside render() is only retried when the act scope is awaited.
    await act(async () => {
      renderViewer({ live });
    });
    expect(currentStill()).toHaveAttribute('src', '/art/31-ink.webp');
    await act(async () => {
      resolve(differing);
    });
    await act(async () => {});
    expect(currentStill()).toHaveAttribute('src', '/art/31-ink-live.webp');
  });
});
