import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/lib/i18n/messages';
import { workOrbit, type WorkOrbit } from '@/lib/art/orbit-records';
import { performedOrbits } from '@/lib/art/orbit-windows';
import { lightFilmDuration } from '@/lib/physics/light-film';
import {
  compare,
  compareFate,
  deriveFate,
  type DerivedFate,
  type Rederivation,
} from '@/lib/physics/orbit';
import type { OrbitReply, OrbitRequest } from '@/lib/physics/orbit.worker';
import { AFTER_THE_FRAME_EVENT } from '@/lib/venue-events';
import { OrbitScore } from './orbit-score';

const lendPlateTone = vi.hoisted(() => vi.fn());
const returnPlateTone = vi.hoisted(() => vi.fn());
vi.mock('./room-ground', () => ({ lendPlateTone, returnPlateTone }));
const motion = vi.hoisted(() => ({ paused: true, reducedMotion: true, theatre: 'playing' }));
vi.mock('./motion-provider', () => ({ useMotion: () => motion }));

const t = messages('en');
/** A calm eternal dance, and the two works that eject soonest after their windows. */
const orbit = workOrbit(31)!;
const soonest = workOrbit(54)!;
const later = workOrbit(25)!;
const steps = orbit.generation.steps;
const lead = Math.round((4 * steps) / lightFilmDuration(steps));

let observers: { callback: IntersectionObserverCallback; options?: IntersectionObserverInit }[] =
  [];
let workers: FakeWorker[] = [];
let frames = new Map<number, FrameRequestCallback>();
let frameIds = 0;
let drawCalls: string[] = [];
let clockNow = 0;
let scrolled: ScrollIntoViewOptions[] = [];

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
  frames = new Map();
  drawCalls = [];
  clockNow = 0;
  scrolled = [];
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
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameIds, callback);
    return frameIds;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.spyOn(performance, 'now').mockImplementation(() => clockNow);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => context as unknown as CanvasRenderingContext2D,
  );
  // jsdom lays nothing out, so it has no scrollIntoView of its own.
  Element.prototype.scrollIntoView = function (options?: boolean | ScrollIntoViewOptions) {
    scrolled.push(options as ScrollIntoViewOptions);
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Runs every frame now due, at `now`; a frame cancelled before it runs never does. */
function nextFrame(now = clockNow) {
  const due = [...frames.values()];
  frames.clear();
  act(() => due.forEach((callback) => callback(now)));
}
/** Runs frames a tenth of a second apart until `until` holds, as a display would. */
function framesUntil(until: () => boolean, limit = 2_000) {
  for (let frame = 0; frame < limit && !until(); frame++) {
    clockNow += 100;
    nextFrame();
  }
  expect(until()).toBe(true);
}

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
function derivation(of: WorkOrbit = orbit): Rederivation {
  // A million-step window drawn every hundredth step.
  const count = 10_000;
  return {
    masses: [...of.published.masses],
    totalEnergy: of.published.totalEnergy,
    angularMomentum: of.published.angularMomentum,
    closestApproach: {
      distance: of.published.closestApproach.distance,
      pair: [...of.published.closestApproach.pair],
      step: of.published.closestApproach.step,
    },
    syzygies: [],
    braid: {
      word: of.published.braid.word,
      crossings: of.published.braid.crossings,
      truncated: of.published.braid.truncated,
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

function derive(result = derivation(), worker = workers[0], of: WorkOrbit = orbit) {
  clockNow = 800;
  worker.reply({ type: 'done', result, comparisons: compare(of.published, result) });
  return result;
}

/** The fate as the worker derives it: the real one for an ejection, an eternal dance in brief. */
function fateOf(of: WorkOrbit): DerivedFate {
  const [performed] = performedOrbits([of.id]);
  if (of.fate.outcome === 'eternal_dance')
    return {
      outcome: 'eternal_dance',
      escaper: null,
      ejectionStep: null,
      horizonSteps: of.fate.horizonSteps,
      windowEnd: {
        positions: Float64Array.from(performed.window.positions),
        velocities: Float64Array.from(performed.window.velocities),
        watchRun: 0,
      },
      approach: null,
    };
  return deriveFate(
    {
      masses: of.published.masses,
      dt: of.generation.dt,
      positions: performed.window.positions,
      velocities: performed.window.velocities,
    },
    {
      steps: of.generation.steps,
      threshold: of.fate.escapeThreshold,
      horizonSteps: of.fate.horizonSteps,
      lead,
    },
  );
}
function fated(of: WorkOrbit = orbit, worker = workers[0]) {
  const fate = fateOf(of);
  worker.reply({ type: 'fate', fate, comparison: compareFate(of.fate, fate) });
  return fate;
}

const section = (container: HTMLElement) => container.querySelector('section')!;
const afterTheFrame = () => screen.getByRole('button', { name: t.afterTheFrame });

describe('the orbit section', () => {
  it('states the record before anything is derived', () => {
    render(<OrbitScore orbit={orbit} t={t} locale="en" />);
    expect(screen.getByRole('heading', { name: t.orbitTitle })).toBeInTheDocument();
    expect(screen.getByText(/masses 130\.7, 251\.0 and 125\.0/)).toBeInTheDocument();
    expect(
      screen.getByText(/Bodies 1–3 pass closest, 80\.2 apart, at step 255,842, 7\.7 seconds/),
    ).toBeInTheDocument();
    expect(screen.getByText(t.orbitWaiting)).toBeInTheDocument();
    expect(screen.getAllByText(t.orbitPending)).toHaveLength(11);
    expect(screen.getByText('124.96327743951707')).toBeInTheDocument();
    expect(screen.getByText('−2142.8907060284882')).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Fate bound through 8,000,000 steps/ })).toBeVisible();
    expect(workers).toHaveLength(0);
  });

  it('states an ejection as the record dates it', () => {
    render(<OrbitScore orbit={soonest} t={t} locale="en" />);
    expect(
      screen.getByRole('row', { name: /Fate body 2 escapes at step 1,090,000/ }),
    ).toBeVisible();
  });

  it('derives when the section approaches and narrates the work as it goes', () => {
    render(<OrbitScore orbit={orbit} t={t} locale="en" />);
    approach();
    expect(workers).toHaveLength(1);
    expect(workers[0].posted).toEqual([
      {
        generation: orbit.generation,
        published: orbit.published,
        stride: 100,
        fate: { published: orbit.fate, lead },
      },
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

  it('marks each measurement exact as it is checked, and speaks once the fate is', () => {
    const { container } = render(<OrbitScore orbit={orbit} t={t} locale="en" />);
    approach();
    derive();
    expect(screen.getAllByText(t.orbitExact)).toHaveLength(10);
    expect(screen.getAllByText(t.orbitPending)).toHaveLength(1);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(section(container)).not.toHaveAttribute('data-exact');
    // The worker runs on past the window to the fate before it is done.
    expect(workers[0].terminated).toBe(false);
    fated();
    expect(screen.getAllByText(t.orbitExact)).toHaveLength(11);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Derived here in 0.8 s from seed 0x4a0d…f5b5: candidate 77,741 of 100,000, then 2,000,000 steps. Every measurement is the published record, to the last bit.',
    );
    expect(section(container)).toHaveAttribute('data-exact', 'true');
    expect(section(container)).toHaveAttribute('data-fate', 'eternal_dance');
    expect(workers[0].terminated).toBe(true);
    // Still by default here (reduced motion): the whole orbit is drawn at once, no Again.
    expect(drawCalls).toContain('stroke');
    expect(drawCalls).toContain('drawImage');
    expect(screen.queryByRole('button', { name: t.again })).not.toBeInTheDocument();
    expect(afterTheFrame()).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows both values when a measurement differs', () => {
    render(<OrbitScore orbit={orbit} t={t} locale="en" />);
    approach();
    const result = derivation();
    result.totalEnergy = -2142.89;
    derive(result);
    fated();
    expect(screen.getAllByText(t.orbitExact)).toHaveLength(10);
    expect(screen.getByText(t.orbitDiffers)).toBeInTheDocument();
    expect(screen.getByText('here: −2142.89')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      '1 of 11 measurements differ from the published record.',
    );
  });

  it('says so when the fate differs, and still speaks if it cannot be derived', () => {
    render(<OrbitScore orbit={orbit} t={t} locale="en" />);
    approach();
    derive();
    const fate = { ...fateOf(orbit), horizonSteps: 7_000_000 };
    workers[0].reply({ type: 'fate', fate, comparison: compareFate(orbit.fate, fate) });
    expect(screen.getByText('here: eternal_dance through 7000000')).toBeInTheDocument();
    cleanup();
    workers = [];
    observers = [];
    render(<OrbitScore orbit={orbit} t={t} locale="en" />);
    approach();
    derive();
    workers[0].reply({ type: 'failed', message: 'no' });
    expect(screen.getAllByText(t.orbitExact)).toHaveLength(10);
    expect(screen.getByRole('status')).toHaveTextContent(t.orbitAllExact);
    expect(screen.queryByRole('button', { name: t.afterTheFrame })).not.toBeInTheDocument();
  });

  it('says plainly when this browser cannot derive it', () => {
    render(<OrbitScore orbit={orbit} t={t} locale="en" />);
    approach();
    act(() => workers[0].onerror?.());
    expect(screen.getByRole('status')).toHaveTextContent(t.orbitUnavailable);
    expect(screen.getAllByText(t.orbitPending)).toHaveLength(11);
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
    expect(frames.size).toBeGreaterThan(0);
    clockNow = 800 + 2_000;
    nextFrame();
    expect(
      screen.getByText(/^Step [\d,]+ of 1,000,000 · 00:02 into the Light film$/),
    ).toBeInTheDocument();
    // Run out the film: thirty seconds later every sample is drawn.
    clockNow = 800 + 31_000;
    nextFrame();
    const again = screen.getByRole('button', { name: t.again });
    fireEvent.click(again);
    expect(screen.queryByRole('button', { name: t.again })).not.toBeInTheDocument();
  });

  it('waits out of view and holds still for Pause and the hush', () => {
    Object.assign(motion, { paused: false, reducedMotion: false, theatre: 'hushed' });
    render(<OrbitScore orbit={orbit} t={t} locale="en" />);
    approach();
    derive();
    expect(frames.size).toBe(0);
    expect(screen.queryByRole('button', { name: t.again })).not.toBeInTheDocument();
  });
});

describe('After the frame', () => {
  /** № 054 in view with motion welcome, its window performed through. */
  function performed(of: WorkOrbit = soonest) {
    Object.assign(motion, { paused: false, reducedMotion: false });
    const view_ = render(<OrbitScore orbit={of} t={t} locale="en" />);
    approach();
    view(true);
    derive(derivation(of), workers[0], of);
    const fate = fated(of);
    clockNow = 800 + 31_000;
    nextFrame();
    return { ...view_, fate };
  }

  it('runs the orbit on past its window at the film’s pace, to the escape and a rest', () => {
    const { container, fate } = performed();
    expect(fate.ejectionStep).toBe(1_090_000);
    fireEvent.click(afterTheFrame());
    expect(afterTheFrame()).toHaveAttribute('aria-pressed', 'true');
    expect(section(container)).toHaveAttribute('data-beyond', 'running');
    // Labelled as physics, not the work.
    expect(screen.getByText(t.afterTheFrameNote)).toBeInTheDocument();
    // The window dims behind it, and the score loses its playhead.
    expect(drawCalls).toContain('drawImage');
    nextFrame();
    clockNow += 1_000;
    nextFrame();
    // A frame never carries more than a tenth of a second: 3,330 steps at the film's pace.
    expect(
      screen.getByText(/^After the frame · step 1,003,330 · 00:00 past the film$/),
    ).toBeVisible();
    framesUntil(() => section(container).getAttribute('data-beyond') === 'rested');
    expect(screen.getByText('Body 2 has escaped, at step 1,090,000')).toBeVisible();
    // An escape this soon is reached at the film's pace: nothing to jump to.
    expect(screen.queryByRole('button', { name: t.toTheEjection })).not.toBeInTheDocument();
    // Again performs After the frame again; the word again returns to the window, drawn whole.
    fireEvent.click(screen.getByRole('button', { name: t.again }));
    expect(section(container)).toHaveAttribute('data-beyond', 'running');
    fireEvent.click(afterTheFrame());
    expect(section(container)).not.toHaveAttribute('data-beyond');
    expect(afterTheFrame()).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(t.orbitLine)).toBeInTheDocument();
    nextFrame();
    expect(screen.getByRole('button', { name: t.again })).toBeVisible();
  });

  it('offers to go straight to an escape that lies further on', () => {
    const { container, fate } = performed(later);
    expect(fate.approach!.taken).toBeGreaterThan(steps);
    fireEvent.click(afterTheFrame());
    fireEvent.click(screen.getByRole('button', { name: t.toTheEjection }));
    expect(screen.queryByRole('button', { name: t.toTheEjection })).not.toBeInTheDocument();
    nextFrame();
    // The readout speaks four times a second; the frame still carries a tenth at most.
    clockNow += 1_000;
    nextFrame();
    const reading = screen.getByText(/^After the frame · step [\d,]+ · /).textContent!;
    const step = Number(reading.match(/step ([\d,]+)/)![1].replaceAll(',', ''));
    expect(step).toBe(fate.approach!.taken + 3_330);
    framesUntil(() => section(container).getAttribute('data-beyond') === 'rested');
    expect(screen.getByText('Body 2 has escaped, at step 1,210,000')).toBeVisible();
  });

  it('is drawn at once for reduced motion, from the approach to the escape', () => {
    const { container } = render(<OrbitScore orbit={later} t={t} locale="en" />);
    approach();
    derive(derivation(later), workers[0], later);
    fated(later);
    fireEvent.click(afterTheFrame());
    // The steps are taken a hundred thousand to a frame, then the whole is drawn.
    framesUntil(() => section(container).getAttribute('data-beyond') === 'rested', 20);
    expect(screen.getByText('Body 2 has escaped, at step 1,210,000')).toBeVisible();
    expect(screen.queryByRole('button', { name: t.again })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t.toTheEjection })).not.toBeInTheDocument();
  });

  it('draws half a window of an eternal dance at once, and rests', () => {
    const { container } = render(<OrbitScore orbit={orbit} t={t} locale="en" />);
    approach();
    derive();
    fated();
    fireEvent.click(afterTheFrame());
    framesUntil(() => section(container).getAttribute('data-beyond') === 'rested', 20);
    expect(
      screen.getByText('After the frame · step 1,500,000 · 00:15 past the film'),
    ).toBeVisible();
  });

  it('answers the plate’s word: into view, derived if need be, and on past the frame', () => {
    const { container } = render(<OrbitScore orbit={soonest} t={t} locale="en" />);
    expect(workers).toHaveLength(0);
    act(() => window.dispatchEvent(new Event(AFTER_THE_FRAME_EVENT)));
    expect(scrolled).toEqual([{ block: 'start', behavior: 'instant' }]);
    // The keyboard and the screen reader arrive with it.
    expect(document.activeElement).toBe(section(container));
    expect(workers).toHaveLength(1);
    derive(derivation(soonest), workers[0], soonest);
    expect(section(container)).not.toHaveAttribute('data-beyond');
    fated(soonest);
    expect(section(container)).toHaveAttribute('data-beyond', 'running');
    // Asked again while it runs, the section only comes back into view.
    act(() => window.dispatchEvent(new Event(AFTER_THE_FRAME_EVENT)));
    expect(scrolled).toHaveLength(2);
    expect(section(container)).toHaveAttribute('data-beyond', 'running');
  });

  it('goes on at once when the fate is already known', () => {
    Object.assign(motion, { paused: false, reducedMotion: false });
    const { container } = render(<OrbitScore orbit={soonest} t={t} locale="en" />);
    approach();
    derive(derivation(soonest), workers[0], soonest);
    fated(soonest);
    act(() => window.dispatchEvent(new Event(AFTER_THE_FRAME_EVENT)));
    expect(scrolled).toEqual([{ block: 'start', behavior: 'smooth' }]);
    expect(section(container)).toHaveAttribute('data-beyond', 'running');
  });
});
