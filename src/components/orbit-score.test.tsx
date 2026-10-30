import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/lib/i18n/messages';
import { workOrbit } from '@/lib/art/orbit-records';
import { compare, type Rederivation } from '@/lib/physics/orbit';
import type { OrbitReply, OrbitRequest } from '@/lib/physics/orbit.worker';
import { OrbitScore } from './orbit-score';

const lendPlateTone = vi.hoisted(() => vi.fn());
const returnPlateTone = vi.hoisted(() => vi.fn());
vi.mock('./room-ground', () => ({ lendPlateTone, returnPlateTone }));
const motion = vi.hoisted(() => ({ paused: true, reducedMotion: true, theatre: 'playing' }));
vi.mock('./motion-provider', () => ({ useMotion: () => motion }));

const t = messages('en');
const orbit = workOrbit(31)!;

let observers: { callback: IntersectionObserverCallback; options?: IntersectionObserverInit }[] =
  [];
let workers: FakeWorker[] = [];
let frames: FrameRequestCallback[] = [];
let drawCalls: string[] = [];
let clockNow = 0;

class FakeWorker {
  onmessage: ((event: MessageEvent<OrbitReply>) => void) | null = null;
  onerror: (() => void) | null = null;
  posted: OrbitRequest[] = [];
  terminated = false;
  constructor() {
    workers.push(this);
  }
  postMessage(request: OrbitRequest) {
    this.posted.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  reply(message: OrbitReply) {
    act(() => this.onmessage?.({ data: message } as MessageEvent<OrbitReply>));
  }
}

const context = new Proxy(
  {},
  {
    get: (_, property) =>
      property === 'createRadialGradient'
        ? () => ({ addColorStop() {} })
        : (...args: unknown[]) => {
            drawCalls.push(String(property));
            return args;
          },
    set: () => true,
  },
);

beforeEach(() => {
  observers = [];
  workers = [];
  frames = [];
  drawCalls = [];
  clockNow = 0;
  Object.assign(motion, { paused: true, reducedMotion: true, theatre: 'playing' });
  lendPlateTone.mockClear();
  returnPlateTone.mockClear();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        observers.push({ callback, options });
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(performance, 'now').mockImplementation(() => clockNow);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => context as unknown as CanvasRenderingContext2D,
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The section approaches (first observer), comes into view (second), passes under the head (third). */
function approach() {
  act(() =>
    observers[0].callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    ),
  );
}
function view(visible: boolean) {
  act(() =>
    observers[1].callback(
      [{ isIntersecting: visible } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    ),
  );
}
function underHead(under: boolean) {
  act(() =>
    observers[2].callback(
      [{ isIntersecting: under } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    ),
  );
}

/** A small derivation that agrees with the record, so the comparison is the real one. */
function derivation(): Rederivation {
  // A million-step window drawn every hundredth step.
  const count = 10_000;
  return {
    masses: [...orbit.published.masses],
    totalEnergy: orbit.published.totalEnergy,
    angularMomentum: orbit.published.angularMomentum,
    closestApproach: {
      distance: orbit.published.closestApproach.distance,
      pair: [...orbit.published.closestApproach.pair],
      step: orbit.published.closestApproach.step,
    },
    syzygies: [],
    braid: {
      word: orbit.published.braid.word,
      crossings: orbit.published.braid.crossings,
      truncated: orbit.published.braid.truncated,
      events: [{ step: 12_000, generator: 1, positive: true }],
    },
    profileDraws: 23,
    attempt: 0,
    samples: {
      stride: 100,
      count,
      positions: Float32Array.from({ length: count * 9 }, (_, i) => Math.sin(i) * 100),
      separations: Float32Array.from({ length: count * 3 }, (_, i) => 10 + i),
    },
    windowStart: { positions: new Float64Array(9), velocities: new Float64Array(9) },
    milliseconds: { beginnings: 1, orbit: 1 },
  };
}

function derive(result = derivation()) {
  clockNow = 800;
  workers[0].reply({ type: 'done', result, comparisons: compare(orbit.published, result) });
  return result;
}

describe('the orbit section', () => {
  it('states the record before anything is derived', () => {
    render(<OrbitScore orbit={orbit} t={t} locale="en" />);
    expect(screen.getByRole('heading', { name: t.orbitTitle })).toBeInTheDocument();
    expect(screen.getByText(/masses 130\.7, 251\.0 and 125\.0/)).toBeInTheDocument();
    expect(
      screen.getByText(/Bodies 1–3 pass closest, 80\.2 apart, at step 255,842, 7\.7 seconds/),
    ).toBeInTheDocument();
    expect(screen.getByText(t.orbitWaiting)).toBeInTheDocument();
    expect(screen.getAllByText(t.orbitPending)).toHaveLength(10);
    expect(screen.getByText('124.96327743951707')).toBeInTheDocument();
    expect(screen.getByText('−2142.8907060284882')).toBeInTheDocument();
    expect(workers).toHaveLength(0);
  });

  it('derives when the section approaches and narrates the work as it goes', () => {
    render(<OrbitScore orbit={orbit} t={t} locale="en" />);
    approach();
    expect(workers).toHaveLength(1);
    expect(workers[0].posted).toEqual([
      { generation: orbit.generation, published: orbit.published, stride: 100 },
    ]);
    workers[0].reply({
      type: 'progress',
      progress: { phase: 'beginnings', done: 2_500, total: 77_741 },
    });
    expect(screen.getByText('Reading the seed · candidate 2,500 of 77,741')).toBeInTheDocument();
    workers[0].reply({
      type: 'progress',
      progress: { phase: 'warm-up', done: 100_000, total: 1_000_000 },
    });
    expect(
      screen.getByText(/Candidate 77,741 in motion · warm-up step 100,000/),
    ).toBeInTheDocument();
    workers[0].reply({
      type: 'progress',
      progress: { phase: 'window', done: 0, total: 1_000_000 },
    });
    expect(screen.getByText('The recorded window · step 0 of 1,000,000')).toBeInTheDocument();
    workers[0].reply({ type: 'progress', progress: { phase: 'braid', done: 0, total: 1_000_000 } });
    expect(screen.getByText('Following the crossings · step 0 of 1,000,000')).toBeInTheDocument();
  });

  it('marks every measurement exact when the derivation is the record', () => {
    const { container } = render(<OrbitScore orbit={orbit} t={t} locale="en" />);
    approach();
    derive();
    expect(screen.getAllByText(t.orbitExact)).toHaveLength(10);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Derived here in 0.8 s from seed 0x4a0d…f5b5: candidate 77,741 of 100,000, then 2,000,000 steps. Every measurement is the published record, to the last bit.',
    );
    expect(container.querySelector('section')).toHaveAttribute('data-exact', 'true');
    expect(workers[0].terminated).toBe(true);
    // Still by default here (reduced motion): the whole orbit is drawn at once, no Again.
    expect(drawCalls).toContain('stroke');
    expect(drawCalls).toContain('drawImage');
    expect(screen.queryByRole('button', { name: t.again })).not.toBeInTheDocument();
  });

  it('shows both values when a measurement differs', () => {
    render(<OrbitScore orbit={orbit} t={t} locale="en" />);
    approach();
    const result = derivation();
    result.totalEnergy = -2142.89;
    derive(result);
    expect(screen.getAllByText(t.orbitExact)).toHaveLength(9);
    expect(screen.getByText(t.orbitDiffers)).toBeInTheDocument();
    expect(screen.getByText('here: −2142.89')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      '1 of 10 measurements differ from the published record.',
    );
  });

  it('says plainly when this browser cannot derive it', () => {
    render(<OrbitScore orbit={orbit} t={t} locale="en" />);
    approach();
    act(() => workers[0].onerror?.());
    expect(screen.getByRole('status')).toHaveTextContent(t.orbitUnavailable);
    expect(screen.getAllByText(t.orbitPending)).toHaveLength(10);
  });

  it('reports a failure the worker sends back', () => {
    render(<OrbitScore orbit={orbit} t={t} locale="en" />);
    approach();
    workers[0].reply({ type: 'failed', message: 'no' });
    expect(screen.getByRole('status')).toHaveTextContent(t.orbitUnavailable);
  });

  it('lends the running head the night only while it stands beneath the head, and returns it', () => {
    const { unmount } = render(<OrbitScore orbit={orbit} t={t} locale="en" />);
    expect(observers[2].options?.rootMargin).toBe('-2px 0px -92% 0px');
    underHead(true);
    expect(lendPlateTone).toHaveBeenLastCalledWith(expect.any(Object), '#000000', 'night');
    const holder = lendPlateTone.mock.calls[0][0];
    underHead(false);
    expect(returnPlateTone).toHaveBeenLastCalledWith(holder);
    unmount();
    expect(returnPlateTone).toHaveBeenCalledTimes(2);
  });

  it('plays at the Light film’s pace in view, reads the clock, and offers Again at the end', () => {
    Object.assign(motion, { paused: false, reducedMotion: false });
    render(<OrbitScore orbit={orbit} t={t} locale="en" />);
    approach();
    view(true);
    derive();
    expect(frames.length).toBeGreaterThan(0);
    clockNow = 800 + 2_000;
    act(() => frames.shift()!(clockNow));
    expect(
      screen.getByText(/^Step [\d,]+ of 1,000,000 · 00:02 into the Light film$/),
    ).toBeInTheDocument();
    // Run out the film: thirty seconds later every sample is drawn.
    clockNow = 800 + 31_000;
    act(() => frames.shift()!(clockNow));
    const again = screen.getByRole('button', { name: t.again });
    fireEvent.click(again);
    expect(screen.queryByRole('button', { name: t.again })).not.toBeInTheDocument();
  });

  it('waits out of view and holds still for Pause and the hush', () => {
    Object.assign(motion, { paused: false, reducedMotion: false, theatre: 'hushed' });
    render(<OrbitScore orbit={orbit} t={t} locale="en" />);
    approach();
    derive();
    expect(frames).toHaveLength(0);
    expect(screen.queryByRole('button', { name: t.again })).not.toBeInTheDocument();
  });
});
