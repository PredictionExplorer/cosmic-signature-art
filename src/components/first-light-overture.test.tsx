import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { getInterpretation } from '@/lib/art/types';
import { performedOrbits } from '@/lib/art/orbit-windows';
import { plateFrame } from '@/lib/art/orbit-frames';
import { plateSpace } from '@/lib/first-light/samples';
import type { SamplesRequest } from '@/lib/first-light/samples.worker';
import { BEATS, DURATION } from '@/lib/first-light/timeline';
import { OVERTURE_KEY } from '@/lib/storage-keys';
import type { OvertureWork } from './overture';

const motion = vi.hoisted(() => ({ paused: false, reducedMotion: false, theatre: 'playing' }));
vi.mock('./motion-provider', () => ({ useMotion: () => motion }));
// Each test imports the event afresh; the engine is stood in for in every copy of its module.
const lights = vi.hoisted(() => ({ create: (() => null) as (canvas: unknown) => unknown }));
vi.mock('./first-light-engine', () => ({
  LightEngine: { create: (canvas: unknown) => lights.create(canvas) },
}));

const html = document.documentElement;
const [performed] = performedOrbits([31]);
const light = getInterpretation(getCuratedArtwork(31)!, 'light')!;
const WORK: OvertureWork = {
  // A short window keeps the worker's stand-in quick; the home hands over the whole one.
  start: { ...performed.window, steps: 2_001 },
  frame: plateFrame(31, light)!,
  closestStep: 1_000,
  rungs: light.rungs!,
};

/** The worker, in this thread: it samples the window it is sent and answers by message. */
class SamplingWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  postMessage(request: SamplesRequest) {
    const space = plateSpace(request.start, request.frame, request.stride);
    setTimeout(() => this.onmessage?.({ data: { type: 'done', space } }), 0);
  }
  terminate() {}
}

/** The clock the performance reads, and the frames it asks for, run by hand. */
let clock = 0;
let frames = new Map<number, FrameRequestCallback>();
let frameIds = 0;
function at(ms: number) {
  clock = ms;
  const due = [...frames.values()];
  frames.clear();
  act(() => due.forEach((callback) => callback(ms)));
}

let engine: { lost: boolean; [name: string]: unknown };
const create = vi.fn();
function engineStandIn(available = true) {
  engine = {
    lost: false,
    setScene: vi.fn(),
    resize: vi.fn(),
    draw: vi.fn(),
    dispose: vi.fn(),
  };
  create.mockReset();
  create.mockReturnValue(available ? engine : null);
  lights.create = create;
}

/** The home's plate as the page lays it out: a desk's plate under where the head will come. */
function home() {
  document.body.innerHTML =
    '<main class="home"><section data-presentation="home"><div data-layer="ink"><div class="art-media"></div></div></section></main>';
  const plate = document.querySelector<HTMLElement>('.art-media')!;
  plate.getBoundingClientRect = () =>
    ({ left: 27, top: 52, width: 1386, height: 896, right: 1413, bottom: 948 }) as DOMRect;
}

/** Imports the event afresh, as a page load does: it reads the first paint once. */
async function overture(asked: boolean, given: OvertureWork | null = WORK, strict = false) {
  if (asked) html.setAttribute('data-overture', 'pending');
  await import('./first-light-overture');
  const { Overture } = await import('./overture');
  const store = await import('./overture-store');
  const tree = <Overture work={given} skip="Skip" />;
  const view = render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  // The performance is its own chunk, and the window is sampled by a worker: let both come.
  for (let i = 0; i < 6; i++) await act(async () => new Promise((resolve) => setTimeout(resolve)));
  return { ...view, store };
}

const stage = () => document.querySelector<HTMLElement>('[data-first-light]');
const canvasOpacity = () => stage()?.querySelector('canvas')?.style.opacity;

describe('First Light on the home', () => {
  beforeEach(() => {
    vi.resetModules();
    home();
    clock = 0;
    frames = new Map();
    frameIds = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frameIds += 1;
      frames.set(frameIds, callback);
      return frameIds;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    vi.stubGlobal('Worker', SamplingWorker);
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: () => Promise.resolve(),
    });
    motion.paused = false;
    motion.reducedMotion = false;
    localStorage.clear();
    engineStandIn();
  });

  afterEach(() => {
    cleanup();
    html.removeAttribute('data-overture');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('is nothing on a visit the first paint did not ask it for', async () => {
    await overture(false);
    expect(stage()).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('opens on the plate, takes it into the light, gives it back, and brings the head last', async () => {
    const { store } = await overture(true);
    expect(localStorage.getItem(OVERTURE_KEY)).toBe('seen');
    // Until the light covers the plate, the page beneath is the plate as it opened.
    expect(html.getAttribute('data-overture')).toBe('pending');
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
    at(1);
    // The light comes up over the lift's half second, from nothing.
    expect(Number(canvasOpacity())).toBeLessThan(1e-3);
    expect(engine.draw).toHaveBeenCalled();
    at(BEATS.lift + 1);
    expect(canvasOpacity()).toBe('1');
    expect(html.getAttribute('data-overture')).toBe('playing');
    expect(store.overturePhase()).toBe('playing');
    // The flat landing is laid on the plate's own still, where the page has put it.
    expect(stage()?.dataset.still).toBe('27 52 1386 896');
    at(4_000);
    expect(stage()?.dataset.beat).toBe('dance');
    at(DURATION + 1);
    expect(stage()?.dataset.beat).toBe('landed');
    expect(canvasOpacity()).toBe('0');
    expect(html.getAttribute('data-overture')).toBe('landing');
    expect(store.overturePhase()).toBe('landing');
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
    // The plate lands (artwork-viewer.tsx); then the head and the strip arrive over --t-dawn.
    vi.useFakeTimers();
    act(() => store.setOverturePhase('done'));
    expect(html.getAttribute('data-overture')).toBe('dawn');
    act(() => vi.advanceTimersByTime(2_000));
    vi.useRealTimers();
    expect(html.hasAttribute('data-overture')).toBe(false);
    expect(stage()).toBeNull();
  });

  it('performs once when mounted twice, as development mounts every effect twice', async () => {
    await overture(true, WORK, true);
    at(BEATS.lift + 1);
    expect(html.getAttribute('data-overture')).toBe('playing');
    expect(document.querySelectorAll('[data-first-light]')).toHaveLength(1);
  });

  it('while the light holds the plate, the key that ends it is no key for the page; Tab moves on', async () => {
    await overture(true);
    at(BEATS.lift + 1);
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    window.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    expect(html.getAttribute('data-overture')).toBe('playing');
    const key = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(key);
    });
    expect(key.defaultPrevented).toBe(true);
    expect(html.hasAttribute('data-overture')).toBe(false);
  });

  it('swallows the press that ends it, so nothing beneath is pressed blind', async () => {
    await overture(true);
    at(BEATS.lift + 1);
    act(() => {
      fireEvent.pointerDown(window);
    });
    expect(html.hasAttribute('data-overture')).toBe(false);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.body.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
  });

  it('ends at once by its skip control', async () => {
    await overture(true);
    at(BEATS.lift + 1);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    });
    expect(html.hasAttribute('data-overture')).toBe(false);
  });

  it('ends at once for Pause, or when the tab is left', async () => {
    const { rerender } = await overture(true);
    at(BEATS.lift + 1);
    motion.paused = true;
    const { Overture } = await import('./overture');
    rerender(<Overture work={WORK} skip="Skip" />);
    expect(html.hasAttribute('data-overture')).toBe(false);
    cleanup();
    home();
    motion.paused = false;
    await overture(true);
    at(BEATS.lift + 1);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(html.hasAttribute('data-overture')).toBe(false);
  });

  it('lets the page stand at once without a work, a plate, a way to draw, or a page at its top', async () => {
    await overture(true, null);
    expect(html.hasAttribute('data-overture')).toBe(false);
    cleanup();
    document.body.innerHTML = '<main class="home"></main>';
    await overture(true);
    expect(html.hasAttribute('data-overture')).toBe(false);
    cleanup();
    home();
    engineStandIn(false);
    await overture(true);
    expect(html.hasAttribute('data-overture')).toBe(false);
    expect(localStorage.getItem(OVERTURE_KEY)).toBeNull();
  });

  it('gives the page back when it is taken down while it plays', async () => {
    const { unmount } = await overture(true);
    at(BEATS.lift + 1);
    unmount();
    expect(html.hasAttribute('data-overture')).toBe(false);
    expect(engine.dispose).toHaveBeenCalled();
  });

  it('never waits on a window that does not come', async () => {
    vi.stubGlobal(
      'Worker',
      class extends SamplingWorker {
        postMessage() {}
      },
    );
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    html.setAttribute('data-overture', 'pending');
    await import('./first-light-overture');
    const { Overture } = await import('./overture');
    render(<Overture work={WORK} skip="Skip" />);
    // Let the performance's chunk mount and set its wait, then let the wait run out.
    for (let i = 0; i < 6; i++)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
    expect(html.getAttribute('data-overture')).toBe('pending');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_001);
    });
    vi.useRealTimers();
    expect(html.hasAttribute('data-overture')).toBe(false);
  });
});
