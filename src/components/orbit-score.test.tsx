import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/lib/i18n/messages';
import { workOrbit, type WorkOrbit } from '@/lib/art/orbit-records';
import { performedOrbits } from '@/lib/art/orbit-windows';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { orbitPlate, type OrbitPlate } from '@/lib/art/orbit-plate';
import { plateFrame } from '@/lib/art/orbit-frames';
import type { FramedSamples } from '@/lib/physics/framing';
import { lightFilmDuration } from '@/lib/physics/light-film';
import {
  compare,
  compareFate,
  deriveFate,
  type DerivedFate,
  type Rederivation,
} from '@/lib/physics/orbit';
import type { OrbitReply, OrbitRequest } from '@/lib/physics/orbit.worker';
import type { TwinRun } from '@/lib/physics/twin';
import type { TwinRequest } from '@/lib/physics/twin.worker';
import { fill } from '@/lib/i18n/format';
import { AFTER_THE_FRAME_EVENT } from '@/lib/venue-events';
import { OrbitScore } from './orbit-score';
import { forgetExpression, rememberExpression } from './turn';

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
/** Every call on a drawing context, with its arguments. */
let calls: { name: string; args: unknown[] }[] = [];
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
            calls.push({ name: String(property), args });
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
  calls = [];
  clockNow = 0;
  forgetExpression();
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

describe('the orbit on the plate', () => {
  const plate031 = orbitPlate(getCuratedArtwork(31)!)!;
  /** The window on its plate as the worker places it: every stride, then the still's step. */
  function framedOf(copies = 1): FramedSamples {
    const count = 10_000;
    return {
      stride: 100,
      count,
      copies,
      pixels: Float32Array.from({ length: (count + 1) * copies * 6 }, (_, i) =>
        i % 2 ? 1_117 + Math.cos(i) * 400 : 1_728 + Math.sin(i) * 600,
      ),
    };
  }
  const placedOn = (framed: FramedSamples, worker = workers[0]) =>
    worker.reply({ type: 'framed', framed });
  const stage = (container: HTMLElement) => container.querySelector('figure > div')!;
  const still = (container: HTMLElement) => container.querySelector('figure img');
  const arcs = (radius: number) =>
    calls.filter((call) => call.name === 'arc' && call.args[2] === radius);

  it('lays the drawing over the still the page shows, and asks the worker to place it', () => {
    const { container } = render(
      <OrbitScore orbit={orbit} t={t} locale="en" plate={plate031} opening="ink" both />,
    );
    expect(section(container)).toHaveAttribute('data-drawing', 'plate');
    expect(section(container)).toHaveAttribute('data-material', 'ink');
    expect(stage(container)).toHaveAttribute('data-material', 'ink');
    // The still is the work's own, untouched, beneath the drawing: an image, never a canvas.
    expect(still(container)).toHaveAttribute('src', plate031.stills.ink!.src);
    expect(still(container)).toHaveAttribute('srcset', plate031.stills.ink!.srcSet);
    expect(still(container)).toHaveAttribute('alt', '');
    // Lazy until the section is a screen away; then fetched, as the derivation begins.
    expect(still(container)).toHaveAttribute('loading', 'lazy');
    expect(
      screen.getByText(
        /drawn over the Ink still where they stirred the ink, at the Light film’s pace; each comes to rest in the hollow it left\. .* Analysis, not the work\.$/,
      ),
    ).toBeInTheDocument();
    approach();
    expect(still(container)).toHaveAttribute('loading', 'eager');
    expect(workers[0].posted[0].frame).toEqual(plate031.frame);
    derive();
    // The measurements are in; nothing is drawn over the still until the window is placed.
    expect(drawCalls).not.toContain('stroke');
    placedOn(framedOf());
    expect(drawCalls).toContain('stroke');
  });

  it('brings each body to rest where the still shows it, at the size the Ink edition gave it', () => {
    render(<OrbitScore orbit={orbit} t={t} locale="en" plate={plate031} opening="ink" both />);
    approach();
    derive();
    const framed = framedOf();
    placedOn(framed);
    // jsdom lays nothing out: the canvas is one pixel, so the plate is 1/3,456 of the frame.
    const rings = arcs(0.025);
    expect(rings).toHaveLength(3);
    rings.forEach(({ args: [x, y] }, body) => {
      expect(x).toBeCloseTo(framed.pixels[framed.count * 6 + body * 2] / 3456, 9);
      expect(y).toBeCloseTo(framed.pixels[framed.count * 6 + body * 2 + 1] / 2234, 9);
    });
    // Each centre marked, and the closest approach ringed once, no larger than the plate allows.
    expect(arcs(1.5)).toHaveLength(3);
    expect(arcs(0.04)).toHaveLength(1);
  });

  it('draws every copy of a kaleidoscope on Light, and only the first on Ink', () => {
    const { rerender } = render(
      <OrbitScore orbit={orbit} t={t} locale="en" plate={plate031} opening="light" both />,
    );
    approach();
    derive();
    placedOn(framedOf(12));
    // Light: thirty-six lights at rest, and the closest approach ringed in each of twelve copies.
    expect(calls.filter((call) => call.name === 'arc' && call.args[2] === 0.035)).toHaveLength(36);
    expect(arcs(0.04)).toHaveLength(12);
    calls = [];
    act(() => rememberExpression('ink'));
    rerender(<OrbitScore orbit={orbit} t={t} locale="en" plate={plate031} opening="light" both />);
    expect(arcs(0.025)).toHaveLength(3);
    expect(arcs(0.04)).toHaveLength(1);
  });

  it('turns with the plate: the visitor’s choice, else the page’s opening', () => {
    const { container } = render(
      <OrbitScore orbit={orbit} t={t} locale="en" plate={plate031} opening="ink" both />,
    );
    act(() => rememberExpression('light'));
    expect(section(container)).toHaveAttribute('data-material', 'light');
    expect(still(container)).toHaveAttribute('src', plate031.stills.light!.src);
    expect(
      screen.getByText(
        /drawn over the Light still where its film drew them, at the film’s pace; each ends where its stroke ends\./,
      ),
    ).toBeInTheDocument();
    cleanup();
    // A work with one expression opens on it, whatever was chosen elsewhere.
    const alone = render(
      <OrbitScore orbit={orbit} t={t} locale="en" plate={plate031} opening="ink" />,
    );
    expect(section(alone.container)).toHaveAttribute('data-material', 'ink');
  });

  it('draws in the orbit’s own plane without a plate, or a still that bears it out', () => {
    const { container } = render(<OrbitScore orbit={orbit} t={t} locale="en" />);
    expect(section(container)).toHaveAttribute('data-drawing', 'plane');
    expect(section(container)).not.toHaveAttribute('data-material');
    expect(still(container)).toBeNull();
    expect(screen.getByText(/drawn in the plane of their greatest extent/)).toBeInTheDocument();
    cleanup();
    // An Ink still whose hollows do not bear the bodies out is never drawn on.
    const lightOnly: OrbitPlate = { ...plate031, stills: { light: plate031.stills.light } };
    const inked = render(
      <OrbitScore orbit={orbit} t={t} locale="en" plate={lightOnly} opening="ink" both />,
    );
    expect(section(inked.container)).toHaveAttribute('data-drawing', 'plane');
    expect(still(inked.container)).toBeNull();
  });

  it('falls back to the plane when the window could not be placed on its plate', () => {
    const { container } = render(
      <OrbitScore orbit={orbit} t={t} locale="en" plate={plate031} opening="light" both />,
    );
    approach();
    derive();
    placedOn(null as unknown as FramedSamples);
    expect(section(container)).toHaveAttribute('data-drawing', 'plane');
    expect(still(container)).toBeNull();
    expect(drawCalls).toContain('stroke');
    // A worker that fails after measuring leaves the plane too.
    cleanup();
    workers = [];
    observers = [];
    const failed = render(
      <OrbitScore orbit={orbit} t={t} locale="en" plate={plate031} opening="light" both />,
    );
    approach();
    derive();
    workers[0].reply({ type: 'failed', message: 'no' });
    expect(section(failed.container)).toHaveAttribute('data-drawing', 'plane');
    // So does a browser that cannot derive it at all: no still waits for a drawing.
    cleanup();
    observers = [];
    vi.stubGlobal('Worker', undefined);
    const unable = render(
      <OrbitScore orbit={orbit} t={t} locale="en" plate={plate031} opening="light" both />,
    );
    approach();
    expect(section(unable.container)).toHaveAttribute('data-drawing', 'plane');
    expect(still(unable.container)).toBeNull();
  });

  it('carries the orbit on past the frame over the same still, to the escape', () => {
    // № 054 is not among the curated works: its plate as the page would make it.
    const plate054: OrbitPlate = {
      frame: plateFrame(54)!,
      stills: { ink: { src: '/art/stills/54-ink-1920.webp', width: 1920, height: 1242 } },
    };
    const { container } = render(
      <OrbitScore orbit={soonest} t={t} locale="en" plate={plate054} opening="ink" both />,
    );
    approach();
    derive(derivation(soonest), workers[0], soonest);
    placedOn(framedOf());
    fated(soonest);
    fireEvent.click(afterTheFrame());
    framesUntil(() => section(container).getAttribute('data-beyond') === 'rested', 20);
    expect(section(container)).toHaveAttribute('data-drawing', 'plate');
    expect(screen.getByText('Body 2 has escaped, at step 1,090,000')).toBeVisible();
    // Past the frame the bodies are outlined on the paper still, as in the window.
    expect(arcs(0.025).length).toBeGreaterThanOrEqual(3);
  });
});

describe('the clock in the visitor’s hands', () => {
  const slider = () => screen.getByRole('slider', { name: t.orbitTimeLabel });
  /** № 031 in view with motion welcome, two seconds into its performance. */
  function playing() {
    Object.assign(motion, { paused: false, reducedMotion: false });
    const view_ = render(<OrbitScore orbit={orbit} t={t} locale="en" />);
    approach();
    view(true);
    derive();
    clockNow = 800 + 2_000;
    nextFrame();
    return view_;
  }

  it('pauses where it stands, and plays on from there', () => {
    playing();
    fireEvent.click(screen.getByRole('button', { name: t.pause }));
    expect(frames.size).toBe(0);
    expect(screen.getByText(/· 00:02 into the Light film$/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t.play }));
    expect(screen.getByRole('button', { name: t.pause })).toBeInTheDocument();
    clockNow += 1_000;
    nextFrame();
    clockNow += 1_000;
    nextFrame();
    expect(screen.getByText(/· 00:04 into the Light film$/)).toBeInTheDocument();
  });

  it('sets the moment from the slider, forward or back, at once', () => {
    playing();
    // The slider holds the film's frames, and says the moment it stands at.
    expect(slider()).toHaveAttribute('min', '0');
    expect(slider()).toHaveAttribute('max', String(1_802 - 1));
    fireEvent.click(screen.getByRole('button', { name: t.pause }));
    fireEvent.change(slider(), { target: { value: '600' } });
    expect(
      screen.getByText(/^Step 333,555 of 1,000,000 · 00:10 into the Light film$/),
    ).toBeInTheDocument();
    expect(slider()).toHaveAttribute('aria-valuetext', expect.stringMatching(/00:10/));
    // Back, the drawing is laid again from the window's first step.
    calls = [];
    fireEvent.change(slider(), { target: { value: '60' } });
    expect(calls.some((call) => call.name === 'clearRect')).toBe(true);
    expect(screen.getByText(/· 00:01 into the Light film$/)).toBeInTheDocument();
    // Paused before, it stays paused.
    expect(frames.size).toBe(0);
  });

  it('carries the moment with a hand on the score, and plays on when let go', () => {
    playing();
    const strip = slider();
    strip.getBoundingClientRect = () =>
      ({ left: 0, width: 1_801, top: 0, height: 54, right: 1_801, bottom: 54 }) as DOMRect;
    fireEvent.pointerDown(strip, { pointerId: 3, pointerType: 'mouse', button: 0, clientX: 1_200 });
    // Held, the clock stands still.
    expect(frames.size).toBe(0);
    expect(screen.getByText(/· 00:20 into the Light film$/)).toBeInTheDocument();
    fireEvent.pointerMove(strip, { pointerId: 3, pointerType: 'mouse', clientX: 900 });
    expect(screen.getByText(/· 00:15 into the Light film$/)).toBeInTheDocument();
    fireEvent.pointerUp(strip, { pointerId: 3, pointerType: 'mouse' });
    // It was playing, so it plays on.
    expect(frames.size).toBeGreaterThan(0);
  });

  it('slows as the bodies pass their closest approach', () => {
    playing();
    fireEvent.click(screen.getByRole('button', { name: t.toClosestApproach }));
    // From two seconds of film before it, it reaches the approach later than the film would:
    // at the film's own pace twenty frames of a tenth of a second would do.
    let frames_ = 0;
    while (!screen.queryByText('Closest approach · bodies 1–3, 80.2 apart') && frames_ < 200) {
      clockNow += 100;
      nextFrame();
      frames_ += 1;
    }
    expect(screen.getByText('Closest approach · bodies 1–3, 80.2 apart')).toBeInTheDocument();
    expect(frames_).toBeGreaterThan(22);
  });

  it('offers Play where motion is unwelcome, plays only when asked, then offers Again', () => {
    render(<OrbitScore orbit={orbit} t={t} locale="en" />);
    approach();
    view(true);
    derive();
    expect(frames.size).toBe(0);
    expect(screen.queryByRole('button', { name: t.again })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t.play }));
    expect(frames.size).toBeGreaterThan(0);
    framesUntil(() => screen.queryByRole('button', { name: t.again }) !== null, 400);
    // The closest approach rests on it, where motion is unwelcome.
    fireEvent.click(screen.getByRole('button', { name: t.toClosestApproach }));
    expect(frames.size).toBe(0);
    expect(screen.getByText('Closest approach · bodies 1–3, 80.2 apart')).toBeInTheDocument();
  });
});

describe('the orbit in the hand, in the section', () => {
  const plate031 = orbitPlate(getCuratedArtwork(31)!)!;

  it('asks for the window in depth only where it could be drawn', () => {
    render(<OrbitScore orbit={orbit} t={t} locale="en" plate={plate031} opening="light" both />);
    approach();
    expect(workers[0].posted[0].space).toBeUndefined();
    cleanup();
    workers = [];
    observers = [];
    vi.stubGlobal('WebGL2RenderingContext', class {});
    render(<OrbitScore orbit={orbit} t={t} locale="en" plate={plate031} opening="light" both />);
    approach();
    expect(workers[0].posted[0]).toMatchObject({ space: true, frame: plate031.frame });
  });

  it('carries a small rung of the Light still to colour the light in depth', () => {
    expect(plate031.stills.light!.colours).toMatch(/\/31-light-(640|960|1280)-/);
  });
});

describe('one part in a trillion', () => {
  const plate031 = orbitPlate(getCuratedArtwork(31)!)!;
  const twinButton = () => screen.getByRole('button', { name: t.oneInATrillion });
  /** What the twin's worker finds: a gap doubling every 40,000 steps, parting past the frame. */
  function found(of: WorkOrbit = orbit): TwinRun {
    const fate = fateOf(of);
    const steps = of.generation.steps;
    return {
      body: 0,
      axis: 0,
      nudge: 1e-12,
      windowEnd: {
        positions: Float64Array.from(fate.windowEnd.positions),
        velocities: Float64Array.from(fate.windowEnd.velocities),
      },
      gaps: Float64Array.from({ length: 1_031 }, (_, i) => 1e-12 * 2 ** (i / 40)),
      every: 1_000,
      parted: steps + 20_000,
      doubling: 40_000,
      until: steps + 30_000,
    };
  }
  /** № 031 on its plate, derived, placed and fated: the window drawn whole, as reduced motion has it. */
  function onThePlate() {
    const view_ = render(
      <OrbitScore orbit={orbit} t={t} locale="en" plate={plate031} opening="ink" both />,
    );
    approach();
    view(true);
    derive();
    workers[0].reply({
      type: 'framed',
      framed: {
        stride: 100,
        count: 10_000,
        copies: 1,
        pixels: Float32Array.from({ length: 10_001 * 6 }, (_, i) =>
          i % 2 ? 1_117 + Math.cos(i) * 400 : 1_728 + Math.sin(i) * 600,
        ),
      },
    });
    fated();
    return view_;
  }

  it('is offered beside After the frame once the window stands drawn, on the plate', () => {
    onThePlate();
    expect(twinButton()).toHaveAttribute('aria-pressed', 'false');
    expect(afterTheFrame()).toBeInTheDocument();
  });

  it('follows the twin off the main thread, says so, and sets the window aside', () => {
    const { container } = onThePlate();
    fireEvent.click(twinButton());
    expect(section(container)).toHaveAttribute('data-twin', 'following');
    expect(twinButton()).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(fill(t.oneInATrillionNote, { body: 1 }))).toBeInTheDocument();
    expect(screen.getByText(fill(t.twinWorking, { body: 1 }))).toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    // The twin's own worker, given the derived window's first state and the plate's frame.
    const request = workers[1].posted[0] as unknown as TwinRequest;
    expect(request.frame).toEqual(plate031.frame);
    expect(request.start.steps).toBe(orbit.generation.steps);
    expect(request.horizon).toBe(orbit.fate.horizonSteps);
  });

  it('carries the pair past the frame until the twin parts, and says when, and how fast it grew', () => {
    const { container } = onThePlate();
    fireEvent.click(twinButton());
    workers[1].reply({ type: 'done', run: found() } as unknown as OrbitReply);
    expect(workers[1].terminated).toBe(true);
    framesUntil(() => section(container).getAttribute('data-twin') === 'rested', 50);
    expect(
      screen.getByText('Parted at step 1,020,000. The gap doubled about every 40,000 steps.'),
    ).toBeInTheDocument();
    // The twin's bodies are ringed in its red, on the marks above the drawing.
    expect(calls.some((call) => call.name === 'arc' && call.args[2] === 5)).toBe(true);
  });

  it('gives way to After the frame, and After the frame to it, a word apart', () => {
    const { container } = onThePlate();
    fireEvent.click(twinButton());
    fireEvent.click(afterTheFrame());
    expect(section(container)).not.toHaveAttribute('data-twin');
    expect(section(container)).toHaveAttribute('data-beyond');
    fireEvent.click(twinButton());
    expect(section(container)).not.toHaveAttribute('data-beyond');
    expect(section(container)).toHaveAttribute('data-twin');
    // Pressed again, it gives the window back, drawn whole.
    fireEvent.click(twinButton());
    expect(section(container)).not.toHaveAttribute('data-twin');
    expect(screen.getByText(t.orbitLine)).toBeInTheDocument();
  });

  it('says plainly when this browser cannot follow the twin', () => {
    onThePlate();
    fireEvent.click(twinButton());
    workers[1].reply({ type: 'failed', message: 'no' } as unknown as OrbitReply);
    expect(screen.getByText(t.twinUnavailable)).toBeInTheDocument();
  });
});
