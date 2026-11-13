import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/lib/i18n/messages';
import { workOrbit, type WorkOrbit } from '@/lib/art/orbit-records';
import { performedOrbits } from '@/lib/art/orbit-windows';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { orbitPlate, type OrbitPlate } from '@/lib/art/orbit-plate';
import { plateFrame } from '@/lib/art/orbit-frames';
import type { BeyondPath } from '@/lib/physics/beyond';
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
/** How many pictures have been read for what they show past the frame (orbit-beyond.ts). */
const readings = vi.hoisted(() => ({ made: 0 }));
vi.mock('./orbit-beyond', async (original) => {
  const real = await original<typeof import('./orbit-beyond')>();
  return {
    ...real,
    heldScript: (...args: Parameters<typeof real.heldScript>) => {
      readings.made += 1;
      return real.heldScript(...args);
    },
  };
});

const t = messages('en');
/** A work whose record finds its three bound, and the one that ejects soonest after its window. */
const orbit = workOrbit(31)!;
const soonest = workOrbit(54)!;
const steps = orbit.generation.steps;
/** The Light film's pace, in steps a second, and the worker's samples in a second of it. */
const pace = steps / lightFilmDuration(steps);
const PER_SECOND = pace / 100;

let observers: { callback: IntersectionObserverCallback; options?: IntersectionObserverInit }[] =
  [];
let workers: FakeWorker[] = [];
/** The section's resize observers as it made them: what each watches, and whether it still does. */
let resizers: { callback: () => void; targets: Element[]; live: boolean }[] = [];
/** The observed element whose class name it is takes another size: its observer reports. */
const resize = (named: RegExp) =>
  act(() =>
    resizers
      .find((one) => one.live && one.targets.some((target) => named.test(target.className)))!
      .callback(),
  );
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
  resizers = [];
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
      targets: Element[] = [];
      live = true;
      constructor(public callback: () => void) {
        resizers.push(this);
      }
      observe(target: Element) {
        this.targets.push(target);
      }
      disconnect() {
        this.live = false;
      }
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

/**
 * The fate as the worker derives it: the real one for an ejection, an eternal dance in brief.
 *
 * A work's is derived once for the file (a run of a million steps and more, which most tests
 * here would otherwise each make) and kept by the work's number: every work these tests fate
 * is the record's own, unaltered. Each test is handed a copy that shares nothing with the one
 * kept, so what a test does to its fate no other test meets. The copy names every field: one
 * added to a fate later will not compile here until it is copied too.
 */
const derivedFates = new Map<number, DerivedFate>();
function fateOf(of: WorkOrbit): DerivedFate {
  const kept = derivedFates.get(of.id) ?? deriveFateOf(of);
  derivedFates.set(of.id, kept);
  const { outcome, escaper, ejectionStep, horizonSteps, energy, windowEnd } = kept;
  const { first, windowChange, change, broken } = energy;
  return {
    outcome,
    escaper,
    ejectionStep,
    horizonSteps,
    energy: {
      first,
      windowChange,
      change,
      broken: broken && { step: broken.step, change: broken.change, closest: broken.closest },
    },
    windowEnd: {
      positions: windowEnd.positions.slice(),
      velocities: windowEnd.velocities.slice(),
    },
  };
}
function deriveFateOf(of: WorkOrbit): DerivedFate {
  const [performed] = performedOrbits([of.id]);
  if (of.fate.outcome === 'eternal_dance')
    return {
      outcome: 'eternal_dance',
      escaper: null,
      ejectionStep: null,
      horizonSteps: of.fate.horizonSteps,
      energy: { first: -1, windowChange: 0, change: 0, broken: null },
      windowEnd: {
        positions: Float64Array.from(performed.window.positions),
        velocities: Float64Array.from(performed.window.velocities),
      },
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
    },
  );
}

/**
 * A path past the window as the worker carries it, for `seconds` of film. Each body stands at
 * the middle of the frame, or where `places` puts it, but for the stretches `out` names (in
 * seconds of film; without a `to`, to the path's end), when it stands `far` frame-widths
 * outside it.
 */
function pathOf({
  seconds = 6,
  out = [],
  lost = null,
  copies = 1,
  places = [],
}: {
  seconds?: number;
  out?: { body: number; from: number; to?: number; far?: number }[];
  lost?: BeyondPath['lost'];
  copies?: number;
  places?: [number, number][];
} = {}): BeyondPath {
  const samples = Math.round(seconds * PER_SECOND) + 1;
  const pixels = new Float32Array(samples * copies * 6);
  for (let sample = 0; sample < samples; sample++)
    for (let body = 0; body < 3; body++) {
      const at = sample / PER_SECOND;
      const away = out.find(
        (stretch) => stretch.body === body && at >= stretch.from && at < (stretch.to ?? Infinity),
      );
      const far = away ? (away.far ?? 1) : 0;
      const [x, y] = places[body] ?? [1_728, 1_117];
      for (let copy = 0; copy < copies; copy++) {
        pixels[(sample * copies * 3 + copy * 3 + body) * 2] = far ? 3_456 * (1 + far) : x;
        pixels[(sample * copies * 3 + copy * 3 + body) * 2 + 1] = far ? 1_117 : y;
      }
    }
  return { from: steps, stride: 100, samples, pixels, copies, lost };
}
/** A work's plate as its page makes it, for one not among the curated works. */
const plateOf = (id: number, material: 'light' | 'ink' = 'light'): OrbitPlate => ({
  frame: plateFrame(id)!,
  stills: {
    [material]: { src: `/art/stills/${id}-${material}-1920.webp`, width: 1920, height: 1242 },
  },
});
/** The fate, and after it the path past the window, as the worker sends them. */
function fated(of: WorkOrbit = orbit, worker = workers[0], path: BeyondPath | null = pathOf()) {
  const fate = fateOf(of);
  worker.reply({ type: 'fate', fate, comparison: compareFate(of.fate, fate) });
  worker.reply({ type: 'beyond', beyond: path });
  return fate;
}

const section = (container: HTMLElement) => container.querySelector('section')!;
const afterTheFrame = () => screen.getByRole('button', { name: t.afterTheFrame });
/**
 * After the frame, with the frame: its word and, where the visitor is asked whom to stay with
 * (a picture that draws the bodies where they were), the answer that holds the frame.
 */
function pastTheFrame() {
  fireEvent.click(afterTheFrame());
  const frame = screen.queryByRole('button', { name: t.beyondStayFrame });
  if (frame) fireEvent.click(frame);
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
    expect(screen.getAllByText(t.orbitPending)).toHaveLength(11);
    expect(screen.getByText('124.96327743951707')).toBeInTheDocument();
    expect(screen.getByText('−2142.8907060284882')).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Fate bound through 8,000,000 steps/ })).toBeVisible();
    expect(workers).toHaveLength(0);
  });

  it('states an ejection as the record dates it', () => {
    render(<OrbitScore orbit={soonest} t={t} locale="en" />);
    expect(
      screen.getByRole('row', { name: /Fate body 2 no longer bound at step 1,090,000/ }),
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
        fate: { published: orbit.fate },
        beyond: { pace },
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
    expect(container.querySelector('[class*="kept"]')).toBeEmptyDOMElement();
    fated();
    expect(screen.getAllByText(t.orbitExact)).toHaveLength(11);
    // With the fate comes the watch's answer: the computed energy held.
    expect(container.querySelector('[data-energy="held"]')).toHaveTextContent(
      'As computed here, the energy holds to 15 digits through the recorded window.',
    );
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
    // Drawn in its own plane, without a plate, there is no frame to go past: After the frame
    // is offered on the plate alone (below).
    expect(screen.queryByRole('button', { name: t.afterTheFrame })).not.toBeInTheDocument();
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
  /**
   * № 025's record finds body 2 free 210,000 steps past its window, and its picture draws the
   * bodies where they were, so a body that leaves it can be named. № 031's finds its three bound.
   */
  const ejected = workOrbit(25)!;
  const sectionOf = (container: HTMLElement) => section(container);
  const phase = (container: HTMLElement) => sectionOf(container).getAttribute('data-beyond');
  const telling = (container: HTMLElement) =>
    container.querySelector<HTMLElement>('#orbit p[class*="readout"]')!;
  const line = (container: HTMLElement) => telling(container).textContent;
  const words = (container: HTMLElement) =>
    [...container.querySelectorAll('#orbit [class*="words"] :is(button, a)')].map(
      (word) => word.textContent,
    );
  const word = (name: string) => screen.getByRole('button', { name });
  /** Where the bodies' lights were last drawn, in canvas pixels, body by body. */
  const lights = () =>
    calls
      .filter((call) => call.name === 'arc')
      .slice(-3)
      .map(({ args }) => [Math.round(args[0] as number), Math.round(args[1] as number)]);

  /** A work on its Light plate, in view, its window performed through, and its path known. */
  function performed(
    of: WorkOrbit = ejected,
    path: BeyondPath | null = pathOf(),
    { still = false, plate = plateOf(of.id) as OrbitPlate | null, framed = framedOf() } = {},
  ) {
    Object.assign(motion, { paused: still, reducedMotion: still });
    // jsdom lays nothing out: the canvases are given the plate's size on a desk.
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 900,
      height: 580,
    } as DOMRect);
    const view_ = render(
      <OrbitScore orbit={of} t={t} locale="en" plate={plate ?? undefined} opening="light" />,
    );
    approach();
    view(true);
    derive(derivation(of), workers[0], of);
    if (plate) workers[0].reply({ type: 'framed', framed });
    const fate = fated(of, workers[0], path);
    clockNow = 800 + 31_000;
    nextFrame();
    return { ...view_, fate };
  }
  /** Frames a tenth of a second apart until so many seconds of film have been performed. */
  function perform(seconds: number) {
    for (let frame = 0; frame < Math.round(seconds * 10); frame++) {
      clockNow += 100;
      nextFrame();
    }
  }
  /** The eight seconds of nothing, and the fade before them. */
  function rest() {
    act(() => vi.advanceTimersByTime(1_200 + 8_000));
  }
  /**
   * Where jsdom would lay the picture, what stands beneath it and the words, were it to lay
   * anything out: each a top and a bottom, or what they are past the frame and back at it.
   */
  type Box = [number, number] | ((pastFrame: boolean) => [number, number]);
  function laidOut(boxes: { picture: Box; beneath: Box; words?: Box }) {
    vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLDivElement,
    ) {
      const box = /_stage_/.test(this.className)
        ? boxes.picture
        : /_score_/.test(this.className)
          ? boxes.beneath
          : /_words_/.test(this.className)
            ? (boxes.words ?? [0, 0])
            : ([0, 0] as [number, number]);
      const pastFrame = !!document.querySelector('#orbit[data-beyond]');
      const [top, bottom] = typeof box === 'function' ? box(pastFrame) : box;
      return { top, bottom } as DOMRect;
    });
  }
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
  afterEach(() => vi.useRealTimers());

  it('runs on with the frame held until all three are out, rests on the still, then says what happened', () => {
    // Body 2 leaves the picture three seconds after the film, and the two it left follow it
    // out two seconds later.
    const path = pathOf({
      seconds: 20,
      out: [
        { body: 1, from: 3, far: 1.4 },
        { body: 0, from: 5 },
        { body: 2, from: 5 },
      ],
    });
    const { container, fate } = performed(ejected, path);
    expect(fate.ejectionStep).toBe(1_210_000);
    calls = [];
    pastTheFrame();
    expect(afterTheFrame()).toHaveAttribute('aria-pressed', 'true');
    expect(phase(container)).toBe('running');
    // Labelled as physics, not the work, with both answers to the question said above the
    // picture; and under the picture.
    expect(screen.getByText(t.afterTheFrameNoteAsk)).toBeInTheDocument();
    expect(container.querySelector('figcaption')!.textContent).toBe(t.analysisNotWork);
    // The window is drawn again, dimmed, and over it the three bodies where the path's first
    // sample places them: at the middle of the frame, at the size the plate is drawn at.
    expect(calls.some((call) => call.name === 'stroke')).toBe(true);
    expect(lights()).toEqual([
      [450, 290],
      [450, 290],
      [450, 290],
    ]);
    nextFrame();
    clockNow += 1_000;
    nextFrame();
    // A frame never carries more than a tenth of a second: 3,330 steps at the film's pace.
    expect(line(container)).toBe('00:00 past the film · step 1,003,300');
    calls = [];
    perform(3.4);
    // Nothing follows the body that leaves: its light is drawn 1.4 frame-widths past the edge,
    // off the canvas, with its trail out to it; the line counts how far away it is.
    expect(lights()).toEqual([
      [450, 290],
      [2160, 290],
      [450, 290],
    ]);
    expect(
      calls.some((call) => call.name === 'lineTo' && Math.round(call.args[0] as number) === 2160),
    ).toBe(true);
    expect(line(container)).toBe(
      '00:03 past the film · body 2 is out of the picture, 1.4 picture widths away',
    );
    perform(2);
    expect(line(container)).toBe('00:05 past the film · all three are out of the picture');
    // Two seconds with all three out; then the drawing gives way to the still.
    word(t.beyondTell).focus();
    expect(telling(container)).not.toHaveAttribute('aria-live');
    framesUntil(() => phase(container) === 'resting', 40);
    expect(line(container)).toBe('');
    // The words are gone: a focus that stood on one stays in the section, and the line that
    // will say what happened is live from now, so a screen reader says it when it comes.
    expect(document.activeElement).toBe(sectionOf(container));
    expect(telling(container)).toHaveAttribute('aria-live', 'polite');
    // The label goes with the drawing it labelled, and keeps its line.
    const label = container.querySelector('figcaption span')!;
    expect(label).toHaveAttribute('data-shown', 'false');
    expect(label).toHaveAttribute('aria-hidden', 'true');
    // Eight seconds in which nothing is said and nothing is offered.
    expect(words(container)).toEqual([]);
    act(() => vi.advanceTimersByTime(1_200 + 7_900));
    expect(phase(container)).toBe('resting');
    act(() => vi.advanceTimersByTime(100));
    expect(phase(container)).toBe('told');
    expect(line(container)).toBe(
      'Body 2 left the picture 3.0 seconds after the film ended. 2.0 seconds later the other two had left it too. The record finds body 2 no longer bound to the other two at step 1,210,000.',
    );
    // Told by the clock, the focus is left where the visitor has it.
    expect(document.activeElement).toBe(sectionOf(container));
    // Two words, the way back to the frame, and the other act.
    expect(words(container)).toEqual([t.again, t.beyondRecord, t.afterTheFrame, t.oneInATrillion]);
    expect(screen.getByRole('link', { name: t.beyondRecord })).toHaveAttribute('href', '#proof');
    // Again asks the question again: the word that was pressed goes, and the keyboard and the
    // screen reader are taken to the question. Answered, it is performed from the film's end.
    const again = word(t.again);
    again.focus();
    fireEvent.click(again);
    expect(phase(container)).toBe('choosing');
    expect(line(container)).toBe(t.beyondAsk);
    expect(document.activeElement).toBe(telling(container));
    fireEvent.click(word(t.beyondStayFrame));
    expect(phase(container)).toBe('running');
    nextFrame();
    expect(line(container)).toBe('00:00 past the film · step 1,000,000');
    // The word again returns to the window, and is the same word still.
    const pressed = afterTheFrame();
    pressed.focus();
    fireEvent.click(pressed);
    expect(sectionOf(container)).not.toHaveAttribute('data-beyond');
    expect(afterTheFrame()).toHaveAttribute('aria-pressed', 'false');
    expect(document.activeElement).toBe(afterTheFrame());
    expect(screen.getByText(t.orbitLine)).toBeInTheDocument();
  });

  it('ends a bound orbit when the first body to leave the picture has come back', () => {
    // № 031's record finds the three bound to its horizon. Body 3 is gone from the picture for
    // six seconds; body 1 only grazes its edge, too briefly and too near to be missed.
    const path = pathOf({
      seconds: 30,
      out: [
        { body: 0, from: 1, to: 2, far: 0.05 },
        { body: 2, from: 4, to: 10, far: 0.6 },
      ],
    });
    const { container } = performed(orbit, path);
    pastTheFrame();
    perform(1.6);
    // Body 1 is over the edge now, and the line does not chatter about it.
    expect(line(container)).toMatch(/^00:01 past the film · step [\d,]+$/);
    perform(4.4);
    expect(line(container)).toMatch(/^00:05 past the film · body 3 is out of the picture, /);
    // Back at ten seconds, and two more of the three together again.
    framesUntil(() => phase(container) === 'resting', 80);
    expect(clockNow).toBeGreaterThan(800 + 31_000 + 11_900);
    rest();
    expect(line(container)).toBe(
      'Body 3 left the picture 4.0 seconds after the film ended. It came back 6.0 seconds later. All three are still bound to one another at step 8,000,000, where the record stops looking.',
    );
  });

  it('keeps Further on in its place, dimmed where it would save nothing, and goes to a little before the next moment', () => {
    const path = pathOf({ seconds: 80, out: [{ body: 2, from: 40, to: 50 }] });
    const { container } = performed(orbit, path);
    pastTheFrame();
    perform(1);
    const all = [t.beyondOnward, t.beyondTell, t.afterTheFrame, t.oneInATrillion];
    expect(words(container)).toEqual(all);
    const onward = word(t.beyondOnward);
    expect(onward).not.toHaveAttribute('aria-disabled');
    onward.focus();
    fireEvent.click(onward);
    nextFrame();
    // Four seconds before body 3 leaves: near enough to watch it go.
    expect(line(container)).toBe('00:36 past the film · step 2,198,700');
    // With the moment that near there is nothing to skip: the word stays where it is, with the
    // focus that pressed it, says it is not to be pressed, and does nothing if it is.
    expect(words(container)).toEqual(all);
    expect(word(t.beyondOnward)).toBe(onward);
    expect(document.activeElement).toBe(onward);
    expect(onward).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(onward);
    nextFrame();
    expect(line(container)).toMatch(/^00:36 past the film · step /);
    perform(5);
    expect(line(container)).toMatch(/^00:4[01] past the film · body 3 is out of the picture/);
    // And on again, to a little before its return.
    expect(onward).not.toHaveAttribute('aria-disabled');
    fireEvent.click(onward);
    nextFrame();
    expect(line(container)).toMatch(/^00:46 past the film · body 3 is out of the picture/);
  });

  it('waits where it stands while the section is out of view, and goes on when it is back', () => {
    const { container } = performed(orbit, pathOf({ seconds: 30 }));
    pastTheFrame();
    perform(2);
    expect(line(container)).toMatch(/^00:0[12] past the film/);
    view(false);
    const waiting = line(container);
    expect(frames.size).toBe(0);
    clockNow += 60_000;
    view(true);
    perform(1);
    // A minute away is not a minute performed.
    expect(line(container)).toMatch(/^00:0[23] past the film/);
    expect(line(container)).not.toBe(waiting);
  });

  it('brings the whole picture just under the running head as a performance begins, and keeps the words under the hand on the way back', () => {
    const scrolledTo = vi.fn();
    vi.stubGlobal('scrollTo', scrolledTo);
    const { container } = performed(orbit, pathOf({ seconds: 20 }));
    // The running head is 48 px tall: the section's scroll margin says so.
    const style = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) =>
      element === sectionOf(container)
        ? new Proxy(style(element, pseudo), {
            get: (real, key) => {
              if (key === 'scrollMarginTop') return '48px';
              const value = Reflect.get(real, key);
              return typeof value === 'function' ? value.bind(real) : value;
            },
          })
        : style(element, pseudo),
    );
    // The picture runs under the fold of a 768 px window: its line and its words are out of sight.
    const boxes: { picture: Box; beneath: Box; words: Box } = {
      picture: [302, 1002],
      beneath: [1011, 1140],
      words: [1096, 1140],
    };
    laidOut(boxes);
    pastTheFrame();
    // Not in the frame of the change of layout, which WebKit's scroll anchoring answers…
    expect(scrolledTo).not.toHaveBeenCalled();
    nextFrame();
    expect(scrolledTo).not.toHaveBeenCalled();
    // …but two frames on, measured again there: the picture has moved a line down meanwhile.
    boxes.picture = [329, 1029];
    nextFrame();
    // It comes to stand 6 px under the running head, at the visitor's pace.
    expect(scrolledTo.mock.calls).toEqual([[{ top: 329 - 48 - 6, behavior: 'smooth' }]]);
    // All of it in view under the head, Again moves nothing: neither as the question is asked
    // again, nor as it is answered.
    boxes.picture = [54, 574];
    boxes.beneath = [583, 744];
    fireEvent.click(word(t.beyondTell));
    fireEvent.click(word(t.again));
    nextFrame();
    nextFrame();
    fireEvent.click(word(t.beyondStayFrame));
    nextFrame();
    nextFrame();
    expect(scrolledTo).toHaveBeenCalledTimes(1);
    // The picture's top behind the head is not in view: it is brought out from under it, as
    // the question is asked.
    boxes.picture = [40, 560];
    fireEvent.click(word(t.beyondTell));
    fireEvent.click(word(t.again));
    nextFrame();
    nextFrame();
    expect(scrolledTo.mock.calls[1]).toEqual([{ top: 40 - 48 - 6, behavior: 'smooth' }]);
    boxes.picture = [54, 574];
    fireEvent.click(word(t.beyondStayFrame));
    nextFrame();
    nextFrame();
    expect(scrolledTo).toHaveBeenCalledTimes(2);
    // Back at the frame the caption and the score return above the words, 72 px lower. They are
    // put back where they stood under the hand: at once, before the page is painted again.
    boxes.words = (pastFrame) => (pastFrame ? [700, 744] : [772, 816]);
    pastTheFrame();
    expect(scrolledTo.mock.calls[2]).toEqual([{ top: 72, behavior: 'instant' }]);
    // Two frames on, the browser has answered the change its own way: 27 px more are put right.
    boxes.words = [727, 771];
    nextFrame();
    nextFrame();
    expect(scrolledTo.mock.calls[3]).toEqual([{ top: 27, behavior: 'instant' }]);
    expect(scrolledTo).toHaveBeenCalledTimes(4);
  });

  it('moves nothing on the way back where the words were not in view', () => {
    const scrolledTo = vi.fn();
    vi.stubGlobal('scrollTo', scrolledTo);
    performed(orbit, pathOf({ seconds: 20 }), { still: true });
    // All of it in view as the performance begins: nothing moves.
    const boxes: { picture: Box; beneath: Box; words: Box } = {
      picture: [54, 574],
      beneath: [583, 744],
      words: [700, 744],
    };
    laidOut(boxes);
    pastTheFrame();
    expect(scrolledTo).not.toHaveBeenCalled();
    // The visitor scrolls the words under the fold, and leaves by the keyboard: the words are
    // not brought back from where they had put them.
    boxes.words = (pastFrame) => (pastFrame ? [946, 990] : [1018, 1062]);
    pastTheFrame();
    nextFrame();
    nextFrame();
    expect(scrolledTo).not.toHaveBeenCalled();
  });

  it('carries on at another size, and draws nothing there once the still has returned', () => {
    const { container } = performed(ejected, pathOf({ seconds: 20 }));
    pastTheFrame();
    nextFrame();
    perform(3);
    expect(line(container)).toMatch(/^00:0[23] past the film/);
    // The observer's first report is of the size the picture already has. The second is a
    // resize: the picture is drawn again where the performance stands, and it goes on.
    resize(/_stage_/);
    resize(/_stage_/);
    expect(phase(container)).toBe('running');
    nextFrame();
    perform(0.3);
    expect(line(container)).toMatch(/^00:03 past the film/);
    // Told, the still stands over the last frame: a resize draws nothing and starts nothing.
    fireEvent.click(word(t.beyondTell));
    expect(phase(container)).toBe('told');
    calls = [];
    resize(/_stage_/);
    expect(calls).toHaveLength(0);
    expect(frames.size).toBe(0);
  });

  it('fits the plate again when what stands beneath it takes another height, as the section then stands', () => {
    let beneathBottom = 700;
    const { container } = performed(ejected, pathOf({ seconds: 20 }));
    laidOut({ picture: [100, 500], beneath: () => [520, beneathBottom] });
    const measured = () => sectionOf(container).style.getPropertyValue('--beneath-measured');
    // At the frame the plate is the size it always was, whatever stands beneath it.
    resize(/_score_/);
    expect(measured()).toBe('');
    pastTheFrame();
    expect(measured()).toBe('212px');
    // A telling takes a line more: the room beneath the picture is measured again.
    beneathBottom = 730;
    resize(/_score_/);
    expect(measured()).toBe('242px');
    // Back at the frame, the same report fits nothing; past it again, it fits.
    fireEvent.click(afterTheFrame());
    expect(phase(container)).toBeNull();
    resize(/_score_/);
    expect(measured()).toBe('');
    pastTheFrame();
    resize(/_score_/);
    expect(measured()).toBe('242px');
  });

  describe('whom to stay with', () => {
    /** Where the film left the three in the work's frame, apart enough that each can be found. */
    const places: [number, number][] = [
      [1_400, 900],
      [1_728, 1_117],
      [2_100, 1_300],
    ];
    /** A place in the frame's pixels as the 900 by 580 canvas draws it. */
    const drawn = ([x, y]: [number, number]) => [
      Math.round((x * 900) / 3_456),
      Math.round((y * 580) / 2_234),
    ];
    /** Body 2 goes three seconds after the film, and does not come back. */
    const leaving = () => pathOf({ seconds: 30, places, out: [{ body: 1, from: 3, far: 1.4 }] });
    const stayWith = (body: number) => word(fill(t.beyondStayBody, { body }));
    const answers = (container: HTMLElement) =>
      [...container.querySelectorAll('#orbit [class*="answers"] button')].map(
        (answer) => answer.textContent,
      );
    const stageOf = (container: HTMLElement) =>
      container.querySelector<HTMLElement>('figure > div')!;
    /** The window's placed samples, with the three left where a test wants them at its end. */
    const framedWith = (ends: [number, number][]) => {
      const framed = framedOf();
      ends.forEach(([x, y], body) => {
        framed.pixels[framed.count * 6 + body * 2] = x;
        framed.pixels[framed.count * 6 + body * 2 + 1] = y;
      });
      return framed;
    };
    /** Three bodies well apart: where the choosing draws them, in CSS pixels of the stage. */
    const apart: [number, number][] = [
      [800, 600],
      [1_900, 1_500],
      [2_700, 500],
    ];
    const css = ([x, y]: [number, number]) => [(x * 900) / 3_456, (y * 580) / 2_234];
    const arcsDrawn = () => calls.filter((call) => call.name === 'arc');

    it('asks before anything runs, with the three numbered in the picture', () => {
      const { container } = performed(ejected, leaving(), { framed: framedWith(apart) });
      calls = [];
      afterTheFrame().focus();
      fireEvent.click(afterTheFrame());
      expect(phase(container)).toBe('choosing');
      expect(afterTheFrame()).toHaveAttribute('aria-pressed', 'true');
      // The question, in the voice of what will be told. The keyboard and the screen reader are
      // taken to it, so it is said by the focus; it is not also a live region.
      expect(line(container)).toBe(t.beyondAsk);
      expect(document.activeElement).toBe(telling(container));
      expect(telling(container)).not.toHaveAttribute('aria-live');
      // Its answers stand under it, as a group it names, in its order: the three by their
      // numbers, then the frame; each says what it does, and its letters are in that (WCAG 2.5.3).
      expect(answers(container)).toEqual(['1', '2', '3', t.beyondFrame]);
      const group = screen.getByRole('group', { name: t.beyondAsk });
      expect(group.querySelectorAll('button')).toHaveLength(4);
      expect(stayWith(2)).toHaveTextContent('2');
      expect(word(t.beyondStayFrame)).toHaveTextContent(t.beyondFrame);
      expect(t.beyondStayFrame.toLowerCase()).toContain(t.beyondFrame.toLowerCase());
      // The words beside the line are the two that stay: no word stands where an answer will go.
      expect(words(container)).toEqual([t.afterTheFrame, t.oneInATrillion]);
      // The note above the picture says both answers; the picture is labelled; and room is kept
      // under it for a telling that begins by saying whom the picture stayed with.
      expect(screen.getByText(t.afterTheFrameNoteAsk)).toBeInTheDocument();
      const label = container.querySelector('figcaption span')!;
      expect(label).toHaveTextContent(t.analysisNotWork);
      expect(label).toHaveAttribute('data-shown', 'true');
      expect(label).toHaveAttribute('aria-hidden', 'false');
      // The window drawn whole, the three where the film left them, and by each its own number:
      // set off from it, away from the middle of the three.
      expect(calls.some((call) => call.name === 'stroke')).toBe(true);
      expect(arcsDrawn()).toHaveLength(3);
      const middle = [0, 1].map(
        (axis) => (css(apart[0])[axis] + css(apart[1])[axis] + css(apart[2])[axis]) / 3,
      );
      for (const body of [0, 1, 2]) {
        const [x, y] = css(apart[body]);
        const figures = calls.filter(
          (call) => call.name === 'fillText' && call.args[0] === String(body + 1),
        );
        expect(figures.length).toBeGreaterThan(0);
        const [, fx, fy] = figures.at(-1)!.args as [string, number, number];
        // Outlined where it stands, so that it reads on whatever the still shows there.
        const outline = calls.find(
          (call) => call.name === 'strokeText' && call.args[0] === String(body + 1),
        );
        expect(outline?.args.slice(1)).toEqual([fx, fy]);
        const off = Math.hypot(fx - x, fy - y);
        expect(off).toBeGreaterThan(14);
        expect(off).toBeLessThan(20);
        // Nearer its own body than any other, and on the side away from the middle.
        for (const other of [0, 1, 2])
          if (other !== body)
            expect(
              Math.hypot(fx - css(apart[other])[0], fy - css(apart[other])[1]),
            ).toBeGreaterThan(off);
        expect(Math.hypot(fx - middle[0], fy - middle[1])).toBeGreaterThan(
          Math.hypot(x - middle[0], y - middle[1]),
        );
      }
      // Nothing plays, and nothing is counted, until the visitor answers.
      expect(frames.size).toBe(0);
      expect(sectionOf(container)).not.toHaveAttribute('data-kept');
    });

    it('keeps a number on the picture, and off another body, where its own side has no room', () => {
      // Body 1 stands at the top edge, where "away from the middle" points off the sheet; body 3
      // stands where body 2's number would go.
      const crowded: [number, number][] = [
        [1_700, 110],
        [1_700, 1_400],
        [1_700, 1_465],
      ];
      performed(ejected, leaving(), { framed: framedWith(crowded) });
      calls = [];
      fireEvent.click(afterTheFrame());
      for (const body of [0, 1, 2]) {
        const [, fx, fy] = calls
          .filter((call) => call.name === 'fillText' && call.args[0] === String(body + 1))
          .at(-1)!.args as [string, number, number];
        // Whole on the 900 by 580 canvas…
        expect(fx).toBeGreaterThanOrEqual(7);
        expect(fx).toBeLessThanOrEqual(893);
        expect(fy).toBeGreaterThanOrEqual(7);
        expect(fy).toBeLessThanOrEqual(573);
        // …and clear of the other two bodies' lights.
        for (const other of [0, 1, 2])
          if (other !== body)
            expect(
              Math.hypot(fx - css(crowded[other])[0], fy - css(crowded[other])[1]),
            ).toBeGreaterThan(12);
      }
    });

    // One section a test: four of them in one test ran it close to its budget where coverage
    // is counted.
    it.each([
      ['top', [1_700, 40]],
      ['bottom', [1_700, 2_194]],
      ['left', [40, 1_100]],
      ['right', [3_416, 1_100]],
    ] as [string, [number, number]][])(
      'turns a number onto the picture at its %s edge',
      (_name, edge) => {
        // A body 10 px from the edge, the other two well inside: its number's first place,
        // away from the middle of the three, is off the picture.
        performed(ejected, leaving(), {
          framed: framedWith([edge, [1_500, 1_000], [1_900, 1_200]]),
        });
        calls = [];
        fireEvent.click(afterTheFrame());
        const [, fx, fy] = calls
          .filter((call) => call.name === 'fillText' && call.args[0] === '1')
          .at(-1)!.args as [string, number, number];
        // Whole on the 900 by 580 canvas…
        expect(fx).toBeGreaterThanOrEqual(7.8);
        expect(fx).toBeLessThanOrEqual(892.2);
        expect(fy).toBeGreaterThanOrEqual(7.8);
        expect(fy).toBeLessThanOrEqual(572.2);
        // …and turned about its body, at its own distance from it: not pushed in against it.
        const [x, y] = css(edge);
        const off = Math.hypot(fx - x, fy - y);
        expect(off).toBeGreaterThan(14);
        expect(off).toBeLessThan(20);
      },
    );

    it('keeps each number nearer its own body than any other', () => {
      // Body 2 stands 24 px from body 1, where body 1's number would first go: 17 px from
      // body 2, a little nearer it than its own. Body 3 is far to the right.
      const neighbours: [number, number][] = [
        [1_152, 1_155],
        [1_084, 1_217],
        [3_072, 1_155],
      ];
      performed(ejected, leaving(), { framed: framedWith(neighbours) });
      calls = [];
      fireEvent.click(afterTheFrame());
      for (const body of [0, 1, 2]) {
        const [, fx, fy] = calls
          .filter((call) => call.name === 'fillText' && call.args[0] === String(body + 1))
          .at(-1)!.args as [string, number, number];
        const far = (of: number) =>
          Math.hypot(fx - css(neighbours[of])[0], fy - css(neighbours[of])[1]);
        for (const other of [0, 1, 2])
          if (other !== body) expect(far(other)).toBeGreaterThanOrEqual(far(body) - 1e-6);
      }
    });

    it('numbers each body once where the work is drawn more than once, and rings and takes every copy', () => {
      // A work drawn twice: the second copy of each body stands well away from the first.
      const second = apart.map(([x, y]): [number, number] => [x + 500, y + 300]);
      const framed = framedOf(2);
      [...apart, ...second].forEach(([x, y], drawn) => {
        framed.pixels[framed.count * 12 + drawn * 2] = x;
        framed.pixels[framed.count * 12 + drawn * 2 + 1] = y;
      });
      const twice = pathOf({
        seconds: 30,
        places,
        copies: 2,
        out: [{ body: 1, from: 3, far: 1.4 }],
      });
      const { container } = performed(ejected, twice, { framed });
      calls = [];
      fireEvent.click(afterTheFrame());
      // Six lights, and three numbers for three answers: each stands in one place, by the first
      // copy of its body.
      expect(arcsDrawn()).toHaveLength(6);
      for (const body of [0, 1, 2]) {
        const figures = calls
          .filter((call) => call.name === 'fillText' && call.args[0] === String(body + 1))
          .map(({ args }) => [args[1] as number, args[2] as number]);
        expect(new Set(figures.map(([x, y]) => `${Math.round(x)} ${Math.round(y)}`)).size).toBe(1);
        const [fx, fy] = figures[0];
        expect(Math.hypot(fx - css(apart[body])[0], fy - css(apart[body])[1])).toBeLessThan(20);
      }
      // Pointing at a number rings its body in both copies.
      calls = [];
      fireEvent.focus(stayWith(2));
      expect(arcsDrawn().map(({ args }) => (args as number[]).slice(0, 2).map(Math.round))).toEqual(
        [css(apart[1]).map(Math.round), css(second[1]).map(Math.round)],
      );
      // And the copy that bears no number answers a press for its body all the same.
      const [x, y] = css(second[2]);
      fireEvent.click(stageOf(container), { clientX: x + 3, clientY: y });
      expect(sectionOf(container)).toHaveAttribute('data-kept', '3');
    });

    it('stays with the body the record finds free: brought to the middle, then alone', () => {
      const { container } = performed(ejected, leaving());
      fireEvent.click(afterTheFrame());
      const answer = stayWith(2);
      answer.focus();
      calls = [];
      fireEvent.click(answer);
      expect(phase(container)).toBe('running');
      expect(sectionOf(container)).toHaveAttribute('data-kept', '2');
      // The word that answered is gone: the focus is on the line, which says first whom the
      // picture stays with.
      expect(document.activeElement).toBe(telling(container));
      expect(line(container)).toBe('Staying with body 2 · 00:00 past the film · step 1,000,000');
      expect(answers(container)).toEqual([]);
      // The note above the picture has not changed: nothing moves as the answer is given.
      expect(screen.getByText(t.afterTheFrameNoteAsk)).toBeInTheDocument();
      // The three stand first where the film left them in the work's own frame…
      expect(lights()).toEqual(places.map(drawn));
      // …and are brought, all by one move, until body 2 stands at the middle. Time waits.
      nextFrame();
      clockNow += 600;
      nextFrame();
      expect(lights()).toEqual(places.map(([x, y]) => drawn([x, y])));
      expect(line(container)).toBe('Staying with body 2 · 00:00 past the film · step 1,000,000');
      clockNow += 600;
      nextFrame();
      // Body 2 was at the middle already: the picture is on it without a move.
      expect(lights()[1]).toEqual([450, 290]);
      nextFrame();
      perform(3.5);
      // From body 2, it is the other two that go: its own light holds the middle.
      expect(lights()[1]).toEqual([450, 290]);
      expect(lights()[0][0]).toBeLessThan(0);
      expect(lights()[2][0]).toBeLessThan(0);
      expect(line(container)).toBe(
        'Staying with body 2 · 00:03 past the film · bodies 1 and 3 are out of the picture',
      );
      // Eight seconds on the one body, alone; then the still, the silence, and what happened.
      framesUntil(() => phase(container) === 'resting', 120);
      expect(clockNow).toBeGreaterThan(800 + 31_000 + 1_200 + 10_900);
      // The line is made live for the rest, while it stands empty: what comes is said.
      expect(telling(container)).toHaveAttribute('aria-live', 'polite');
      rest();
      expect(line(container)).toBe(
        'The picture stayed with body 2. Body 2 was alone in it from 3.0 seconds after the film ended. The record finds body 2 no longer bound to the other two at step 1,210,000.',
      );
    });

    it('brings the body to the middle from where the film left it, and only then goes further on', () => {
      // Body 2 goes half a minute after the film: Further on would save the wait.
      const later = pathOf({ seconds: 60, places, out: [{ body: 1, from: 30, far: 1.4 }] });
      const { container } = performed(ejected, later);
      fireEvent.click(afterTheFrame());
      fireEvent.click(stayWith(1));
      // Body 1 stood up and to the left of the middle: all three move by its way there.
      const by = [1_728 - 1_400, 1_117 - 900];
      const moved = (share: number) =>
        places.map(([x, y]) => drawn([x + by[0] * share, y + by[1] * share]));
      expect(lights()).toEqual(moved(0));
      // Until they have arrived, time waits, and there is nothing to go further on to.
      expect(word(t.beyondOnward)).toHaveAttribute('aria-disabled', 'true');
      nextFrame();
      clockNow += 600;
      nextFrame();
      expect(lights()).toEqual(moved(0.5));
      fireEvent.click(word(t.beyondOnward));
      expect(line(container)).toBe('Staying with body 1 · 00:00 past the film · step 1,000,000');
      // A redraw on the way (the section out of view and back) carries the bringing on: the
      // three are not taken back to where the film left them.
      view(false);
      view(true);
      expect(lights()).toEqual(moved(0.5));
      nextFrame();
      clockNow += 600;
      nextFrame();
      expect(lights()).toEqual(moved(1));
      expect(word(t.beyondOnward)).not.toHaveAttribute('aria-disabled');
      // Then time resumes; the body it stays with does not move again. Further on goes to four
      // seconds before the leaving, and the picture is drawn there at once, with nothing brought.
      nextFrame();
      fireEvent.click(word(t.beyondOnward));
      expect(line(container)).toMatch(
        /^Staying with body 1 · 00:2[56] past the film · step 1,86\d,\d00$/,
      );
      expect(lights()).toEqual(moved(1));
      perform(4.5);
      expect(lights()[0]).toEqual([450, 290]);
      expect(line(container)).toMatch(
        /^Staying with body 1 · 00:30 past the film · body 2 is out of the picture, 1\.\d picture widths away$/,
      );
      // Eight seconds more on the two that stay; then told, with the one that stayed by it.
      framesUntil(() => phase(container) === 'resting', 120);
      rest();
      expect(line(container)).toBe(
        'The picture stayed with body 1. Body 2 left the picture 30.0 seconds after the film ended. 8.0 seconds later body 3 was still in it. The record finds body 2 no longer bound to the other two at step 1,210,000.',
      );
      // Again asks the question again, and takes the keyboard to it.
      const again = word(t.again);
      again.focus();
      fireEvent.click(again);
      expect(phase(container)).toBe('choosing');
      expect(sectionOf(container)).not.toHaveAttribute('data-kept');
      expect(document.activeElement).toBe(telling(container));
      // Where Again stood there is no word now: only the two that stay.
      expect(words(container)).toEqual([t.afterTheFrame, t.oneInATrillion]);
    });

    it('rings the body a word points at, and the one a mouse is on, without drawing the picture again', () => {
      const { container } = performed(ejected, leaving(), { framed: framedWith(apart) });
      fireEvent.click(afterTheFrame());
      const stage = stageOf(container);
      calls = [];
      fireEvent.focus(stayWith(3));
      // One ring, about body 3, and the numbers again: the window and the lights are not redrawn.
      expect(arcsDrawn()).toHaveLength(1);
      expect((arcsDrawn()[0].args as number[]).slice(0, 2).map(Math.round)).toEqual(
        css(apart[2]).map(Math.round),
      );
      expect(calls.some((call) => call.name === 'lineTo')).toBe(false);
      expect(calls.some((call) => call.name === 'fillText')).toBe(true);
      // A mouse near body 1 rings it too, and makes the stage say it can be pressed: Enter would
      // stay with the one, a click with the other.
      const [x, y] = css(apart[0]);
      calls = [];
      fireEvent.pointerMove(stage, { clientX: x + 10, clientY: y - 8, pointerType: 'mouse' });
      expect(stage).toHaveAttribute('data-pick');
      expect(arcsDrawn()).toHaveLength(2);
      // A finger does not hover: its move rings nothing.
      fireEvent.pointerLeave(stage, { pointerType: 'mouse' });
      fireEvent.pointerMove(stage, { clientX: x + 10, clientY: y - 8, pointerType: 'touch' });
      expect(stage).not.toHaveAttribute('data-pick');
      calls = [];
      fireEvent.blur(stayWith(3));
      // The numbers' layer is drawn again, without a ring: not merely left as it was.
      expect(calls.some((call) => call.name === 'clearRect')).toBe(true);
      expect(calls.some((call) => call.name === 'fillText')).toBe(true);
      expect(arcsDrawn()).toHaveLength(0);
      // A mouse on a word rings its body as the focus does; a finger on its way to a press
      // changes nothing before the press.
      calls = [];
      fireEvent.pointerEnter(stayWith(2), { pointerType: 'touch' });
      expect(calls).toEqual([]);
      fireEvent.pointerEnter(stayWith(2), { pointerType: 'mouse' });
      expect(arcsDrawn()).toHaveLength(1);
      expect((arcsDrawn()[0].args as number[]).slice(0, 2).map(Math.round)).toEqual(
        css(apart[1]).map(Math.round),
      );
      calls = [];
      fireEvent.pointerLeave(stayWith(2), { pointerType: 'mouse' });
      expect(arcsDrawn()).toHaveLength(0);
    });

    it('draws the body once where its copies stand on one another, and the window as they are brought', () => {
      // A work drawn twice: at the middle both copies of the body the picture stays with coincide.
      const twice = pathOf({
        seconds: 30,
        places,
        copies: 2,
        out: [{ body: 1, from: 3, far: 1.4 }],
      });
      performed(ejected, twice, { framed: framedOf(2) });
      fireEvent.click(afterTheFrame());
      calls = [];
      fireEvent.click(stayWith(1));
      // The window's strokes are drawn whole once more, for the stylesheet to let go with the
      // still, and all six lights stand where the film left them.
      expect(calls.filter((call) => call.name === 'lineTo').length).toBeGreaterThan(50_000);
      expect(arcsDrawn()).toHaveLength(6);
      // A quarter of the way through, the move has barely begun: it eases in.
      nextFrame();
      clockNow += 300;
      calls = [];
      nextFrame();
      expect(arcsDrawn()).toHaveLength(6);
      const eased = 4 * 0.25 ** 3;
      expect(lights()[0]).toEqual(
        drawn([1_400 + (1_728 - 1_400) * eased, 900 + (1_117 - 900) * eased]),
      );
      // Arrived, the second copy of body 1 is not drawn on the first: five lights a frame.
      clockNow += 900;
      nextFrame();
      calls = [];
      nextFrame();
      expect(arcsDrawn()).toHaveLength(5);
      // And it draws no trail: it does not move in its own picture. Four strokes a frame, for
      // the two copies of the other two.
      calls = [];
      perform(1);
      const strokes = calls.filter((call) => call.name === 'stroke').length;
      const frames_ = calls.filter((call) => call.name === 'clearRect').length;
      expect(frames_).toBe(10);
      expect(strokes).toBe(frames_ * 4);
    });

    it('takes a press on a body within its reach, or on its number, and none beside them', () => {
      const { container } = performed(ejected, leaving(), { framed: framedWith(apart) });
      fireEvent.click(afterTheFrame());
      const stage = stageOf(container);
      const [x, y] = css(apart[0]);
      // Towards the middle of the three, where its number is not: 23 px is past its reach…
      const middle = [0, 1].map(
        (axis) => (css(apart[0])[axis] + css(apart[1])[axis] + css(apart[2])[axis]) / 3,
      );
      const far = Math.hypot(middle[0] - x, middle[1] - y);
      const towards = (px: number) => ({
        clientX: x + ((middle[0] - x) / far) * px,
        clientY: y + ((middle[1] - y) / far) * px,
      });
      fireEvent.click(stage, towards(23));
      expect(phase(container)).toBe('choosing');
      // …and its number, 17 px the other way, answers for it as far as it is drawn.
      const [, fx, fy] = calls
        .filter((call) => call.name === 'fillText' && call.args[0] === '1')
        .at(-1)!.args as [string, number, number];
      const out = [(fx - x) / Math.hypot(fx - x, fy - y), (fy - y) / Math.hypot(fx - x, fy - y)];
      const past = (px: number) => ({
        clientX: fx + out[0] * px,
        clientY: fy + out[1] * px,
        pointerType: 'mouse',
      });
      // Ten pixels beyond the number, 27 from the body: the number's own reach.
      fireEvent.pointerMove(stage, past(10));
      expect(stage).toHaveAttribute('data-pick');
      fireEvent.pointerMove(stage, past(15));
      expect(stage).not.toHaveAttribute('data-pick');
      // 21 px from the body is within it: the press answers the question.
      fireEvent.click(stage, towards(21));
      expect(phase(container)).toBe('running');
      expect(sectionOf(container)).toHaveAttribute('data-kept', '1');
      expect(stage).not.toHaveAttribute('data-pick');
    });

    it('takes a press on a number for the body that bears it', () => {
      const { container } = performed(ejected, leaving(), { framed: framedWith(apart) });
      fireEvent.click(afterTheFrame());
      // Where the numeral 2 is drawn: off its body, past the body's own reach.
      const [, fx, fy] = calls
        .filter((call) => call.name === 'fillText' && call.args[0] === '2')
        .at(-1)!.args as [string, number, number];
      const [x, y] = css(apart[1]);
      expect(Math.hypot(fx - x, fy - y)).toBeGreaterThan(10);
      fireEvent.click(stageOf(container), { clientX: fx, clientY: fy });
      expect(phase(container)).toBe('running');
      expect(sectionOf(container)).toHaveAttribute('data-kept', '2');
    });

    it('takes a finger’s press at two device pixels to one, but not where two bodies are under it', () => {
      vi.stubGlobal('devicePixelRatio', 2);
      // Bodies 1 and 2 stand 10 px apart on the stage; body 3 well away.
      const close: [number, number][] = [
        [1_000, 1_000],
        [1_040, 1_000],
        [2_500, 1_500],
      ];
      const { container } = performed(ejected, leaving(), { framed: framedWith(close) });
      fireEvent.click(afterTheFrame());
      const stage = stageOf(container);
      const between = {
        clientX: (css(close[0])[0] + css(close[1])[0]) / 2,
        clientY: css(close[0])[1],
      };
      // A finger between the two covers both: the press is not taken, and the words answer.
      fireEvent.pointerDown(stage, { ...between, pointerType: 'touch' });
      fireEvent.click(stage, between);
      expect(phase(container)).toBe('choosing');
      // On body 3, with no hover before it, it is taken: found in CSS pixels, not the canvas's.
      const [x, y] = css(close[2]);
      fireEvent.pointerDown(stage, { clientX: x + 6, clientY: y + 6, pointerType: 'touch' });
      fireEvent.click(stage, { clientX: x + 6, clientY: y + 6 });
      expect(phase(container)).toBe('running');
      expect(sectionOf(container)).toHaveAttribute('data-kept', '3');
    });

    it('lets a mouse choose between two bodies a finger could not tell apart', () => {
      const close: [number, number][] = [
        [1_000, 1_000],
        [1_040, 1_000],
        [2_500, 1_500],
      ];
      const { container } = performed(ejected, leaving(), { framed: framedWith(close) });
      fireEvent.click(afterTheFrame());
      const stage = stageOf(container);
      // Nearer body 2 than body 1: the nearest is the one pressed.
      const at = { clientX: css(close[1])[0] + 2, clientY: css(close[1])[1] };
      fireEvent.pointerDown(stage, { ...at, pointerType: 'mouse' });
      fireEvent.click(stage, at);
      expect(sectionOf(container)).toHaveAttribute('data-kept', '2');
    });

    it('takes a finger at its word where its body is clearly the nearer, and shows the two it cannot tell apart', () => {
      // Bodies 1 and 2 stand 30 px apart on the stage; body 3 well away.
      const near: [number, number][] = [
        [1_000, 1_000],
        [1_115, 1_000],
        [2_500, 1_500],
      ];
      const { container } = performed(ejected, leaving(), { framed: framedWith(near) });
      fireEvent.click(afterTheFrame());
      const stage = stageOf(container);
      const [x, y] = css(near[0]);
      const rings = () =>
        arcsDrawn().map(({ args }) => (args as number[]).slice(0, 2).map(Math.round));
      // Midway between the two a finger covers both. The press is not taken, and both are
      // ringed: it is seen to have been taken in, and the words answer.
      calls = [];
      const midway = { clientX: x + 15, clientY: y };
      fireEvent.pointerDown(stage, { ...midway, pointerType: 'touch' });
      fireEvent.click(stage, midway);
      expect(phase(container)).toBe('choosing');
      expect(rings()).toEqual([css(near[0]).map(Math.round), css(near[1]).map(Math.round)]);
      // The next press begins afresh. On body 1 itself, body 2 is thirty pixels off: it is
      // clearly the farther, and the finger is taken at its word.
      calls = [];
      fireEvent.pointerDown(stage, { clientX: x, clientY: y, pointerType: 'touch' });
      expect(rings()).toEqual([]);
      fireEvent.click(stage, { clientX: x, clientY: y });
      expect(phase(container)).toBe('running');
      expect(sectionOf(container)).toHaveAttribute('data-kept', '1');
    });

    it('takes a pen as it takes a mouse: it hovers, and points finely', () => {
      const close: [number, number][] = [
        [1_000, 1_000],
        [1_040, 1_000],
        [2_500, 1_500],
      ];
      const { container } = performed(ejected, leaving(), { framed: framedWith(close) });
      fireEvent.click(afterTheFrame());
      const stage = stageOf(container);
      const at = { clientX: css(close[1])[0] + 2, clientY: css(close[1])[1] };
      fireEvent.pointerMove(stage, { ...at, pointerType: 'pen' });
      expect(stage).toHaveAttribute('data-pick');
      fireEvent.pointerDown(stage, { ...at, pointerType: 'pen' });
      fireEvent.click(stage, at);
      expect(sectionOf(container)).toHaveAttribute('data-kept', '2');
    });

    it('does not take a drag across the picture that ends on a body', () => {
      const { container } = performed(ejected, leaving(), { framed: framedWith(apart) });
      fireEvent.click(afterTheFrame());
      const stage = stageOf(container);
      const [x, y] = css(apart[0]);
      // The press went down on bare picture, 250 px away, and came up on body 1.
      fireEvent.pointerDown(stage, { clientX: x + 250, clientY: y, pointerType: 'mouse' });
      fireEvent.click(stage, { clientX: x, clientY: y });
      expect(phase(container)).toBe('choosing');
      // Down and up on the body is a press on it.
      fireEvent.pointerDown(stage, { clientX: x + 3, clientY: y, pointerType: 'mouse' });
      fireEvent.click(stage, { clientX: x, clientY: y });
      expect(sectionOf(container)).toHaveAttribute('data-kept', '1');
    });

    it('does not take a pointer’s press on what came, less than four tenths of a second ago, where the last press landed', () => {
      const { container } = performed(ejected, leaving(), { framed: framedWith(apart) });
      /** A pointer's press: down and up at one place. False where the press was not followed. */
      const press = (target: Element, at: { clientX: number; clientY: number }) => {
        fireEvent.pointerDown(target, { ...at, pointerType: 'mouse' });
        return fireEvent.click(target, { ...at, detail: 1 });
      };
      // After the frame is pressed where body 1 will stand: the page may bring the picture
      // under the very pointer that asked for it.
      const [x, y] = css(apart[0]);
      const here = { clientX: x, clientY: y };
      clockNow += 1_000;
      press(afterTheFrame(), here);
      expect(phase(container)).toBe('choosing');
      // The second press of a double click, 150 ms on, would answer a question nobody has
      // read: it is not taken. Nor is a third: it is measured against the press the picture
      // came after, not against the second.
      clockNow += 150;
      press(stageOf(container), here);
      expect(phase(container)).toBe('choosing');
      clockNow += 150;
      press(stageOf(container), here);
      expect(phase(container)).toBe('choosing');
      // Once the picture has stood four tenths of a second, a press there is an answer.
      clockNow += 100;
      press(stageOf(container), here);
      expect(sectionOf(container)).toHaveAttribute('data-kept', '1');
      // Tell me gives way to the way into the record, which comes to stand where it was
      // pressed: a second press there does not follow it, nor a third, and one made in its
      // own time does.
      clockNow += 1_000;
      const there = { clientX: 700, clientY: 560 };
      press(word(t.beyondTell), there);
      expect(phase(container)).toBe('told');
      const record = screen.getByRole('link', { name: t.beyondRecord });
      clockNow += 150;
      expect(press(record, there)).toBe(false);
      clockNow += 150;
      expect(press(record, there)).toBe(false);
      clockNow += 100;
      expect(press(record, there)).toBe(true);
    });

    it('takes at once a pointer’s press that lands elsewhere, or on a word that was there all along', () => {
      const { container } = performed(ejected, leaving(), { still: true });
      const press = (target: Element, at: { clientX: number; clientY: number }) => {
        fireEvent.pointerDown(target, { ...at, pointerType: 'mouse' });
        fireEvent.click(target, { ...at, detail: 1 });
      };
      clockNow += 1_000;
      press(afterTheFrame(), { clientX: 800, clientY: 560 });
      // The answers came with that press, and stand elsewhere: one is pressed in the same
      // instant, as a hand that knows the page (or a test that drives it) may.
      press(stayWith(1), { clientX: 120, clientY: 500 });
      expect(sectionOf(container)).toHaveAttribute('data-kept', '1');
      // Further on came with that answer, and is stepped with again and again in one place
      // from its first tenth of a second: it was there when the first press of it was made,
      // so that press was the visitor's own, and so is every one after.
      const onward = { clientX: 640, clientY: 560 };
      clockNow += 50;
      press(word(t.beyondOnward), onward);
      expect(line(container)).toMatch(/^Staying with body 1 · 00:04 past the film/);
      clockNow += 50;
      press(word(t.beyondOnward), onward);
      expect(line(container)).toMatch(/^Staying with body 1 · 00:11 past the film/);
    });

    it('measures a press on the picture against one made outside the section: the plate’s own word', () => {
      const { container } = performed(ejected, leaving(), { framed: framedWith(apart) });
      const [x, y] = css(apart[0]);
      const here = { clientX: x, clientY: y, pointerType: 'mouse' };
      // The plate's word stands a screen above the section. Pressed, it asks by its event, and
      // the page brings the picture under the pointer that pressed it.
      clockNow += 1_000;
      fireEvent.pointerDown(document.body, here);
      act(() => window.dispatchEvent(new Event(AFTER_THE_FRAME_EVENT)));
      expect(phase(container)).toBe('choosing');
      // The second press of that double click lands on body 1: it answers nothing.
      clockNow += 150;
      fireEvent.pointerDown(stageOf(container), here);
      fireEvent.click(stageOf(container), { ...here, detail: 1 });
      expect(phase(container)).toBe('choosing');
      // In its own time, it is an answer.
      clockNow += 400;
      fireEvent.pointerDown(stageOf(container), here);
      fireEvent.click(stageOf(container), { ...here, detail: 1 });
      expect(sectionOf(container)).toHaveAttribute('data-kept', '1');
    });

    it('takes the picture as new under the pointer when the plate’s word brings back a question that already stands', () => {
      const { container } = performed(ejected, leaving(), {
        framed: framedWith(apart),
        still: true,
      });
      clockNow += 1_000;
      fireEvent.click(afterTheFrame());
      expect(phase(container)).toBe('choosing');
      // The visitor goes back up to the plate, and a minute later presses its word twice. The
      // first press brings the picture under the pointer at once; the second lands on body 1.
      clockNow += 60_000;
      const [x, y] = css(apart[0]);
      const here = { clientX: x, clientY: y, pointerType: 'mouse' };
      fireEvent.pointerDown(document.body, here);
      act(() => window.dispatchEvent(new Event(AFTER_THE_FRAME_EVENT)));
      clockNow += 150;
      fireEvent.pointerDown(stageOf(container), here);
      fireEvent.click(stageOf(container), { ...here, detail: 1 });
      expect(phase(container)).toBe('choosing');
      clockNow += 400;
      fireEvent.pointerDown(stageOf(container), here);
      fireEvent.click(stageOf(container), { ...here, detail: 1 });
      expect(sectionOf(container)).toHaveAttribute('data-kept', '1');
    });

    it('takes the picture as new under the pointer for as long as the page glides to it', () => {
      const { container } = performed(ejected, leaving(), { framed: framedWith(apart) });
      const press = (target: Element, at: { clientX: number; clientY: number }) => {
        fireEvent.pointerDown(target, { ...at, pointerType: 'mouse' });
        fireEvent.click(target, { ...at, detail: 1 });
      };
      const [x, y] = css(apart[0]);
      const here = { clientX: x, clientY: y };
      clockNow += 1_000;
      press(afterTheFrame(), here);
      // The page glides to the picture for six tenths of a second, longer than a press must
      // wait: the second press of someone who thought the first did nothing lands on body 1
      // as the glide ends.
      clockNow += 600;
      fireEvent.scroll(window);
      clockNow += 100;
      press(stageOf(container), here);
      expect(phase(container)).toBe('choosing');
      // Once the picture has stood still under the pointer, a press there is an answer.
      clockNow += 400;
      press(stageOf(container), here);
      expect(sectionOf(container)).toHaveAttribute('data-kept', '1');
    });

    it('does not take the letting go of a press that went down before the question was asked', () => {
      const { container } = performed(ejected, leaving(), { framed: framedWith(apart) });
      fireEvent.click(afterTheFrame());
      const [x, y] = css(apart[1]);
      // A hold begun on the orbit in the hand, which the question took from under it: the
      // browser gives the click to the picture, and no press went down on it.
      clockNow += 1_000;
      fireEvent.click(stageOf(container), { clientX: x, clientY: y, detail: 1 });
      expect(phase(container)).toBe('choosing');
      // A press that goes down on the body and comes up on it is an answer.
      fireEvent.pointerDown(stageOf(container), { clientX: x, clientY: y, pointerType: 'mouse' });
      fireEvent.click(stageOf(container), { clientX: x, clientY: y, detail: 1 });
      expect(sectionOf(container)).toHaveAttribute('data-kept', '2');
    });

    it('reads the pictures when After the frame is asked for, keeps them, and reads none for a turn of the plate at the frame', () => {
      Object.assign(motion, { paused: true, reducedMotion: true });
      vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
        width: 900,
        height: 580,
      } as DOMRect);
      const both: OrbitPlate = {
        frame: plateFrame(ejected.id)!,
        stills: {
          light: { src: '/light.webp', width: 1920, height: 1242 },
          ink: { src: '/ink.webp', width: 1920, height: 1242 },
        },
      };
      render(<OrbitScore orbit={ejected} t={t} locale="en" plate={both} opening="light" both />);
      approach();
      view(true);
      derive(derivation(ejected), workers[0], ejected);
      workers[0].reply({ type: 'framed', framed: framedWith(apart) });
      fated(ejected, workers[0], leaving());
      clockNow = 800 + 31_000;
      nextFrame();
      // Nothing is read before After the frame is asked for, however the plate is turned.
      readings.made = 0;
      act(() => rememberExpression('ink'));
      act(() => rememberExpression('light'));
      expect(readings.made).toBe(0);
      // Asked: the frame's picture and each body's, once. Answered, told and asked again: none.
      fireEvent.click(afterTheFrame());
      expect(readings.made).toBe(4);
      fireEvent.click(stayWith(1));
      fireEvent.click(word(t.beyondTell));
      fireEvent.click(word(t.again));
      expect(readings.made).toBe(4);
      // Back at the frame, and asked for again: kept.
      fireEvent.click(afterTheFrame());
      fireEvent.click(afterTheFrame());
      expect(readings.made).toBe(4);
      // Back at the frame, the plate is turned: the other material is not read until it is
      // asked for there.
      fireEvent.click(afterTheFrame());
      act(() => rememberExpression('ink'));
      expect(readings.made).toBe(4);
      fireEvent.click(afterTheFrame());
      expect(readings.made).toBe(8);
    });

    it('moves nothing when the plate, turned to a material its orbit is not drawn on, is turned back', () => {
      const scrolledTo = vi.fn();
      vi.stubGlobal('scrollTo', scrolledTo);
      Object.assign(motion, { paused: true, reducedMotion: true });
      vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
        width: 900,
        height: 580,
      } as DOMRect);
      // A plate with a Light still alone, in a work that has both expressions (none is so
      // today: every still bears its orbit out).
      const { container } = render(
        <OrbitScore
          orbit={ejected}
          t={t}
          locale="en"
          plate={plateOf(ejected.id)}
          opening="light"
          both
        />,
      );
      approach();
      view(true);
      derive(derivation(ejected), workers[0], ejected);
      workers[0].reply({ type: 'framed', framed: framedWith(apart) });
      fated(ejected, workers[0], leaving());
      clockNow = 800 + 31_000;
      nextFrame();
      laidOut({ picture: [54, 574], beneath: [583, 744], words: [700, 744] });
      fireEvent.click(afterTheFrame());
      fireEvent.click(stayWith(1));
      expect(sectionOf(container)).toHaveAttribute('data-kept', '1');
      expect(scrolledTo).not.toHaveBeenCalled();
      // The visitor scrolls up to the plate, two screens above, and turns it to Ink: the
      // orbit is drawn in its plane, at the frame.
      laidOut({ picture: [2054, 2574], beneath: [2583, 2744], words: [2700, 2744] });
      act(() => rememberExpression('ink'));
      expect(sectionOf(container)).not.toHaveAttribute('data-beyond');
      // Turned back, the picture stands past the frame as it did. Turning the plate did not
      // ask for the orbit: the page stays where the visitor's hand is.
      act(() => rememberExpression('light'));
      expect(sectionOf(container)).toHaveAttribute('data-kept', '1');
      expect(scrolledTo).not.toHaveBeenCalled();
    });

    it('draws the question again at another size, aims afresh, and still knows what a press finds', () => {
      const { container } = performed(ejected, leaving(), { framed: framedWith(apart) });
      fireEvent.click(afterTheFrame());
      const stage = stageOf(container);
      const [x, y] = css(apart[0]);
      fireEvent.pointerMove(stage, { clientX: x + 10, clientY: y - 8, pointerType: 'mouse' });
      expect(stage).toHaveAttribute('data-pick');
      fireEvent.focus(stayWith(3));
      // The observer's first report is of the size the picture already has: nothing is drawn.
      calls = [];
      resize(/_stage_/);
      expect(calls).toHaveLength(0);
      expect(stage).toHaveAttribute('data-pick');
      // At another size the picture is not where a resting mouse found it: the aim is let go,
      // and the question is drawn again, the window with its numbers.
      resize(/_stage_/);
      expect(phase(container)).toBe('choosing');
      expect(stage).not.toHaveAttribute('data-pick');
      expect(calls.some((call) => call.name === 'lineTo')).toBe(true);
      expect(calls.some((call) => call.name === 'fillText')).toBe(true);
      // A press on a body answers as before: the picture drawn again knows its bodies.
      clockNow += 5_000;
      fireEvent.pointerDown(stage, { clientX: x, clientY: y, pointerType: 'mouse' });
      fireEvent.click(stage, { clientX: x, clientY: y, detail: 1 });
      expect(phase(container)).toBe('running');
      expect(sectionOf(container)).toHaveAttribute('data-kept', '1');
    });

    it('times a press on the picture from when the question stood drawn, however long that took', () => {
      const { container } = performed(ejected, leaving(), { framed: framedWith(apart) });
      const press = (target: Element, at: { clientX: number; clientY: number }) => {
        fireEvent.pointerDown(target, { ...at, pointerType: 'mouse' });
        fireEvent.click(target, { ...at, detail: 1 });
      };
      // The word is pressed where body 1 will stand, on a device that takes 0.3 s to draw the
      // question: each of its five canvases is 60 ms in the making.
      const [x, y] = css(apart[0]);
      const here = { clientX: x, clientY: y };
      clockNow += 1_000;
      let drawing = true;
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
        if (drawing) clockNow += 60;
        return context as unknown as CanvasRenderingContext2D;
      });
      press(afterTheFrame(), here);
      drawing = false;
      expect(phase(container)).toBe('choosing');
      // A second press there a tenth of a second after the picture stood drawn is no answer,
      // though 0.4 s have passed since the first: the wait is counted from the picture.
      clockNow += 100;
      press(stageOf(container), here);
      expect(phase(container)).toBe('choosing');
      // 0.4 s after the picture stood drawn, it is.
      clockNow += 300;
      press(stageOf(container), here);
      expect(phase(container)).toBe('running');
      expect(sectionOf(container)).toHaveAttribute('data-kept', '1');
    });

    it('takes a key’s press at once, and a held key’s only once', () => {
      const { container } = performed(ejected, leaving());
      // A key's click counts no presses: it goes to the word the focus was moved to.
      fireEvent.click(afterTheFrame());
      const answer = stayWith(2);
      // Held, the key's repeats are stopped where they begin; a press of its own is not.
      expect(fireEvent.keyDown(answer, { key: 'Enter', repeat: true })).toBe(false);
      expect(fireEvent.keyDown(answer, { key: ' ', repeat: true })).toBe(false);
      expect(fireEvent.keyDown(answer, { key: 'Enter' })).toBe(true);
      expect(fireEvent.keyDown(answer, { key: 'Tab', repeat: true })).toBe(true);
      fireEvent.click(answer);
      expect(sectionOf(container)).toHaveAttribute('data-kept', '2');
    });

    it('rings the answer the focus is on and the one a mouse is over, each for itself', () => {
      performed(ejected, leaving(), { framed: framedWith(apart) });
      fireEvent.click(afterTheFrame());
      const rings = () =>
        arcsDrawn().map(({ args }) => (args as number[]).slice(0, 2).map(Math.round));
      calls = [];
      fireEvent.focus(stayWith(2));
      expect(rings()).toEqual([css(apart[1]).map(Math.round)]);
      // A mouse crossing another answer rings its body too…
      calls = [];
      fireEvent.pointerEnter(stayWith(3), { pointerType: 'mouse' });
      expect(rings()).toEqual([css(apart[1]).map(Math.round), css(apart[2]).map(Math.round)]);
      // …and leaving it, takes only its own ring away: Enter still stays with body 2.
      calls = [];
      fireEvent.pointerLeave(stayWith(3), { pointerType: 'mouse' });
      expect(rings()).toEqual([css(apart[1]).map(Math.round)]);
    });

    it('stands the three where the picture holds them at once when motion becomes unwelcome on the way', () => {
      const later = pathOf({ seconds: 60, places, out: [{ body: 1, from: 30, far: 1.4 }] });
      const plate = plateOf(ejected.id);
      const { container, rerender } = performed(ejected, later, { plate });
      fireEvent.click(afterTheFrame());
      fireEvent.click(stayWith(1));
      const by = [1_728 - 1_400, 1_117 - 900];
      const moved = (share: number) =>
        places.map(([x, y]) => drawn([x + by[0] * share, y + by[1] * share]));
      nextFrame();
      clockNow += 600;
      nextFrame();
      expect(lights()).toEqual(moved(0.5));
      // The venue is paused half-way. Nothing plays now, so nothing is left half-brought…
      Object.assign(motion, { paused: true });
      rerender(<OrbitScore orbit={ejected} t={t} locale="en" plate={plate} opening="light" />);
      expect(lights()).toEqual(moved(1));
      expect(frames.size).toBe(0);
      // …and Further on, the only way on where nothing plays, is alive.
      expect(word(t.beyondOnward)).not.toHaveAttribute('aria-disabled');
      fireEvent.click(word(t.beyondOnward));
      expect(line(container)).toMatch(/^Staying with body 1 · 00:31 past the film · body 2 is out/);
    });

    it('reads each kept picture through the film: what the film showed a body do is no event', () => {
      // The film itself showed body 2 half a picture's width outside the picture kept on body 1.
      const framed = framedOf();
      [1_728, 1_117, 5_184, 1_117].forEach((value, at) => {
        framed.pixels[500 * 6 + at] = value;
      });
      // Past the film body 2 goes a third of a width out for ten seconds and comes back: no
      // farther than the film showed. № 031's record finds its three bound.
      const routine = pathOf({ seconds: 40, out: [{ body: 1, from: 5, to: 15, far: 0.3 }] });
      const { container } = performed(orbit, routine, { framed });
      fireEvent.click(afterTheFrame());
      fireEvent.click(stayWith(1));
      fireEvent.click(word(t.beyondTell));
      expect(line(container)).toBe(
        'The picture stayed with body 1. All three are still bound to one another at step 8,000,000, where the record stops looking.',
      );
      // In the work's own frame, which holds the whole film, the same excursion is one a
      // visitor sees.
      fireEvent.click(word(t.again));
      fireEvent.click(word(t.beyondStayFrame));
      fireEvent.click(word(t.beyondTell));
      expect(line(container)).toMatch(
        /^Body 2 left the picture 5\.0 seconds after the film ended\. It came back 10\.0 seconds later\./,
      );
    });

    it('hands the focus to the line only once it has its words, and without moving the page', () => {
      const focused: { text: string | null; options: unknown }[] = [];
      const focus = HTMLElement.prototype.focus;
      vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (
        this: HTMLElement,
        options?: FocusOptions,
      ) {
        focused.push({ text: this.textContent, options });
        focus.call(this, options);
      });
      const { container } = performed(ejected, leaving());
      fireEvent.click(afterTheFrame());
      expect(focused).toEqual([{ text: t.beyondAsk, options: { preventScroll: true } }]);
      fireEvent.click(stayWith(2));
      // Not the line while it stood empty between the answer and the first drawing.
      expect(focused.slice(1)).toEqual([
        {
          text: 'Staying with body 2 · 00:00 past the film · step 1,000,000',
          options: { preventScroll: true },
        },
      ]);
      expect(document.activeElement).toBe(telling(container));
    });

    it('finds a body by the stage’s own place in the window', () => {
      const { container } = performed(ejected, leaving(), { framed: framedWith(apart) });
      fireEvent.click(afterTheFrame());
      const stage = stageOf(container);
      // The stage stands 40 px in and 300 px down the window.
      vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({ left: 40, top: 300 } as DOMRect);
      const [x, y] = css(apart[1]);
      fireEvent.click(stage, { clientX: x, clientY: y });
      expect(phase(container)).toBe('choosing');
      fireEvent.click(stage, { clientX: x + 40, clientY: y + 300 });
      expect(sectionOf(container)).toHaveAttribute('data-kept', '2');
    });

    it('keeps the room of the longest thing that can be told here, from the moment of asking', () => {
      const { container } = performed(ejected, leaving());
      const fits = () => [
        ...container.querySelectorAll<HTMLElement>(
          '#orbit [class*="_said_"] > p[aria-hidden="true"]',
        ),
      ];
      // At the frame nothing is laid out for a telling.
      expect(fits()).toHaveLength(0);
      fireEvent.click(afterTheFrame());
      // The question asked, every telling the visitor may be given stands unseen in the line's
      // room (the frame's, and each body's), with the longest line a performance says.
      expect(fits()).toHaveLength(5);
      for (const fit of fits()) expect(fit.className).toMatch(/_fit_/);
      expect(fits().map((fit) => fit.textContent)).toEqual([
        // (The frame's own telling lingers from the step that confirms the record's finding.)
        'Body 2 left the picture 3.0 seconds after the film ended. 12.5 seconds later the other two were still in it. The record finds body 2 no longer bound to the other two at step 1,210,000.',
        'The picture stayed with body 1. Body 2 left the picture 3.0 seconds after the film ended. 8.0 seconds later body 3 was still in it. The record finds body 2 no longer bound to the other two at step 1,210,000.',
        'The picture stayed with body 2. Body 2 was alone in it from 3.0 seconds after the film ended. The record finds body 2 no longer bound to the other two at step 1,210,000.',
        'The picture stayed with body 3. Body 2 left the picture 3.0 seconds after the film ended. 8.0 seconds later body 1 was still in it. The record finds body 2 no longer bound to the other two at step 1,210,000.',
        'Staying with body 3 · 00:00 past the film · body 3 is out of the picture, 88.8 picture widths away',
      ]);
      // The line itself is the first in the room, and the only one seen or said.
      expect(telling(container)).not.toHaveAttribute('aria-hidden');
      // What is told is one of them, word for word: the room was its own.
      fireEvent.click(stayWith(3));
      fireEvent.click(word(t.beyondTell));
      expect(line(container)).toBe(fits()[3].textContent);
      expect(fits()).toHaveLength(5);
    });

    it('lays out the one telling, and a line that names no body, where the visitor is not asked', () => {
      const { container } = performed(soonest, pathOf({ seconds: 20 }));
      fireEvent.click(afterTheFrame());
      const fits = [
        ...container.querySelectorAll('#orbit [class*="_said_"] > p[aria-hidden="true"]'),
      ].map((fit) => fit.textContent);
      expect(fits).toEqual([
        'The record finds body 2 no longer bound to the other two at step 1,090,000.',
        '00:00 past the film · step 8,000,000',
      ]);
    });

    it('stands with its body at once where motion is unwelcome, and steps by Further on', () => {
      const { container } = performed(ejected, leaving(), { still: true });
      fireEvent.click(afterTheFrame());
      expect(phase(container)).toBe('choosing');
      fireEvent.click(stayWith(1));
      // No bringing: body 1 is at the middle in the first picture drawn, and nothing runs.
      expect(lights()[0]).toEqual([450, 290]);
      expect(frames.size).toBe(0);
      expect(line(container)).toBe('Staying with body 1 · 00:00 past the film · step 1,000,000');
      // A step to a second past the leaving, then to the end. There Further on has nowhere to
      // go and is dimmed; Tell me says what happened.
      fireEvent.click(word(t.beyondOnward));
      expect(line(container)).toMatch(/^Staying with body 1 · 00:04 past the film · body 2 is out/);
      fireEvent.click(word(t.beyondOnward));
      expect(line(container)).toMatch(/^Staying with body 1 · 00:11 past the film · body 2 is out/);
      expect(word(t.beyondOnward)).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(word(t.beyondOnward));
      expect(phase(container)).toBe('running');
      fireEvent.click(word(t.beyondTell));
      expect(phase(container)).toBe('told');
      expect(line(container)).toMatch(/^The picture stayed with body 1\. Body 2 left the picture/);
    });

    it('is not asked where the picture does not draw the bodies where they were', () => {
      // One work of each such picture: № 054 is plotted in cross-braid space, № 033 is a
      // hodograph, and № 007 a phase portrait drawn twice. Their marks are not bodies to stay
      // with.
      for (const [id, copies] of [
        [33, 1],
        [7, 2],
      ] as const) {
        workers = [];
        observers = [];
        const of = workOrbit(id)!;
        const { container, unmount } = performed(of, pathOf({ seconds: 20, copies }), {
          framed: framedOf(copies),
        });
        fireEvent.click(afterTheFrame());
        expect(phase(container)).toBe('running');
        expect(screen.getByText(t.afterTheFrameNote)).toBeInTheDocument();
        expect(screen.queryByRole('group', { name: t.beyondAsk })).not.toBeInTheDocument();
        unmount();
      }
      workers = [];
      observers = [];
      const { container } = performed(soonest, pathOf({ seconds: 20 }));
      const entered = afterTheFrame();
      entered.focus();
      fireEvent.click(entered);
      expect(phase(container)).toBe('running');
      expect(screen.getByText(t.afterTheFrameNote)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: t.beyondStayFrame })).not.toBeInTheDocument();
      expect(screen.queryByRole('group', { name: t.beyondAsk })).not.toBeInTheDocument();
      // The word that was pressed stays, and the focus on it. So with Again, which is Tell me's
      // own element: where no question is asked, nothing takes the focus from it.
      expect(document.activeElement).toBe(entered);
      const tell = word(t.beyondTell);
      tell.focus();
      fireEvent.click(tell);
      expect(phase(container)).toBe('told');
      const again = word(t.again);
      again.focus();
      fireEvent.click(again);
      expect(phase(container)).toBe('running');
      expect(again).toBe(word(t.beyondTell));
      expect(document.activeElement).toBe(again);
    });

    it('is not asked where the path holds nothing to perform', () => {
      // The energy broke inside the recorded window: one sample, and what happened said at once.
      const lost = { step: 900_000, change: 0.4 } as NonNullable<BeyondPath['lost']>;
      const { container } = performed(ejected, pathOf({ seconds: 0, lost }));
      fireEvent.click(afterTheFrame());
      expect(phase(container)).toBe('told');
      expect(screen.queryByRole('button', { name: t.beyondStayFrame })).not.toBeInTheDocument();
    });

    it('leaves no hand on the picture when the twin is asked for from the question', () => {
      const { container } = performed(ejected, leaving(), { framed: framedWith(apart) });
      fireEvent.click(afterTheFrame());
      const stage = stageOf(container);
      const [x, y] = css(apart[1]);
      fireEvent.pointerMove(stage, { clientX: x, clientY: y, pointerType: 'mouse' });
      expect(stage).toHaveAttribute('data-pick');
      fireEvent.click(word(t.oneInATrillion));
      expect(sectionOf(container)).not.toHaveAttribute('data-beyond');
      expect(stage).not.toHaveAttribute('data-pick');
    });

    it('moves nothing as the answer is given, where all of it is in view, even after a start that waited', () => {
      const { container, scrolledTo } = askedEarly();
      laidOut({ picture: [80, 600], beneath: [609, 740] });
      fated(ejected);
      expect(phase(container)).toBe('choosing');
      nextFrame();
      nextFrame();
      expect(scrolledTo).toHaveBeenCalledTimes(1);
      // The page has brought the picture under the head; the visitor answers there.
      laidOut({ picture: [54, 574], beneath: [583, 714] });
      fireEvent.click(word(t.beyondStayFrame));
      nextFrame();
      nextFrame();
      expect(phase(container)).toBe('running');
      expect(scrolledTo).toHaveBeenCalledTimes(1);
    });
  });

  /** The plate's word, given before anything is derived: the page sets off for the section. */
  function askedEarly(of: WorkOrbit = ejected) {
    const scrolledTo = vi.fn();
    vi.stubGlobal('scrollTo', scrolledTo);
    Object.assign(motion, { paused: false, reducedMotion: false });
    const { container } = render(
      <OrbitScore orbit={of} t={t} locale="en" plate={plateOf(of.id)} opening="light" />,
    );
    act(() => window.dispatchEvent(new Event(AFTER_THE_FRAME_EVENT)));
    expect(scrolled).toEqual([{ block: 'start', behavior: 'smooth' }]);
    derive(derivation(of), workers[0], of);
    workers[0].reply({ type: 'framed', framed: framedOf() });
    return { container, scrolledTo };
  }

  it('ends on the picture when the path was awaited, wherever the page had got to', () => {
    const { container, scrolledTo } = askedEarly();
    // The path arrives while that scroll is under way, at a moment when all of it happens to
    // be in view: the page still ends on the picture, not wherever that scroll was going.
    laidOut({ picture: [80, 600], beneath: [609, 740] });
    fated(ejected);
    // The visitor is asked whom to stay with, with the picture in front of them.
    expect(sectionOf(container)).toHaveAttribute('data-beyond', 'choosing');
    nextFrame();
    nextFrame();
    expect(scrolledTo.mock.calls).toEqual([[{ top: 74, behavior: 'smooth' }]]);
  });

  it('does not pull back a visitor who left while the path was awaited', () => {
    const { container, scrolledTo } = askedEarly();
    // They have gone back up the page: the picture is two screens below.
    laidOut({ picture: [2400, 3100], beneath: [3110, 3240] });
    fated(ejected);
    expect(sectionOf(container)).toHaveAttribute('data-beyond', 'choosing');
    nextFrame();
    nextFrame();
    expect(scrolledTo).not.toHaveBeenCalled();
  });

  it('performs nothing, and gives the window back, where the awaited path cannot be carried', () => {
    const { container } = askedEarly();
    const slider = () => screen.getByRole('slider', { name: t.orbitTimeLabel });
    // While it waits, the window stands whole and its slider is held.
    expect(slider()).toBeDisabled();
    fated(ejected, workers[0], null);
    // No performance of nothing: the section is not past the frame, says nothing of it, and
    // the window is the visitor's again.
    expect(sectionOf(container)).not.toHaveAttribute('data-beyond');
    expect(screen.getByText(t.orbitLine)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t.afterTheFrame })).not.toBeInTheDocument();
    expect(slider()).toBeEnabled();
  });

  it('gives the window back where the worker fails while the path is awaited', () => {
    const { container } = askedEarly();
    const slider = () => screen.getByRole('slider', { name: t.orbitTimeLabel });
    expect(slider()).toBeDisabled();
    workers[0].reply({ type: 'failed', message: 'no' });
    expect(sectionOf(container)).not.toHaveAttribute('data-beyond');
    expect(slider()).toBeEnabled();
  });

  it('tells what happened at once when asked, with no rest, and hands the focus to what is told', () => {
    const path = pathOf({ seconds: 80, out: [{ body: 2, from: 40, to: 50 }] });
    const { container } = performed(orbit, path);
    pastTheFrame();
    perform(1);
    word(t.beyondTell).focus();
    fireEvent.click(word(t.beyondTell));
    expect(phase(container)).toBe('told');
    expect(line(container)).toBe(
      'Body 3 left the picture 40.0 seconds after the film ended. It came back 10.0 seconds later. All three are still bound to one another at step 8,000,000, where the record stops looking.',
    );
    // Each sentence is a box of its own, so a line breaks between two before it breaks inside one.
    expect(
      [...telling(container).querySelectorAll('span')].map((sentence) => sentence.textContent),
    ).toEqual([
      'Body 3 left the picture 40.0 seconds after the film ended.',
      'It came back 10.0 seconds later.',
      'All three are still bound to one another at step 8,000,000, where the record stops looking.',
    ]);
    expect(words(container)).toEqual([t.again, t.beyondRecord, t.afterTheFrame, t.oneInATrillion]);
    // The keyboard and the screen reader stand on what was told.
    expect(document.activeElement).toBe(telling(container));
    // Nothing goes on being performed behind what was told.
    expect(frames.size).toBe(0);
  });

  it('performs nothing past the step at which the computation lost its energy, and says so', () => {
    Object.assign(motion, { paused: false, reducedMotion: false });
    const { container } = render(
      <OrbitScore orbit={ejected} t={t} locale="en" plate={plateOf(25)} opening="light" />,
    );
    approach();
    view(true);
    derive(derivation(ejected), workers[0], ejected);
    workers[0].reply({ type: 'framed', framed: framedOf() });
    // № 025's own run, with the watch's answer for one that broke 5,000 steps past the frame.
    const broken = { step: 1_005_000, change: 7.8, closest: 0.11 };
    const fate: DerivedFate = {
      ...fateOf(ejected),
      energy: { first: -2864.2, windowChange: 2e-11, change: 13, broken },
    };
    workers[0].reply({ type: 'fate', fate, comparison: compareFate(ejected.fate, fate) });
    // The worker stops the path a thousand steps before the watch found the break.
    workers[0].reply({
      type: 'beyond',
      beyond: { ...pathOf({ seconds: 4_000 / pace }), lost: broken },
    });
    clockNow = 800 + 31_000;
    nextFrame();
    // The record's note: what the published record does not say, and this browser found.
    const note = container.querySelector('[data-energy]')!;
    expect(note).toHaveAttribute('data-energy', 'broken');
    expect(note).toHaveTextContent(
      'As computed here, the energy holds to 10 digits through the recorded window. Near step 1,005,000 two bodies pass 0.11 apart, closer than the computation’s fixed step can follow, and its energy changes by 780%. Gravity keeps energy constant, so past that step this is the computation, not an orbit.',
    );
    pastTheFrame();
    nextFrame();
    expect(line(container)).toBe('00:00 past the film · step 1,000,000');
    // A tenth of a second of film, and the path is at its end.
    framesUntil(() => phase(container) === 'resting', 10);
    rest();
    expect(line(container)).toBe(
      'Past step 1,005,000 this is not an orbit: the computed energy changed by 780%.',
    );
    expect(
      screen.queryByText(/no longer bound to the other two|still bound/),
    ).not.toBeInTheDocument();
  });

  it.each([
    ['performed', false],
    ['stepped, where motion is unwelcome', true],
  ])(
    'says at once what happened where there is nothing past the frame to perform (%s)',
    (_, still) => {
      Object.assign(motion, { paused: still, reducedMotion: still });
      const { container } = render(
        <OrbitScore orbit={ejected} t={t} locale="en" plate={plateOf(25)} opening="light" />,
      );
      approach();
      view(true);
      derive(derivation(ejected), workers[0], ejected);
      workers[0].reply({ type: 'framed', framed: framedOf() });
      // A window that lost its energy inside itself: the path past it is where the window ended.
      const broken = { step: 44_000, change: 0.58, closest: 0.09 };
      const fate: DerivedFate = {
        ...fateOf(ejected),
        energy: { first: -2864.2, windowChange: 0.58, change: 0.58, broken },
      };
      workers[0].reply({ type: 'fate', fate, comparison: compareFate(ejected.fate, fate) });
      workers[0].reply({
        type: 'beyond',
        beyond: { ...pathOf({ seconds: 1 }), samples: 1, lost: broken },
      });
      clockNow = 800 + 31_000;
      nextFrame();
      pastTheFrame();
      // No performance, so no rest and nothing to step through: the line is there, with its
      // words, and Again is not among them: there is nothing to perform again.
      expect(phase(container)).toBe('told');
      expect(line(container)).toBe(
        'Past step 44,000 this is not an orbit: the computed energy changed by 58%.',
      );
      expect(words(container)).toEqual([t.beyondRecord, t.afterTheFrame, t.oneInATrillion]);
      expect(frames.size).toBe(0);
    },
  );

  it('stands still where motion is unwelcome, and is stepped from moment to moment', () => {
    const path = pathOf({
      seconds: 20,
      out: [
        { body: 1, from: 3 },
        { body: 0, from: 5 },
        { body: 2, from: 5 },
      ],
    });
    const { container } = performed(ejected, path, { still: true });
    pastTheFrame();
    // Nothing plays: the picture stands at the film's end, and the words go on from there.
    expect(frames.size).toBe(0);
    expect(line(container)).toBe('00:00 past the film · step 1,000,000');
    expect(words(container)).toEqual([
      t.beyondOnward,
      t.beyondTell,
      t.afterTheFrame,
      t.oneInATrillion,
    ]);
    // Where nothing plays Further on is the way on, and is not dimmed while there is further
    // to go, however near. The line changes only when the visitor steps it, so each step is
    // said to one who cannot see the picture: the focus stays on the word they step with.
    expect(word(t.beyondOnward)).not.toHaveAttribute('aria-disabled');
    expect(telling(container)).toHaveAttribute('aria-live', 'polite');
    const onward = () => fireEvent.click(word(t.beyondOnward));
    // Each step lands a second past a moment, so the picture shows it.
    onward();
    expect(line(container)).toMatch(/^00:04 past the film · body 2 is out of the picture/);
    onward();
    expect(line(container)).toBe('00:06 past the film · all three are out of the picture');
    expect(word(t.beyondOnward)).not.toHaveAttribute('aria-disabled');
    // Then the end of the performance. Further on has nowhere left to go: it keeps its place,
    // dimmed, and a press made in the rhythm of the stepping does nothing. It never turns into
    // the word that tells, nor into the one that asks again.
    onward();
    expect(line(container)).toBe('00:07 past the film · all three are out of the picture');
    expect(phase(container)).toBe('running');
    expect(telling(container)).toHaveAttribute('aria-live', 'polite');
    expect(word(t.beyondOnward)).toHaveAttribute('aria-disabled', 'true');
    onward();
    onward();
    expect(phase(container)).toBe('running');
    expect(line(container)).toBe('00:07 past the film · all three are out of the picture');
    // Tell me says what happened: no rest is timed.
    fireEvent.click(word(t.beyondTell));
    expect(phase(container)).toBe('told');
    expect(line(container)).toBe(
      'Body 2 left the picture 3.0 seconds after the film ended. 2.0 seconds later the other two had left it too. The record finds body 2 no longer bound to the other two at step 1,210,000.',
    );
    expect(words(container)).toEqual([t.again, t.beyondRecord, t.afterTheFrame, t.oneInATrillion]);
    // The word that was pressed is gone: the keyboard and the screen reader stand on what it told.
    expect(document.activeElement).toBe(telling(container));
    expect(telling(container)).toHaveAttribute('aria-live', 'polite');
  });

  it('names no body where the picture does not draw the bodies where they were', () => {
    // № 054 is plotted in cross-braid space: a mark there is made of two bodies' coordinates.
    const path = pathOf({
      seconds: 20,
      out: [
        { body: 1, from: 3 },
        { body: 0, from: 5 },
        { body: 2, from: 5 },
      ],
    });
    const { container } = performed(soonest, path, { still: true });
    pastTheFrame();
    // The marks' leaving still shapes the performance: the same steps, to the same end.
    fireEvent.click(word(t.beyondOnward));
    expect(line(container)).toBe('00:04 past the film · step 1,133,200');
    fireEvent.click(word(t.beyondTell));
    // And what is told is the record's finding alone.
    expect(line(container)).toBe(
      'The record finds body 2 no longer bound to the other two at step 1,090,000.',
    );
    // So with a hodograph (№ 033) and a phase portrait drawn twice (№ 007): the line counts
    // the film's clock and names no one, and nothing is told of the picture.
    for (const [id, copies] of [
      [33, 1],
      [7, 2],
    ] as const) {
      cleanup();
      workers = [];
      observers = [];
      const marks = pathOf({ seconds: 20, copies, out: [{ body: 1, from: 3 }] });
      const other = performed(workOrbit(id)!, marks, { still: true, framed: framedOf(copies) });
      pastTheFrame();
      fireEvent.click(word(t.beyondOnward));
      expect(line(other.container)).toMatch(/^00:04 past the film · step [\d,]+$/);
      fireEvent.click(word(t.beyondTell));
      expect(line(other.container)).not.toMatch(/picture/);
      expect(line(other.container)).toMatch(
        /^(The record finds|All three are still bound|Past step)/,
      );
    }
  });

  it('is not offered where the path past the window could not be carried', () => {
    performed(ejected, null);
    expect(screen.queryByRole('button', { name: t.afterTheFrame })).not.toBeInTheDocument();
  });

  it('is not offered in the plane, where there is no frame for a body to leave', () => {
    // A work with no plate is drawn in its own plane, and the worker carries no path for it.
    const { container } = performed(ejected, null, { plate: null });
    expect(sectionOf(container)).toHaveAttribute('data-drawing', 'plane');
    expect(screen.queryByRole('button', { name: t.afterTheFrame })).not.toBeInTheDocument();
    // Nor, asked for by the plate's word, is anything performed.
    act(() => window.dispatchEvent(new Event(AFTER_THE_FRAME_EVENT)));
    expect(sectionOf(container)).not.toHaveAttribute('data-beyond');
  });

  it('answers the plate’s word: into view, derived if need be, and on past the frame', () => {
    const { container } = render(
      <OrbitScore orbit={ejected} t={t} locale="en" plate={plateOf(25)} opening="light" />,
    );
    expect(workers).toHaveLength(0);
    act(() => window.dispatchEvent(new Event(AFTER_THE_FRAME_EVENT)));
    expect(scrolled).toEqual([{ block: 'start', behavior: 'instant' }]);
    // The keyboard and the screen reader arrive with it.
    expect(document.activeElement).toBe(section(container));
    expect(workers).toHaveLength(1);
    derive(derivation(ejected), workers[0], ejected);
    workers[0].reply({ type: 'framed', framed: framedOf() });
    expect(section(container)).not.toHaveAttribute('data-beyond');
    // It waits for the path past the window, which follows the fate.
    const fate = fateOf(ejected);
    workers[0].reply({ type: 'fate', fate, comparison: compareFate(ejected.fate, fate) });
    expect(section(container)).not.toHaveAttribute('data-beyond');
    workers[0].reply({ type: 'beyond', beyond: pathOf() });
    // The path known, the visitor is asked whom to stay with. The focus had waited on the
    // section: it is handed to the question, which is said by it, as by the section's own word.
    expect(section(container)).toHaveAttribute('data-beyond', 'choosing');
    const question = container.querySelector<HTMLElement>('#orbit-said')!;
    expect(question).toHaveTextContent(t.beyondAsk);
    expect(document.activeElement).toBe(question);
    // Asked again while the question stands, from the plate a screen above: its picture comes
    // back, whole, and the question stands, and is said again.
    const scrolledTo = vi.fn();
    vi.stubGlobal('scrollTo', scrolledTo);
    laidOut({ picture: [954, 1654], beneath: [1663, 1790] });
    act(() => window.dispatchEvent(new Event(AFTER_THE_FRAME_EVENT)));
    expect(scrolledTo.mock.calls).toEqual([[{ top: 948, behavior: 'instant' }]]);
    expect(scrolled).toHaveLength(1);
    expect(section(container)).toHaveAttribute('data-beyond', 'choosing');
    expect(document.activeElement).toBe(question);
    // Answered, it runs; asked again while it runs, its picture comes back too.
    fireEvent.click(word(t.beyondStayFrame));
    expect(section(container)).toHaveAttribute('data-beyond', 'running');
    act(() => window.dispatchEvent(new Event(AFTER_THE_FRAME_EVENT)));
    expect(scrolledTo).toHaveBeenCalledTimes(3);
    expect(section(container)).toHaveAttribute('data-beyond', 'running');
    // Asked again once it has been told, the question is asked again.
    fireEvent.click(word(t.beyondTell));
    expect(section(container)).toHaveAttribute('data-beyond', 'told');
    act(() => window.dispatchEvent(new Event(AFTER_THE_FRAME_EVENT)));
    expect(section(container)).toHaveAttribute('data-beyond', 'choosing');
  });

  it('asks at once when the path is already known', () => {
    const { container } = performed(ejected, pathOf());
    // The plate is a screen above: the picture comes into view in one scroll, to where it will
    // stand, and the section's own start is not scrolled to on the way.
    const scrolledTo = vi.fn();
    vi.stubGlobal('scrollTo', scrolledTo);
    laidOut({ picture: [954, 1654], beneath: [1663, 1790] });
    act(() => window.dispatchEvent(new Event(AFTER_THE_FRAME_EVENT)));
    nextFrame();
    nextFrame();
    expect(scrolledTo.mock.calls).toEqual([[{ top: 948, behavior: 'smooth' }]]);
    expect(scrolled).toEqual([]);
    expect(section(container)).toHaveAttribute('data-beyond', 'choosing');
    // The plate's word is a link to here: the question it asks is said by the focus it is given.
    expect(document.activeElement).toBe(container.querySelector('#orbit-said'));
  });

  it('leaves the focus where a visitor has taken it while the path was awaited', () => {
    const { container } = render(
      <>
        <button type="button">Elsewhere</button>
        <OrbitScore orbit={ejected} t={t} locale="en" plate={plateOf(25)} opening="light" />
      </>,
    );
    act(() => window.dispatchEvent(new Event(AFTER_THE_FRAME_EVENT)));
    expect(document.activeElement).toBe(section(container));
    derive(derivation(ejected), workers[0], ejected);
    workers[0].reply({ type: 'framed', framed: framedOf() });
    // They move on before the path is known: the question, when it comes, takes nothing back.
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    elsewhere.focus();
    fated(ejected);
    expect(section(container)).toHaveAttribute('data-beyond', 'choosing');
    expect(document.activeElement).toBe(elsewhere);
  });

  it('where the visitor is not asked, the plate’s word leaves the focus on the section', () => {
    // № 054 draws another space: After the frame begins at once, with nothing to answer.
    const { container } = performed(soonest, pathOf({ seconds: 20 }));
    act(() => window.dispatchEvent(new Event(AFTER_THE_FRAME_EVENT)));
    expect(section(container)).toHaveAttribute('data-beyond', 'running');
    expect(document.activeElement).toBe(section(container));
  });
});

describe('the orbit on the plate', () => {
  const plate031 = orbitPlate(getCuratedArtwork(31)!)!;
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

  it('carries the orbit on past the frame over the same still, on paper', () => {
    // № 025 is not among the curated works: its Ink plate as the page would make it.
    const ejected = workOrbit(25)!;
    const { container } = render(
      <OrbitScore
        orbit={ejected}
        t={t}
        locale="en"
        plate={plateOf(25, 'ink')}
        opening="ink"
        both
      />,
    );
    approach();
    derive(derivation(ejected), workers[0], ejected);
    placedOn(framedOf());
    // On the plate the picture is the frame itself: body 2 stands 1.4 frame-widths outside it.
    fated(
      ejected,
      workers[0],
      pathOf({
        seconds: 20,
        out: [
          { body: 1, from: 3, far: 1.4 },
          { body: 0, from: 5 },
          { body: 2, from: 5 },
        ],
      }),
    );
    const caption = () => container.querySelector('figcaption')!;
    expect(caption()).toHaveTextContent(/Analysis, not the work\.$/);
    pastTheFrame();
    expect(section(container)).toHaveAttribute('data-drawing', 'plate');
    expect(section(container)).toHaveAttribute('data-material', 'ink');
    expect(section(container)).toHaveAttribute('data-beyond', 'running');
    // The caption's account of the window steps aside: the label alone stands under the picture.
    expect(caption().textContent).toBe(t.analysisNotWork);
    expect(caption().firstElementChild).toHaveAttribute('data-shown', 'true');
    expect(caption().firstElementChild).toHaveAttribute('aria-hidden', 'false');
    // Past the frame the bodies are outlined on the paper still, as in the window.
    expect(arcs(0.025).length).toBeGreaterThanOrEqual(3);
    // Stepped to a second past the leaving: the same count, in widths of the frame.
    fireEvent.click(screen.getByRole('button', { name: t.beyondOnward }));
    expect(
      screen.getByText(
        '00:04 past the film · body 2 is out of the picture, 1.4 picture widths away',
      ),
    ).toBeVisible();
    // Told, the picture is the work again, and needs no label; the label keeps its line, unseen.
    fireEvent.click(screen.getByRole('button', { name: t.beyondTell }));
    expect(section(container)).toHaveAttribute('data-beyond', 'told');
    expect(container.querySelector('#orbit p[class*="readout"]')!.textContent).toBe(
      'Body 2 left the picture 3.0 seconds after the film ended. 2.0 seconds later the other two had left it too. The record finds body 2 no longer bound to the other two at step 1,210,000.',
    );
    expect(caption().firstElementChild).toHaveAttribute('data-shown', 'false');
    expect(caption().firstElementChild).toHaveAttribute('aria-hidden', 'true');
    // Back at the frame, the caption says again what the window's drawing is.
    pastTheFrame();
    expect(caption()).toHaveTextContent(/^Three bodies, .* Analysis, not the work\.$/);
  });

  it('tells again, of the picture on view, when the plate is turned while the line stands', () => {
    // Two copies of each body, as a mirrored work draws them on Light; Ink draws the first
    // alone. Body 3's first copy leaves for six seconds while its second stays in the picture.
    const turned: OrbitPlate = {
      frame: plateFrame(31)!,
      stills: {
        light: { src: '/art/stills/31-light-1920.webp', width: 1920, height: 1242 },
        ink: { src: '/art/stills/31-ink-1920.webp', width: 1920, height: 1242 },
      },
    };
    const path = pathOf({ seconds: 30, copies: 2 });
    for (let sample = Math.round(4 * PER_SECOND); sample < Math.round(10 * PER_SECOND); sample++)
      path.pixels[(sample * 6 + 2) * 2] = 3_456 * 1.5;
    const { container } = render(
      <OrbitScore orbit={orbit} t={t} locale="en" plate={turned} opening="light" both />,
    );
    approach();
    derive();
    placedOn(framedOf(2));
    fated(orbit, workers[0], path);
    pastTheFrame();
    fireEvent.click(screen.getByRole('button', { name: t.beyondTell }));
    const told = () => container.querySelector('#orbit p[class*="readout"]')!.textContent;
    const stillBound =
      'All three are still bound to one another at step 8,000,000, where the record stops looking.';
    // On Light a copy of body 3 is in the picture throughout: nothing was seen to leave.
    expect(told()).toBe(stillBound);
    // The plate turned to Ink, the line is of the Ink picture, which draws the first copy alone.
    act(() => rememberExpression('ink'));
    expect(section(container)).toHaveAttribute('data-material', 'ink');
    expect(section(container)).toHaveAttribute('data-beyond', 'told');
    expect(told()).toBe(
      `Body 3 left the picture 4.0 seconds after the film ended. It came back 6.0 seconds later. ${stillBound}`,
    );
  });

  describe('through the rest', () => {
    beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
    afterEach(() => vi.useRealTimers());

    it('lets the last frame stand on the plate while it gives way to the still, and after', () => {
      Object.assign(motion, { paused: false, reducedMotion: false });
      const ejected = workOrbit(25)!;
      const { container } = render(
        <OrbitScore
          orbit={ejected}
          t={t}
          locale="en"
          plate={plateOf(25, 'ink')}
          opening="ink"
          both
        />,
      );
      approach();
      view(true);
      derive(derivation(ejected), workers[0], ejected);
      placedOn(framedOf());
      // All three are out of the picture a second after the film: it ends two seconds on.
      fated(
        ejected,
        workers[0],
        pathOf({
          seconds: 20,
          out: [
            { body: 0, from: 1 },
            { body: 1, from: 1 },
            { body: 2, from: 1 },
          ],
        }),
      );
      clockNow = 800 + 31_000;
      nextFrame();
      pastTheFrame();
      // Sizing a canvas wipes it. The frame that ends the performance sizes none: its last
      // picture stands, and the stylesheet fades the drawing's layers as they are.
      const sized = vi.spyOn(HTMLCanvasElement.prototype, 'width', 'set');
      for (let frame = 0; frame < 80; frame++) {
        if (section(container).getAttribute('data-beyond') === 'resting') break;
        sized.mockClear();
        clockNow += 100;
        nextFrame();
      }
      expect(section(container)).toHaveAttribute('data-beyond', 'resting');
      expect(sized).not.toHaveBeenCalled();
      // Through the fade, the rest and the telling nothing is drawn, and nothing is wiped: the
      // layers stand unseen under the still, which is the work again.
      calls = [];
      act(() => vi.advanceTimersByTime(1_200 + 8_000));
      expect(section(container)).toHaveAttribute('data-beyond', 'told');
      expect(calls).toEqual([]);
      expect(sized).not.toHaveBeenCalled();
      // Again, and the canvases are laid out afresh: for the question, where one is asked.
      fireEvent.click(screen.getByRole('button', { name: t.again }));
      expect(sized).toHaveBeenCalled();
      expect(calls.some((call) => call.name === 'stroke')).toBe(true);
    });
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

  it('rests where motion is unwelcome before the window is first drawn, and a hand on the slider then holds it there', () => {
    const plate031 = orbitPlate(getCuratedArtwork(31)!)!;
    render(<OrbitScore orbit={orbit} t={t} locale="en" plate={plate031} opening="ink" both />);
    approach();
    view(true);
    // Derived, the slider is offered at once; the window waits for its places on the plate.
    derive();
    // The word says what a press would do: Play, never Pause for a performance not running.
    expect(screen.queryByRole('button', { name: t.pause })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: t.play })).toBeInTheDocument();
    fireEvent.change(slider(), { target: { value: '0' } });
    workers[0].reply({ type: 'framed', framed: framedOf() });
    clockNow += 2_000;
    nextFrame();
    // Set by the hand at the first frame, it stays there, and the line says so: nothing plays
    // unasked.
    expect(frames.size).toBe(0);
    expect(
      screen.getByText(/^Step [\d,]+ of 1,000,000 · 00:00 into the Light film$/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t.play })).toBeInTheDocument();
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
    // From the twin, After the frame asks its question, and hands the focus to it.
    fireEvent.click(afterTheFrame());
    expect(section(container)).not.toHaveAttribute('data-twin');
    expect(section(container)).toHaveAttribute('data-beyond', 'choosing');
    expect(document.activeElement).toBe(container.querySelector('#orbit-said'));
    fireEvent.click(screen.getByRole('button', { name: t.beyondStayFrame }));
    expect(section(container)).toHaveAttribute('data-beyond');
    fireEvent.click(twinButton());
    expect(section(container)).not.toHaveAttribute('data-beyond');
    expect(section(container)).toHaveAttribute('data-twin');
    // Pressed again, it gives the window back, drawn whole.
    fireEvent.click(twinButton());
    expect(section(container)).not.toHaveAttribute('data-twin');
    expect(screen.getByText(t.orbitLine)).toBeInTheDocument();
  });

  it('performs the pair where motion is welcome, rests, and performs afresh without following anew', () => {
    Object.assign(motion, { paused: false, reducedMotion: false });
    const { container } = onThePlate();
    const line = () => container.querySelector('#orbit-said')!.textContent!;
    const rested = () => section(container).getAttribute('data-twin') === 'rested';
    // The window plays to its end first; then the twin is asked for, and found.
    framesUntil(() => !!screen.queryByRole('button', { name: t.oneInATrillion }), 1_000);
    fireEvent.click(twinButton());
    workers[1].reply({ type: 'done', run: found() } as unknown as OrbitReply);
    expect(section(container)).toHaveAttribute('data-twin', 'running');
    calls = [];
    clockNow += 100;
    nextFrame();
    clockNow += 100;
    nextFrame();
    // Each frame adds to the two trails past the frame, and rings the twin's bodies in its red.
    expect(calls.filter((call) => call.name === 'stroke').length).toBeGreaterThan(0);
    expect(calls.some((call) => call.name === 'arc' && call.args[2] === 5)).toBe(true);
    expect(line()).toMatch(/^Apart by /);
    framesUntil(rested, 2_000);
    expect(line()).toBe('Parted at step 1,020,000. The gap doubled about every 40,000 steps.');
    // Again: the same twin performed afresh from the window's end, with no second following.
    fireEvent.click(screen.getByRole('button', { name: t.again }));
    expect(workers).toHaveLength(2);
    expect(section(container)).toHaveAttribute('data-twin', 'running');
    expect(screen.queryByRole('button', { name: t.again })).not.toBeInTheDocument();
    expect(line()).toMatch(/^Apart by /);
    framesUntil(rested, 2_000);
    // Left and come back to: performed afresh once more, still with no third worker.
    fireEvent.click(twinButton());
    expect(section(container)).not.toHaveAttribute('data-twin');
    fireEvent.click(twinButton());
    expect(workers).toHaveLength(2);
    expect(section(container)).toHaveAttribute('data-twin', 'running');
    expect(line()).toMatch(/^Apart by /);
    // Out of view the pair waits; back in view it carries on from where it stood.
    clockNow += 100;
    nextFrame();
    clockNow += 100;
    nextFrame();
    view(false);
    expect(frames.size).toBe(0);
    view(true);
    expect(frames.size).toBe(1);
    framesUntil(rested, 2_000);
  });

  it('says plainly when this browser cannot follow the twin', () => {
    onThePlate();
    fireEvent.click(twinButton());
    workers[1].reply({ type: 'failed', message: 'no' } as unknown as OrbitReply);
    expect(screen.getByText(t.twinUnavailable)).toBeInTheDocument();
  });
});

describe('the work page in two acts', () => {
  it('performs the orbit in act one, and opens act two on the record, checked here', () => {
    const { container } = render(<OrbitScore orbit={orbit} t={t} locale="en" />);
    approach();
    derive();
    fated();
    const [show, record] = container.querySelectorAll('section');
    expect(show).toHaveAttribute('id', 'orbit');
    expect(screen.getByRole('region', { name: t.orbitTitle })).toBe(show);
    // The show carries no table: the record does, under a heading of its own.
    expect(show.querySelector('table')).toBeNull();
    expect(record).toHaveAttribute('id', 'proof');
    expect(screen.getByRole('region', { name: t.orbitTableCaption })).toBe(record);
    expect(screen.getByRole('heading', { level: 2, name: t.orbitTableCaption })).toBeVisible();
    expect(screen.getByRole('table', { name: t.orbitTableCaption })).toBeInTheDocument();
    // Both acts say the derivation is the published record, to the last bit.
    expect(show).toHaveAttribute('data-exact', 'true');
    expect(record).toHaveAttribute('data-exact', 'true');
    expect(record.querySelector('[role="status"]')).toHaveTextContent(t.orbitAllExact);
  });
});
