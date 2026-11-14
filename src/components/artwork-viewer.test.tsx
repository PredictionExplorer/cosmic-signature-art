import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArtworkViewer } from './artwork-viewer';
import { LINED_PLATE_SIZES, PLATE_SIZES } from './artwork-media';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { artworkFromIndex } from '@/lib/art/collection-cards';
import { indexedWork } from '@/lib/art/collection-index';
import { withCollectionPreviews } from '@/lib/art/collection-previews';
import type { Artwork } from '@/lib/art/types';
import { en } from '@/lib/i18n/en';
import { ja } from '@/lib/i18n/ja';
import { AFTER_THE_FRAME_EVENT, SEAM_EVENT } from '@/lib/venue-events';
import { ROOM_SIZES } from './artwork-room';
import { BREATH_MS, forgetExpression } from './turn';
import { closeSheet, openSheet } from './sheets-store';
import { EXPRESSION_KEY, HOME_RESOLVED_KEY } from '@/lib/storage-keys';
import { overturePhase, setOverturePhase } from './overture-store';
import { filmOrbit } from '@/lib/art/orbit-windows';
import { clock, fill } from '@/lib/i18n/format';
import {
  closestApproachSeconds,
  pairName,
  physicsAt,
  type FilmScore,
} from '@/lib/physics/film-score';
import { lightFilmDuration, lightFilmFrames } from '@/lib/physics/light-film';
import { scoreWindow } from '@/lib/physics/score-window';
import type { ScoreReply, ScoreRequest } from '@/lib/physics/score.worker';
import { forgetFilmScores } from './film-score-store';

const motion = vi.hoisted(() => ({
  paused: false,
  reducedMotion: false,
  theatre: 'playing' as 'playing' | 'hushed',
  toggle: vi.fn(),
}));
const push = vi.hoisted(() => vi.fn());
const overrideRoom = vi.hoisted(() => vi.fn());
const setPlateTone = vi.hoisted(() => vi.fn());
const lendPlateTone = vi.hoisted(() => vi.fn());
const returnPlateTone = vi.hoisted(() => vi.fn());
const imageDecode = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'decode');
vi.mock('./motion-provider', () => ({ useMotion: () => motion }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('./room-ground', () => ({ overrideRoom, setPlateTone, lendPlateTone, returnPlateTone }));

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
  await dropSeam();
}
/** The seam outlasts a commit by one chrome beat (--t-chrome) so the head's overlay covers its fade. */
async function dropSeam() {
  await act(async () => {
    vi.advanceTimersByTime(300);
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

/** The page's opening is Ink unless a case says otherwise, as on an Ink day. */
function renderViewer(props: Partial<Parameters<typeof ArtworkViewer>[0]> = {}) {
  return render(
    <ArtworkViewer
      artwork={work}
      t={en}
      locale="en"
      traits={traits}
      openingExpression="ink"
      {...props}
    />,
  );
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
/** The home's handover: the opening clip plays, the complete film is cued and takes over. */
async function handover() {
  const opening = player() as HTMLVideoElement;
  expect(opening).toHaveAttribute(
    'src',
    expect.stringMatching(/\/art\/clips\/31-ink-opening-[a-f0-9]{16}\.mp4$/),
  );
  Object.defineProperty(opening, 'duration', { configurable: true, value: 10 });
  Object.defineProperty(opening, 'paused', { configurable: true, value: false });
  fireEvent.playing(opening);
  // Two seconds of clip past where it began (just before the first mark), the film is fetched.
  Object.defineProperty(opening, 'currentTime', { configurable: true, value: 3.5, writable: true });
  fireEvent.timeUpdate(opening);
  const relay = document.querySelector<HTMLVideoElement>(
    '[data-layer-state="current"] video[data-relay]',
  )!;
  expect(relay).toHaveAttribute('src', expect.stringMatching(/\/art\/31-ink-preview\.mp4$/));
  Object.defineProperty(relay, 'duration', { configurable: true, value: 30 });
  Object.defineProperty(relay, 'readyState', { configurable: true, value: 4 });
  Object.defineProperty(relay, 'buffered', {
    configurable: true,
    value: { length: 1, start: () => 0, end: () => 30 },
  });
  fireEvent.canPlay(relay);
  fireEvent.playing(relay);
  return relay;
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
    expect(currentStill()).toHaveAttribute('alt', '№\u00a0031 · Ink');
    expect(within(layer('light') as HTMLElement).getByAltText('№ 031 · Light')).toBeInTheDocument();
    expect(document.querySelectorAll('.hanging-numeral')[0]).toHaveTextContent('031');
    expect(
      within(layer('ink') as HTMLElement).getByText('Orbit Ribbons · Harmonic Weave · Ink'),
    ).toBeVisible();
    for (const name of [en.light, en.film, en.ways]) expect(word(name)).toBeVisible();
    expect(screen.queryByRole('button', { name: en.sit })).toBeNull();
    expect(screen.queryByRole('button', { name: en.enlarge })).toBeNull();
    fireEvent.click(word(en.ways));
    for (const name of [en.sit, en.enlarge]) expect(word(name)).toBeVisible();
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
    expect(document.querySelector('[data-wing]')).toBeNull();
  });

  it('sets the line under each still where the label stood, each sentence a box of its own', () => {
    const line = ['Three bodies, together for all the steps.', 'One of them is no longer bound.'];
    renderViewer({ lines: { ink: line, light: line } });
    expect(document.querySelector('.viewing-room')).toHaveAttribute('data-lines');
    for (const id of ['ink', 'light']) {
      const strip = layer(id).querySelector('.strip')!;
      // The strip is marked, so that the line keeps its place where a label gives way.
      expect(strip).toHaveAttribute('data-line');
      const said = strip.querySelector('p')!;
      expect(said.textContent).toBe(
        'Three bodies, together for all the steps. One of them is no longer bound.',
      );
      // A line breaks between two sentences before it breaks inside one.
      expect([...said.querySelectorAll('em > span')].map((span) => span.textContent)).toEqual(line);
    }
    // The generator's vocabulary has left the strip; the entry keeps it, with its notes.
    expect(screen.queryByText(/Orbit Ribbons/)).toBeNull();
  });

  it('runs two sentences together as the language does: no space between them in Japanese', () => {
    const line = ['一つ目の文。', '二つ目の文。'];
    renderViewer({ t: ja, locale: 'ja', lines: { ink: line, light: line } });
    expect(layer('ink').querySelector('.strip p')!.textContent).toBe('一つ目の文。二つ目の文。');
  });

  it('says its line under the twin’s own screen too, each material’s its own', () => {
    renderViewer({
      lines: { ink: ['Three bodies.', 'This is ink.'], light: ['Three bodies.', 'This is light.'] },
    });
    // Beneath an Ink plate the wing hangs the Light twin, on a screen of its own where no
    // scroll draws it over the plate: a phone, reduced motion, an older browser.
    const twin = document.querySelector('[data-wing]')!.lastElementChild!;
    expect(twin).toHaveAttribute('data-ground', 'night');
    expect(twin.querySelector('.strip')).toHaveAttribute('data-line');
    expect(twin.querySelector('.strip p')!.textContent).toBe('Three bodies. This is light.');
    expect(layer('ink').querySelector('.strip p')!.textContent).toBe('Three bodies. This is ink.');
  });

  it('keeps the material’s name under the twin’s screen in a room without lines', () => {
    renderViewer();
    const twin = document.querySelector('[data-wing]')!.lastElementChild!;
    expect(twin.querySelector('.strip')).not.toHaveAttribute('data-line');
    expect(within(twin.querySelector('.strip') as HTMLElement).getByText('Light')).toBeVisible();
  });

  it('says after a work’s line, as a sentence of its own, that no Ink is published', () => {
    const line = ['Three bodies, together for all the steps.', 'They are still bound.'];
    renderViewer({
      artwork: getCuratedArtwork(2)!,
      traits: undefined,
      lines: { ink: line, light: line },
    });
    const said = layer('light').querySelector('.strip p')!;
    // The whole paragraph, in order: the two sentences, a space, the note.
    expect(said.textContent).toBe(
      `Three bodies, together for all the steps. They are still bound. ${en.noInkPublished}`,
    );
    expect(said.lastElementChild).toHaveTextContent(en.noInkPublished);
    expect(said.lastElementChild).toHaveClass('folio');
    expect(screen.queryByText(`${en.light} · ${en.noInkPublished}`)).toBeNull();
  });

  it('asks the still ladder for the plate a line leaves room for', () => {
    const line = ['Three bodies.'];
    const sizesOf = () =>
      document.querySelector('[data-layer-state="current"] img.art-still')!.getAttribute('sizes');
    const lined = renderViewer({ lines: { ink: line, light: line } });
    expect(sizesOf()).toBe(LINED_PLATE_SIZES);
    lined.unmount();
    renderViewer();
    expect(sizesOf()).toBe(PLATE_SIZES);
  });

  it('keeps the label line on a sale’s page, whatever line it is given', () => {
    const line = ['Three bodies, together for all the steps.', 'One of them is no longer bound.'];
    renderViewer({ presentation: 'auction', lines: { ink: line, light: line } });
    // A work's fate is not told beside its sale: the viewer cuts the line as it cuts the orbit.
    expect(document.querySelector('.viewing-room')).not.toHaveAttribute('data-lines');
    const strip = layer('ink').querySelector('.strip')!;
    expect(strip).not.toHaveAttribute('data-line');
    expect(strip.querySelector('p')).toBeNull();
    expect(
      within(strip as HTMLElement).getByText('Orbit Ribbons · Harmonic Weave · Ink'),
    ).toBeInTheDocument();
    expect(document.querySelector('img.art-still')).toHaveAttribute('sizes', PLATE_SIZES);
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
    window.addEventListener(SEAM_EVENT, seams);
    await act(async () => {
      vi.advanceTimersByTime(950);
    });
    await act(async () => {});
    expect(stage()).toHaveAttribute('data-expression', 'light');
    expect(layer('light')).toHaveAttribute('data-layer-state', 'current');
    expect(layer('ink')).toHaveAttribute('inert');
    // The committed seam stays one chrome beat so the head's base can fade under the overlay.
    expect(root().getAttribute('data-turning')).toBe('time');
    expect(root().getAttribute('data-turn-to')).toBe('night');
    await dropSeam();
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
    await dropSeam();
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

  it('a peek whose keyup is lost returns when the window blurs', async () => {
    renderViewer();
    fireEvent.keyDown(window, { key: 'L' });
    await act(async () => {
      vi.advanceTimersByTime(BREATH_MS + 1000);
    });
    expect(root().style.getPropertyValue('--seam')).toBe('0%');
    fireEvent.blur(window);
    expect(root().style.getPropertyValue('--seam')).toBe('100%');
    await act(async () => {
      vi.advanceTimersByTime(950);
    });
    await act(async () => {});
    await dropSeam();
    expect(stage()).toHaveAttribute('data-expression', 'ink');
    expect(root().hasAttribute('data-turning')).toBe(false);
    // The key may be pressed again: the lost peek left nothing behind.
    fireEvent.keyDown(window, { key: 'L' });
    await act(async () => {
      vi.advanceTimersByTime(BREATH_MS);
    });
    expect(root().style.getPropertyValue('--seam')).toBe('0%');
    fireEvent.keyUp(window, { key: 'L' });
  });

  it('a drag whose twin cannot be decoded springs the seam back to rest', async () => {
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error('undecodable')),
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 1000,
      bottom: 600,
      width: 1000,
      height: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    Object.defineProperty(Element.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    renderViewer();
    const turn = layer('ink').closest<HTMLElement>('[data-expression]')!;
    const touch = (clientX: number) => ({
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      clientX,
      clientY: 300,
    });
    fireEvent.pointerDown(turn, touch(900));
    fireEvent.pointerMove(turn, touch(300));
    fireEvent.pointerUp(turn, touch(300));
    expect(root().getAttribute('data-turning')).toBe('drag');
    await act(async () => {});
    expect(screen.getByText(en.expressionFailed)).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(950);
    });
    await act(async () => {});
    await dropSeam();
    expect(root().hasAttribute('data-turning')).toBe(false);
    expect(root().style.getPropertyValue('--seam')).toBe('');
    expect(stage()).toHaveAttribute('data-expression', 'ink');
  });

  /** What an image asks the browser for: the three attributes a rung is chosen from. */
  const asks = (image: HTMLImageElement) =>
    (['src', 'srcset', 'sizes'] as const).map((name) => image.getAttribute(name));
  /** The one image a Turn readies as it is asked for: made off the page, and asked to decode. */
  function readiedBy(turn: () => void) {
    const decode = vi.mocked(HTMLImageElement.prototype.decode);
    const before = decode.mock.contexts.length;
    turn();
    const made = (decode.mock.contexts.slice(before) as HTMLImageElement[]).filter(
      (image) => !image.isConnected,
    );
    expect(made).toHaveLength(1);
    return made[0];
  }

  it('readies the twin as its plate asks for it: the ladder at the plate’s width, not the published still alone', () => {
    renderViewer();
    const twin = layer('light').querySelector<HTMLImageElement>('img.art-still')!;
    const probe = readiedBy(() => fireEvent.click(word(en.light)));
    // The same three attributes, so the browser resolves the rung the plate already holds.
    expect(asks(probe)).toEqual(asks(twin));
    expect(asks(probe)).toEqual([
      '/art/31-light.webp',
      expect.stringMatching(
        /^\/art\/stills\/31-light-1280-[a-f0-9]{16}\.webp 1280w, \/art\/stills\/31-light-1920-[a-f0-9]{16}\.webp 1920w, \/art\/31-light\.webp 3456w$/,
      ),
      PLATE_SIZES,
    ]);
  });

  it('readies the twin of a plate that carries its line at that plate’s own width', () => {
    // The strip with the line under the still is two rows on a middling screen, and its plate is
    // fitted to what is left: the Turn must ask at that width, or it readies a wider rung.
    const line = ['Three bodies.', 'One orbit.'];
    renderViewer({ lines: { ink: line, light: line } });
    const twin = layer('light').querySelector<HTMLImageElement>('img.art-still')!;
    const probe = readiedBy(() => fireEvent.click(word(en.light)));
    expect(asks(probe)).toEqual(asks(twin));
    expect(probe.getAttribute('sizes')).toBe(LINED_PLATE_SIZES);
  });

  it('readies the capped ladder on a constrained connection, as its plate shows it', () => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: Object.assign(new EventTarget(), { saveData: true }),
    });
    try {
      renderViewer();
      const twin = layer('light').querySelector<HTMLImageElement>('img.art-still')!;
      const probe = readiedBy(() => fireEvent.click(word(en.light)));
      expect(asks(probe)).toEqual(asks(twin));
      // The 1280 rung is the only candidate: the 3,456 px file is never fetched to be thrown away.
      expect(probe.getAttribute('srcset')).toMatch(
        /^\/art\/stills\/31-light-1280-[a-f0-9]{16}\.webp 1280w$/,
      );
    } finally {
      Reflect.deleteProperty(navigator, 'connection');
    }
  });

  it('readies a change of material in the room as the room asks for it, at the room’s width', async () => {
    renderViewer();
    fireEvent.click(word(en.ways));
    fireEvent.click(word(en.enlarge));
    const dialog = screen.getByRole('dialog');
    const asked = asks(readiedBy(() => fireEvent.keyDown(dialog, { key: 'l' })));
    expect(asked[2]).toBe(ROOM_SIZES);
    // The whole ladder: the room is where a screen wide enough is given the original.
    expect(asked[1]).toMatch(/1280w, .* 1920w, \/art\/31-light\.webp 3456w$/);
    await act(async () => {});
    expect(stage()).toHaveAttribute('data-expression', 'light');
    const shown = screen
      .getByRole('dialog')
      .querySelector<HTMLImageElement>('img[data-room-media]')!;
    expect(shown).toHaveAttribute('alt', expect.stringContaining(en.light));
    expect(asks(shown)).toEqual(asked);
  });

  it('follows the session’s remembered expression when the URL names none, remembers what a URL asks for, and never a work with one expression', async () => {
    sessionStorage.setItem(EXPRESSION_KEY, 'light');
    forgetExpression();
    sessionStorage.setItem(EXPRESSION_KEY, 'light');
    renderViewer();
    await act(async () => {});
    expect(stage()).toHaveAttribute('data-expression', 'light');
    expect(root().hasAttribute('data-turning')).toBe(false);
    cleanup();
    // The half the visitor pressed, or a shared link, is their choice for the visit.
    renderViewer({ initialExpression: 'ink' });
    await act(async () => {});
    expect(stage()).toHaveAttribute('data-expression', 'ink');
    expect(sessionStorage.getItem(EXPRESSION_KEY)).toBe('ink');
    cleanup();
    renderViewer({ artwork: getCuratedArtwork(2)!, traits: undefined, initialExpression: 'light' });
    await act(async () => {});
    expect(sessionStorage.getItem(EXPRESSION_KEY)).toBe('ink');
  });
});

/*
  The layer that leaves goes inert, and a word that held the focus there would drop it to the
  page. jsdom keeps the focus on an inert control, so these cases prove the hand-over is made;
  that the focus is lost without it is the browser suite's to prove (tests/e2e/artwork.spec.ts).
*/
describe('the focus across a Turn', () => {
  const turnWord = (to: 'ink' | 'light') =>
    document.querySelector<HTMLElement>(`[data-layer-state="current"] [data-turn="${to}"]`)!;
  const filmWord = () =>
    document.querySelector<HTMLElement>('[data-layer-state="current"] [data-film-word]')!;
  /** Enter or Space on a button: the click it makes counts no press of a pointer. */
  const pressByKey = (control: HTMLElement) => {
    control.focus();
    fireEvent.click(control, { detail: 0 });
  };
  /** A mouse or a finger: the browser gives the pressed button the focus, and the click counts one. */
  const pressByPointer = (control: HTMLElement) => {
    control.focus();
    fireEvent.click(control, { detail: 1 });
  };
  const tapKey = async (key: string) => {
    fireEvent.keyDown(window, { key });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.keyUp(window, { key });
  };
  afterEach(() => {
    act(() => setOverturePhase(null));
  });

  it('hands the focus to the word of the layer now on view when the word is pressed from the keyboard, without a scroll', async () => {
    renderViewer();
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    pressByKey(turnWord('light'));
    focus.mockClear();
    await travel();
    expect(stage()).toHaveAttribute('data-expression', 'light');
    expect(turnWord('ink')).toHaveFocus();
    expect(turnWord('ink').closest('[inert]')).toBeNull();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    // And back: the word that took the focus turns the plate again.
    fireEvent.click(turnWord('ink'), { detail: 0 });
    await travel();
    expect(stage()).toHaveAttribute('data-expression', 'ink');
    expect(turnWord('light')).toHaveFocus();
  });

  it('hands the focus on at the home, where the Light strip carries a word Ink’s has not', async () => {
    renderViewer({ presentation: 'home' });
    pressByKey(turnWord('light'));
    await travel();
    expect(stage()).toHaveAttribute('data-expression', 'light');
    expect(turnWord('ink')).toHaveFocus();
    // The way through the spectrum has no match in the Ink strip: the Turn's word takes it.
    const spectrum = within(layer('light') as HTMLElement).getByRole('link', {
      name: new RegExp(en.throughSpectrum),
    });
    spectrum.focus();
    await tapKey('i');
    await travel();
    expect(stage()).toHaveAttribute('data-expression', 'ink');
    expect(turnWord('light')).toHaveFocus();
  });

  it('hands the focus on after L or I, to the match of the word it stood on', async () => {
    renderViewer();
    await settle();
    filmWord().focus();
    await tapKey('l');
    await travel();
    expect(stage()).toHaveAttribute('data-expression', 'light');
    expect(filmWord()).toHaveFocus();
    // The options are a control of each layer too, and are mounted afresh as the layer changes.
    word(en.ways).focus();
    await tapKey('i');
    await travel();
    expect(stage()).toHaveAttribute('data-expression', 'ink');
    expect(word(en.ways)).toHaveFocus();
  });

  it('hands the focus on when the Turn is one frame: paused, reduced or hushed', async () => {
    for (const quiet of ['paused', 'reducedMotion', 'theatre'] as const) {
      motion.paused = quiet === 'paused';
      motion.reducedMotion = quiet === 'reducedMotion';
      motion.theatre = quiet === 'theatre' ? 'hushed' : 'playing';
      const view = renderViewer();
      turnWord('light').focus();
      fireEvent.keyDown(window, { key: 'l' });
      await act(async () => {});
      expect(stage()).toHaveAttribute('data-expression', 'light');
      expect(turnWord('ink')).toHaveFocus();
      pressByKey(turnWord('ink'));
      await act(async () => {});
      expect(stage()).toHaveAttribute('data-expression', 'ink');
      expect(turnWord('light')).toHaveFocus();
      view.unmount();
    }
  });

  it('moves no focus for a pointer’s Turn, nor for a key with the focus outside the strip', async () => {
    renderViewer();
    const pressed = turnWord('light');
    pressByPointer(pressed);
    await travel();
    expect(stage()).toHaveAttribute('data-expression', 'light');
    expect(pressed).toHaveFocus();
    expect(turnWord('ink')).not.toHaveFocus();
    // A key with nothing of the strip in focus turns the plate and leaves the focus alone.
    pressed.blur();
    expect(document.body).toHaveFocus();
    await tapKey('i');
    await travel();
    expect(stage()).toHaveAttribute('data-expression', 'ink');
    expect(document.body).toHaveFocus();
  });

  it('a pointer’s Turn drops what a key had noted', async () => {
    // The Light still is slow: the key's Turn is still being readied when the pointer asks.
    let ready = () => {};
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: () => new Promise<void>((resolve) => (ready = resolve)),
    });
    renderViewer();
    const pressed = turnWord('light');
    pressByKey(pressed);
    await act(async () => {});
    fireEvent.click(pressed, { detail: 1 });
    await act(async () => ready());
    await travel();
    expect(stage()).toHaveAttribute('data-expression', 'light');
    expect(turnWord('ink')).not.toHaveFocus();
  });

  it('keeps the note through a slow Turn, for as long as the still takes', async () => {
    let ready = () => {};
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: () => new Promise<void>((resolve) => (ready = resolve)),
    });
    renderViewer();
    const pressed = turnWord('light');
    pressByKey(pressed);
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(stage()).toHaveAttribute('data-expression', 'ink');
    expect(pressed).toHaveFocus();
    await act(async () => ready());
    await travel();
    expect(stage()).toHaveAttribute('data-expression', 'light');
    expect(turnWord('ink')).toHaveFocus();
  });

  it('leaves the focus where the visitor moved it while the Turn was on its way', async () => {
    const elsewhere = document.createElement('button');
    document.body.append(elsewhere);
    try {
      renderViewer();
      pressByKey(turnWord('light'));
      await act(async () => {
        vi.advanceTimersByTime(BREATH_MS + 400);
      });
      elsewhere.focus();
      await travel();
      expect(stage()).toHaveAttribute('data-expression', 'light');
      expect(elsewhere).toHaveFocus();
      // The bare page, pressed mid-way, keeps it as well.
      const back = turnWord('ink');
      pressByKey(back);
      await act(async () => {
        vi.advanceTimersByTime(BREATH_MS + 400);
      });
      back.blur();
      await travel();
      expect(stage()).toHaveAttribute('data-expression', 'ink');
      expect(document.body).toHaveFocus();
    } finally {
      elsewhere.remove();
    }
  });

  it('hands on the word the visitor moved to inside the strip while the Turn was on its way', async () => {
    renderViewer();
    await settle();
    pressByKey(turnWord('light'));
    await act(async () => {
      vi.advanceTimersByTime(BREATH_MS + 400);
    });
    filmWord().focus();
    await travel();
    expect(stage()).toHaveAttribute('data-expression', 'light');
    expect(filmWord()).toHaveFocus();
  });

  it('drops the note when the still cannot be had', async () => {
    const decode = HTMLImageElement.prototype.decode;
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error('undecodable')),
    });
    renderViewer();
    const pressed = turnWord('light');
    pressByKey(pressed);
    await act(async () => {});
    expect(screen.getByText(en.expressionFailed)).toBeInTheDocument();
    expect(stage()).toHaveAttribute('data-expression', 'ink');
    expect(pressed).toHaveFocus();
    // A move that is not the visitor's then puts the plate in Light: the failed Turn's note
    // is not there for it to spend.
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: decode,
    });
    act(() => setOverturePhase('playing'));
    await act(async () => {});
    expect(stage()).toHaveAttribute('data-expression', 'light');
    expect(turnWord('ink')).not.toHaveFocus();
  });

  it('keeps the focus in the room through a Turn made there, and returns it to the matching word', async () => {
    renderViewer();
    await settle();
    // Z opens the room from wherever the focus stands: here, the Turn's word.
    turnWord('light').focus();
    fireEvent.keyDown(window, { key: 'z' });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    // The room's two words both stay: the one pressed keeps the focus, and says it is pressed.
    const ways = within(dialog).getByRole('group', { name: en.ways });
    const light = within(ways).getByRole('button', { name: en.light });
    light.focus();
    fireEvent.click(light, { detail: 0 });
    await act(async () => {});
    expect(stage()).toHaveAttribute('data-expression', 'light');
    expect(light).toHaveFocus();
    expect(light).toHaveAttribute('aria-pressed', 'true');
    // The room's own key, with the focus on its close word.
    const close = within(dialog).getByRole('button', { name: en.close });
    close.focus();
    fireEvent.keyDown(dialog, { key: 'i' });
    await act(async () => {});
    expect(stage()).toHaveAttribute('data-expression', 'ink');
    expect(close).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'l' });
    await act(async () => {});
    expect(stage()).toHaveAttribute('data-expression', 'light');
    // The plate turned behind the room: the word that opened it is in the layer that left.
    fireEvent.click(close);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(turnWord('ink')).toHaveFocus();
  });

  it('returns the focus to the options of the layer now on view when Study opened the room', async () => {
    renderViewer();
    fireEvent.click(word(en.ways));
    fireEvent.click(word(en.enlarge));
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'l' });
    await act(async () => {});
    expect(stage()).toHaveAttribute('data-expression', 'light');
    fireEvent.click(within(dialog).getByRole('button', { name: en.close }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(word(en.ways)).toHaveFocus();
    expect(word(en.ways).closest('[data-layer]')).toHaveAttribute('data-layer', 'light');
  });
});

describe('the wing', () => {
  const wing = () => document.querySelector<HTMLElement>('[data-wing]')!;
  /** The Turn by the word, through the breath and the travel to the commit. */
  async function turnBy(name: string) {
    fireEvent.click(word(name));
    await act(async () => {});
    await act(async () => {
      vi.advanceTimersByTime(BREATH_MS + 950);
    });
    await act(async () => {});
  }

  it('hangs the Light twin in the night wing beneath an Ink plate', () => {
    renderViewer();
    expect(wing()).toHaveAttribute('data-wing', 'night');
    expect(wing()).toHaveAttribute('data-twin', 'light');
    expect(wing().lastElementChild).toHaveAttribute('data-ground', 'night');
    expect(wing().lastElementChild!.querySelector('img.art-still')).toHaveAttribute(
      'src',
      '/art/31-light.webp',
    );
  });

  it('hangs the Ink twin in a paper wing beneath a Light plate', () => {
    renderViewer({ openingExpression: 'light' });
    expect(stage()).toHaveAttribute('data-expression', 'light');
    expect(wing()).toHaveAttribute('data-wing', 'paper');
    expect(wing()).toHaveAttribute('data-twin', 'ink');
    expect(wing().lastElementChild).toHaveAttribute('data-ground', 'paper');
    expect(wing().lastElementChild!.querySelector('img.art-still')).toHaveAttribute(
      'src',
      '/art/31-ink.webp',
    );
  });

  it('keeps the wing under the hand when the plate Turns', async () => {
    renderViewer({ openingExpression: 'light' });
    await turnBy(en.ink);
    expect(stage()).toHaveAttribute('data-expression', 'ink');
    expect(wing()).toHaveAttribute('data-twin', 'ink');
    await turnBy(en.light);
    expect(stage()).toHaveAttribute('data-expression', 'light');
    expect(wing()).toHaveAttribute('data-twin', 'ink');
  });

  it('follows a remembered choice that re-opens the page, which is not a Turn', async () => {
    sessionStorage.setItem(EXPRESSION_KEY, 'light');
    forgetExpression();
    sessionStorage.setItem(EXPRESSION_KEY, 'light');
    renderViewer();
    await act(async () => {});
    expect(stage()).toHaveAttribute('data-expression', 'light');
    expect(wing()).toHaveAttribute('data-twin', 'ink');
    await turnBy(en.ink);
    expect(wing()).toHaveAttribute('data-twin', 'ink');
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

  it.each([true, false])(
    'offers After the frame once the film resolves, only above an orbit (%s)',
    async (orbit) => {
      const asked = vi.fn();
      window.addEventListener(AFTER_THE_FRAME_EVENT, asked);
      renderViewer({ afterTheFrame: orbit });
      await settle();
      await act(async () => {
        vi.advanceTimersByTime(1300);
      });
      const video = player()!;
      Object.defineProperty(video, 'duration', { configurable: true, value: 30 });
      fireEvent.playing(video);
      const strip = () =>
        within(document.querySelector<HTMLElement>('[data-layer-state="current"]')!);
      expect(strip().queryByRole('link', { name: en.afterTheFrame })).toBeNull();
      fireEvent.ended(video);
      await act(async () => {
        vi.advanceTimersByTime(8000);
      });
      if (!orbit) {
        expect(strip().queryByRole('link', { name: en.afterTheFrame })).toBeNull();
        window.removeEventListener(AFTER_THE_FRAME_EVENT, asked);
        return;
      }
      // A link to the orbit beneath, which the page asks to go on past the frame.
      const link = strip().getByRole('link', { name: en.afterTheFrame });
      expect(link).toHaveAttribute('href', '#orbit');
      fireEvent.click(link);
      expect(asked).toHaveBeenCalledTimes(1);
      window.removeEventListener(AFTER_THE_FRAME_EVENT, asked);
      // Again takes the word away until the film resolves once more.
      fireEvent.click(word(en.again));
      expect(strip().queryByRole('link', { name: en.afterTheFrame })).toBeNull();
    },
  );

  it('Sit fades the strip and the head until the visitor moves, swallowing the waking click', async () => {
    const { container } = renderViewer();
    const section = container.querySelector('section')!;
    const options = word(en.ways);
    fireEvent.click(options);
    fireEvent.click(word(en.sit));
    expect(options).toHaveAttribute('aria-expanded', 'false');
    expect(section).toHaveAttribute('data-sit');
    expect(root()).toHaveAttribute('data-sit');
    fireEvent.pointerMove(section);
    expect(section).toHaveAttribute('data-sit');
    await act(async () => {
      vi.advanceTimersByTime(700);
    });
    fireEvent.pointerDown(options);
    expect(section).not.toHaveAttribute('data-sit');
    expect(root()).not.toHaveAttribute('data-sit');
    fireEvent.click(options);
    expect(options).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('the chrome after Sit', () => {
  it('the rest after the film and a Turn both stand the chrome up, running head included', async () => {
    const { container } = renderViewer();
    await settle();
    await act(async () => {
      vi.advanceTimersByTime(1300);
    });
    const video = player()!;
    Object.defineProperty(video, 'duration', { configurable: true, value: 30 });
    fireEvent.playing(video);
    fireEvent.click(word(en.ways));
    fireEvent.click(word(en.sit));
    expect(root()).toHaveAttribute('data-sit');
    fireEvent.ended(video);
    await act(async () => {
      vi.advanceTimersByTime(8000);
    });
    expect(container.querySelector('section')).not.toHaveAttribute('data-sit');
    expect(root()).not.toHaveAttribute('data-sit');
    // Sitting again, then turning: the commit stands the chrome up as well.
    fireEvent.keyDown(window, { key: 's' });
    expect(root()).toHaveAttribute('data-sit');
    fireEvent.click(word(en.light));
    await travel();
    expect(stage()).toHaveAttribute('data-expression', 'light');
    expect(root()).not.toHaveAttribute('data-sit');
  });
});

describe('the room and the keys', () => {
  it('Study opens the room on the still, silences the plate keys, and returns focus', () => {
    renderViewer();
    const options = word(en.ways);
    fireEvent.click(options);
    const study = word(en.enlarge);
    study.focus();
    fireEvent.click(study);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName(`№\u00a0031 · ${en.viewingRoom}`);
    expect(dialog.querySelector('video')).toBeNull();
    fireEvent.keyDown(window, { key: 'L' });
    expect(root().hasAttribute('data-turning')).toBe(false);
    fireEvent.click(within(dialog).getByRole('button', { name: en.close }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(options).toHaveFocus();
    expect(options).toHaveAttribute('aria-expanded', 'false');
  });

  it('answers Space, the arrows and F, and is silent in a field or under a sheet', async () => {
    renderViewer({
      neighbours: { previous: { id: 30 }, next: { id: 32 } },
    });
    await settle();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(push).toHaveBeenLastCalledWith('/art/32?expression=ink');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(push).toHaveBeenLastCalledWith('/art/30?expression=ink');
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

  it('lists the neighbours with the expression on view in their links, Ink or Light', async () => {
    renderViewer({
      neighbours: {
        previous: { id: 30, preview: '/art/previews/30.webp' },
        next: { id: 32 },
        spectral: { id: 44, deltaNm: 18, direction: 'redder' },
        lot: true,
      },
    });
    expect(screen.getByRole('link', { name: `${en.previousWork} · №\u00a0030` })).toHaveAttribute(
      'href',
      '/art/30?expression=ink',
    );
    expect(screen.getByRole('link', { name: /Next by wavelength/ })).toHaveTextContent(
      'Next by wavelength · № 044 · 18 nm redder',
    );
    expect(screen.getByRole('link', { name: /Collect/ })).toHaveAttribute('href', '/auctions/31');
    fireEvent.click(word(en.light));
    await travel();
    expect(screen.getByRole('link', { name: `${en.nextWork} · №\u00a0032` })).toHaveAttribute(
      'href',
      '/art/32?expression=light',
    );
  });
});

describe('the home', () => {
  it('sets the one line in the strip, remembers a resolved arrival, and opens the night wing’s words', async () => {
    const { container } = renderViewer({
      presentation: 'home',
      lines: { ink: [en.homeLine, en.homeLineInk], light: [en.homeLine, en.homeLineLight] },
    });
    // Each material's still is told in its own second sentence.
    expect(layer('ink').querySelector('.strip p')).toHaveTextContent(
      'Three bodies, each pulling on the other two. This is the ink their motion stirred.',
    );
    expect(layer('light').querySelector('.strip p')).toHaveTextContent(
      'Three bodies, each pulling on the other two. This is a long exposure of their motion.',
    );
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
    // The arrival film is the opening clip; the complete film takes over at the same frame.
    const film = await handover();
    expect(container.querySelector('[data-layer-state="current"] .art-media')).toHaveAttribute(
      'data-handover',
      'film',
    );
    fireEvent.ended(film);
    expect(sessionStorage.getItem(HOME_RESOLVED_KEY)).toBe('resolved');
    await act(async () => {
      vi.advanceTimersByTime(8000);
    });
    expect(word(en.again)).toBeInTheDocument();
    cleanup();
    // The next visit to the home in this session opens on the still with Again.
    const second = renderViewer({ presentation: 'home' });
    expect(within(second.container).getByRole('button', { name: en.again })).toBeInTheDocument();
    expect(container.querySelector('video')).toBeNull();
  });
});

describe('the Overture, beneath and landing', () => {
  const wing = () => document.querySelector<HTMLElement>('[data-wing]')!;
  afterEach(() => {
    act(() => setOverturePhase(null));
  });

  it('stands the home in Light beneath it, then crosses to the day’s Ink by its own crossing', async () => {
    renderViewer({ presentation: 'home', openingExpression: 'ink' });
    await settle();
    expect(stage()).toHaveAttribute('data-expression', 'ink');
    act(() => setOverturePhase('playing'));
    await act(async () => {});
    expect(stage()).toHaveAttribute('data-expression', 'light');
    act(() => setOverturePhase('landing'));
    await act(async () => {});
    await act(async () => {
      vi.advanceTimersByTime(BREATH_MS);
    });
    expect(root().getAttribute('data-turning')).toBe('overture');
    // --t-overture-cross: 4000 ms in jsdom's fallback.
    await act(async () => {
      vi.advanceTimersByTime(4100);
    });
    await act(async () => {});
    await dropSeam();
    expect(stage()).toHaveAttribute('data-expression', 'ink');
    expect(overturePhase()).toBe('done');
    // None of it was the visitor's choice: nothing is remembered, and the wing keeps the twin.
    expect(sessionStorage.getItem(EXPRESSION_KEY)).toBeNull();
    expect(wing()).toHaveAttribute('data-twin', 'light');
  });

  it('leaves nothing of a move it called off for the visitor’s own next Turn', async () => {
    renderViewer({ presentation: 'home', openingExpression: 'ink' });
    await settle();
    // The Light still is slow to come, and the Overture ends before it has.
    const decode = HTMLImageElement.prototype.decode;
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: () => new Promise<void>(() => {}),
    });
    act(() => setOverturePhase('playing'));
    await act(async () => {});
    act(() => setOverturePhase('done'));
    await act(async () => {});
    expect(stage()).toHaveAttribute('data-expression', 'ink');
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: decode,
    });
    // The visitor's own Turn travels by time, and the visit remembers it.
    fireEvent.click(word(en.light));
    await act(async () => {});
    await act(async () => {
      vi.advanceTimersByTime(BREATH_MS);
    });
    expect(root().getAttribute('data-turning')).toBe('time');
    await act(async () => {
      vi.advanceTimersByTime(950);
    });
    await act(async () => {});
    await dropSeam();
    expect(stage()).toHaveAttribute('data-expression', 'light');
    expect(sessionStorage.getItem(EXPRESSION_KEY)).toBe('light');
  });

  it('lands at once when an input ends it, and lands a Light day where it stands', async () => {
    renderViewer({ presentation: 'home', openingExpression: 'ink' });
    await settle();
    act(() => setOverturePhase('playing'));
    await act(async () => {});
    expect(stage()).toHaveAttribute('data-expression', 'light');
    act(() => setOverturePhase('done'));
    await act(async () => {});
    expect(stage()).toHaveAttribute('data-expression', 'ink');
    expect(root().hasAttribute('data-turning')).toBe(false);
    expect(sessionStorage.getItem(EXPRESSION_KEY)).toBeNull();
    cleanup();
    act(() => setOverturePhase(null));
    renderViewer({ presentation: 'home', openingExpression: 'light' });
    await settle();
    act(() => setOverturePhase('playing'));
    act(() => setOverturePhase('landing'));
    await act(async () => {});
    expect(overturePhase()).toBe('done');
    expect(stage()).toHaveAttribute('data-expression', 'light');
  });
});

describe('the home’s arrival', () => {
  it('reads arriving while the opening clip has ended before the complete film can take over, then film', async () => {
    const { container } = renderViewer({ presentation: 'home' });
    await settle();
    await act(async () => {
      vi.advanceTimersByTime(1200);
    });
    const opening = player() as HTMLVideoElement;
    Object.defineProperty(opening, 'duration', { configurable: true, value: 10 });
    fireEvent.playing(opening);
    Object.defineProperty(opening, 'currentTime', {
      configurable: true,
      value: 10,
      writable: true,
    });
    // Nothing of the complete film is buffered yet: the clip's last frame holds, and the strip says so.
    fireEvent.ended(opening);
    const state = container.querySelector('[data-layer-state="current"] [data-film-state]')!;
    expect(state).toHaveAttribute('data-film-state', 'arriving');
    expect(state).toHaveTextContent(en.arriving);
    expect(container.querySelector('[data-layer-state="current"] .art-media')).toHaveAttribute(
      'data-handover',
      'waiting',
    );
    expect(screen.queryByRole('button', { name: en.again })).toBeNull();
    // The film arrives: it takes over at the clip's own time and the strip reads film again.
    const relay = document.querySelector<HTMLVideoElement>(
      '[data-layer-state="current"] video[data-relay]',
    )!;
    Object.defineProperty(relay, 'duration', { configurable: true, value: 30 });
    Object.defineProperty(relay, 'readyState', { configurable: true, value: 4 });
    Object.defineProperty(relay, 'buffered', {
      configurable: true,
      value: { length: 1, start: () => 0, end: () => 30 },
    });
    fireEvent.canPlayThrough(relay);
    expect(relay.currentTime).toBe(10);
    fireEvent.playing(relay);
    expect(state).toHaveAttribute('data-film-state', 'film');
    expect(state).toHaveTextContent(en.film);
  });
});

describe('a phone’s plate', () => {
  function phone() {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('767'),
      addEventListener() {},
      removeEventListener() {},
    }));
  }
  const indexed = artworkFromIndex(indexedWork(40)!);
  const excerpt = indexed.media.find((item) => item.id === 'ink')!.previewFilm!;
  const inkClip = indexed.media.find((item) => item.id === 'ink')!.settlingFilm!;

  it('rests on the still with the eight-second excerpt as its ambient motion, labelled, and plays the film on the word', async () => {
    phone();
    const { container } = renderViewer({ artwork: indexed, traits: undefined });
    await settle();
    await act(async () => {
      vi.advanceTimersByTime(1250);
    });
    // The ambient film is the excerpt, never the settling clip, and the strip names it.
    const video = player()!;
    expect(video).toHaveAttribute('src', excerpt.src);
    Object.defineProperty(video, 'duration', { configurable: true, value: 8 });
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 2, writable: true });
    fireEvent.playing(video);
    fireEvent.timeUpdate(video);
    const state = container.querySelector('[data-layer-state="current"] [data-film-state]')!;
    expect(state).toHaveAttribute('data-film-state', 'film');
    expect(state).toHaveTextContent(`${en.excerpt} 00:06–00:14`);
    expect(container.querySelector('[data-layer-state="current"] .time-line')).toBeNull();
    expect(
      within(document.querySelector<HTMLElement>('[data-layer-state="current"]')!).queryByText(
        /00:0\d \/ 00:14/,
      ),
    ).toBeNull();
    fireEvent.ended(video);
    await act(async () => {
      vi.advanceTimersByTime(9500);
    });
    // After the excerpt rests the word is Film, not Again: the plate's own film plays on the word.
    expect(screen.queryByRole('button', { name: en.again })).toBeNull();
    const film = word(en.film);
    expect(film).not.toHaveAttribute('title');
    fireEvent.click(film);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(player()).toHaveAttribute('src', inkClip.src);
  });

  it('opens the home on the excerpt, never the opening clip and its relay', async () => {
    phone();
    const { container } = renderViewer({ presentation: 'home' });
    await settle();
    await act(async () => {
      vi.advanceTimersByTime(1250);
    });
    expect(player()).toHaveAttribute('src', expect.stringMatching(/\/art\/previews\/31-/));
    expect(container.querySelector('video[data-relay]')).toBeNull();
    expect(container.querySelector('[data-layer-state="current"] .art-media')).not.toHaveAttribute(
      'data-handover',
    );
  });
});

describe('the settling plate', () => {
  const indexed = artworkFromIndex(indexedWork(40)!);
  const inkClip = indexed.media.find((item) => item.id === 'ink')!.settlingFilm!;

  it('carries the film’s time into the room while the plate is mid-film, and nothing once it has resolved', async () => {
    renderViewer({ artwork: indexed, traits: undefined });
    await settle();
    await act(async () => {
      vi.advanceTimersByTime(1250);
    });
    const video = player()!;
    Object.defineProperty(video, 'duration', { configurable: true, value: 8 });
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 3, writable: true });
    fireEvent.playing(video);
    fireEvent.timeUpdate(video);
    // Still, then Film: the room opens on the complete film at the plate's own time, 00:25.
    fireEvent.click(word(en.still));
    fireEvent.click(word(en.film));
    const roomVideo = screen.getByRole('dialog').querySelector('video')!;
    Object.defineProperty(roomVideo, 'duration', { configurable: true, value: 30 });
    fireEvent.loadedMetadata(roomVideo);
    expect(roomVideo.currentTime).toBeCloseTo(inkClip.startSeconds! + 3, 3);
  });

  it('opens the room from the first frame once the plate has resolved into its still', async () => {
    renderViewer({ artwork: indexed, traits: undefined });
    await settle();
    await act(async () => {
      vi.advanceTimersByTime(1250);
    });
    const video = player()!;
    Object.defineProperty(video, 'duration', { configurable: true, value: 8 });
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 8, writable: true });
    fireEvent.playing(video);
    fireEvent.timeUpdate(video);
    fireEvent.ended(video);
    await act(async () => {
      vi.advanceTimersByTime(1200);
    });
    fireEvent.click(word(en.film));
    const roomVideo = screen.getByRole('dialog').querySelector('video')!;
    Object.defineProperty(roomVideo, 'duration', { configurable: true, value: 30 });
    fireEvent.loadedMetadata(roomVideo);
    expect(roomVideo.currentTime).toBe(0);
  });

  it('wakes a work without a local film into its settling clip, keeps the film’s own clock, and fades into the still', async () => {
    const { container } = renderViewer({ artwork: indexed, traits: undefined });
    await settle();
    await act(async () => {
      vi.advanceTimersByTime(1250);
    });
    const video = player()!;
    expect(inkClip.src).toMatch(/^\/art\/clips\/40-ink-settling-[a-f0-9]{16}\.mp4$/);
    expect(video).toHaveAttribute('src', inkClip.src);
    Object.defineProperty(video, 'duration', { configurable: true, value: 8 });
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 3, writable: true });
    fireEvent.playing(video);
    fireEvent.timeUpdate(video);
    // The clock is the film's own: the clip is its last eight seconds.
    expect(container.querySelector('[data-film-state]')).toHaveAttribute('data-film-state', 'film');
    fireEvent.click(word(en.ways));
    expect(
      within(document.querySelector<HTMLElement>('[data-layer-state="current"]')!).getByText(
        '00:25 / 00:30',
      ),
    ).toBeInTheDocument();
    expect(word(en.still)).toBeInTheDocument();
    fireEvent.ended(video);
    expect(container.querySelector('[data-film-state]')).toHaveAttribute(
      'data-film-state',
      'still',
    );
    // The last frame is the still: it is held for --t-hold, then fades into the still beneath.
    expect(video).toHaveClass('has-frame');
    expect(video).toHaveClass('has-ended');
    await act(async () => {
      vi.advanceTimersByTime(1200);
    });
    expect(video).not.toHaveClass('has-frame');
    expect(word(en.film)).toHaveAttribute('title', en.filmInRoom);
    await act(async () => {
      vi.advanceTimersByTime(8000);
    });
    expect(word(en.again)).toBeInTheDocument();
  });

  it('Film on a settling plate is the complete film, and opens it in the room', () => {
    renderViewer({ artwork: indexed, traits: undefined, initialStill: true });
    const film = word(en.film);
    expect(film).toHaveAttribute('title', en.filmInRoom);
    fireEvent.click(film);
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('video')).toHaveAttribute(
      'src',
      expect.stringMatching(/\/videos\/web\/ember\.mp4$/),
    );
  });

  it('the Light plate wakes into its own settling clip', async () => {
    renderViewer({ artwork: indexed, traits: undefined, initialExpression: 'light' });
    await settle();
    await act(async () => {
      vi.advanceTimersByTime(1250);
    });
    expect(player()).toHaveAttribute(
      'src',
      expect.stringMatching(/\/art\/clips\/40-light-settling-[a-f0-9]{16}\.mp4$/),
    );
  });
});

describe('the score in the films’ transport', () => {
  const orbit = filmOrbit(31)!;
  const clip = work.media.find((item) => item.id === 'light')!.settlingFilm!;
  let measured: FilmScore;
  // № 031's window measured as the worker measures it, once for these tests. A million steps
  // take seconds under CI's coverage, so the measuring has its own budget, as the physics
  // tests' do, rather than spending the first test's.
  beforeAll(() => {
    measured = scoreWindow(orbit.window);
  }, 30_000);
  const scoreOf = () => measured;
  const oneDecimal = new Intl.NumberFormat('en', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const reading = (seconds: number) => {
    const moment = physicsAt(scoreOf(), seconds);
    return fill(en.filmPhysics, {
      pair: pairName(moment.pair),
      distance: oneDecimal.format(moment.distance),
    });
  };
  let workers: ScoreWorker[] = [];
  class ScoreWorker {
    onmessage: ((event: MessageEvent<ScoreReply>) => void) | null = null;
    onerror: (() => void) | null = null;
    posted: ScoreRequest[] = [];
    constructor() {
      workers.push(this);
    }
    postMessage(request: ScoreRequest) {
      this.posted.push(request);
    }
    terminate() {}
    reply(message: ScoreReply) {
      act(() => this.onmessage?.({ data: message } as MessageEvent<ScoreReply>));
    }
  }
  beforeEach(() => {
    workers = [];
    forgetFilmScores();
    vi.stubGlobal('Worker', ScoreWorker);
  });

  /** The plate's film plays `at` seconds into its clip. */
  async function play(at: number) {
    await settle();
    await act(async () => {
      vi.advanceTimersByTime(1250);
    });
    const video = player() as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { configurable: true, value: 8 });
    Object.defineProperty(video, 'currentTime', { configurable: true, value: at, writable: true });
    fireEvent.playing(video);
    fireEvent.timeUpdate(video);
    return video;
  }
  const strip = () => within(document.querySelector<HTMLElement>('[data-layer-state="current"]')!);

  it('measures the orbit while the Light film plays, scores its transport and reads the physics of the moment', async () => {
    renderViewer({ initialExpression: 'light', orbit });
    expect(workers).toHaveLength(0);
    const video = await play(3);
    expect(video).toHaveAttribute('src', clip.src);
    expect(workers).toHaveLength(1);
    expect(workers[0].posted).toEqual([{ window: orbit.window }]);
    // The plain time line stands at the plate's foot until the score is measured; nothing is
    // read yet.
    const plate = document.querySelector('[data-layer-state="current"] [data-plate-ground]')!;
    expect(plate).toHaveAttribute('data-plate-ground', 'night');
    expect(plate.lastElementChild).toHaveClass('time-line');
    expect(document.querySelector('[data-film-score]')).toBeNull();
    expect(document.querySelector('[data-film-physics]')).toBeNull();

    workers[0].reply({ type: 'done', score: scoreOf() });
    expect(document.querySelector('.time-line')).toBeNull();
    expect(plate.lastElementChild).toHaveAttribute('data-film-score');
    const seconds = clip.startSeconds! + 3;
    const share = seconds / lightFilmDuration(orbit.window.steps);
    expect(document.querySelector('[data-film-score-progress]')).toHaveAttribute(
      'data-film-score-progress',
      String(Math.round(share * 1000) / 10),
    );
    expect(strip().getByText(reading(seconds))).toBeVisible();
    // The film draws on, and the strip reads on with it.
    video.currentTime = 7;
    fireEvent.timeUpdate(video);
    expect(strip().getByText(reading(clip.startSeconds! + 7))).toBeVisible();

    // Still: the plate rests, and the readout and the score step aside with the film.
    fireEvent.click(word(en.still));
    fireEvent.pause(video);
    expect(document.querySelector('[data-film-physics]')).toBeNull();
    expect(document.querySelector('[data-film-score]')).toBeNull();
  });

  it('opens the room’s complete film just before the closest approach, then the plate’s own moment again', async () => {
    renderViewer({ initialExpression: 'light', orbit, initialStill: true });
    const seconds = closestApproachSeconds({
      steps: orbit.window.steps,
      closestApproach: orbit.closestApproach,
    });
    // № 031's bodies pass closest at step 255,842, first drawn by the film's frame 460.
    expect(seconds).toBeCloseTo(460 / 60, 9);
    fireEvent.click(word(en.ways));
    // The record's closest approach: offered before anything is measured.
    const closest = word(`${en.toClosestApproach} ${clock(seconds)}`);
    expect(closest).toHaveAccessibleDescription(
      fill(en.closestApproachAt, { clock: clock(seconds) }),
    );
    fireEvent.click(closest);
    const dialog = screen.getByRole('dialog');
    const film = dialog.querySelector('video')!;
    Object.defineProperty(film, 'duration', { configurable: true, value: 30 });
    fireEvent.loadedMetadata(film);
    expect(film.currentTime).toBeCloseTo(seconds - 2, 9);

    fireEvent.click(within(dialog).getByRole('button', { name: en.close }));
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.keyDown(window, { key: 'f' });
    const again = screen.getByRole('dialog').querySelector('video')!;
    Object.defineProperty(again, 'duration', { configurable: true, value: 30 });
    fireEvent.loadedMetadata(again);
    expect(again.currentTime).toBe(0);
  });

  it('measures the score for a room entered on the still, whose complete film then carries it', () => {
    renderViewer({ initialExpression: 'light', orbit, initialStill: true });
    expect(workers).toHaveLength(0);
    fireEvent.click(word(en.ways));
    fireEvent.click(word(en.enlarge));
    const dialog = screen.getByRole('dialog');
    expect(workers).toHaveLength(1);
    workers[0].reply({ type: 'done', score: scoreOf() });
    expect(dialog.querySelector('[data-film-score]')).toBeNull();
    const sources = within(dialog).getByRole('group', { name: en.sources });
    fireEvent.click(within(sources).getByRole('button', { name: en.film }));
    expect(dialog.querySelector('video')).toHaveAttribute(
      'src',
      expect.stringMatching(/\/videos\/web\/main\.mp4$/),
    );
    expect(dialog.querySelector('[data-film-score]')).not.toBeNull();
  });

  it('opens the other expression’s film from its first frame after a Turn in the room', async () => {
    renderViewer({ initialExpression: 'light', orbit, initialStill: true });
    fireEvent.click(word(en.ways));
    fireEvent.click(word(new RegExp(`^${en.toClosestApproach}`)));
    const dialog = screen.getByRole('dialog');
    const light = dialog.querySelector('video')!;
    Object.defineProperty(light, 'duration', { configurable: true, value: 30 });
    fireEvent.loadedMetadata(light);
    expect(light.currentTime).toBeGreaterThan(5);
    // The closest approach is a moment of the Light film, not of Ink's.
    fireEvent.keyDown(dialog, { key: 'i' });
    await act(async () => {});
    expect(stage()).toHaveAttribute('data-expression', 'ink');
    const ink = screen.getByRole('dialog').querySelector('video')!;
    expect(ink).not.toBe(light);
    Object.defineProperty(ink, 'duration', { configurable: true, value: 30 });
    fireEvent.loadedMetadata(ink);
    expect(ink.currentTime).toBe(0);
  });

  /*
    The complete Ink film keeps the Light film's clock frame for frame, after a pre-roll of bare
    paper: № 031's first ink is its frame 71 (third-physics-phase-e.md §6). Its plate plays the
    local complete film, every other frame of the published one, which the venue checked too.
  */
  const inkFilm = work.media.find((item) => item.id === 'ink')!.films[0];
  const inkFrom = (71 / lightFilmFrames(orbit.window.steps)) * 100;

  it('scores the Ink film’s transport where its clock was checked, lit and read from its first ink', async () => {
    expect(orbit.ink?.firstInked).toBe(71);
    expect(orbit.ink?.films).toContain(inkFilm.sha256);
    renderViewer({ orbit });
    const video = await play(0.5);
    expect(video).toHaveAttribute('src', inkFilm.src);
    expect(workers).toHaveLength(1);
    workers[0].reply({ type: 'done', score: scoreOf() });
    const plate = document.querySelector('[data-layer-state="current"] [data-plate-ground]')!;
    expect(plate).toHaveAttribute('data-plate-ground', 'paper');
    const band = plate.lastElementChild!;
    expect(band).toHaveAttribute('data-film-score', 'ink');
    const lit = band.querySelector('[data-film-score-progress]') as HTMLElement;
    expect(lit).toHaveAttribute('data-film-score-from', String(Math.round(inkFrom * 10) / 10));
    // Half a second in, the paper is bare: nothing is lit, and the strip reads nothing.
    expect(lit.style.clipPath).toBe(`inset(0 ${100 - inkFrom}% 0 ${inkFrom}%)`);
    expect(document.querySelector('[data-film-physics]')).toBeNull();
    // The ink is down: the score is lit from it, and the strip reads the moment.
    video.currentTime = 3;
    fireEvent.timeUpdate(video);
    const share = 3 / lightFilmDuration(orbit.window.steps);
    expect(lit.style.clipPath).toBe(`inset(0 ${(1 - share) * 100}% 0 ${inkFrom}%)`);
    expect(strip().getByText(reading(3))).toBeVisible();
    // The closest approach is shown on the Ink film's frame 460 too: the options open it.
    fireEvent.click(word(en.ways));
    const seconds = closestApproachSeconds({
      steps: orbit.window.steps,
      closestApproach: orbit.closestApproach,
    });
    fireEvent.click(word(`${en.toClosestApproach} ${clock(seconds)}`));
    const room = screen.getByRole('dialog').querySelector('video')!;
    expect(room).toHaveAttribute('src', inkFilm.src);
    Object.defineProperty(room, 'duration', { configurable: true, value: 30 });
    fireEvent.loadedMetadata(room);
    expect(room.currentTime).toBeCloseTo(seconds - 2, 9);
  });

  it('carries the band alone on the home’s Ink plate, whose strip keeps to its words as Light’s does', async () => {
    renderViewer({ orbit, presentation: 'home', openingExpression: 'ink' });
    const video = await play(3);
    expect(video).toHaveAttribute(
      'src',
      expect.stringMatching(/\/art\/clips\/31-ink-opening-[a-f0-9]{16}\.mp4$/),
    );
    expect(workers).toHaveLength(1);
    workers[0].reply({ type: 'done', score: scoreOf() });
    expect(document.querySelector('[data-film-score="ink"]')).not.toBeNull();
    expect(document.querySelector('[data-film-physics]')).toBeNull();
    fireEvent.click(word(en.ways));
    expect(strip().queryByRole('button', { name: new RegExp(en.toClosestApproach) })).toBeNull();
    cleanup();
    // An opening clip the venue has not checked keeps the plain line, though the film it hands
    // over to was checked.
    const opening = work.media.find((item) => item.id === 'ink')!.openingFilm!;
    const unchecked = orbit.ink!.films.filter((sha256) => sha256 !== opening.sha256);
    renderViewer({
      orbit: { ...orbit, ink: { ...orbit.ink!, films: unchecked } },
      presentation: 'home',
      openingExpression: 'ink',
    });
    await play(3);
    expect(workers).toHaveLength(1);
    expect(document.querySelector('[data-film-score]')).toBeNull();
    expect(document.querySelector('.time-line')).not.toBeNull();
  });

  it('offers no closest approach on an Ink film that reaches it on bare paper', async () => {
    // A pre-roll past frame 460: the bodies pass closest before the Ink film shows them.
    renderViewer({ orbit: { ...orbit, ink: { ...orbit.ink!, firstInked: 500 } } });
    const video = await play(3);
    workers[0].reply({ type: 'done', score: scoreOf() });
    expect(document.querySelector('[data-film-score="ink"]')).not.toBeNull();
    expect(document.querySelector('[data-film-physics]')).toBeNull();
    fireEvent.click(word(en.ways));
    expect(strip().queryByRole('button', { name: new RegExp(en.toClosestApproach) })).toBeNull();
    video.currentTime = 9;
    fireEvent.timeUpdate(video);
    expect(strip().getByText(reading(9))).toBeVisible();
  });

  it('keeps the score off an Ink film it was not checked against, and off a sale’s page', async () => {
    renderViewer({ orbit: { ...orbit, ink: { firstInked: 71, films: ['0'.repeat(64)] } } });
    await play(3);
    expect(workers).toHaveLength(0);
    expect(document.querySelector('.time-line')).not.toBeNull();
    fireEvent.click(word(en.ways));
    expect(strip().queryByRole('button', { name: new RegExp(en.toClosestApproach) })).toBeNull();
    cleanup();

    renderViewer({ orbit, presentation: 'auction' });
    await play(3);
    expect(workers).toHaveLength(0);
    expect(document.querySelector('.time-line')).not.toBeNull();
    cleanup();

    renderViewer({ initialExpression: 'light', orbit, presentation: 'auction' });
    await play(3);
    expect(workers).toHaveLength(0);
    expect(document.querySelector('.time-line')).not.toBeNull();
    fireEvent.click(word(en.ways));
    expect(strip().queryByRole('button', { name: new RegExp(en.toClosestApproach) })).toBeNull();
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
