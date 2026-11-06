import { StrictMode } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { workOrbit } from '@/lib/art/orbit-records';
import { performedOrbits } from '@/lib/art/orbit-windows';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { getInterpretation } from '@/lib/art/types';
import { OVERTURE_KEY } from '@/lib/storage-keys';
import type { OvertureWork } from './overture-performance';

const motion = vi.hoisted(() => ({ paused: false, reducedMotion: false, theatre: 'playing' }));
vi.mock('./motion-provider', () => ({ useMotion: () => motion }));

const html = document.documentElement;
const [performed] = performedOrbits([31]);
const light = getInterpretation(getCuratedArtwork(31)!, 'light')!;
const work: OvertureWork = {
  window: performed.window,
  bodyHues: performed.bodyHues,
  rungs: light.rungs!,
  arrival: light.arrival!.src,
};

let frames = new Map<number, FrameRequestCallback>();
let frameIds = 0;
let decodes: { resolve: () => void; reject: () => void }[] = [];
/** The home's plate as the page lays it out: a desk's plate filling its screen. */
const PLATE = { left: 27, top: 52, width: 1386, height: 896 };

function home() {
  document.body.innerHTML =
    '<main class="home"><section class="viewing-room" data-presentation="home"><div data-layer="ink"><div class="art-media"></div></div></section></main>';
}
/** Runs every frame now due, at `now`. */
function nextFrame(now: number) {
  const due = [...frames.values()];
  frames.clear();
  act(() => due.forEach((callback) => callback(now)));
}
/** Imports the Overture afresh, as a page load does: it reads the first paint once. */
async function overture(asked: boolean, given: OvertureWork | null = work) {
  if (asked) html.setAttribute('data-overture', 'pending');
  // The performance is its own chunk; fetched here first, its lazy import resolves at once.
  await import('./overture-performance');
  const { Overture } = await import('./overture');
  const store = await import('./overture-store');
  const view = render(<Overture work={given} />);
  // The performance is its own chunk: let it load and mount.
  for (let i = 0; i < 4; i++) await act(async () => {});
  return { ...view, store };
}
async function decodeAll() {
  await act(async () => {
    decodes.splice(0).forEach(({ resolve }) => resolve());
  });
  for (let i = 0; i < 3; i++) await act(async () => {});
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  frames = new Map();
  decodes = [];
  Object.assign(motion, { paused: false, reducedMotion: false });
  localStorage.clear();
  html.removeAttribute('data-overture');
  home();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameIds, callback);
    return frameIds;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  // A second into the page: the first paint's black has not lifted itself yet.
  vi.spyOn(performance, 'now').mockReturnValue(1_000);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const box = this.classList.contains('art-media')
      ? PLATE
      : { left: 0, top: 0, width: 0, height: 0 };
    return {
      ...box,
      x: box.left,
      y: box.top,
      right: box.left + box.width,
      bottom: box.top + box.height,
      toJSON() {},
    } as DOMRect;
  });
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    value: () => new Promise<void>((resolve, reject) => decodes.push({ resolve, reject })),
  });
  // A 2D context that takes every call; jsdom has no WebGL, so the still comes up whole.
  const context = new Proxy(
    {},
    {
      get: (_, property) =>
        property === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => undefined,
      set: () => true,
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((kind: string) =>
    kind === '2d' ? context : null) as typeof HTMLCanvasElement.prototype.getContext);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  html.removeAttribute('data-overture');
  Reflect.deleteProperty(HTMLImageElement.prototype, 'decode');
});

describe('the Overture', () => {
  it('is nothing on a visit the first paint did not ask it for', async () => {
    const { container, store } = await overture(false);
    expect(container).toBeEmptyDOMElement();
    expect(store.overturePhase()).toBeNull();
    expect(localStorage.getItem(OVERTURE_KEY)).toBeNull();
  });

  it('condenses the still beside the score on one clock, lands, and brings the head last', async () => {
    const { container, store } = await overture(true);
    const overlay = container.firstElementChild as HTMLElement;
    expect(html.getAttribute('data-overture')).toBe('playing');
    expect(store.overturePhase()).toBe('playing');
    // Seen once, the Overture is not offered again on this browser.
    expect(localStorage.getItem(OVERTURE_KEY)).toBe('seen');
    // A desk: the plate condenses smaller, beside the score, and is laid out in its own place.
    const plate = overlay.lastElementChild as HTMLElement;
    expect(plate.style.left).toBe('27px');
    expect(plate.style.width).toBe('1386px');
    expect(plate.style.transform).toMatch(/^translate\(.+\) scale\(0\.\d+\)$/);
    await decodeAll();
    const still = plate.querySelector('img')!;
    expect(still.hidden).toBe(false);
    nextFrame(1_000);
    expect(still.style.opacity).toBe('0');
    nextFrame(1_000 + 3_250);
    expect(Number(still.style.opacity)).toBeCloseTo(0.5, 6);
    nextFrame(1_000 + 6_500);
    // The score gives way and the plate grows into its place.
    expect(overlay).toHaveAttribute('data-landing');
    expect(plate.style.transform).toBe('none');
    await act(async () => {
      vi.advanceTimersByTime(1_200);
    });
    expect(html.getAttribute('data-overture')).toBe('landing');
    expect(store.overturePhase()).toBe('landing');
    nextFrame(9_000);
    nextFrame(9_016);
    expect(overlay).toHaveAttribute('data-gone');
    // The home's plate lands the Overture (artwork-viewer.tsx); the head then arrives.
    act(() => store.setOverturePhase('done'));
    expect(html.getAttribute('data-overture')).toBe('dawn');
    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    expect(html.hasAttribute('data-overture')).toBe(false);
    expect(container).toBeEmptyDOMElement();
  });

  it('performs once when mounted twice, as development mounts every effect twice', async () => {
    html.setAttribute('data-overture', 'pending');
    await import('./overture-performance');
    const { Overture } = await import('./overture');
    render(
      <StrictMode>
        <Overture work={work} />
      </StrictMode>,
    );
    for (let i = 0; i < 4; i++) await act(async () => {});
    await decodeAll();
    // One clock: a single frame is waiting, and a single still is coming up.
    expect(frames.size).toBe(1);
    expect(document.querySelectorAll('img:not([hidden])')).toHaveLength(1);
  });

  it('plays once a visit: coming back to the home later never plays it again', async () => {
    const first = await overture(true);
    await decodeAll();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    });
    first.unmount();
    const { Overture } = await import('./overture');
    const again = render(<Overture work={work} />);
    for (let i = 0; i < 4; i++) await act(async () => {});
    expect(again.container).toBeEmptyDOMElement();
    expect(html.hasAttribute('data-overture')).toBe(false);
  });

  it('while the black is up, the key that ends it is no key for the page; Tab still moves on', async () => {
    const heard: string[] = [];
    const page = (event: KeyboardEvent) => heard.push(event.key);
    window.addEventListener('keydown', page);
    await overture(true);
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    act(() => {
      document.body.dispatchEvent(space);
    });
    expect(space.defaultPrevented).toBe(true);
    expect(heard).toEqual([]);
    expect(html.hasAttribute('data-overture')).toBe(false);
    cleanup();
    vi.resetModules();
    html.removeAttribute('data-overture');
    await overture(true);
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });
    expect(heard).toEqual(['Tab']);
    window.removeEventListener('keydown', page);
  });

  it('swallows the press that ends it only while the black is up', async () => {
    const clicks: boolean[] = [];
    const target = document.createElement('a');
    document.body.append(target);
    target.addEventListener('click', (event) => clicks.push(event.defaultPrevented));
    const press = () =>
      act(() => {
        target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      });
    await overture(true);
    press();
    // Beneath the black: the click never reached what lay there.
    expect(clicks).toEqual([]);
    cleanup();
    vi.resetModules();
    html.removeAttribute('data-overture');
    home();
    document.body.append(target);
    const { store } = await overture(true);
    await decodeAll();
    nextFrame(1_000);
    nextFrame(1_000 + 6_500);
    await act(async () => {
      vi.advanceTimersByTime(1_200);
    });
    expect(store.overturePhase()).toBe('landing');
    // The black has lifted: the press ends the Overture and is a press on the page too.
    press();
    expect(store.overturePhase()).toBe('done');
    expect(clicks).toEqual([false]);
  });

  it('stands aside when its black has already lifted itself', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(5_000);
    const { store, container } = await overture(true);
    expect(store.overturePhase()).toBe('done');
    expect(html.hasAttribute('data-overture')).toBe(false);
    expect(localStorage.getItem(OVERTURE_KEY)).toBeNull();
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  it('gives the page back when it is taken down while it plays', async () => {
    const { store, unmount } = await overture(true);
    expect(html.getAttribute('data-overture')).toBe('playing');
    unmount();
    expect(store.overturePhase()).toBe('done');
    expect(html.hasAttribute('data-overture')).toBe(false);
  });

  it('ends at once on any input, on the page as it would have opened', async () => {
    const { container, store } = await overture(true);
    await decodeAll();
    nextFrame(500);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    });
    expect(store.overturePhase()).toBe('done');
    expect(html.hasAttribute('data-overture')).toBe(false);
    expect(frames.size).toBe(0);
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  it('ends at once for Pause, or when the tab is left', async () => {
    const { store, rerender } = await overture(true);
    motion.paused = true;
    const { Overture } = await import('./overture');
    rerender(<Overture work={work} />);
    await act(async () => {});
    expect(store.overturePhase()).toBe('done');
    expect(html.hasAttribute('data-overture')).toBe(false);
  });

  it('lifts the black at once without a work, a still, or a page at its top', async () => {
    const without = await overture(true, null);
    expect(without.store.overturePhase()).toBe('done');
    expect(html.hasAttribute('data-overture')).toBe(false);
    cleanup();
    vi.resetModules();
    const failed = await overture(true);
    await act(async () => {
      decodes.splice(0).forEach(({ reject }) => reject());
    });
    await act(async () => {});
    expect(failed.store.overturePhase()).toBe('done');
    expect(html.hasAttribute('data-overture')).toBe(false);
    cleanup();
    vi.resetModules();
    localStorage.clear();
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(400);
    const scrolled = await overture(true);
    expect(scrolled.store.overturePhase()).toBe('done');
    expect(localStorage.getItem(OVERTURE_KEY)).toBeNull();
  });

  it('never waits on a still that does not come', async () => {
    const { store } = await overture(true);
    await act(async () => {
      vi.advanceTimersByTime(4_000);
    });
    expect(store.overturePhase()).toBe('done');
    expect(html.hasAttribute('data-overture')).toBe(false);
  });
});

describe('the day’s work as the Overture performs it', () => {
  it('has a window, its hues and a Light still with its order', () => {
    expect(workOrbit(31)).toBeDefined();
    expect(work.window.steps).toBe(1_000_000);
    expect(work.rungs.length).toBeGreaterThan(0);
    expect(work.arrival).toMatch(/^\/art\/arrival\/31-light-[a-f0-9]{16}\.webp$/);
  });
});
