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

/** The fate as the worker derives it: the real one for an ejection, an eternal dance in brief. */
function fateOf(of: WorkOrbit): DerivedFate {
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
 * the middle of the frame, but for the stretches `out` names (in seconds of film; without a
 * `to`, to the path's end), when it stands `far` frame-widths outside it.
 */
function pathOf({
  seconds = 6,
  out = [],
  lost = null,
  copies = 1,
}: {
  seconds?: number;
  out?: { body: number; from: number; to?: number; far?: number }[];
  lost?: BeyondPath['lost'];
  copies?: number;
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
      for (let copy = 0; copy < copies; copy++) {
        pixels[(sample * copies * 3 + copy * 3 + body) * 2] = far ? 3_456 * (1 + far) : 1_728;
        pixels[(sample * copies * 3 + copy * 3 + body) * 2 + 1] = 1_117;
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
    container.querySelector<HTMLElement>('#orbit [class*="readoutRow"] > p')!;
  const line = (container: HTMLElement) => telling(container).textContent;
  const words = (container: HTMLElement) =>
    [...container.querySelectorAll('#orbit [class*="words"] > *')].map((word) => word.textContent);
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
    { still = false, plate = plateOf(of.id) as OrbitPlate | null } = {},
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
    if (plate) workers[0].reply({ type: 'framed', framed: framedOf() });
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
    fireEvent.click(afterTheFrame());
    expect(afterTheFrame()).toHaveAttribute('aria-pressed', 'true');
    expect(phase(container)).toBe('running');
    // Labelled as physics, not the work, with the camera held; and under the picture.
    expect(screen.getByText(t.afterTheFrameNote)).toBeInTheDocument();
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
    // Again performs it again from the film's end, and the word that was pressed is the word
    // that now offers to tell: the hand, or the keyboard, still stands on it.
    const again = word(t.again);
    again.focus();
    fireEvent.click(again);
    expect(phase(container)).toBe('running');
    expect(document.activeElement).toBe(word(t.beyondTell));
    expect(again).toBe(word(t.beyondTell));
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
    fireEvent.click(afterTheFrame());
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
    fireEvent.click(afterTheFrame());
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
    fireEvent.click(afterTheFrame());
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
        ? ({ scrollMarginTop: '48px' } as CSSStyleDeclaration)
        : style(element, pseudo),
    );
    // The picture runs under the fold of a 768 px window: its line and its words are out of sight.
    const boxes: { picture: Box; beneath: Box; words: Box } = {
      picture: [302, 1002],
      beneath: [1011, 1140],
      words: [1096, 1140],
    };
    laidOut(boxes);
    fireEvent.click(afterTheFrame());
    // Not in the frame of the change of layout, which WebKit's scroll anchoring answers…
    expect(scrolledTo).not.toHaveBeenCalled();
    nextFrame();
    expect(scrolledTo).not.toHaveBeenCalled();
    // …but two frames on, measured again there: the picture has moved a line down meanwhile.
    boxes.picture = [329, 1029];
    nextFrame();
    // It comes to stand 6 px under the running head, at the visitor's pace.
    expect(scrolledTo.mock.calls).toEqual([[{ top: 329 - 48 - 6, behavior: 'smooth' }]]);
    // All of it in view under the head, Again moves nothing.
    boxes.picture = [54, 574];
    boxes.beneath = [583, 744];
    fireEvent.click(word(t.beyondTell));
    fireEvent.click(word(t.again));
    nextFrame();
    nextFrame();
    expect(scrolledTo).toHaveBeenCalledTimes(1);
    // The picture's top behind the head is not in view: it is brought out from under it.
    boxes.picture = [40, 560];
    fireEvent.click(word(t.beyondTell));
    fireEvent.click(word(t.again));
    nextFrame();
    nextFrame();
    expect(scrolledTo.mock.calls[1]).toEqual([{ top: 40 - 48 - 6, behavior: 'smooth' }]);
    // Back at the frame the caption and the score return above the words, 72 px lower. They are
    // put back where they stood under the hand: at once, before the page is painted again.
    boxes.words = (pastFrame) => (pastFrame ? [700, 744] : [772, 816]);
    fireEvent.click(afterTheFrame());
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
    fireEvent.click(afterTheFrame());
    expect(scrolledTo).not.toHaveBeenCalled();
    // The visitor scrolls the words under the fold, and leaves by the keyboard: the words are
    // not brought back from where they had put them.
    boxes.words = (pastFrame) => (pastFrame ? [946, 990] : [1018, 1062]);
    fireEvent.click(afterTheFrame());
    nextFrame();
    nextFrame();
    expect(scrolledTo).not.toHaveBeenCalled();
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
    expect(sectionOf(container)).toHaveAttribute('data-beyond', 'running');
    nextFrame();
    nextFrame();
    expect(scrolledTo.mock.calls).toEqual([[{ top: 74, behavior: 'smooth' }]]);
  });

  it('does not pull back a visitor who left while the path was awaited', () => {
    const { container, scrolledTo } = askedEarly();
    // They have gone back up the page: the picture is two screens below.
    laidOut({ picture: [2400, 3100], beneath: [3110, 3240] });
    fated(ejected);
    expect(sectionOf(container)).toHaveAttribute('data-beyond', 'running');
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
    fireEvent.click(afterTheFrame());
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
    fireEvent.click(afterTheFrame());
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
      fireEvent.click(afterTheFrame());
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
    fireEvent.click(afterTheFrame());
    // Nothing plays: the picture stands at the film's end, and the words go on from there.
    expect(frames.size).toBe(0);
    expect(line(container)).toBe('00:00 past the film · step 1,000,000');
    expect(words(container)).toEqual([
      t.beyondOnward,
      t.beyondTell,
      t.afterTheFrame,
      t.oneInATrillion,
    ]);
    // Where nothing plays Further on is the way on, and is never dimmed.
    expect(word(t.beyondOnward)).not.toHaveAttribute('aria-disabled');
    const onward = () => fireEvent.click(word(t.beyondOnward));
    // Each step lands a second past a moment, so the picture shows it.
    onward();
    expect(line(container)).toMatch(/^00:04 past the film · body 2 is out of the picture/);
    onward();
    expect(line(container)).toBe('00:06 past the film · all three are out of the picture');
    // Then the end of the performance, and from there what happened: no rest is timed.
    onward();
    expect(line(container)).toBe('00:07 past the film · all three are out of the picture');
    expect(phase(container)).toBe('running');
    expect(telling(container)).not.toHaveAttribute('aria-live');
    onward();
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
    fireEvent.click(afterTheFrame());
    // The marks' leaving still shapes the performance: the same steps, to the same end.
    fireEvent.click(word(t.beyondOnward));
    expect(line(container)).toBe('00:04 past the film · step 1,133,200');
    fireEvent.click(word(t.beyondTell));
    // And what is told is the record's finding alone.
    expect(line(container)).toBe(
      'The record finds body 2 no longer bound to the other two at step 1,090,000.',
    );
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
    expect(section(container)).toHaveAttribute('data-beyond', 'running');
    // Asked again while it runs, from the plate a screen above: its picture comes back, whole.
    const scrolledTo = vi.fn();
    vi.stubGlobal('scrollTo', scrolledTo);
    laidOut({ picture: [954, 1654], beneath: [1663, 1790] });
    act(() => window.dispatchEvent(new Event(AFTER_THE_FRAME_EVENT)));
    expect(scrolledTo.mock.calls).toEqual([[{ top: 948, behavior: 'instant' }]]);
    expect(scrolled).toHaveLength(1);
    expect(section(container)).toHaveAttribute('data-beyond', 'running');
    // Asked again once it has been told, it is performed again.
    fireEvent.click(word(t.beyondTell));
    expect(section(container)).toHaveAttribute('data-beyond', 'told');
    act(() => window.dispatchEvent(new Event(AFTER_THE_FRAME_EVENT)));
    expect(section(container)).toHaveAttribute('data-beyond', 'running');
  });

  it('goes on at once when the path is already known', () => {
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
    expect(section(container)).toHaveAttribute('data-beyond', 'running');
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
    fireEvent.click(afterTheFrame());
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
    expect(container.querySelector('#orbit [class*="readoutRow"] > p')!.textContent).toBe(
      'Body 2 left the picture 3.0 seconds after the film ended. 2.0 seconds later the other two had left it too. The record finds body 2 no longer bound to the other two at step 1,210,000.',
    );
    expect(caption().firstElementChild).toHaveAttribute('data-shown', 'false');
    expect(caption().firstElementChild).toHaveAttribute('aria-hidden', 'true');
    // Back at the frame, the caption says again what the window's drawing is.
    fireEvent.click(afterTheFrame());
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
    fireEvent.click(afterTheFrame());
    fireEvent.click(screen.getByRole('button', { name: t.beyondTell }));
    const told = () => container.querySelector('#orbit [class*="readoutRow"] > p')!.textContent;
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
      fireEvent.click(afterTheFrame());
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
      // Again, and the canvases are laid out afresh for the performance.
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
