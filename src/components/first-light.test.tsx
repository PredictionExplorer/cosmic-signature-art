import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { performedOrbits } from '@/lib/art/orbit-windows';
import { plateFrame } from '@/lib/art/orbit-frames';
import { plateSpace } from '@/lib/first-light/samples';
import type { SamplesRequest } from '@/lib/first-light/samples.worker';
import { MOTION_KEY } from '@/lib/storage-keys';
import { FirstLight, type FirstLightWork } from './first-light';
import { LightEngine } from './first-light-engine';

const [performed] = performedOrbits([31]);
const WORK: FirstLightWork = {
  id: 31,
  label: '№ 031',
  alt: '№ 031 · Light',
  href: '/art/31',
  rungs: [
    { src: '/art/stills/31-light-1280.webp', width: 1280, height: 827, sha256: 'a', bytes: 1 },
    { src: '/art/stills/31-light-1920.webp', width: 1920, height: 1241, sha256: 'b', bytes: 1 },
  ],
  // A short window keeps the worker's stand-in quick; the page hands over the whole one.
  start: { ...performed.window, steps: 2_001 },
  frame: plateFrame(31)!,
  closestStep: 1_000,
};
const WORDS = {
  skip: 'Skip',
  watch: 'Watch it form',
  again: 'Again',
  computed: 'Computed from its seed, in this browser, just now.',
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

function engineStandIn() {
  const engine = {
    lost: false,
    setScene: vi.fn(),
    resize: vi.fn(),
    draw: vi.fn(),
    dispose: vi.fn(),
  };
  vi.spyOn(LightEngine, 'create').mockReturnValue(engine as unknown as LightEngine);
  return engine;
}

function preferReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    addEventListener() {},
    removeEventListener() {},
  }));
}

const state = () => document.querySelector('section')?.getAttribute('data-state');

describe('First Light', () => {
  beforeEach(() => {
    vi.stubGlobal('Worker', SamplingWorker);
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: () => Promise.resolve(),
    });
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('leaves the still on view where the light cannot be drawn', () => {
    render(<FirstLight work={WORK} words={WORDS} />);
    const still = screen.getByRole('img', { name: '№ 031 · Light' });
    expect(still).toHaveAttribute('fetchpriority', 'high');
    expect(still.getAttribute('srcset')).toContain('/art/stills/31-light-1920.webp 1920w');
    expect(state()).toBe('unavailable');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('link', { name: '№ 031' })).toHaveAttribute('href', '/art/31');
  });

  it('opens the picture after the still has held the stage, and gives it back on any key', async () => {
    preferReducedMotion(false);
    const engine = engineStandIn();
    render(<FirstLight work={WORK} words={WORDS} />);
    expect(state()).toBe('preparing');
    // The still holds the stage for most of a second before the picture opens.
    await screen.findByRole('button', { name: 'Skip' }, { timeout: 4_000 });
    expect(state()).toBe('playing');
    expect(engine.setScene).toHaveBeenCalledTimes(1);
    const [space] = engine.setScene.mock.calls[0];
    expect(space.count).toBe(21);
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    expect(engine.draw).toHaveBeenCalled();
    const [moment] = engine.draw.mock.calls[0];
    // The first moment is the generator's own flat view, the drift restored.
    expect(moment.drift).toBe(1);
    expect(moment.lens.inverseDistance).toBe(0);

    fireEvent.keyDown(window, { key: 'Shift' });
    expect(state()).toBe('playing');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(state()).toBe('ended');
    expect(screen.getByText(WORDS.computed)).toBeInTheDocument();
    expect(document.querySelector('canvas')!.style.opacity).toBe('0');
    expect(screen.getByRole('button', { name: 'Again' })).toBeInTheDocument();
  });

  it('waits to be asked where motion is unwelcome, then performs once ready', async () => {
    preferReducedMotion(true);
    engineStandIn();
    render(<FirstLight work={WORK} words={WORDS} />);
    expect(state()).toBe('invited');
    fireEvent.click(screen.getByRole('button', { name: 'Watch it form' }));
    await screen.findByRole('button', { name: 'Skip' }, { timeout: 4_000 });
    expect(state()).toBe('playing');
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(state()).toBe('ended');
    // Again plays at once: the orbit is already sampled.
    fireEvent.click(screen.getByRole('button', { name: 'Again' }));
    expect(state()).toBe('playing');
  });

  it('keeps the session’s own choice of stillness over the system’s', async () => {
    preferReducedMotion(false);
    sessionStorage.setItem(MOTION_KEY, 'paused');
    engineStandIn();
    render(<FirstLight work={WORK} words={WORDS} />);
    expect(state()).toBe('invited');
  });

  it('ends the moment the tab is hidden', async () => {
    preferReducedMotion(false);
    engineStandIn();
    render(<FirstLight work={WORK} words={WORDS} />);
    await screen.findByRole('button', { name: 'Skip' }, { timeout: 4_000 });
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange'));
    expect(state()).toBe('ended');
  });

  it('says so when the orbit cannot be sampled', async () => {
    preferReducedMotion(false);
    engineStandIn();
    vi.stubGlobal(
      'Worker',
      class extends SamplingWorker {
        postMessage() {
          setTimeout(() => this.onerror?.({ message: 'no' }), 0);
        }
      },
    );
    render(<FirstLight work={WORK} words={WORDS} />);
    await vi.waitFor(() => expect(state()).toBe('unavailable'));
  });
});
